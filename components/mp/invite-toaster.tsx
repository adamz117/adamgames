'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { markInviteSeen, subscribeInvites, type Invite } from '@/lib/mp/friends-client';
import { parseCode } from '@/lib/mp/protocol';

const SHOWN = 3;

// Friends' invites to a game, on any page a member has open (nothing for guests or signed-out
// visitors). Join goes to the lobby; either button marks the invite seen.
export default function InviteToaster() {
  const router = useRouter();
  const pathname = usePathname();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => subscribeInvites(setInvites), []);

  // Already in that lobby: the invite is done with.
  const here = parseCode(/^\/play\/([^/]+)\/?$/.exec(pathname ?? '')?.[1]);
  useEffect(() => {
    for (const i of invites) if (i.code === here) void markInviteSeen(i.id);
  }, [invites, here]);

  const seen = (ids: number[]) => {
    setHidden((h) => new Set([...h, ...ids]));
    ids.forEach((id) => void markInviteSeen(id));
  };

  // One per lobby (a friend may have asked twice), newest first.
  const byLobby = new Map<string, Invite[]>();
  for (const i of invites) {
    if (hidden.has(i.id) || i.code === here) continue;
    byLobby.set(i.lobbyId, [...(byLobby.get(i.lobbyId) ?? []), i]);
  }
  const shown = [...byLobby.values()].slice(0, SHOWN);
  if (!shown.length) return null;

  return (
    <div className="club-invites" role="status" aria-live="polite">
      {shown.map((group) => {
        const invite = group[0];
        const ids = group.map((i) => i.id);
        return (
          <div key={invite.lobbyId} className="club-invite">
            <p className="club-invite-text"><strong>{invite.fromName}</strong> invited you to a game</p>
            <div className="club-invite-buttons">
              <button
                type="button"
                className="club-button club-lobby-small"
                onClick={() => {
                  seen(ids);
                  router.push(`/play/${invite.code}`);
                }}
              >
                Join
              </button>
              <button type="button" className="club-lobby-quiet" onClick={() => seen(ids)}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
