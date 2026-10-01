'use client';
import PendingChanges from './pending-changes';
import { FormEvent, ReactNode, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, passwordSetupRequested, AUTH_STORAGE_KEY } from '@/lib/supabase';
import { setAccount } from '@/lib/account';
import { setDefaultLibraryId } from '@/lib/types';
import { exportBackup, importLegacyVault } from '@/lib/backup';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(passwordSetupRequested);
  const [legacyOwner, setLegacyOwner] = useState(false);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === AUTH_STORAGE_KEY || event.key === 'vault-offline-profile') window.location.reload();
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    let cancelled = false;
    let activeId: string | undefined;
    const offlineProfile = localStorage.getItem('vault-offline-profile');
    if (!navigator.onLine && offlineProfile) {
      try {
        const profile = JSON.parse(offlineProfile);
        if (typeof profile.id === 'string' && typeof profile.email === 'string') {
          setAccount(profile.id);
          const owner = localStorage.getItem('vault-legacy-owner-' + profile.id) === 'true';
          setDefaultLibraryId(owner ? 'sermon-series' : profile.id + '-sermon-series');
          // Local UI identity only: it does not grant database access or create an Auth token.
          setSession({ user: { id: profile.id, email: profile.email } } as Session);
          setLegacyOwner(owner); setReady(true);
          const reconnect = () => window.location.reload();
          window.addEventListener('online', reconnect);
          return () => window.removeEventListener('online', reconnect);
        }
      } catch {}
    }
    const apply = async (next: Session | null) => {
      const id = next?.user.id || '';
      if (activeId !== undefined && activeId !== id) { window.location.reload(); return; }
      activeId = id;
      if (id) {
        setAccount(id);
        let owner = window.localStorage.getItem('vault-legacy-owner-' + id) === 'true';
        if (navigator.onLine) {
          const { data, error } = await supabase!.rpc('vault_is_legacy_owner');
          if (error) { if (!cancelled) setMessage('Auth migration is not ready. Follow SETUP.md before opening the vault.'); return; }
          owner = data === true;
          window.localStorage.setItem('vault-legacy-owner-' + id, String(owner));
        }
        setDefaultLibraryId(owner ? 'sermon-series' : id + '-sermon-series');
        if (!cancelled) setLegacyOwner(owner);
        localStorage.setItem('vault-offline-profile', JSON.stringify({ id, email: next!.user.email || '' }));
      } else {
        localStorage.removeItem('vault-offline-profile');
      }
      if (!cancelled) { setSession(next); setReady(true); }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && window.location.hash.includes('type=invite'))) setReset(true);
      // Never await Supabase calls inside its auth callback lock.
      window.setTimeout(() => void apply(next), 0);
    });
    if (/type=(recovery|invite)/.test(window.location.hash)) setReset(true);
    void supabase.auth.getSession().then(({ data, error }) => { if (error) setMessage(error.message); else void apply(data.session); });
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage('');
    try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message : 'Action failed. Please try again.'); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      const result = session && reset
        ? await supabase!.auth.updateUser({ password })
        : await supabase!.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      setPassword(''); setReset(false);
    });
  }
  if (!supabase) return <><div className="p-3 text-amber-300">Local mode — configure Supabase to enable private accounts and team access.</div>{children}</>;
  if (!ready) return <main className="p-10" role="status">{message || 'Opening Design Vault…'}</main>;
  if (!session || reset) return <main className="grid min-h-screen place-items-center p-5">
    <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-white/10 bg-zinc-900 p-7">
      <h1 className="text-2xl font-semibold">Design Vault</h1>
      <p>{session ? 'Set your password' : 'Sign in to your private and shared libraries.'}</p>
      {!session && <label className="block">Email<input required type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded bg-zinc-800 p-3"/></label>}
      <label className="block">Password<input required minLength={session ? 12 : 1} type="password" autoComplete={session ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} className="mt-2 w-full rounded bg-zinc-800 p-3"/></label>
      <button disabled={busy} className="w-full rounded bg-orange-500 p-3 text-black">{busy ? 'Please wait…' : session ? 'Save password' : 'Sign in'}</button>
      {!session && <button type="button" disabled={busy || !email} onClick={() => void run(async () => {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
        if (error) throw error;
        setMessage('If this account exists, a password reset email has been sent.');
      })}>Forgot password?</button>}
      <p className="text-sm text-zinc-400">Access is by invitation. Ask the vault owner for your account.</p>
      {message && <p role="status" className="text-amber-300">{message}</p>}
    </form>
  </main>;
  return <>
    <div className="flex flex-wrap items-center gap-4 border-b border-white/10 bg-zinc-900 p-3 text-xs">
      <span>{session.user.email}</span><PendingChanges/>
      <button disabled={busy} onClick={() => void run(exportBackup)}>Download backup</button>
      {legacyOwner && <button disabled={busy} onClick={() => void run(async () => {
        await importLegacyVault(); setMessage('Legacy data copied safely. Reload the vault to review and sync.');
      })}>Import this device’s old vault</button>}
      <button onClick={() => setReset(true)}>Change password</button>
      <button disabled={busy} onClick={() => void run(async () => {
        localStorage.removeItem('vault-offline-profile');
        try {
          if (navigator.onLine) await supabase!.auth.signOut({ scope: 'local' });
        } finally {
          // Offline sign-out must lock this device even when token revocation
          // cannot reach the Auth server.
          for (const suffix of ['', '-code-verifier', '-user']) localStorage.removeItem(AUTH_STORAGE_KEY + suffix);
          window.location.reload();
        }
      })}>Sign out</button>
      {message && <span role="status" className="text-amber-300">{message}</span>}
    </div>
    {children}
  </>;
}
