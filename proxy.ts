import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { GAMES } from '@/lib/games-registry';

const VISIBLE_GAME_HREFS = new Set(GAMES.map((game) => game.href));

export async function proxy(request: NextRequest) {
  // A hidden game's page sends you to the homepage rather than loading.
  const { pathname } = request.nextUrl;
  if (/^\/games\/[^/]+\/?$/.test(pathname) && !VISIBLE_GAME_HREFS.has(pathname.replace(/\/$/, ''))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session if it exists. No redirect on missing session —
  // games stay playable signed out.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:html|svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
