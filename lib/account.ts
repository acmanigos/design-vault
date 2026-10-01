import { supabase } from './supabase';

let accountId = '';
export function setAccount(id: string) {
  if (accountId && accountId !== id) throw new Error('Reload required to switch accounts.');
  accountId = id;
}
export function currentAccount() {
  if (supabase && !accountId) throw new Error('Sign in first.');
  return accountId;
}
export async function verifyAccount() {
  if (!supabase) return;
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== currentAccount()) throw new Error('Sign in again before syncing.');
}
