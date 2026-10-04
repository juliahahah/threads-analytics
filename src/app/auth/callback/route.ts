/**
 * OAuth / Magic Link callback. Exchanges the one-time code for a session
 * cookie, then forwards the user to the dashboard.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createServerSupabase } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/login?reason=not-configured`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?reason=missing-code`);
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?reason=${encodeURIComponent(error.message)}`,
    );
  }
  return NextResponse.redirect(`${origin}${next}`);
}
