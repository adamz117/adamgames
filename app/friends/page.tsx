import Link from 'next/link';
import FriendsList from '@/components/mp/friends-list';
import { createClient } from '@/lib/supabase/server';
import { memberName } from '@/lib/mp/protocol';

export const metadata = { title: 'Friends | Adam Games' };

// The signed-in member, and whether others can find them (a username that isn't the email prefix).
async function getMember(): Promise<{ findable: boolean } | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) return null;
    const { data } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
    return { findable: memberName(data?.username, user.email) !== 'Member' };
  } catch {
    return null;
  }
}

export default async function FriendsPage() {
  const member = await getMember();
  return (
    <main className="club-wrap club-lobby">
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2 club-lobby-title">Friends</h1>
      <p className="club-lobby-lede">
        Add friends by username, see who&rsquo;s on the site now, and keep a head-to-head record of
        every 1v1 you finish together.
      </p>
      {member ? (
        <FriendsList findable={member.findable} />
      ) : (
        <div className="club-lobby-panel">
          <h2 className="club-lobby-h3">Sign in to add friends</h2>
          <p className="club-lobby-note">
            Friends, invites and head-to-head records are for members. Guests can still play anyone with a
            lobby link.
          </p>
          <div className="club-lobby-buttons">
            <Link href="/login" className="club-button">Sign in</Link>
            <Link href="/signup" className="club-link">Sign up</Link>
          </div>
        </div>
      )}
    </main>
  );
}
