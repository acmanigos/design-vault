import { withVaultLock } from './lock';
import { DEFAULT_LIBRARY_ID, libraryPresetDefaults, type IdeaBox, type IdeaOption, type LibraryPreset, type VaultLibrary } from './types';
import { DESIGN_VAULT_BUCKET, isSupabaseConfigured, supabase } from './supabase';
import { currentAccount, verifyAccount } from './account';
import { canEdit, canManage } from './permissions';
import { listSyncQueue, loadLocalIdeaBox, loadLocalIdeaBoxes, loadLocalLibraries, loadLocalLibrary, putLocalIdeaBox, putLocalLibrary, putSyncQueue, removeLocalIdeaBox, removeLocalLibrary, removeSyncQueue, type SyncQueueItem } from './local-db';
export { isSupabaseConfigured } from './supabase';
export { imageFileToStorageDataUrl } from './images';

export type SyncSummary = { configured: boolean; online: boolean; syncing: boolean; pendingCount: number; lastSyncedAt?: string; error?: string };
let summary: SyncSummary = { configured: isSupabaseConfigured, online: true, syncing: false, pendingCount: 0 };
const listeners = new Set<(value: SyncSummary) => void>();
const dataListeners = new Set<(boxes: IdeaBox[]) => void>();
let syncPromise: Promise<IdeaBox[]> | null = null;
function emitSummary(patch: Partial<SyncSummary>) { summary = { ...summary, ...patch }; listeners.forEach(f => f(summary)); }
export function subscribeSyncSummary(f: (value: SyncSummary) => void) { listeners.add(f); f(summary); return () => listeners.delete(f); }
export function subscribeDataChanges(f: (boxes: IdeaBox[]) => void) { dataListeners.add(f); return () => dataListeners.delete(f); }
export async function refreshSyncSummary() { emitSummary({ pendingCount: (await listSyncQueue()).length, online: navigator.onLine }); return summary; }
export function getAutoSync() { return typeof window === 'undefined' || localStorage.getItem('vault-auto-sync-' + currentAccount()) !== 'false'; }
export function setAutoSync(value: boolean) { localStorage.setItem('vault-auto-sync-' + currentAccount(), String(value)); if (value) void syncNow(); }
function changed() { void refreshSyncSummary(); if (supabase && getAutoSync() && navigator.onLine) window.setTimeout(() => void syncNow(), 50); }

