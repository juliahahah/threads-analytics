/**
 * Route protection + session refresh.
 *
 * Enforces the exam requirement "未登入使用者不可查看分析 dashboard":
 * any request to /dashboard without a valid session is redirected to /login.
 * Running this in middleware means the guard applies before the page renders,
 * so protected data never reaches an anonymous client.
 */
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request: { headers: request.headers } });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const isProtected = PROTECTED_PREFIXES.some((p) =>
    request.nextUrl.pathname.startsWith(p),
  );

  // Without Supabase credentials there is no auth system to consult. Rather
  // than silently exposing the dashboard, send users to /login, which explains
  // the setup state and offers the explicit local demo entry point.
  if (!url || !anonKey) {
    if (isProtected && request.nextUrl.searchParams.get('demo') !== '1') {
      const redirect = request.nextUrl.clone();
      redirect.pathname = '/login';
      redirect.searchParams.set('reason', 'not-configured');
      return NextResponse.redirect(redirect);
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        request.cookies.set({ name, value, ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: CookieOptions) {
        request.cookies.set({ name, value: '', ...options });
        response = NextResponse.next({ request: { headers: request.headers } });
        response.cookies.set({ name, value: '', ...options });
      },
    },
  });

  // getUser() revalidates the JWT with Supabase; getSession() would trust the
  // cookie as-is, which is not safe for an access-control decision.
  const { data: { user } } = await supabase.auth.getUser();

  if (isProtected && !user) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/login';
    redirect.searchParams.set('redirectedFrom', request.nextUrl.pathname);
    return NextResponse.redirect(redirect);
  }

  // Already signed in? Skip the login page.
  if (user && request.nextUrl.pathname === '/login') {
    const redirect = request.nextUrl.clone();
    redirect.pathname = '/dashboard';
    redirect.search = '';
    return NextResponse.redirect(redirect);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.svg$).*)'],
};
