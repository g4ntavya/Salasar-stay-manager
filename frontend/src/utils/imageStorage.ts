// ID photo storage on the self-hosted media server (Oracle VM).
//
// Upload:  PUT  {mediaUrl}/v1/customers/{customerId}/images/{index}   (raw JPEG body)
// View:    GET  the returned URL
// Both require `Authorization: Bearer <Firebase ID token>`; the server verifies the token,
// so ID documents are never publicly reachable.
//
// The server address is read from config/mediaUrl in the database (set with
// `npm run firebase:config`), falling back to EXPO_PUBLIC_MEDIA_URL, so moving the
// server never needs a new app build.

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onIdTokenChanged } from 'firebase/auth';
import { ref, get } from 'firebase/database';
import { auth, rtdb } from '../firebase/firebase';

const MEDIA_URL_KEY = 'config:mediaUrl';
const normalizeUrl = (url: unknown) => (typeof url === 'string' ? url.trim().replace(/\/+$/, '') : '');

let mediaUrl = normalizeUrl(process.env.EXPO_PUBLIC_MEDIA_URL);
const mediaUrlListeners = new Set<() => void>();

const setMediaUrl = (url: string) => {
  if (!url || url === mediaUrl) return;
  mediaUrl = url;
  AsyncStorage.setItem(MEDIA_URL_KEY, url).catch(() => {});
  mediaUrlListeners.forEach(listener => listener());
};

AsyncStorage.getItem(MEDIA_URL_KEY)
  .then(saved => saved && setMediaUrl(normalizeUrl(saved)))
  .catch(() => {});

export const getMediaUrl = () => mediaUrl;
export const isMediaServerConfigured = () => mediaUrl.length > 0;

/** Called when the media server address becomes known or changes. */
export const onMediaUrlChange = (listener: () => void) => {
  mediaUrlListeners.add(listener);
  return () => mediaUrlListeners.delete(listener);
};

// Directory for photos waiting to upload. documentDirectory is never purged by the OS.
export const PENDING_DIR = `${FileSystem.documentDirectory}pending-uploads/`;

export interface UploadResult {
  success: boolean;
  downloadUrl?: string;
  error?: string;
  /** True when the failure is permanent and retrying cannot help. */
  permanent?: boolean;
}

// Current ID token, kept fresh so image components can send it synchronously.
// Signing in (and each hourly token refresh) also re-reads the server address.
let idToken: string | null = null;
onIdTokenChanged(auth, async user => {
  idToken = user ? await user.getIdToken().catch(() => null) : null;
  if (user) {
    get(ref(rtdb, 'config/mediaUrl'))
      .then(snap => setMediaUrl(normalizeUrl(snap.val())))
      .catch(() => {});
  }
});

const MEDIA_PATH = /^https?:\/\/[^/]+(\/v1\/customers\/.+)$/;

/**
 * Image `source` for any ID photo URI. Media-server links are pointed at the current
 * server address (so older links survive a domain change) and carry the login token.
 */
export const mediaImageSource = (uri: string) => {
  const match = uri.match(MEDIA_PATH);
  if (!match || !mediaUrl || !idToken) return { uri };
  return { uri: mediaUrl + match[1], headers: { Authorization: `Bearer ${idToken}` } };
};

export const isBase64Image = (str: string): boolean =>
  typeof str === 'string' && (str.startsWith('data:image') || str.length > 5000);

const ensurePendingDir = async () => {
  const info = await FileSystem.getInfoAsync(PENDING_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(PENDING_DIR, { intermediates: true });
};

/**
 * Resizes to at most 1600px wide at 70% JPEG quality (typically 200–400 KB), which keeps
 * Aadhaar numbers legible, and stores the result where the OS will not delete it.
 */
export async function preparePendingImage(uri: string, name: string): Promise<string> {
  await ensurePendingDir();
  const target = `${PENDING_DIR}${name}.jpg`;
  try {
    const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], {
      compress: 0.7,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    await FileSystem.moveAsync({ from: result.uri, to: target });
  } catch (e) {
    console.warn('[ImageStorage] Compression failed, keeping original:', e);
    await FileSystem.copyAsync({ from: uri, to: target });
  }
  return target;
}

export async function saveBase64ToFile(base64Data: string, customerId: string, index: number): Promise<string> {
  await ensurePendingDir();
  const content = base64Data.includes('base64,') ? base64Data.split('base64,')[1] : base64Data;
  const fileUri = `${PENDING_DIR}raw_${customerId}_${index}_${Date.now()}.jpg`;
  await FileSystem.writeAsStringAsync(fileUri, content, { encoding: FileSystem.EncodingType.Base64 });
  return fileUri;
}

export async function uploadImageToStorage(
  imageUri: string,
  customerId: string,
  imageIndex: number = 0
): Promise<UploadResult> {
  if (!imageUri) return { success: false, error: 'No image URI', permanent: true };
  if (imageUri.startsWith('http')) return { success: true, downloadUrl: imageUri };
  if (!isMediaServerConfigured()) return { success: false, error: 'Media server not configured' };

  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return { success: false, error: 'Not signed in' };

  const info = await FileSystem.getInfoAsync(imageUri);
  if (!info.exists) return { success: false, error: 'Local image file is missing', permanent: true };

  try {
    const response = await FileSystem.uploadAsync(
      `${mediaUrl}/v1/customers/${encodeURIComponent(customerId)}/images/${imageIndex}`,
      imageUri,
      {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/jpeg' },
      }
    );
    if (response.status < 200 || response.status >= 300) {
      // 4xx other than auth/rate-limit will not succeed on retry.
      const permanent = response.status >= 400 && response.status < 500 && ![401, 403, 408, 429].includes(response.status);
      return { success: false, error: `Upload failed (${response.status}): ${response.body.slice(0, 200)}`, permanent };
    }
    const { url } = JSON.parse(response.body || '{}');
    if (!url) return { success: false, error: 'Upload response had no URL' };
    return { success: true, downloadUrl: url };
  } catch (error: any) {
    return { success: false, error: error?.message || 'Upload failed' };
  }
}
