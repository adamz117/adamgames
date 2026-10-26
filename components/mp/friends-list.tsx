'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import OnlineDot from '@/components/mp/online-dot';
import { Skel, SkeletonRows } from '@/components/mp/skeleton';
import { listFriends, removeFriend, requestFriend, respond, useOnline, type Friend } from '@/lib/mp/friends-client';
import { getHeadToHeads } from '@/lib/mp/records-client';
import { formatRecord, gamesPlayed, type HeadToHead, type RecordRow } from '@/lib/mp/records';

const ADD_ERROR: Record<string, string> = {
  not_found:
    'No member has that username. Check the spelling. Members who haven’t picked a username yet can’t be found, so ask them to choose one on their card.',
  self: 'That’s your own username.',
  not_signed_in: 'Sign in to add friends.',
  failed: 'That didn’t go through. Try again in a moment.',
};
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
// How long "Undo" stays up before a removed friend is removed for real.
const UNDO_MS = 6000;
const resultWord = (g: RecordRow) => (g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : g.format === 'match' ? 'Halved' : 'Tied');

// Add by username, requests both ways, and friends with who's online and the record against each.
// `findable` is false while my own username is still my email prefix (nobody can add me yet).
export default function FriendsList({ findable }: { findable: boolean }) {
  const online = useOnline();
  const [friends, setFriends] = useState<Friend[] | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // undefined while loading, null when they couldn't be read.
  const [records, setRecords] = useState<Map<string, HeadToHead> | null | undefined>(undefined);

  const load = useCallback(() => listFriends().then((list) => {
    setFriends(list);
    if (list) return getHeadToHeads(list.filter((f) => f.status === 'accepted').map((f) => f.id)).then(setRecords);
  }), []);
  useEffect(() => {
    void load();
    // Requests arrive while the page is open: re-read when the tab comes back.
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  // Removing a friend: they go from the list at once, with an Undo, and only after UNDO_MS (or when
  // the page closes or moves on) for real.
  const [removing, setRemoving] = useState<Friend | null>(null);
  const pending = useRef<{ friend: Friend; timer: number } | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const commitRemove = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    clearTimeout(p.timer);
    setRemoving(null);
    setFriends((list) => list?.filter((f) => f.id !== p.friend.id)); // no flash back while it goes through
    void removeFriend(p.friend.id).then((r) => {
      if (r.error) setActionError(`${p.friend.name} couldn’t be removed. Try again in a moment.`);
      void load();
    });
  }, [load]);
  function startRemove(friend: Friend) {
    commitRemove(); // one at a time
    pending.current = { friend, timer: window.setTimeout(commitRemove, UNDO_MS) };
    setRemoving(friend);
  }
  function undo() {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setRemoving(null);
  }
  useEffect(() => {
    window.addEventListener('pagehide', commitRemove);
    return () => { window.removeEventListener('pagehide', commitRemove); commitRemove(); };
  }, [commitRemove]);
  // The row that had focus is gone: keyboard users land on Undo.
  useEffect(() => { if (removing) undoRef.current?.focus(); }, [removing]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const wanted = name.trim();
    if (!wanted) return;
    setAdding(true);
    setMessage(null);
    const r = await requestFriend(wanted);
    setAdding(false);
    if ('error' in r) return setMessage({ ok: false, text: ADD_ERROR[r.error] ?? ADD_ERROR.failed });
    setName('');
    setMessage({ ok: true, text: r.status === 'accepted' ? 'You’re friends now.' : 'Request sent. They’ll see it on their friends page.' });
    void load();
  }

  async function act(id: string, run: () => Promise<{ error: string | null }>) {
    setBusy(id);
    setActionError(null);
    const r = await run();
    setBusy(null);
    if (r.error) setActionError('That didn’t go through. Try again in a moment.');
    void load();
  }

  const incoming = friends?.filter((f) => f.status === 'incoming') ?? [];
  const outgoing = friends?.filter((f) => f.status === 'outgoing') ?? [];
  const accepted = (friends?.filter((f) => f.status === 'accepted' && f.id !== removing?.id) ?? [])
    .sort((a, b) => Number(online.has(b.id)) - Number(online.has(a.id)));

  return (
    <>
      <section className="club-lobby-actions">
        <form className="club-lobby-panel" onSubmit={add}>
          <h2 className="club-lobby-h3"><label htmlFor="friend-name">Add a friend</label></h2>
          <p className="club-lobby-note">Ask for their username: it’s the name at the top of their card.</p>
          <div className="club-lobby-inline">
            <input
              id="friend-name"
              className="club-lobby-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Username"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              maxLength={40}
            />
            <button type="submit" className="club-button" disabled={adding || !name.trim()}>
              {adding ? 'Sending…' : 'Send request'}
            </button>
          </div>
          {message && (
            <p className={message.ok ? 'club-lobby-note club-friends-ok' : 'club-lobby-error'} role={message.ok ? 'status' : 'alert'}>
              {message.text}
            </p>
          )}
        </form>

        <div className="club-lobby-panel">
          <h2 className="club-lobby-h3">Your username</h2>
          {findable ? (
            <p className="club-lobby-note">Friends add you by the username on <Link href="/account" className="club-link">your card</Link>. Invite them to a game from any lobby.</p>
          ) : (
            <p className="club-lobby-note">
              Nobody can find you yet: your username is still the start of your email address, which we keep
              private. <Link href="/account" className="club-link">Pick a username</Link> on your card so friends can add you.
            </p>
          )}
        </div>
      </section>

      {actionError && <p className="club-lobby-error" role="alert">{actionError}</p>}

      {friends === undefined ? (
        <section className="club-lobby-section">
          <h2 className="club-lobby-h3">Friends</h2>
          <SkeletonRows label="Looking for your friends…" />
        </section>
      ) : friends === null ? (
        <p className="club-lobby-error club-lobby-section" role="alert">Your friends couldn’t load. Reload the page to try again.</p>
      ) : (
        <>
          {(incoming.length > 0 || outgoing.length > 0) && (
            <section className="club-lobby-section" aria-labelledby="requests-h">
              <h2 id="requests-h" className="club-lobby-h3">Requests</h2>
              <ul className="club-lobby-list">
                {incoming.map((f) => (
                  <li key={f.id} className="club-friend-row">
                    <span className="club-friend-main">
                      <strong>{f.name}</strong>
                      <span>Wants to be friends</span>
                    </span>
                    <span className="club-lobby-buttons">
                      <button type="button" className="club-button club-lobby-small" disabled={busy === f.id} onClick={() => act(f.id, () => respond(f.id, true))}>Accept</button>
                      <button type="button" className="club-lobby-quiet" disabled={busy === f.id} onClick={() => act(f.id, () => respond(f.id, false))}>Decline</button>
                    </span>
                  </li>
                ))}
                {outgoing.map((f) => (
                  <li key={f.id} className="club-friend-row">
                    <span className="club-friend-main">
                      <strong>{f.name}</strong>
                      <span>Waiting for them to accept</span>
                    </span>
                    <button type="button" className="club-lobby-quiet" disabled={busy === f.id} onClick={() => act(f.id, () => removeFriend(f.id))}>Cancel</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="club-lobby-section" aria-labelledby="friends-h">
            <h2 id="friends-h" className="club-lobby-h3">Friends</h2>
            {accepted.length === 0 ? (
              <p className="club-lobby-note">No friends yet. Add someone by their username above, and once they accept you can invite them straight into a lobby.</p>
            ) : (
              <ul className="club-lobby-list">
                {accepted.map((f) => (
                  <FriendRow key={f.id} friend={f} record={records === undefined ? undefined : records?.get(f.id) ?? null} online={online.has(f.id)} busy={busy === f.id} onRemove={() => startRemove(f)} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {removing && (
        <p className="club-undo" role="status">
          <span>Removed {removing.name} from your friends.</span>
          <button ref={undoRef} type="button" className="club-lobby-quiet" onClick={undo}>Undo</button>
        </p>
      )}
    </>
  );
}

// record: undefined while loading, null when it couldn't be read.
function FriendRow({ friend, record, online, busy, onRemove }: {
  friend: Friend; record: HeadToHead | null | undefined; online: boolean; busy: boolean; onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);

  const panel = `friend-${friend.id}`;
  return (
    <li className="club-friend">
      <div className="club-friend-row">
        <span className="club-friend-main">
          <strong><OnlineDot on={online} />{friend.name}</strong>
          <span className="club-figure">
            {record === undefined ? <Skel w="132px" h={14} /> : record === null ? 'Record unavailable right now' : gamesPlayed(record) === 0 ? 'No games together yet' : formatRecord(record)}
          </span>
        </span>
        <button type="button" className="club-lobby-quiet" aria-expanded={open} aria-controls={panel} onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : 'Games'}
        </button>
      </div>
      {open && (
        <div id={panel} className="club-friend-more">
          {record === undefined ? (
            <div role="status" className="club-skel-room" style={{ gap: 10 }}>
              <span className="club-sr-only">Loading your games together…</span>
              <Skel w="40%" h={13} /><Skel w="90%" h={16} /><Skel w="82%" h={16} />
            </div>
          ) : record === null ? (
            <p className="club-lobby-error" role="alert">Your games together couldn’t load. Reload the page to try again.</p>
          ) : record.games.length === 0 ? (
            <p className="club-lobby-note">You haven’t finished a game together yet. Open a lobby and invite them.</p>
          ) : (
            <>
              <h3 className="club-lobby-label">Your last {record.games.length === 1 ? 'game' : `${record.games.length} games`} together</h3>
              <ol className="club-friend-games">
                {record.games.map((g) => (
                  <li key={`${g.lobby_id}-${g.game}`}>
                    <span className="club-friend-result">{resultWord(g)}{g.detail && g.detail !== resultWord(g) ? ` · ${g.detail}` : ''}</span>
                    <span>{g.course_label}</span>
                    <span className="club-friend-date">{shortDate(g.played_at)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
          <div className="club-lobby-buttons" style={{ marginTop: 14 }}>
            <button type="button" className="club-lobby-quiet" disabled={busy} onClick={onRemove}>Remove friend</button>
          </div>
        </div>
      )}
    </li>
  );
}
