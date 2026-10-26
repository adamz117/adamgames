import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/sign-out-button';
import GamesDropdown from '@/components/games-dropdown';
import { GAMES } from '@/lib/games-registry';
import { getProfileServer } from '@/lib/profile';
import InviteToaster from '@/components/mp/invite-toaster';

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const profile = user && !user.is_anonymous ? await getProfileServer() : null;

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
          <Link href="/play" className="club-nav-play" aria-label="Play friends">
            <span className="club-nav-long">Play friends</span>
            <span className="club-nav-short">Play</span>
          </Link>
          <GamesDropdown
            games={GAMES.map(({ id, title, description, href }) => ({ id, title, description, href }))}
          />
          {user && !user.is_anonymous ? (
            <>
              {/* Wide screens only: on smaller ones /play and the account page link to it. */}
              <Link href="/friends" className="club-nav-play club-nav-friends">
                Friends
              </Link>
              <Link href="/account" className="club-link club-nav-user">
                {profile?.username ?? user.email}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <>
              {/* A guest (anonymous session) has no account page: they can still sign up or in. */}
              {user && <span className="club-nav-guest">Guest</span>}
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
      {/* Invites and "online now" are for members: nobody else loads Realtime. Fixed, so it can sit here. */}
      {user && !user.is_anonymous && <InviteToaster userId={user.id} />}
    </header>
  );
}
