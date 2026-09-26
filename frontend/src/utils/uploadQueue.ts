// Persistent background queue for ID photo uploads.
//
// A photo is compressed into documentDirectory as soon as it is queued, so it survives
// app restarts, OS cache cleanup and long offline periods. The queue retries with
// exponential backoff until the upload succeeds, and resumes on reconnect, when the app
// returns to the foreground, and on sign-in. Nothing is dropped except when the guest
// was deleted or the local file is gone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, get, update } from 'firebase/database';
import { auth, rtdb } from '../firebase/firebase';
import { preparePendingImage, uploadImageToStorage, onMediaUrlChange, PENDING_DIR } from './imageStorage';

// Kept in sync with MAX_ID_IMAGES in rtdbService (not imported to avoid a cycle).
const MAX_ID_IMAGES = 3;
export const UPLOAD_QUEUE_STORAGE_KEY = 'upload_queue:v4:tasks';
const STORAGE_KEY = UPLOAD_QUEUE_STORAGE_KEY;
const BASE_RETRY_MS = 15_000;
const MAX_RETRY_MS = 30 * 60_000;

export interface UploadTask {
  id: string;
  imageUri: string;
  customerId: string;
  imageIndex: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
  createdAt: number;
}

class UploadQueueService {
  private queue: UploadTask[] = [];
  private ready: Promise<void>;
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private wasConnected = true;

  constructor() {
    this.ready = this.load();
    // Coming back online is a real reason to retry right away; other events just resume due work.
    NetInfo.addEventListener(state => {
      const connected = !!state.isConnected;
      if (connected && !this.wasConnected) this.kick(true);
      this.wasConnected = connected;
    });
    AppState.addEventListener('change', state => state === 'active' && this.kick());
    onAuthStateChanged(auth, user => user && this.kick());
    // Photos taken before the server address was known upload as soon as it is.
    onMediaUrlChange(() => this.kick(true));
  }

  private async load() {
    try {
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      this.queue = saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('[UploadQueue] Could not read saved queue:', e);
      this.queue = [];
    }
  }

  private async save() {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue)).catch(e =>
      console.warn('[UploadQueue] Could not persist queue:', e)
    );
  }

  async enqueue(imageUri: string, customerId: string, imageIndex: number = 0): Promise<string> {
    await this.ready;
    const id = `upload_${customerId}_${imageIndex}_${Date.now()}`;
    const existing = this.queue.find(t => t.customerId === customerId && t.imageIndex === imageIndex);

    const localUri = imageUri.startsWith(PENDING_DIR) ? imageUri : await preparePendingImage(imageUri, id);
    if (existing) {
      // A newer photo for the same slot replaces the queued one.
      if (existing.imageUri !== localUri) FileSystem.deleteAsync(existing.imageUri, { idempotent: true }).catch(() => {});
      Object.assign(existing, { imageUri: localUri, attempts: 0, nextAttemptAt: 0, lastError: undefined });
    } else {
      this.queue.push({ id, imageUri: localUri, customerId, imageIndex, attempts: 0, nextAttemptAt: 0, createdAt: Date.now() });
    }
    await this.save();
    this.kick();
    return existing?.id ?? id;
  }

  /** Processes due tasks now; `retryAll` also skips the backoff wait (used after reconnecting). */
  kick(retryAll = false) {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (retryAll) this.queue.forEach(t => (t.nextAttemptAt = Math.min(t.nextAttemptAt, Date.now())));
    this.process();
  }

  private schedule() {
    if (this.timer || this.queue.length === 0) return;
    const next = Math.min(...this.queue.map(t => t.nextAttemptAt));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.process();
    }, Math.max(1000, next - Date.now()));
  }

  private async process() {
    await this.ready;
    if (this.running) return;
    this.running = true;
    try {
      while (true) {
        const task = this.queue.find(t => t.nextAttemptAt <= Date.now());
        if (!task) break;
        if (!(await NetInfo.fetch()).isConnected || !auth.currentUser) break;
        try {
          await this.runTask(task);
        } catch (e: any) {
          await this.fail(task, e?.message || String(e));
        }
      }
    } finally {
      this.running = false;
      this.schedule();
    }
  }

  private async runTask(task: UploadTask) {
    const remove = async () => {
      this.queue = this.queue.filter(t => t !== task);
      await FileSystem.deleteAsync(task.imageUri, { idempotent: true }).catch(() => {});
      await this.save();
    };

    // Guest deleted while the photo was waiting: writing the URL would resurrect a stub record.
    const exists = await get(ref(rtdb, `customers/${task.customerId}/createdAt`))
      .then(s => s.exists())
      .catch(() => true);
    if (!exists) return remove();

    const result = await uploadImageToStorage(task.imageUri, task.customerId, task.imageIndex);
    if (result.success && result.downloadUrl) {
      if (task.imageIndex < MAX_ID_IMAGES) {
        await update(ref(rtdb), {
          [`customers/${task.customerId}/idImageUrls/${task.imageIndex}`]: result.downloadUrl,
          [`customers/${task.customerId}/updatedAt`]: Date.now(),
        });
      }
      return remove();
    }

    if (result.permanent) {
      console.warn(`[UploadQueue] Dropping ${task.id}: ${result.error}`);
      return remove();
    }
    await this.fail(task, result.error);
  }

  private async fail(task: UploadTask, error?: string) {
    task.attempts++;
    task.lastError = error;
    task.nextAttemptAt = Date.now() + Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.min(task.attempts - 1, 10));
    console.warn(`[UploadQueue] ${task.id} failed (attempt ${task.attempts}): ${error}`);
    await this.save();
  }

  getStats() {
    return {
      pending: this.queue.length,
      failing: this.queue.filter(t => t.attempts > 0).length,
      lastError: this.queue.find(t => t.lastError)?.lastError,
    };
  }
}

export const uploadQueue = new UploadQueueService();
export const queueImageUpload = (uri: string, customerId: string, index: number = 0) =>
  uploadQueue.enqueue(uri, customerId, index);
export const getUploadStats = () => uploadQueue.getStats();