async function requireEdit(id: string, manage = false) {
  const library = await loadLocalLibrary(id);
  if (!library || !(manage ? canManage(library) : canEdit(library))) throw new Error(manage ? 'Only the owner can manage this library.' : 'This library is read-only.');
  return library;
}
export async function loadIdeaBoxes() { const deleted = new Set((await listSyncQueue()).filter(q => q.operation === 'delete').map(q => q.id)); return (await loadLocalIdeaBoxes()).filter(b => !deleted.has(b.id)); }
export async function loadIdeaBox(id: string) { return loadLocalIdeaBox(id); }
export async function loadLibraries() { const deleted = new Set((await listSyncQueue()).filter(q => q.operation === 'delete').map(q => q.id)); return (await loadLocalLibraries()).filter(l => !deleted.has(l.id)); }
async function saveIdeaBoxUnlocked(input: IdeaBox) {
  await requireEdit(input.libraryId);
  const previous = await loadLocalIdeaBox(input.id);
  if (previous && input.updatedAt !== previous.updatedAt) throw new Error('This idea changed while you were editing. Keep your draft, then reopen the latest version.');
  if (previous && previous.libraryId !== input.libraryId) {
    await requireEdit(previous.libraryId, true); await requireEdit(input.libraryId, true);
  }
  const local = { ...input, lastSyncedAt: previous?.lastSyncedAt, updatedAt: new Date().toISOString(), syncStatus: supabase ? 'pending' as const : 'local' as const };
  await putLocalIdeaBox(local);
  if (supabase) await putSyncQueue({ id: local.id, operation: 'upsert', updatedAt: local.updatedAt });
  changed(); return local;
}
async function deleteIdeaBoxUnlocked(id: string) {
  const box = await loadLocalIdeaBox(id); if (!box) return;
  await requireEdit(box.libraryId);
  // Keep the full record until the server acknowledges deletion, for conflict recovery.
  if (supabase) await putSyncQueue({ id, operation: 'delete', updatedAt: new Date().toISOString() });
  else await removeLocalIdeaBox(id);
  changed();
}
async function saveLibraryUnlocked(input: VaultLibrary) {
  const previous = await loadLocalLibrary(input.id);
  if (previous && input.updatedAt !== previous.updatedAt) throw new Error('This library changed. Refresh before editing its settings.');
  if (previous) await requireEdit(input.id, true);
  const library: VaultLibrary = { ...input, ownerId: previous?.ownerId || currentAccount(), role: 'owner', visibility: input.visibility || 'private', lastSyncedAt: previous?.lastSyncedAt, updatedAt: new Date().toISOString(), syncStatus: supabase ? 'pending' : 'local' };
  await putLocalLibrary(library);
  if (supabase) await putSyncQueue({ id: library.id, entity: 'library', operation: 'upsert', updatedAt: library.updatedAt });
  changed(); return library;
}
export async function createLibrary(name: string, preset?: LibraryPreset) {
  if (!name.trim()) throw new Error('Library name is required.');
  const defaults = libraryPresetDefaults(preset === 'video-story' ? 'story' : name);
  if (preset === 'image-landscape') Object.assign(defaults, libraryPresetDefaults('design'));
  return saveLibrary({ id: crypto.randomUUID(), name: name.trim(), ...defaults, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), syncStatus: 'local' });
}
async function deleteLibraryUnlocked(id: string) {
  if (id === DEFAULT_LIBRARY_ID) throw new Error('The default library cannot be deleted.');
  await requireEdit(id, true);
  const boxes = (await loadLocalIdeaBoxes()).filter(b => b.libraryId === id);
  if (boxes.length) await requireEdit(DEFAULT_LIBRARY_ID, true);
  for (const box of boxes) await saveIdeaBoxUnlocked({ ...box, libraryId: DEFAULT_LIBRARY_ID });
  if (supabase) await putSyncQueue({ id, entity: 'library', operation: 'delete', updatedAt: new Date().toISOString() });
  else await removeLocalLibrary(id);
  changed();
}

