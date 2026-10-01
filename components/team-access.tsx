'use client';
import { useEffect, useState } from 'react';
import { members, removeMember, setMember, type Member } from '@/lib/team';
import { saveLibrary, syncNow, loadLibraries } from '@/lib/storage';
import { canManage } from '@/lib/permissions';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { VaultLibrary } from '@/lib/types';
export default function TeamAccess({ library, onChange }: { library: VaultLibrary; onChange: (libraries: VaultLibrary[]) => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Member[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('viewer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setOpen(false); setList([]); setError(''); }, [library.id]);
  if (!isSupabaseConfigured) return null;
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); try { await action(); } catch(e) { setError(e instanceof Error ? e.message : 'Could not update access.'); } finally { setBusy(false); } }
  return <section className="my-3 rounded-xl border border-white/10 p-3 text-xs">
    <span>{library.visibility === 'shared' ? 'Shared' : 'Private'} · {library.role || 'owner'}</span>
    {canManage(library) && <button className="ml-4 text-orange-300" onClick={() => { setOpen(!open); if (!open) void run(async () => setList(await members(library.id))); }}>Manage access</button>}
    {open && <div className="mt-3 space-y-3">
      <label>Library visibility <select disabled={busy} className="bg-zinc-800 p-2" value={library.visibility || 'private'} onChange={e => { const visibility = e.target.value as 'shared' | 'private'; void run(async () => { await saveLibrary({ ...library, visibility }); await syncNow(); onChange(await loadLibraries()); }); }}><option value="private">Private</option><option value="shared">Shared with members</option></select></label>
      <p>Invite your friend through Supabase Auth first, then add their account email here. Editors can change ideas; viewers can browse and copy. Only you can manage this library.</p>
      <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { await setMember(library.id, email, role); setList(await members(library.id)); setEmail(''); }); }}>
        <input required type="email" aria-label="Friend’s email" placeholder="Friend’s email" className="bg-zinc-800 p-2" value={email} onChange={e => setEmail(e.target.value)}/>
        <select aria-label="Permission" className="bg-zinc-800 p-2" value={role} onChange={e => setRole(e.target.value)}><option value="viewer">Viewer</option><option value="editor">Editor</option></select>
        <button disabled={busy || library.visibility !== 'shared'}>Add / update member</button>
      </form>
      {list.map(member => <div className="flex flex-wrap gap-3" key={member.user_id}><span>{member.email} · {member.role}</span><button disabled={busy} onClick={() => void run(async () => { await removeMember(library.id, member.user_id); setList(await members(library.id)); })}>Remove access</button></div>)}
    </div>}
    {error && <p role="alert" className="mt-2 text-amber-300">{error}</p>}
  </section>;
}
