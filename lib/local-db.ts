import { currentAccount } from './account';
import { DEFAULT_LIBRARY_ID, DEFAULT_LIBRARY_NAME, libraryPresetDefaults, type IdeaBox, type IdeaOption, type SyncStatus, type VaultLibrary } from '@/lib/types';

const databaseName = () => currentAccount() ? 'design-vault-user-' + currentAccount() : 'design-vault-local';
const DB_VERSION = 4;
const STORE_NAME = 'ideaBoxes';
const QUEUE_STORE = 'syncQueue';
const LIBRARY_STORE = 'libraries';
const LEGACY_STORE_NAME = 'vault';
const LEGACY_REFERENCES_KEY = 'sermon-ideas';

export type SyncQueueItem = {
  id: string;
  entity?: 'ideaBox' | 'library';
  operation: 'upsert' | 'delete';
  updatedAt: string;
};

const asStrings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

function paletteFrom(value: any): string[] {
  return asStrings(value?.colorPalette ?? value?.metadata?.colorPalette);
}

function migrateOption(option: any, fallback: any, index: number): IdeaOption {
  const fallbackImage = typeof fallback?.image === 'string' ? fallback.image : '';
  return {
    id: typeof option?.id === 'string' ? option.id : `${fallback?.id || 'idea'}-option-${index + 1}`,
    title: typeof option?.title === 'string' && option.title.trim() ? option.title : `Option ${index + 1}`,
    image: typeof option?.image === 'string' && option.image ? option.image : fallbackImage,
    cloudImageUrl: typeof option?.cloudImageUrl === 'string' ? option.cloudImageUrl : (typeof option?.image === 'string' && option.image.startsWith('http') ? option.image : undefined),
    videoUrl: typeof option?.videoUrl === 'string' ? option.videoUrl : '',
    promptUsed: typeof option?.promptUsed === 'string' ? option.promptUsed : '',
    notes: typeof option?.notes === 'string' ? option.notes : '',
    colorPalette: paletteFrom(option).length ? paletteFrom(option) : paletteFrom(fallback),
  };
}

export function normalizeIdeaBox(item: any, index = 0): IdeaBox {
  const id = typeof item?.id === 'string' ? item.id : `idea-${Date.now()}-${index}`;
  const legacyImage = typeof item?.image === 'string' ? item.image : '';
  const sourceOptions = Array.isArray(item?.options) && item.options.length ? item.options : [item];
  const options: IdeaOption[] = sourceOptions.map((option: any, optionIndex: number) => migrateOption(option, { ...item, id, image: legacyImage }, optionIndex));
  const matchingLegacyThumbnail = options.find((option) => option.image === legacyImage);
  const requestedThumbnail = typeof item?.thumbnailOptionId === 'string'
    ? options.find((option) => option.id === item.thumbnailOptionId)
    : undefined;
  const createdAt = typeof item?.createdAt === 'string' ? item.createdAt : new Date().toISOString();
  const updatedAt = typeof item?.updatedAt === 'string' ? item.updatedAt : createdAt;
  const syncStatus: SyncStatus = ['local', 'pending', 'syncing', 'synced', 'error'].includes(item?.syncStatus) ? item.syncStatus : 'local';

  return {
    id,
    title: typeof item?.title === 'string' && item.title.trim() ? item.title : `Sermon Idea ${index + 1}`,
    favorite: Boolean(item?.favorite),
    createdAt,
    updatedAt,
    lastSyncedAt: typeof item?.lastSyncedAt === 'string' ? item.lastSyncedAt : undefined,
    syncStatus,
    libraryId: typeof item?.libraryId === 'string' && item.libraryId ? item.libraryId : DEFAULT_LIBRARY_ID,
    source: typeof item?.source === 'string' ? item.source : 'Local upload',
    notes: typeof item?.notes === 'string' ? item.notes : '',
    videoUrl: typeof item?.videoUrl === 'string' ? item.videoUrl : '',
    thumbnailOptionId: requestedThumbnail?.id ?? matchingLegacyThumbnail?.id ?? options[0]?.id ?? '',
    options,
  };
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'));
      return;
    }
    const request = indexedDB.open(databaseName(), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(LIBRARY_STORE)) db.createObjectStore(LIBRARY_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open Design Vault storage.'));
  });
}

async function readLegacyStore(db: IDBDatabase): Promise<IdeaBox[]> {
  if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(LEGACY_STORE_NAME, 'readonly');
    const request = tx.objectStore(LEGACY_STORE_NAME).get(LEGACY_REFERENCES_KEY);
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.map((item, index) => normalizeIdeaBox(item, index)) : []);
    request.onerror = () => reject(request.error ?? new Error('Unable to read legacy Design Vault storage.'));
  });
}

async function clearLegacyRecord(db: IDBDatabase): Promise<void> {
  if (!db.objectStoreNames.contains(LEGACY_STORE_NAME)) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(LEGACY_STORE_NAME, 'readwrite');
    tx.objectStore(LEGACY_STORE_NAME).delete(LEGACY_REFERENCES_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
    tx.onabort = () => resolve();
  });
}

export async function loadLocalIdeaBoxes(): Promise<IdeaBox[]> {
  if (typeof window === 'undefined') return [];
  const db = await openDatabase();
  try {
    const current = await new Promise<IdeaBox[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.map((item, index) => normalizeIdeaBox(item, index)) : []);
      request.onerror = () => reject(request.error ?? new Error('Unable to read Design Vault storage.'));
    });
    if (current.length) return current.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const legacy = await readLegacyStore(db);
    if (legacy.length) {
      await Promise.all(legacy.map((item) => putLocalIdeaBox(item)));
      await clearLegacyRecord(db);
      return legacy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return [];
  } finally {
    db.close();
  }
}

