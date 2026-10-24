'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GuestNameForm from '@/components/mp/guest-name-form';
import InviteFriends from '@/components/mp/invite-friends';
import SettingsEditor from '@/components/mp/settings-editor';
import { useGameRelay } from '@/components/mp/use-game-relay';
import {
  getLobby, getPlayers, heartbeat, joinLobby, leaveLobby, openLobbyChannel, rematch, setReady, startLobby,
  updateSettings,
  type Lobby, type LobbyChannel, type LobbyMember,
} from '@/lib/mp/lobby-client';
import { ensureSession } from '@/lib/mp/session-client';
import { parseCode, presentPlayers, type LobbyEvent, type LobbySettings, type Visibility } from '@/lib/mp/protocol';
import { courseText, errorText, FORMAT_LABEL, PACE_LABEL, todayKey } from '@/lib/mp/lobby-ui';
import type { Viewer } from '@/lib/mp/viewer';

type Me = { id: string; userId: string; slot: number; name: string };

const HEARTBEAT_MS = 15_000;

type Entry =
  | { stage: 'name'; lobby: Lobby }
  | { stage: 'error'; error: string; lobby?: Lobby }
  | { stage: 'room'; lobby: Lobby; players: LobbyMember[] | null; me: Me };

// Why someone who isn't in a lobby that's under way can't come in.
const startedError = (lobby: Lobby) => (lobby.status === 'finished' ? 'over' : 'not_open');

// Into the lobby: a guest (or a visitor with no session yet) is asked for a name first, unless
// they're already in it; then join (also a rejoin: it clears my left_at while the lobby is open).
async function enterLobby(code: string, viewer: Viewer, name?: string): Promise<Entry> {
  const lobby = await getLobby(code);
  if (!lobby) return { stage: 'error', error: 'not_found' };
  if (lobby.status === 'closed') return { stage: 'error', error: 'closed', lobby };
  if (viewer === 'none' && name === undefined) {
    // No session, so not a player in it: no name (and no guest account) for a game under way.
    return lobby.status === 'open' ? { stage: 'name', lobby } : { stage: 'error', error: startedError(lobby), lobby };
  }

  const s = await ensureSession(name);
  if ('error' in s) {
    if (s.error !== 'bad_name') return { stage: 'error', error: s.error, lobby };
    return lobby.status === 'open' ? { stage: 'name', lobby } : { stage: 'error', error: startedError(lobby), lobby };
  }

  const rows = await getPlayers(lobby.id); // [] unless I'm already in it
  const mine = rows?.find((p) => p.userId === s.userId);
  if (mine?.leftAt && lobby.status !== 'open') return { stage: 'error', error: lobby.status === 'finished' ? 'over' : 'left', lobby };
  if (!mine && lobby.status !== 'open') return { stage: 'error', error: startedError(lobby), lobby };
  if (!mine && s.guest && name === undefined) return { stage: 'name', lobby };

  let slot = mine?.slot;
  if (slot === undefined || lobby.status === 'open') {
    const r = await joinLobby(code, s.name);
    if ('error' in r) return { stage: 'error', error: r.error, lobby };
    slot = r.slot;
  }
  return { stage: 'room', lobby, players: mine ? rows : await getPlayers(lobby.id), me: { id: lobby.id, userId: s.userId, slot, name: s.name } };
}

