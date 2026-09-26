import { ref, get, query, orderByChild, limitToLast } from 'firebase/database';
import { rtdb } from './firebase';
import { ChangelogEntry } from '../types';

/**
 * Release notes, newest first. Stored at changelog/{id} = { title, description, version, createdAt }
 * and written by admins (see scripts/firebase/add-changelog.js).
 */
export const fetchChangelog = async (limit = 30): Promise<ChangelogEntry[]> => {
  const snap = await get(query(ref(rtdb, 'changelog'), orderByChild('createdAt'), limitToLast(limit)));
  return Object.entries<any>(snap.val() || {})
    .map(([id, e]) => ({
      id,
      title: e.title || '',
      description: e.description || '',
      version: e.version || '',
      created_at: e.createdAt ? new Date(e.createdAt).toISOString() : '',
      created_by: e.createdBy,
    }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
};
