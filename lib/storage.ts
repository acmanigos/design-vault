import { DEFAULT_LIBRARY_ID, DEFAULT_LIBRARY_NAME, libraryPresetDefaults, type IdeaBox, type IdeaOption, type LibraryPreset, type VaultLibrary } from '@/lib/types';
import { DESIGN_VAULT_BUCKET, isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  listSyncQueue,
  loadLocalIdeaBox,
  loadLocalIdeaBoxes,
  loadLocalLibraries,
  loadLocalLibrary,
  putLocalIdeaBox,
  putLocalLibrary,
  putSyncQueue,
  removeLocalIdeaBox,
  removeLocalLibrary,
  removeSyncQueue,
  type SyncQueueItem,
} from '@/lib/local-db';

export { isSupabaseConfigured } from '@/lib/supabase';

const AUTO_SYNC_KEY = 'design-vault-auto-sync';
const LAST_SYNC_KEY = 'design-vault-last-sync';
const optionPath = (ideaBoxId: string, optionId: string) => `idea-boxes/${ideaBoxId}/${optionId}.webp`;

export type SyncSummary = {
  configured: boolean;
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  lastSyncedAt?: string;
  error?: string;
};

let syncPromise: Promise<IdeaBox[]> | null = null;
let summary: SyncSummary = {
  configured: isSupabaseConfigured,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pendingCount: 0,
  lastSyncedAt: typeof window === 'undefined' ? undefined : window.localStorage.getItem(LAST_SYNC_KEY) || undefined,
};
const listeners = new Set<(value: SyncSummary) => void>();
const dataListeners = new Set<(boxes: IdeaBox[]) => void>();

function emitSummary(patch: Partial<SyncSummary> = {}) {
  summary = { ...summary, ...patch };
  listeners.forEach((listener) => listener(summary));
}

export function subscribeSyncSummary(listener: (value: SyncSummary) => void) {
  listeners.add(listener);
  listener(summary);
  return () => listeners.delete(listener);
}