// The lobby behind /play/<code>: join (asking a guest's name), the room with its settings and
// ready/start, then the game iframe, relayed to the lobby by useGameRelay.
export default function LobbyRoom({ code: rawCode, viewer }: { code: string; viewer: Viewer }) {
  const router = useRouter();
  const code = parseCode(rawCode);
  const [stage, setStage] = useState<'loading' | 'name' | 'room' | 'error'>('loading');
  const [fatal, setFatal] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const [lobby, setLobby] = useState<Lobby | null>(null);
  const [players, setPlayers] = useState<LobbyMember[]>([]);
  const [present, setPresent] = useState<string[]>([]);
  const [me, setMe] = useState<Me | null>(null);

  const channelRef = useRef<LobbyChannel | null>(null);
  const refreshRef = useRef<() => void>(() => {});
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const send = useCallback(async (event: LobbyEvent) => {
    await channelRef.current?.send(event).catch(() => 'error');
  }, []);

  // ── joining ──
  const applyEntry = useCallback((r: Entry) => {
    if (r.lobby) setLobby(r.lobby);
    if (r.stage === 'error') setFatal(r.error);
    if (r.stage === 'room') {
      if (r.players) setPlayers(r.players);
      setMe(r.me);
    }
    setStage(r.stage);
  }, []);

  useEffect(() => {
    if (!code) return;
    let live = true;
    enterLobby(code, viewer).then((r) => live && applyEntry(r));
    return () => { live = false; };
  }, [code, viewer, applyEntry]);

  const leaveRoom = useCallback(async () => {
    if (!me) return;
    setBusy(true);
    await leaveLobby(me.id);
    await send('left');
    router.push('/play');
  }, [me, router, send]);

  // ── the game iframe's relay ──
  const inGame = !!me && !!lobby?.settings && (lobby.status === 'playing' || lobby.status === 'finished');
  const game = lobby?.game ?? 0;
  const presentSlots = useMemo(() => presentPlayers(present, players), [present, players]);
  const feed = useGameRelay({
    active: inGame, lobbyId: me?.id ?? null, code, game, me: me?.slot ?? null,
    players, present: presentSlots, status: lobby?.status, iframeRef,
    onRematch: async () => {
      if (!me) return;
      const r = await rematch(me.id);
      if ('error' in r) setNotice(errorText(r.error));
      else await send('rematch');
      refreshRef.current();
    },
    onLeave: () => void leaveRoom(),
    onFinished: () => refreshRef.current(),
    onError: setNotice,
  });

  // ── in the lobby: channel, heartbeat, refreshes ──
  useEffect(() => {
    if (!me || !code) return;
    let alive = true, inFlight = false, again = false;
    // Re-read the lobby and its players (every broadcast is only a hint to do this).
    const refresh = async () => {
      if (inFlight) { again = true; return; }
      inFlight = true;
      do {
        again = false;
        const [l, rows] = await Promise.all([getLobby(code), getPlayers(me.id)]);
        if (!alive) return;
        if (l) setLobby(l);
        // My row is gone (quiet for 60 s before the start, or a rematch removed it): join again.
        if (l && rows && !rows.some((p) => p.userId === me.userId)) {
          if (l.status !== 'open') { setFatal(l.status === 'closed' ? 'closed' : 'not_member'); setStage('error'); return; }
          const r = await joinLobby(code, me.name);
          if (!alive) return;
          if ('error' in r) { setFatal(r.error); setStage('error'); return; }
          if (r.slot !== me.slot) return setMe({ ...me, slot: r.slot }); // this effect starts over
          again = true;
          continue;
        }
        if (rows) setPlayers(rows);
      } while (again);
      inFlight = false;
    };
    refreshRef.current = () => void refresh();
    // Hidden tabs throttle timers, so also beat whenever the page comes back.
    const beat = () => { void heartbeat(me.id); void refresh(); };
    const onVisible = () => { if (document.visibilityState === 'visible') beat(); };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', beat);

    let ch: LobbyChannel | null = null;
    openLobbyChannel(me.id, me.userId, {
      onPresence: (ids) => { if (alive) { setPresent(ids); void refresh(); } },
      onEvent: () => void refresh(),
      onSwing: feed.swing,
      onStatus: (status) => { if (status === 'SUBSCRIBED') feed.resync(); }, // catch up after a (re)join
    }).then((opened) => {
      if (!alive) return opened.close();
      ch = opened;
      channelRef.current = opened;
    }).catch((e) => console.error('mp: channel', e));

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', beat);
      ch?.close();
      channelRef.current = null;
      refreshRef.current = () => {};
    };
  }, [me, code, feed]);

  // ── views ──
  if (!code) return <Message text={errorText('not_found')} />;
  if (stage === 'loading') return <Message text="Finding the lobby…" quiet />;
  if (stage === 'error') return <Message text={errorText(fatal ?? 'failed')} />;
  if (!lobby) return <Message text={errorText('not_found')} />;

  const today = todayKey();
  const hostName = lobby.players.find((p) => p.slot === 0)?.name ?? 'Member';

  if (stage === 'name') {
    return (
      <Shell>
        <h1 className="club-h2 club-lobby-title">Join {hostName}</h1>
        {lobby.settings && <p className="club-lobby-lede">{summary(lobby.settings, today)}</p>}
        <div className="club-lobby-panel">
          <GuestNameForm
            label="Join lobby"
            busy={busy}
            onSubmit={async (name) => {
              setBusy(true);
              applyEntry(await enterLobby(code, viewer, name));
              setBusy(false);
            }}
          />
        </div>
      </Shell>
    );
  }

  if (!me) return <Message text="Finding the lobby…" quiet />;
  if (lobby.status === 'closed') return <Message text={errorText('closed')} />;

  if (inGame) {
    return (
      <>
        {notice && <p className="club-lobby-toast" role="status">{notice}</p>}
        <iframe
          key={game}
          ref={iframeRef}
          src="/games/nine-holes/index.html?mp=1"
          className="club-lobby-game"
          title="Nine Holes, two players"
        />
      </>
    );
  }

  // The room, while open.
  const isHost = lobby.host === me.userId;
  const active = players.filter((p) => !p.leftAt);
  const here = new Set([...presentSlots, me.slot]);
  const mine = active.find((p) => p.slot === me.slot);
  const waitingOn = active.filter((p) => p.userId !== lobby.host && !p.ready);
  const away = active.filter((p) => !here.has(p.slot));
  const canStart = isHost && active.length === 2 && !away.length && !waitingOn.length;
  const startHint =
    active.length < 2 ? 'Waiting for a second player.'
      : away.length ? `Waiting for ${away.map((p) => p.name).join(' and ')} to come back.`
        : waitingOn.length ? `Waiting for ${waitingOn.map((p) => p.name).join(' and ')} to get ready.`
          : isHost ? 'Everyone’s ready.' : `Waiting for ${hostName} to start.`;
  const link = `${location.origin}/play/${code}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  }

  async function changeSettings(settings: LobbySettings, visibility: Visibility) {
    if (!me || !lobby) return;
    setLobby({ ...lobby, settings, visibility });
    setPlayers((ps) => ps.map((p) => ({ ...p, ready: false }))); // the database un-readies everyone too
    const r = await updateSettings(me.id, settings, visibility);
    setNotice(r.error ? errorText(r.error) : null);
    await send('settings');
    refreshRef.current();
  }

  async function toggleReady() {
    if (!me) return;
    setBusy(true);
    const r = await setReady(me.id, !mine?.ready);
    setBusy(false);
    setNotice(r.error ? errorText(r.error) : null);
    await send('ready');
    refreshRef.current();
  }

  async function start() {
    if (!me) return;
    setBusy(true);
    const r = await startLobby(me.id);
    setBusy(false);
    setNotice(r.error ? errorText(r.error) : null);
    if (!r.error) await send('start');
    refreshRef.current();
  }

  return (
    <Shell>
      <h1 className="club-h2 club-lobby-title">{isHost ? 'Your lobby' : `${hostName}’s lobby`}</h1>
      <p className="club-lobby-lede">
        {lobby.visibility === 'public' ? 'Public: listed on the lobby page, and open to anyone with the link.' : 'Private: only people with the link or code can join.'}
      </p>

      <div className="club-lobby-grid">
        <section className="club-lobby-panel">
          <h2 className="club-lobby-h3">Invite</h2>
          <p className="club-lobby-label">Code</p>
          <p className="club-lobby-code" aria-label={`Lobby code ${code.split('').join(' ')}`}>{code}</p>
          <p className="club-lobby-label">Link</p>
          <div className="club-lobby-inline">
            <input className="club-lobby-input" value={link} readOnly onFocus={(e) => e.target.select()} aria-label="Lobby link" />
            <button type="button" className="club-button club-lobby-small" onClick={copyLink}>Copy</button>
          </div>
          {copied && (
            <p className="club-lobby-note" role="status">{copied === 'yes' ? 'Link copied.' : 'Couldn’t copy. Select the link and copy it yourself.'}</p>
          )}
          <InviteFriends lobbyId={me.id} />
        </section>

        <section className="club-lobby-panel">
          <h2 className="club-lobby-h3">Players</h2>
          <ul className="club-lobby-slots">
            {[0, 1].map((slot) => {
              const p = active.find((x) => x.slot === slot);
              if (!p) return <li key={slot} className="club-lobby-slot empty">Waiting for a player…</li>;
              const host = p.userId === lobby.host;
              return (
                <li key={slot} className="club-lobby-slot">
                  <strong>{p.name}</strong>
                  <span className="club-lobby-tags">
                    {p.slot === me.slot && <span>You</span>}
                    {p.guest && <span>Guest</span>}
                    {!here.has(p.slot) && <span className="away">Away</span>}
                    {host ? <span>Host</span> : <span className={p.ready ? 'ready' : ''}>{p.ready ? 'Ready' : 'Not ready'}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="club-lobby-buttons">
            {isHost ? (
              <button type="button" className="club-button" disabled={!canStart || busy} onClick={start}>Start the game</button>
            ) : (
              <button type="button" className="club-button" disabled={busy} onClick={toggleReady}>
                {mine?.ready ? 'Not ready' : 'Ready'}
              </button>
            )}
            <button type="button" className="club-lobby-quiet" disabled={busy} onClick={() => void leaveRoom()}>
              {isHost ? 'Close lobby' : 'Leave'}
            </button>
          </div>
          <p className="club-lobby-note">{startHint}</p>
        </section>

        <section className="club-lobby-panel club-lobby-wide">
          <h2 className="club-lobby-h3">The game</h2>
          {!lobby.settings ? (
            <p className="club-lobby-note">These settings come from a newer version of the site. Reload the page.</p>
          ) : isHost ? (
            <SettingsEditor settings={lobby.settings} visibility={lobby.visibility} today={today} onChange={changeSettings} />
          ) : (
            <>
              <p className="club-lobby-summary">{summary(lobby.settings, today)}</p>
              <p className="club-lobby-note">The host picks these. Any change un-readies everyone.</p>
            </>
          )}
        </section>
      </div>
      {notice && <p className="club-lobby-error" role="alert">{notice}</p>}
    </Shell>
  );
}

const summary = (s: LobbySettings, today: string) =>
  `${courseText(s.spec, today)} · ${FORMAT_LABEL[s.format]} · ${PACE_LABEL[s.pace]} · 30 s shot clock`;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="club-wrap club-lobby">
      <div className="club-grain" aria-hidden="true" />
      {children}
    </main>
  );
}

function Message({ text, quiet }: { text: string; quiet?: boolean }) {
  return (
    <Shell>
      <h1 className="club-h2 club-lobby-title">{quiet ? 'Lobby' : 'No game here'}</h1>
      <p className="club-lobby-lede">{text}</p>
      {!quiet && <p className="club-lobby-lede"><Link href="/play" className="club-link">Back to the lobbies</Link></p>}
    </Shell>
  );
}
