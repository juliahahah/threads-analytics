/**
 * Shared Supabase config + the BROWSER client.
 *
 * This module must stay free of `next/headers`, because Client Components
 * import it. The server-only client lives in `supabase-server.ts`.
 *
 * The project runs in two modes (see DATA_SOURCE in .env.example):
 *   - mock     : no Supabase credentials required; data comes from data/posts.json
 *   - supabase : full auth + persistence
 *
 * `isSupabaseConfigured()` lets the UI degrade gracefully instead of crashing
 * with an opaque error when the keys are absent.
 */
import { createBrowserClient } from '@supabase/ssr';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Browser-side client (login form, sign-out). */
export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