export async function loadLocalIdeaBox(id: string): Promise<IdeaBox | null> {
  if (typeof window === 'undefined') return null;
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve(request.result ? normalizeIdeaBox(request.result) : null);
      request.onerror = () => reject(request.error ?? new Error('Unable to load Design Vault item.'));
    });
  } finally {
    db.close();
  }
}

export async function putLocalIdeaBox(reference: IdeaBox): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(reference);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to save Design Vault storage.'));
      tx.onabort = () => reject(tx.error ?? new Error('Design Vault save was aborted.'));
    });
  } finally { db.close(); }
}

export async function removeLocalIdeaBox(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to delete Design Vault item.'));
      tx.onabort = () => reject(tx.error ?? new Error('Design Vault delete was aborted.'));
    });
  } finally { db.close(); }
}

export async function listSyncQueue(): Promise<SyncQueueItem[]> {
  if (typeof window === 'undefined') return [];
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readonly');
      const request = tx.objectStore(QUEUE_STORE).getAll();
      request.onsuccess = () => resolve((request.result ?? []) as SyncQueueItem[]);
      request.onerror = () => reject(request.error ?? new Error('Unable to read sync queue.'));
    });
  } finally { db.close(); }
}

export async function putSyncQueue(item: SyncQueueItem): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to update sync queue.'));
    });
  } finally { db.close(); }
}

export async function removeSyncQueue(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, 'readwrite');
      tx.objectStore(QUEUE_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to update sync queue.'));
    });
  } finally { db.close(); }
}


export function normalizeLibrary(item: any, index = 0): VaultLibrary {
  const now = new Date().toISOString();
  const createdAt = typeof item?.createdAt === 'string' ? item.createdAt : now;
  const name = typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : `Library ${index + 1}`;
  const defaults = libraryPresetDefaults(name);
  return {
    id: typeof item?.id === 'string' && item.id ? item.id : `library-${Date.now()}-${index}`,
    name,
    ownerId: item?.ownerId, visibility: item?.visibility ?? 'private', role: item?.role ?? 'owner',
    preset: item?.preset === 'video-story' ? 'video-story' : item?.preset === 'image-landscape' ? 'image-landscape' : defaults.preset,
    aspectRatio: item?.aspectRatio === '9:16' ? '9:16' : item?.aspectRatio === '16:9' ? '16:9' : defaults.aspectRatio,
    width: Number.isFinite(item?.width) ? Number(item.width) : defaults.width,
    height: Number.isFinite(item?.height) ? Number(item.height) : defaults.height,
    optionVideoEnabled: typeof item?.optionVideoEnabled === 'boolean' ? item.optionVideoEnabled : defaults.optionVideoEnabled,
    createdAt,
    updatedAt: typeof item?.updatedAt === 'string' ? item.updatedAt : createdAt,
    lastSyncedAt: typeof item?.lastSyncedAt === 'string' ? item.lastSyncedAt : undefined,
    syncStatus: ['local', 'pending', 'syncing', 'synced', 'error'].includes(item?.syncStatus) ? item.syncStatus : 'local',
  };
}

export async function loadLocalLibraries(): Promise<VaultLibrary[]> {
  if (typeof window === 'undefined') return [];
  const db = await openDatabase();
  try {
    const libraries = await new Promise<VaultLibrary[]>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readonly');
      const request = tx.objectStore(LIBRARY_STORE).getAll();
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result.map((item, index) => normalizeLibrary(item, index)) : []);
      request.onerror = () => reject(request.error ?? new Error('Unable to read libraries.'));
    });
    if (libraries.some((library) => library.id === DEFAULT_LIBRARY_ID)) return libraries.sort((a, b) => a.name.localeCompare(b.name));
    const now = new Date().toISOString();
    const defaultLibrary: VaultLibrary = { ownerId: currentAccount(), visibility: 'private', role: 'owner', id: DEFAULT_LIBRARY_ID, name: DEFAULT_LIBRARY_NAME, ...libraryPresetDefaults(DEFAULT_LIBRARY_NAME), createdAt: now, updatedAt: now, syncStatus: 'local' };
    await putLocalLibrary(defaultLibrary);
    return [defaultLibrary, ...libraries].sort((a, b) => a.name.localeCompare(b.name));
  } finally { db.close(); }
}

export async function loadLocalLibrary(id: string): Promise<VaultLibrary | null> {
  if (typeof window === 'undefined') return null;
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readonly');
      const request = tx.objectStore(LIBRARY_STORE).get(id);
      request.onsuccess = () => resolve(request.result ? normalizeLibrary(request.result) : null);
      request.onerror = () => reject(request.error ?? new Error('Unable to load library.'));
    });
  } finally { db.close(); }
}

export async function putLocalLibrary(library: VaultLibrary): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readwrite');
      tx.objectStore(LIBRARY_STORE).put(library);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to save library.'));
      tx.onabort = () => reject(tx.error ?? new Error('Library save was aborted.'));
    });
  } finally { db.close(); }
}

export async function removeLocalLibrary(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(LIBRARY_STORE, 'readwrite');
      tx.objectStore(LIBRARY_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Unable to delete library.'));
    });
  } finally { db.close(); }
}

