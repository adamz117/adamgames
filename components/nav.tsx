import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/sign-out-button';
import GamesDropdown from '@/components/games-dropdown';
import { GAMES } from '@/lib/games-registry';
import { getProfileServer } from '@/lib/profile';

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user ? await getProfileServer() : null;

  return (
    <header
      className="site-header"
      style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link href="/" className="club-wordmark" translate="no">
          Adam Games
        </Link>
        <nav className="club-nav">
          <GamesDropdown
            games={GAMES.map(({ id, title, description, href }) => ({ id, title, description, href }))}
          />
          {user ? (
            <>
              <Link href="/account" className="club-link" style={{ fontSize: 14 }}>
                {profile?.username ?? user.email}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/signup"
                className="club-nav-extra"
                style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: 14, whiteSpace: 'nowrap' }}
              >
                Sign up
              </Link>
              <Link href="/login" className="club-button" style={{ minHeight: 38, padding: '0 18px', fontSize: 14 }}>
                Sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
