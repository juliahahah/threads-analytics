import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createServerSupabase } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