export function subscribeDataChanges(listener: (boxes: IdeaBox[]) => void) {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

function emitData(boxes: IdeaBox[]) {
  dataListeners.forEach((listener) => listener(boxes));
}

export async function refreshSyncSummary() {
  const queue = await listSyncQueue();
  emitSummary({ pendingCount: queue.length, online: typeof navigator === 'undefined' ? true : navigator.onLine });
  return summary;
}

export function getAutoSync(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(AUTO_SYNC_KEY) !== 'false';
}

export function setAutoSync(enabled: boolean) {
  if (typeof window !== 'undefined') window.localStorage.setItem(AUTO_SYNC_KEY, enabled ? 'true' : 'false');
  if (enabled && isSupabaseConfigured && (typeof navigator === 'undefined' || navigator.onLine)) void syncNow();
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, data] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/webp';
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function uploadOptionImage(ideaBoxId: string, option: IdeaOption): Promise<string> {
  if (!supabase) return option.cloudImageUrl || option.image;
  if (option.cloudImageUrl && option.image.startsWith('data:')) return option.cloudImageUrl;
  if (!option.image.startsWith('data:')) return option.cloudImageUrl || option.image;

  const path = optionPath(ideaBoxId, option.id);
  const blob = dataUrlToBlob(option.image);
  const { error } = await supabase.storage.from(DESIGN_VAULT_BUCKET).upload(path, blob, {
    contentType: blob.type || 'image/webp',
    upsert: true,
    cacheControl: '31536000',
  });
  if (error) throw error;
  const { data } = supabase.storage.from(DESIGN_VAULT_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${encodeURIComponent(String(Date.now()))}`;
}

function mapIdeaRow(row: any, optionRows: any[]): IdeaBox {
  const options = optionRows
    .filter((option) => option.idea_box_id === row.id)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map<IdeaOption>((option) => ({
      id: option.id,
      title: option.title || 'Option',
      image: option.image_url || '',
      cloudImageUrl: option.image_url || '',
      videoUrl: option.video_url || '',
      promptUsed: option.prompt_used || '',
      notes: option.notes || '',
      colorPalette: Array.isArray(option.color_palette) ? option.color_palette : [],
    }));

  const updatedAt = row.updated_at || row.created_at || new Date().toISOString();
  return {
    id: row.id,
    title: row.title || 'Untitled sermon idea',
    favorite: Boolean(row.favorite),
    createdAt: row.created_at || updatedAt,
    updatedAt,
    lastSyncedAt: updatedAt,
    syncStatus: 'synced',
    libraryId: row.library_id || DEFAULT_LIBRARY_ID,
    source: row.source || '',
    notes: row.notes || '',
    videoUrl: row.video_url || '',
    thumbnailOptionId: row.thumbnail_option_id || options[0]?.id || '',
    options,
  };
}

async function loadCloudIdeaBoxes(): Promise<IdeaBox[]> {
  if (!supabase) return [];
  const [{ data: boxes, error: boxError }, { data: options, error: optionError }] = await Promise.all([
    supabase.from('idea_boxes').select('*').order('created_at', { ascending: false }),
    supabase.from('idea_options').select('*').order('sort_order', { ascending: true }),
  ]);
  if (boxError) throw boxError;
  if (optionError) throw optionError;
  return ((boxes ?? []) as any[]).map((box: any) => mapIdeaRow(box, (options ?? []) as any[]));
}

async function loadCloudIdeaBox(id: string): Promise<IdeaBox | null> {
  if (!supabase) return null;
  const [{ data: box, error: boxError }, { data: options, error: optionError }] = await Promise.all([
    supabase.from('idea_boxes').select('*').eq('id', id).maybeSingle(),
    supabase.from('idea_options').select('*').eq('idea_box_id', id).order('sort_order', { ascending: true }),
  ]);
  if (boxError) throw boxError;
  if (optionError) throw optionError;
  return box ? mapIdeaRow(box, options ?? []) : null;
}

function preserveLocalImages(local: IdeaBox | null, cloud: IdeaBox): IdeaBox {
  if (!local) return cloud;
  const localOptions = new Map(local.options.map((option) => [option.id, option]));
  return {
    ...cloud,
    options: cloud.options.map((cloudOption) => {
      const cached = localOptions.get(cloudOption.id);
      if (!cached) return cloudOption;
      if (cached.image.startsWith('data:') && cached.cloudImageUrl && cached.cloudImageUrl === cloudOption.cloudImageUrl) {
        return { ...cloudOption, image: cached.image };
      }
      return cloudOption;
    }),
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to cache cloud image.'));
    reader.readAsDataURL(blob);
  });
}

async function cacheCloudImages(reference: IdeaBox): Promise<IdeaBox> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return reference;

  const options: IdeaOption[] = [];
  for (const option of reference.options) {
    if (option.image.startsWith('data:')) {
      options.push(option);
      continue;
    }

    const remoteUrl = option.cloudImageUrl || option.image;
    if (!/^https?:\/\//i.test(remoteUrl)) {
      options.push(option);
      continue;
    }

    try {
      const response = await fetch(remoteUrl, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Image request failed: ${response.status}`);
      const localImage = await blobToDataUrl(await response.blob());
      options.push({ ...option, image: localImage, cloudImageUrl: remoteUrl });
    } catch {
      options.push(option);
    }
  }

  return { ...reference, options };
}


async function loadCloudLibraries(): Promise<VaultLibrary[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('libraries').select('*').order('name', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((row) => {
    const name = row.name || 'Library';
    const defaults = libraryPresetDefaults(name);
    return {
      id: row.id,
      name,
      preset: row.preset === 'video-story' ? 'video-story' : row.preset === 'image-landscape' ? 'image-landscape' : defaults.preset,
      aspectRatio: row.aspect_ratio === '9:16' ? '9:16' : row.aspect_ratio === '16:9' ? '16:9' : defaults.aspectRatio,
      width: Number(row.width) || defaults.width,
      height: Number(row.height) || defaults.height,
      optionVideoEnabled: typeof row.option_video_enabled === 'boolean' ? row.option_video_enabled : defaults.optionVideoEnabled,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
      lastSyncedAt: row.updated_at || undefined,
      syncStatus: 'synced' as const,
    };
  });
}

async function saveCloudLibrary(library: VaultLibrary): Promise<VaultLibrary> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { error } = await supabase.from('libraries').upsert({
    id: library.id,
    name: library.name,
    preset: library.preset,
    aspect_ratio: library.aspectRatio,
    width: library.width,
    height: library.height,
    option_video_enabled: library.optionVideoEnabled,
    created_at: library.createdAt,
    updated_at: library.updatedAt,
  });
  if (error) throw error;
  return { ...library, syncStatus: 'synced', lastSyncedAt: new Date().toISOString() };
}

async function deleteCloudLibrary(id: string): Promise<void> {
  if (!supabase || id === DEFAULT_LIBRARY_ID) return;
  const { error } = await supabase.from('libraries').delete().eq('id', id);
  if (error) throw error;
}

