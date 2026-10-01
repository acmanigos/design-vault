import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const AUTH_STORAGE_KEY = 'design-vault-auth';
export const passwordSetupRequested = typeof window !== 'undefined' && /type=(recovery|invite)/.test(window.location.hash);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_STORAGE_KEY },
    })
  : null;

export const DESIGN_VAULT_BUCKET = 'design-vault';