function storagePath(value: string) {
  if (value.startsWith('storage:')) return value.slice(8);
  // Convert only this project's old public URLs; do not send tokens to external hosts.
  try {
    const url = new URL(value);
    const base = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
    const prefix = '/storage/v1/object/public/' + DESIGN_VAULT_BUCKET + '/';
    if (url.origin === base.origin && url.pathname.startsWith(prefix)) return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {}
  return null;
}
async function imageData(value: string): Promise<string> {
  const path = storagePath(value);
  let blob: Blob;
  if (path) {
    const { data, error } = await supabase!.storage.from(DESIGN_VAULT_BUCKET).download(path);
    if (error) throw error; blob = data;
  } else {
    if (!/^https?:|^data:image\//.test(value)) return '';
    const response = await fetch(value, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error('Image download failed.'); blob = await response.blob();
  }
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}
async function uploadOption(box: IdeaBox, option: IdeaOption) {
  const oldPath = storagePath(option.cloudImageUrl || '');
  if (oldPath) return 'storage:' + oldPath;
  if (!option.image.startsWith('data:')) return option.image;
  const blob = await (await fetch(option.image)).blob();
  const path = currentAccount() + '/' + box.libraryId + '/' + crypto.randomUUID() + '.webp';
  const { error } = await supabase!.storage.from(DESIGN_VAULT_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return 'storage:' + path;
}
function mapLibrary(row: any, roles: Map<string, string>): VaultLibrary {
  const own = row.owner_id === currentAccount();
  return { id: row.id, name: row.name, preset: row.preset, aspectRatio: row.aspect_ratio, width: row.width, height: row.height, optionVideoEnabled: row.option_video_enabled, createdAt: row.created_at, updatedAt: row.updated_at, lastSyncedAt: row.updated_at, syncStatus: 'synced', ownerId: row.owner_id, visibility: row.visibility, role: own ? 'owner' : roles.get(row.id) as 'editor' | 'viewer' };
}
async function cloudSnapshot() {
  // One SQL statement gives a consistent snapshot and avoids PostgREST's
  // per-table row limit silently truncating larger option collections.
  const { data, error } = await supabase!.rpc('vault_snapshot');
  if (error) throw error;
  const roles = new Map<string, string>((data.members || []).map((r: any) => [r.library_id, r.role]));
  const libraries: VaultLibrary[] = (data.libraries || []).map((r: any) => mapLibrary(r, roles));
  const boxes: IdeaBox[] = (data.boxes || []).map((r: any) => ({
    id: r.id, title: r.title, favorite: r.favorite, libraryId: r.library_id, source: r.source, notes: r.notes, videoUrl: r.video_url, thumbnailOptionId: r.thumbnail_option_id,
    createdAt: r.created_at, updatedAt: r.updated_at, lastSyncedAt: r.updated_at, syncStatus: 'synced',
    options: (data.options || []).filter((o: any) => o.idea_box_id === r.id).map((o: any) => ({ id: o.id, title: o.title, image: o.image_url, cloudImageUrl: o.image_url, videoUrl: o.video_url, promptUsed: o.prompt_used, notes: o.notes, colorPalette: o.color_palette }))
  }));
  return { libraries, boxes };
}
async function cacheBox(box: IdeaBox) {
  const old = await loadLocalIdeaBox(box.id);
  for (const option of box.options) {
    const cached = old?.options.find(o => o.id === option.id);
    if (cached?.image.startsWith('data:') && storagePath(cached.cloudImageUrl || '') === storagePath(option.cloudImageUrl || '') && cached.cloudImageUrl) option.image = cached.image;
    else if (option.image) {
      try { option.image = await imageData(option.image); }
      catch { option.image = ''; } // Never persist a bearer signed URL. Next sync retries.
    }
  }
  await putLocalIdeaBox(box);
}
async function reconcile(snapshot: Awaited<ReturnType<typeof cloudSnapshot>>) {
  const queue = await listSyncQueue();
  const pending = new Set(queue.map(q => q.id));
  const accessible = new Map(snapshot.libraries.map(l => [l.id, l]));
  for (const lib of snapshot.libraries) {
    const local = await loadLocalLibrary(lib.id);
    if (!pending.has(lib.id)) await putLocalLibrary(lib);
    else if (local) await putLocalLibrary({ ...local, role: lib.role, ownerId: lib.ownerId, visibility: local.ownerId === currentAccount() ? local.visibility : lib.visibility });
  }
  for (const local of await loadLocalLibraries()) {
    if (!accessible.has(local.id) && local.lastSyncedAt) {
      // Revoked membership: purge cached shared content and pending writes on reconnect.
      await removeLocalLibrary(local.id); await removeSyncQueue(local.id);
      for (const b of await loadLocalIdeaBoxes()) if (b.libraryId === local.id) { await removeLocalIdeaBox(b.id); await removeSyncQueue(b.id); }
    }
  }
  for (const box of snapshot.boxes) if (!pending.has(box.id)) await cacheBox(box);
  const ids = new Set(snapshot.boxes.map(b => b.id));
  for (const local of await loadLocalIdeaBoxes()) if (!ids.has(local.id) && local.lastSyncedAt && !pending.has(local.id)) await removeLocalIdeaBox(local.id);
}
async function processItem(item: SyncQueueItem) {
  const isLibrary = item.entity === 'library';
  const local = isLibrary ? await loadLocalLibrary(item.id) : await loadLocalIdeaBox(item.id);
  if (!local) { await removeSyncQueue(item.id); return; }
  if (isLibrary) await requireEdit(item.id, true); else await requireEdit((local as IdeaBox).libraryId);
  let payload: unknown = local;
  if (!isLibrary && item.operation === 'upsert') {
    const box = local as IdeaBox;
    const options = [];
    for (const option of box.options) options.push({ ...option, image: await uploadOption(box, option), cloudImageUrl: undefined });
    payload = { ...box, options };
  }
  const { data, error } = await supabase!.rpc('vault_write', { entity: isLibrary ? 'library' : 'box', operation: item.operation, payload, expected: local.lastSyncedAt || null });
  if (error) throw error;
  // A newer local edit made during a network request must remain queued.
  const latest = isLibrary ? await loadLocalLibrary(item.id) : await loadLocalIdeaBox(item.id);
  const queued = (await listSyncQueue()).find(q => q.id === item.id);
  if (item.operation === 'delete') {
    if (queued?.updatedAt === item.updatedAt) {
      if (isLibrary) await removeLocalLibrary(item.id); else await removeLocalIdeaBox(item.id);
      await removeSyncQueue(item.id);
    }
    return;
  }
  if (!latest) return;
  const unchanged = latest.updatedAt === local.updatedAt && queued?.updatedAt === item.updatedAt && queued?.operation === item.operation;
  const saved = { ...latest, lastSyncedAt: data as string, syncStatus: unchanged ? 'synced' as const : 'pending' as const };
  if (isLibrary) await putLocalLibrary(saved as VaultLibrary);
  else {
    const sent = payload as IdeaBox;
    const box = saved as IdeaBox;
    box.options = box.options.map(o => {
      const before = (local as IdeaBox).options.find(x => x.id === o.id);
      const uploaded = sent.options.find(x => x.id === o.id);
      return before?.image === o.image && uploaded ? { ...o, cloudImageUrl: uploaded.image } : o;
    });
    await putLocalIdeaBox(box);
  }
  if (unchanged) await removeSyncQueue(item.id);
}
export async function syncNow(): Promise<IdeaBox[]> {
  if (!supabase || !navigator.onLine) { await refreshSyncSummary(); return loadIdeaBoxes(); }
  if (syncPromise) return syncPromise;
  syncPromise = withVaultLock(async () => {
    emitSummary({ syncing: true, error: undefined });
    try {
      await verifyAccount();
      // Refresh membership before processing any offline mutations.
      await reconcile(await cloudSnapshot());
      for (const lib of await loadLocalLibraries()) {
        if (!lib.lastSyncedAt && canManage(lib) && !(await listSyncQueue()).some(q => q.id === lib.id))
          await putSyncQueue({ id: lib.id, entity: 'library', operation: 'upsert', updatedAt: lib.updatedAt });
      }
      const queue = await listSyncQueue();
      const rank = (q: SyncQueueItem) => q.entity === 'library' ? (q.operation === 'delete' ? 2 : 0) : 1;
      const errors: string[] = [];
      for (const item of queue.sort((a, b) => rank(a) - rank(b))) {
        try { await processItem(item); }
        catch(e) { errors.push(e instanceof Error ? e.message : (e as { message?: string })?.message || 'Sync failed.'); }
      }
      await reconcile(await cloudSnapshot());
      emitSummary({ lastSyncedAt: new Date().toISOString(), error: errors.length ? errors[0] + ' Your pending work is kept on this device. Download a backup before resolving it.' : undefined });
    } catch(e) { emitSummary({ error: e instanceof Error ? e.message : (e as { message?: string })?.message || 'Cloud unavailable. Your changes are saved locally.' }); }
    finally { emitSummary({ syncing: false }); await refreshSyncSummary(); syncPromise = null; }
    const boxes = await loadIdeaBoxes(); dataListeners.forEach(f => f(boxes)); return boxes;
  });
  return syncPromise;
}
export function installOnlineSyncHandler(onSynced?: (boxes: IdeaBox[]) => void) {
  const online = () => { emitSummary({ online: true }); if (getAutoSync()) void syncNow().then(onSynced); };
  const offline = () => emitSummary({ online: false });
  window.addEventListener('online', online); window.addEventListener('offline', offline);
  return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
}

export const saveIdeaBox = (input: IdeaBox) => withVaultLock(() => saveIdeaBoxUnlocked(input));
export const deleteIdeaBox = (id: string) => withVaultLock(() => deleteIdeaBoxUnlocked(id));
export const saveLibrary = (input: VaultLibrary) => withVaultLock(() => saveLibraryUnlocked(input));
export const deleteLibrary = (id: string) => withVaultLock(() => deleteLibraryUnlocked(id));
export async function reloadCloudVersion(id: string) {
  await withVaultLock(async () => {
    await verifyAccount();
    const snapshot = await cloudSnapshot(); // Fetch succeeds before discarding anything.
    const item = (await listSyncQueue()).find(q => q.id === id);
    if (!item) return;
    if (item.entity === 'library') {
      const lib = snapshot.libraries.find(l => l.id === id);
      if (lib) await putLocalLibrary(lib); else await removeLocalLibrary(id);
    } else {
      const box = snapshot.boxes.find(b => b.id === id);
      if (box) await cacheBox(box); else await removeLocalIdeaBox(id);
    }
    await removeSyncQueue(id);
    await reconcile(snapshot);
  });
  await refreshSyncSummary();
}
