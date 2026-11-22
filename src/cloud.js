// Supabase client. Imported lazily by src/sync.js, only once someone signs
// in (or already is), so the signed-out app never downloads it.
//
// Knightly lives in the WorkLog Supabase project, next to Vetted's tables.
// The publishable key is public by design; knightly_items is locked to each
// user's own rows by RLS (SUPABASE-SETUP.md).
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://uhlbrxyvhfmfeakckzlu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ddVyqs4A4o9j2WsUkDHeZQ_6UskvhMg';

// Its own session key, so Knightly never shares a session with another app on
// the same origin (localhost during development). src/sync.js checks for this
// key to decide whether to load this module at startup.
export const AUTH_STORAGE_KEY = 'knightly-auth';

export const supa = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY },
});