async function mergeCloudLibrariesIntoLocal(cloudLibraries: VaultLibrary[]) {
  const localLibraries = await loadLocalLibraries();
  const queue = await listSyncQueue();
  const pendingLibraryIds = new Set(queue.filter((item) => item.entity === 'library').map((item) => item.id));
  const localById = new Map(localLibraries.map((library) => [library.id, library]));
  const cloudIds = new Set(cloudLibraries.map((library) => library.id));

  for (const cloud of cloudLibraries) {
    if (pendingLibraryIds.has(cloud.id)) continue;
    const local = localById.get(cloud.id);
    if (!local || cloud.updatedAt >= local.updatedAt) await putLocalLibrary(cloud);
    else if (local.syncStatus !== 'synced') await putSyncQueue({ id: local.id, entity: 'library', operation: 'upsert', updatedAt: local.updatedAt });
  }

  for (const local of localLibraries) {
    if (pendingLibraryIds.has(local.id) || cloudIds.has(local.id)) continue;
    if (local.syncStatus === 'local' || local.syncStatus === 'pending' || local.syncStatus === 'error') {
      await putSyncQueue({ id: local.id, entity: 'library', operation: 'upsert', updatedAt: local.updatedAt });
    }
  }
}

async function saveCloudIdeaBox(reference: IdeaBox): Promise<IdeaBox> {
  if (!supabase) throw new Error('Supabase is not configured.');

  const { data: existingOptions, error: existingError } = await supabase.from('idea_options').select('id').eq('idea_box_id', reference.id);
  if (existingError) throw existingError;

  const cloudOptions = await Promise.all(reference.options.map(async (option) => {
    const cloudImageUrl = await uploadOptionImage(reference.id, option);
    return { ...option, cloudImageUrl };
  }));

  const updatedAt = reference.updatedAt || new Date().toISOString();
  const { error: boxError } = await supabase.from('idea_boxes').upsert({
    id: reference.id,
    title: reference.title,
    favorite: reference.favorite,
    created_at: reference.createdAt,
    library_id: reference.libraryId || DEFAULT_LIBRARY_ID,
    source: reference.source || '',
    notes: reference.notes || '',
    video_url: reference.videoUrl || '',
    thumbnail_option_id: reference.thumbnailOptionId || cloudOptions[0]?.id || null,
    updated_at: updatedAt,
  });
  if (boxError) throw boxError;

  if (cloudOptions.length) {
    const { error: optionError } = await supabase.from('idea_options').upsert(cloudOptions.map((option, index) => ({
      id: option.id,
      idea_box_id: reference.id,
      title: option.title,
      image_url: option.cloudImageUrl || option.image,
      video_url: option.videoUrl || '',
      prompt_used: option.promptUsed || '',
      notes: option.notes || '',
      color_palette: option.colorPalette || [],
      sort_order: index,
      updated_at: updatedAt,
    })));
    if (optionError) throw optionError;
  }

  const currentIds = new Set(cloudOptions.map((option) => option.id));
  const removedIds = ((existingOptions ?? []) as Array<{ id: string }>).map((option) => option.id).filter((id) => !currentIds.has(id));
  if (removedIds.length) {
    const { error: deleteRowsError } = await supabase.from('idea_options').delete().in('id', removedIds);
    if (deleteRowsError) throw deleteRowsError;
    await supabase.storage.from(DESIGN_VAULT_BUCKET).remove(removedIds.map((id) => optionPath(reference.id, id)));
  }

  const syncedAt = new Date().toISOString();
  return { ...reference, options: cloudOptions, syncStatus: 'synced', lastSyncedAt: syncedAt };
}

async function deleteCloudIdeaBox(id: string): Promise<void> {
  if (!supabase) return;
  const { data: options, error: optionsError } = await supabase.from('idea_options').select('id').eq('idea_box_id', id);
  if (optionsError) throw optionsError;
  if (options?.length) await supabase.storage.from(DESIGN_VAULT_BUCKET).remove((options as Array<{ id: string }>).map((option) => optionPath(id, option.id)));
  const { error } = await supabase.from('idea_boxes').delete().eq('id', id);
  if (error) throw error;
}

function afterLocalMutation() {
  void refreshSyncSummary();
  if (isSupabaseConfigured && getAutoSync() && (typeof navigator === 'undefined' || navigator.onLine)) {
    window.setTimeout(() => void syncNow(), 50);
  }
}

export async function loadIdeaBoxes(): Promise<IdeaBox[]> {
  return loadLocalIdeaBoxes();
}

