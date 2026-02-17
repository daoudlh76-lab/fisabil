/**
 * Local cache layer using AsyncStorage.
 * Mirrors Supabase data locally for offline access and instant loading.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  SCANS: 'local_scans',
  FOLDERS: 'local_folders',
  VOCAB_PREFIX: 'local_vocab_',
};

// ═══ Types ═══

type Scan = {
  id: string;
  user_id?: string;
  title: string;
  content: string;
  created_at: string;
  folder_id: string | null;
};

type Folder = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

// ═══ Scans ═══

export async function getLocalScans(): Promise<Scan[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.SCANS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveLocalScans(scans: Scan[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.SCANS, JSON.stringify(scans));
  } catch (e) {
    __DEV__ && console.error('[LocalCache] saveLocalScans error:', e);
  }
}

/** Update a single scan in local cache (after folder change, edit, etc.) */
export async function updateLocalScan(updated: Scan): Promise<void> {
  try {
    const scans = await getLocalScans();
    const idx = scans.findIndex(s => s.id === updated.id);
    if (idx >= 0) {
      scans[idx] = updated;
    } else {
      scans.unshift(updated);
    }
    await saveLocalScans(scans);
  } catch (e) {
    __DEV__ && console.error('[LocalCache] updateLocalScan error:', e);
  }
}

/** Remove a scan from local cache */
export async function deleteLocalScan(scanId: string): Promise<void> {
  try {
    const scans = await getLocalScans();
    await saveLocalScans(scans.filter(s => s.id !== scanId));
    // Also remove associated vocab cache
    const keys = await AsyncStorage.getAllKeys();
    const vocabKeys = keys.filter(k => k.startsWith(`${KEYS.VOCAB_PREFIX}${scanId}_`));
    if (vocabKeys.length > 0) {
      await AsyncStorage.multiRemove(vocabKeys);
    }
  } catch (e) {
    __DEV__ && console.error('[LocalCache] deleteLocalScan error:', e);
  }
}

// ═══ Folders ═══

export async function getLocalFolders(): Promise<Folder[]> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.FOLDERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveLocalFolders(folders: Folder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
  } catch (e) {
    __DEV__ && console.error('[LocalCache] saveLocalFolders error:', e);
  }
}

// ═══ Vocabulary (per scan + language) ═══

function vocabKey(scanId: string, lang: string): string {
  return `${KEYS.VOCAB_PREFIX}${scanId}_${lang}`;
}

export async function getLocalVocab(scanId: string, lang: string): Promise<any | null> {
  try {
    const raw = await AsyncStorage.getItem(vocabKey(scanId, lang));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveLocalVocab(scanId: string, lang: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(vocabKey(scanId, lang), JSON.stringify(data));
  } catch (e) {
    __DEV__ && console.error('[LocalCache] saveLocalVocab error:', e);
  }
}

export async function deleteLocalVocab(scanId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const vocabKeys = keys.filter(k => k.startsWith(`${KEYS.VOCAB_PREFIX}${scanId}_`));
    if (vocabKeys.length > 0) {
      await AsyncStorage.multiRemove(vocabKeys);
    }
  } catch (e) {
    __DEV__ && console.error('[LocalCache] deleteLocalVocab error:', e);
  }
}
