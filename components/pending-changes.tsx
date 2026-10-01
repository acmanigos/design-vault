'use client';
import { useState } from 'react';
import { listSyncQueue, type SyncQueueItem } from '@/lib/local-db';
import { reloadCloudVersion } from '@/lib/storage';
import { exportBackup } from '@/lib/backup';
export default function PendingChanges() {
  const [items, setItems] = useState<SyncQueueItem[]>([]);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="text-xs">
    <button onClick={() => { setOpen(!open); void listSyncQueue().then(setItems); }}>Review pending changes</button>
    {open && <div className="space-y-3 rounded-xl border border-white/10 p-3">
      <p>Conflicting drafts stay here. Download a backup before choosing to replace a draft with the cloud version.</p>
      <button onClick={() => void exportBackup()}>Download backup</button>
      {items.map(item => <div className="flex gap-3" key={item.id}><span>{item.entity || 'Idea Box'} · {item.id} · {item.operation}</span><button disabled={busy} onClick={async () => {
        if (!confirm('Replace this pending change with the cloud version? Download a backup first if you want to keep the draft.')) return;
        setBusy(true); setMessage('');
        try { await reloadCloudVersion(item.id); setItems(await listSyncQueue()); setMessage('Cloud version loaded. Return to the vault or refresh to review.'); }
        catch(e) { setMessage(e instanceof Error ? e.message : 'Could not reload the cloud version.'); }
        finally { setBusy(false); }
      }}>Reload cloud version</button></div>)}
      {!items.length && <p>No pending changes.</p>}{message && <p role="status">{message}</p>}
    </div>}
  </div>;
}