export async function loadIdeaBox(id: string): Promise<IdeaBox | null> {
  const local = await loadLocalIdeaBox(id);
  if (local) return local;
  if (!isSupabaseConfigured || (typeof navigator !== 'undefined' && !navigator.onLine)) return null;
  try {
    const cloud = await loadCloudIdeaBox(id);
    if (!cloud) return null;
    const cached = await cacheCloudImages(cloud);
    await putLocalIdeaBox(cached);
    return cached;
  } catch {
    return null;
  }
}

export async function saveIdeaBox(reference: IdeaBox): Promise<IdeaBox> {
  const now = new Date().toISOString();
  const local: IdeaBox = {
    ...reference,
    updatedAt: now,
    syncStatus: isSupabaseConfigured ? 'pending' : 'local',
  };
  await putLocalIdeaBox(local);
  if (isSupabaseConfigured) await putSyncQueue({ id: local.id, operation: 'upsert', updatedAt: now });
  afterLocalMutation();
  return local;
}

export async function deleteIdeaBox(id: string): Promise<void> {
  const now = new Date().toISOString();
  if (isSupabaseConfigured) await putSyncQueue({ id, operation: 'delete', updatedAt: now });
  await removeLocalIdeaBox(id);
  afterLocalMutation();
}

async function processQueueItem(item: SyncQueueItem) {
  if (!isSupabaseConfigured || !supabase) return;
  if (item.entity === 'library') {
    if (item.operation === 'delete') {
      await deleteCloudLibrary(item.id);
      await removeSyncQueue(item.id);
      return;
    }
    const library = await loadLocalLibrary(item.id);
    if (!library) {
      await deleteCloudLibrary(item.id);
      await removeSyncQueue(item.id);
      return;
    }
    const synced = await saveCloudLibrary(library);
    await putLocalLibrary(synced);
    await removeSyncQueue(item.id);
    return;
  }
  if (item.operation === 'delete') {
    const cloud = await loadCloudIdeaBox(item.id);
    if (cloud && cloud.updatedAt > item.updatedAt) {
      await putLocalIdeaBox(await cacheCloudImages(cloud));
      await removeSyncQueue(item.id);
      return;
    }
    await deleteCloudIdeaBox(item.id);
    await removeSyncQueue(item.id);
    return;
  }

  const local = await loadLocalIdeaBox(item.id);
  if (!local) {
    await deleteCloudIdeaBox(item.id);
    await removeSyncQueue(item.id);
    return;
  }

  await putLocalIdeaBox({ ...local, syncStatus: 'syncing' });
  const cloud = await loadCloudIdeaBox(item.id);
  if (cloud && cloud.updatedAt > local.updatedAt) {
    const merged = preserveLocalImages(local, cloud);
    await putLocalIdeaBox(await cacheCloudImages(merged));
    await removeSyncQueue(item.id);
    return;
  }

  const synced = await saveCloudIdeaBox(local);
  await putLocalIdeaBox(synced);
  await removeSyncQueue(item.id);
}

async function mergeCloudIntoLocal(cloudBoxes: IdeaBox[]) {
  const localBoxes = await loadLocalIdeaBoxes();
  const queue = await listSyncQueue();
  const pendingIds = new Set(queue.map((item) => item.id));
  const localById = new Map(localBoxes.map((box) => [box.id, box]));
  const cloudIds = new Set(cloudBoxes.map((box) => box.id));

  for (const cloud of cloudBoxes) {
    if (pendingIds.has(cloud.id)) continue;
    const local = localById.get(cloud.id) ?? null;
    if (!local || cloud.updatedAt >= local.updatedAt) {
      const merged = preserveLocalImages(local, cloud);
      await putLocalIdeaBox(await cacheCloudImages(merged));
    } else if (local.syncStatus !== 'synced') {
      await putSyncQueue({ id: local.id, operation: 'upsert', updatedAt: local.updatedAt });
    }
  }

  for (const local of localBoxes) {
    if (pendingIds.has(local.id) || cloudIds.has(local.id)) continue;
    if (local.syncStatus === 'local' || local.syncStatus === 'pending' || local.syncStatus === 'error') {
      await putSyncQueue({ id: local.id, operation: 'upsert', updatedAt: local.updatedAt });
    } else if (local.syncStatus === 'synced') {
      await removeLocalIdeaBox(local.id);
    }
  }
}

