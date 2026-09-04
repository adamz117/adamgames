import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from '@/components/sign-out-button';

export default async function Nav() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header
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
        <Link
          href="/"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            letterSpacing: '0.02em',
            color: 'var(--text)',
            textDecoration: 'none',
          }}
        >
          ADAM GAMES
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link
            href="/games/flag-atlas"
            style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: 14 }}
          >
            Flag Atlas
          </Link>
          {user ? (
            <>
              <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>{user.email}</span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/signup"
                style={{ color: 'var(--text-dim)', textDecoration: 'none', fontSize: 14 }}
              >
                Sign up
              </Link>
              <Link
                href="/login"
                style={{
                  color: 'var(--bg)',
                  background: 'var(--accent)',
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  padding: '8px 16px',
                  borderRadius: 6,
                }}
              >
                Sign in
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
