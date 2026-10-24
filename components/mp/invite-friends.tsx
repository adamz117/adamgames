'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listFriends, sendInvite, useOnline, type Friend } from '@/lib/mp/friends-client';
import OnlineDot from '@/components/mp/online-dot';

type Sent = 'sending' | 'sent' | 'failed' | 'not_allowed';
const LABEL: Record<Sent, string> = { sending: 'Sending…', sent: 'Invited', failed: 'Try again', not_allowed: 'Can’t invite' };

// "Invite a friend" for the lobby room: members' accepted friends, online ones first. Nothing for guests.
export default function InviteFriends({ lobbyId }: { lobbyId: string }) {
  const online = useOnline();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const [sent, setSent] = useState<Record<string, Sent>>({});

  useEffect(() => {
    let alive = true;
    listFriends().then((list) => alive && setFriends(list?.filter((f) => f.status === 'accepted') ?? null));
    return () => {
      alive = false;
    };
  }, []);

  if (!friends) return null;

  async function invite(id: string) {
    setSent((s) => ({ ...s, [id]: 'sending' }));
    const r = await sendInvite(id, lobbyId);
    setSent((s) => ({ ...s, [id]: r.error === null ? 'sent' : r.error === 'not_allowed' ? 'not_allowed' : 'failed' }));
  }

  const sorted = [...friends].sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)));
  return (
    <div className="club-invite-friends">
      <h3 className="club-lobby-label">Invite a friend</h3>
      {sorted.length === 0 ? (
        <p className="club-lobby-note">
          No friends yet. <Link href="/friends" className="club-link">Add them by username</Link> and they can be invited straight in.
        </p>
      ) : (
        <ul className="club-invite-friends-list">
          {sorted.map((f) => {
            const state = sent[f.id];
            return (
              <li key={f.id}>
                <span className="club-invite-friends-name"><OnlineDot on={online.has(f.id)} />{f.name}</span>
                <button
                  type="button"
                  className="club-lobby-quiet"
                  disabled={state === 'sending' || state === 'sent' || state === 'not_allowed'}
                  onClick={() => invite(f.id)}
                  aria-label={`Invite ${f.name}`}
                >
                  {state ? LABEL[state] : 'Invite'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {Object.values(sent).includes('not_allowed') && (
        <p className="club-lobby-note">Invites only go out while the lobby is open, to friends who have accepted.</p>
      )}
    </div>
  );
}
