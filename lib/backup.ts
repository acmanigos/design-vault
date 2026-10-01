import { currentAccount, verifyAccount } from './account';
import { withVaultLock } from './lock';
import { supabase } from './supabase';
import { loadLocalIdeaBoxes, loadLocalLibraries, loadLocalIdeaBox, loadLocalLibrary, putLocalIdeaBox, putLocalLibrary, putSyncQueue, normalizeIdeaBox, normalizeLibrary } from './local-db';

export async function exportBackup() {
  const backup = { version: 1, account: currentAccount(), exportedAt: new Date().toISOString(), libraries: await loadLocalLibraries(), boxes: await loadLocalIdeaBoxes() };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'design-vault-backup-' + new Date().toISOString().slice(0, 10) + '.json'; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// The original database is opened read-only and is never renamed, cleared or upgraded.
async function importLegacyVaultUnlocked() {
  await verifyAccount();
  const { data, error } = await supabase!.rpc('vault_is_legacy_owner');
  if (error || data !== true) throw new Error('Only the configured original owner may import this device’s legacy vault.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('design-vault-db');
    request.onupgradeneeded = () => { request.transaction?.abort(); reject(new Error('No old vault exists in this browser.')); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const read = (store: string, key?: string) => new Promise<any[]>((resolve, reject) => {
    if (!db.objectStoreNames.contains(store)) { resolve([]); return; }
    const tx = db.transaction(store, 'readonly');
    const request = key ? tx.objectStore(store).get(key) : tx.objectStore(store).getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error);
  });
  try {
    const libs = await read('libraries');
    const boxes = [...await read('ideaBoxes'), ...await read('vault', 'sermon-ideas')];
    for (const raw of libs) {
      const lib = normalizeLibrary(raw);
      if (await loadLocalLibrary(lib.id)) continue;
      await putLocalLibrary({ ...lib, ownerId: currentAccount(), role: 'owner', visibility: 'private', syncStatus: 'pending' });
      await putSyncQueue({ id: lib.id, entity: 'library', operation: 'upsert', updatedAt: lib.updatedAt });
    }
    for (const raw of boxes) {
      const box = normalizeIdeaBox(raw);
      const existing = await loadLocalIdeaBox(box.id);
      // Never overwrite cloud or previously imported work. Preserve a separate copy of
      // any divergent legacy draft, including a fresh set of option IDs.
      if (existing) {
        if (JSON.stringify(existing.options) === JSON.stringify(box.options) && existing.title === box.title && existing.notes === box.notes && existing.favorite === box.favorite && existing.libraryId === box.libraryId && existing.source === box.source && existing.videoUrl === box.videoUrl && existing.thumbnailOptionId === box.thumbnailOptionId) continue;
        const copyId = box.id + '-legacy-copy';
        if (await loadLocalIdeaBox(copyId)) continue;
        box.id = copyId; box.title += ' (legacy device copy)';
        const oldThumb = box.thumbnailOptionId;
        box.options = box.options.map(o => ({ ...o, id: o.id + '-legacy-copy' }));
        box.thumbnailOptionId = oldThumb + '-legacy-copy';
      }
      box.lastSyncedAt = undefined;
      box.syncStatus = 'pending';
      await putLocalIdeaBox(box);
      await putSyncQueue({ id: box.id, operation: 'upsert', updatedAt: box.updatedAt });
    }
  } finally { db.close(); }
}
export function importLegacyVault() { return withVaultLock(importLegacyVaultUnlocked); }
