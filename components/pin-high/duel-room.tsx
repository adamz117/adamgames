'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GuestNameForm from '@/components/mp/guest-name-form';
import { getPlayers, heartbeat, joinLobby, type LobbyMember } from '@/lib/mp/lobby-client';
import { listFriends, sendInvite, useOnline, type Friend } from '@/lib/mp/friends-client';
import { ensureSession } from '@/lib/mp/session-client';
import { parseCode, presentPlayers } from '@/lib/mp/protocol';
import { getDuelLobby, openDuelChannel, type DuelChannel } from '@/lib/pin-high/duel-client';
import type { Viewer } from '@/lib/mp/viewer';

type Seat = { lobbyId: string; code: string; userId: string; slot: number };
type Entry =
  | { stage: 'loading' }
  | { stage: 'name' }
  | { stage: 'error'; error: string }
  | { stage: 'room'; seat: Seat };

const ERRORS: Record<string, string> = {
  not_found: 'There is no duel with that code.',
  closed: 'That duel has been closed.',
  not_open: 'That duel is no longer open.',
  full: 'That duel is full.',
  wrong_game: 'That code is for a Nine Holes lobby, not a Pin High duel.',
  sign_in_failed: 'Could not sign you in as a guest. Try again.',
  failed: 'Something went wrong. Try again.',
};

// A guest (or a visitor with no session yet) is asked for a name first; then they take a seat.
async function enter(codeText: string, viewer: Viewer, name?: string): Promise<Entry> {
  const code = parseCode(codeText);
  if (!code) return { stage: 'error', error: 'not_found' };
  const lobby = await getDuelLobby(code);
  if (!lobby) return { stage: 'error', error: 'not_found' };
  if (!lobby.isDuel) return { stage: 'error', error: 'wrong_game' };
  if (lobby.status !== 'open') return { stage: 'error', error: lobby.status === 'closed' ? 'closed' : 'not_open' };
  if (viewer === 'none' && name === undefined) return { stage: 'name' };
  const s = await ensureSession(name);
  if ('error' in s) return s.error === 'bad_name' ? { stage: 'name' } : { stage: 'error', error: s.error };
  const r = await joinLobby(code, s.name);
  if ('error' in r) return r.error === 'bad_name' ? { stage: 'name' } : { stage: 'error', error: r.error };
  return { stage: 'room', seat: { lobbyId: lobby.id, code, userId: s.userId, slot: r.slot } };
}

export default function DuelRoom({ code, viewer }: { code: string; viewer: Viewer }) {
  const router = useRouter();
  const [entry, setEntry] = useState<Entry>({ stage: 'loading' });
  const [busy, setBusy] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // A member's accepted friends, for the waiting room's "invite a friend" (null for a guest).
  const online = useOnline();
  const [friends, setFriends] = useState<Friend[] | null>(null);
  const gameReady = useRef(false);
  const friendsMsg = useRef<object | null>(null);

  useEffect(() => {
    let gone = false;
    void enter(code, viewer).then((e) => { if (!gone) setEntry(e); });
    return () => { gone = true; };
  }, [code, viewer]);

  const withName = useCallback(async (name: string) => {
    setBusy(true);
    setEntry(await enter(code, viewer, name));
    setBusy(false);
  }, [code, viewer]);

  const seat = entry.stage === 'room' ? entry.seat : null;
  useEffect(() => {
    if (!seat) return;
    let alive = true;
    void listFriends().then((list) => { if (alive) setFriends(list?.filter((f) => f.status === 'accepted') ?? null); });
    return () => { alive = false; };
  }, [seat]);
  // The game draws the list; it gets it again whenever a friend comes online or goes.
  useEffect(() => {
    friendsMsg.current = friends && { type: 'ph-duel-friends', friends: friends.map((f) => ({ id: f.id, name: f.name, online: online.has(f.id) })) };
    if (gameReady.current && friendsMsg.current) iframeRef.current?.contentWindow?.postMessage(friendsMsg.current, window.location.origin);
  }, [friends, online]);

  useEffect(() => {
    if (!seat) return;
    let gone = false;
    let channel: DuelChannel | null = null;
    let players: LobbyMember[] = [];
    let online: string[] = [];
    let ready = false;   // the game in the iframe has loaded and is listening
    let started = false; // it has been told who is playing

    const toGame = (msg: object) => iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
    const tell = () => {
      if (!ready) return;
      const body = { players: players.map((p) => ({ slot: p.slot, name: p.name })), present: presentPlayers(online, players) };
      if (started) toGame({ type: 'ph-duel-presence', ...body });
      else if (players.some((p) => p.slot === seat.slot)) {
        started = true;
        toGame({ type: 'ph-duel-init', lobbyId: seat.lobbyId, code: seat.code, slot: seat.slot, ...body });
      }
    };
    const refresh = async () => {
      const rows = await getPlayers(seat.lobbyId);
      if (gone || !rows) return;
      players = rows.filter((p) => !p.leftAt);
      tell();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return;
      const d = event.data;
      if (d?.type === 'ph-duel-ready') {
        ready = true; started = false; gameReady.current = true;
        tell();
        if (friendsMsg.current) toGame(friendsMsg.current);
      }
      else if (d?.type === 'ph-duel-invite' && typeof d.id === 'string') {
        const id = d.id as string;
        void sendInvite(id, seat.lobbyId).then((r) => toGame({ type: 'ph-duel-invited', id, state: r.error === null ? 'sent' : r.error === 'not_allowed' ? 'not_allowed' : 'failed' }));
      }
      else if (d?.type === 'ph-duel-send') channel?.send(d.data);
      else if (d?.type === 'ph-duel-leave') router.push('/duel');
    };
    window.addEventListener('message', onMessage);

    void refresh();
    void openDuelChannel(seat.lobbyId, seat.userId, {
      presence(ids) { online = ids; void refresh(); }, // someone came or went: their name may be new too
      message(data) { toGame({ type: 'ph-duel-msg', data }); },
    }).then((ch) => { if (gone) ch.close(); else channel = ch; });
    void heartbeat(seat.lobbyId);
    const beat = setInterval(() => void heartbeat(seat.lobbyId), 15_000);

    return () => {
      gone = true;
      gameReady.current = false;
      clearInterval(beat);
      window.removeEventListener('message', onMessage);
      channel?.close();
    };
  }, [seat, router]);

  if (entry.stage === 'room') {
    return (
      <iframe
        ref={iframeRef}
        src="/games/pin-high/index.html?duel=1"
        style={{ display: 'block', width: '100%', height: 'calc(100dvh - 65px)', border: 'none' }}
        title="Pin High duel"
      />
    );
  }

  return (
    <main className="club-wrap club-lobby">
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2 club-lobby-title">Pin High duel</h1>
      {entry.stage === 'loading' && <p className="club-lobby-lede">Finding the duel…</p>}
      {entry.stage === 'name' && (
        <div className="club-lobby-panel" style={{ marginTop: 32 }}>
          <GuestNameForm label="Join the duel" busy={busy} onSubmit={withName} />
        </div>
      )}
      {entry.stage === 'error' && (
        <>
          <p className="club-lobby-error" role="alert">{ERRORS[entry.error] ?? ERRORS.failed}</p>
          <p className="club-card-actions">
            <Link href="/duel" className="club-button">Start a new duel</Link>
            {entry.error === 'wrong_game' && <Link href={`/play/${code}`} className="club-link">Open it in Nine Holes</Link>}
          </p>
        </>
      )}
    </main>
  );
}
