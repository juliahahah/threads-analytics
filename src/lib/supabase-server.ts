/**
 * Server-only Supabase client.
 *
 * Kept separate from `supabase.ts` because this module imports `next/headers`,
 * which may not be pulled into a Client Component bundle.
 */
import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase';

/**
 * Request-scoped client. Binds the request cookies so RLS evaluates against
 * the real signed-in user. Must be called from a Server Component or Route
 * Handler.
 */
export async function createServerSupabase() {
  // Next 15: cookies() is async and must be awaited.
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // Called from a Server Component: the middleware refreshes the
          // session instead, so this is safe to ignore.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch {
          /* see above */
        }
      },
    },
  });
}