export async function syncNow(): Promise<IdeaBox[]> {
  if (!isSupabaseConfigured) {
    await refreshSyncSummary();
    return loadLocalIdeaBoxes();
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    emitSummary({ online: false, error: 'Offline · changes are saved locally and will sync later.' });
    return loadLocalIdeaBoxes();
  }
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    emitSummary({ syncing: true, online: true, error: undefined });
    try {
      const queue = await listSyncQueue();
      for (const item of queue.sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) {
        try {
          await processQueueItem(item);
        } catch (error) {
          const local = await loadLocalIdeaBox(item.id);
          if (local) await putLocalIdeaBox({ ...local, syncStatus: 'error' });
          throw error;
        }
      }

      const [cloud, cloudLibraries] = await Promise.all([loadCloudIdeaBoxes(), loadCloudLibraries()]);
      await mergeCloudIntoLocal(cloud);
      await mergeCloudLibrariesIntoLocal(cloudLibraries);

      const secondPass = await listSyncQueue();
      for (const item of secondPass) await processQueueItem(item);

      const syncedAt = new Date().toISOString();
      if (typeof window !== 'undefined') window.localStorage.setItem(LAST_SYNC_KEY, syncedAt);
      const remaining = await listSyncQueue();
      emitSummary({ syncing: false, pendingCount: remaining.length, lastSyncedAt: syncedAt, error: undefined });
      const boxes = await loadLocalIdeaBoxes();
      emitData(boxes);
      return boxes;
    } catch (error) {
      const remaining = await listSyncQueue();
      emitSummary({ syncing: false, pendingCount: remaining.length, error: error instanceof Error ? error.message : 'Cloud sync failed.' });
      return await loadLocalIdeaBoxes();
    } finally {
      syncPromise = null;
    }
  })();

  return syncPromise;
}

export function installOnlineSyncHandler(onSynced?: (boxes: IdeaBox[]) => void) {
  if (typeof window === 'undefined') return () => {};
  const online = () => {
    emitSummary({ online: true });
    if (getAutoSync() && isSupabaseConfigured) void syncNow().then((boxes) => onSynced?.(boxes));
  };
  const offline = () => emitSummary({ online: false, error: 'Offline · changes are saved locally.' });
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  return () => {
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
}


export async function loadLibraries(): Promise<VaultLibrary[]> {
  return loadLocalLibraries();
}

export async function saveLibrary(input: VaultLibrary): Promise<VaultLibrary> {
  const now = new Date().toISOString();
  const library: VaultLibrary = {
    ...input,
    updatedAt: now,
    syncStatus: isSupabaseConfigured ? 'pending' : 'local',
  };
  await putLocalLibrary(library);
  if (isSupabaseConfigured) await putSyncQueue({ id: library.id, entity: 'library', operation: 'upsert', updatedAt: now });
  afterLocalMutation();
  return library;
}

export async function createLibrary(name: string, preset?: LibraryPreset): Promise<VaultLibrary> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Library name is required.');
  const now = new Date().toISOString();
  const defaults = preset === 'video-story'
    ? { preset: 'video-story' as const, aspectRatio: '9:16' as const, width: 1080, height: 1920, optionVideoEnabled: true }
    : preset === 'image-landscape'
      ? { preset: 'image-landscape' as const, aspectRatio: '16:9' as const, width: 1920, height: 1080, optionVideoEnabled: false }
      : libraryPresetDefaults(trimmed);
  const library: VaultLibrary = {
    id: `library-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed,
    ...defaults,
    createdAt: now,
    updatedAt: now,
    syncStatus: isSupabaseConfigured ? 'pending' : 'local',
  };
  return saveLibrary(library);
}

export async function deleteLibrary(id: string): Promise<void> {
  if (id === DEFAULT_LIBRARY_ID) throw new Error('The Sermon Series library cannot be deleted.');
  const boxes = await loadLocalIdeaBoxes();
  for (const box of boxes.filter((item) => item.libraryId === id)) {
    await saveIdeaBox({ ...box, libraryId: DEFAULT_LIBRARY_ID });
  }
  const now = new Date().toISOString();
  if (isSupabaseConfigured) await putSyncQueue({ id, entity: 'library', operation: 'delete', updatedAt: now });
  await removeLocalLibrary(id);
  afterLocalMutation();
}

export async function imageFileToStorageDataUrl(file: File, maxDimension = 1800, quality = 0.86): Promise<string> {
  const source = await readFileAsDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  ctx.drawImage(image, 0, 0, width, height);
  try { return canvas.toDataURL('image/webp', quality); } catch { return source; }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to decode image.'));
    image.src = src;
  });
}
