'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import GuestNameForm from '@/components/mp/guest-name-form';
import {
  getLobby, getPlayers, getSwings, heartbeat, joinLobby, leaveLobby, openLobbyChannel, rematch, saveSwing,
  setReady, startLobby, updateSettings,
  type Lobby, type LobbyChannel, type LobbyMember,
} from '@/lib/mp/lobby-client';
import { ensureSession } from '@/lib/mp/session-client';
import { postFinish } from '@/lib/mp/finish-client';
import type { SlotResult } from '@/lib/mp/finish-core';
import {
  FORMATS, PACES, parseCode, parseSwing, presentPlayers,
  type CourseSpec, type LobbyEvent, type LobbySettings, type Swing, type Visibility,
} from '@/lib/mp/protocol';
import {
  courseChoice, courseText, errorText, FORMAT_LABEL, MODE_LABEL, PACE_LABEL, REAL_COURSES, specFor, todayKey,
} from '@/lib/mp/lobby-ui';
import { MODES } from '@/lib/course-rounds';
import type { Viewer } from '@/lib/mp/viewer';

type Me = { id: string; userId: string; slot: number };

const HEARTBEAT_MS = 15_000;
const AWAY_MS = 60_000; // an opponent gone from presence this long may have dropped: ask the finish route
const FINISH_RETRY_MS = 5_000;
const FINISH_WAIT_MS = 10 * 60_000; // how long to keep asking while the other player finishes
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Entry =
  | { stage: 'name'; lobby: Lobby }
  | { stage: 'error'; error: string; lobby?: Lobby }
  | { stage: 'room'; lobby: Lobby; players: LobbyMember[] | null; me: Me };

// Into the lobby: a guest (or a visitor with no session yet) is asked for a name first, unless
// they're already in it; then join (also a rejoin: it clears my left_at while the lobby is open).
async function enterLobby(code: string, viewer: Viewer, name?: string): Promise<Entry> {
  const lobby = await getLobby(code);
  if (!lobby) return { stage: 'error', error: 'not_found' };
  if (lobby.status === 'closed') return { stage: 'error', error: 'closed', lobby };
  if (viewer === 'none' && name === undefined) return { stage: 'name', lobby }; // no session until they pick a name

  const s = await ensureSession(name);
  if ('error' in s) return s.error === 'bad_name' ? { stage: 'name', lobby } : { stage: 'error', error: s.error, lobby };

  const rows = await getPlayers(lobby.id); // [] unless I'm already in it
  const mine = rows?.find((p) => p.userId === s.userId);
  if (mine?.leftAt && lobby.status !== 'open') return { stage: 'error', error: 'left', lobby };
  if (!mine && s.guest && name === undefined) return { stage: 'name', lobby };

  let slot = mine?.slot;
  if (slot === undefined || lobby.status === 'open') {
    const r = await joinLobby(code, s.name);
    if ('error' in r) return { stage: 'error', error: r.error, lobby };
    slot = r.slot;
  }
  return { stage: 'room', lobby, players: rows, me: { id: lobby.id, userId: s.userId, slot } };
}

// The lobby behind /play/<code>: join (asking a guest's name), the room with its settings and
// ready/start, then the game iframe, relaying between it and the lobby's channel and swing log.
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
  const swingSink = useRef<((s: Swing, game: number) => void) | null>(null);
  const resyncRef = useRef<(() => void) | null>(null);
  const relayRef = useRef<{ left(slot: number): void; finished(): void } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playersRef = useRef<LobbyMember[]>([]);
  const presentRef = useRef<string[]>([]);
  useEffect(() => { playersRef.current = players; }, [players]);
  useEffect(() => { presentRef.current = present; }, [present]);

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
      onSwing: (s, game) => swingSink.current?.(s, game),
      onStatus: (status) => { if (status === 'SUBSCRIBED') resyncRef.current?.(); }, // catch up after a (re)join
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
  }, [me, code]);

  const leaveRoom = useCallback(async () => {
    if (!me) return;
    setBusy(true);
    await leaveLobby(me.id);
    await send('left');
    router.push('/play');
  }, [me, router, send]);

  // ── the game: relay between the iframe and the lobby ──
  const inGame = !!me && !!lobby?.settings && (lobby.status === 'playing' || lobby.status === 'finished');
  const game = lobby?.game ?? 0;
  useEffect(() => {
    if (!inGame || !me || !code) return;
    const { id, slot: mySlot } = me;
    let alive = true, initSent = false, finishing = false, loopUntil = 0, saving = false, fails = 0;
    let results: SlotResult[] | null = null;
    let held: Swing[] = []; // swings that arrive before mp-init
    const queue: Swing[] = []; // mine, saved in order
    const leftSlots = new Set<number>();
    const lastHere = new Map<number, number>();
    const started = Date.now();

    const post = (m: object) => iframeRef.current?.contentWindow?.postMessage(m, location.origin);
    const forward = (s: Swing) => { if (s.slot !== mySlot) post({ type: 'mp-swing', swing: s }); };

    swingSink.current = (s, g) => {
      if (g !== game) return;
      if (initSent) forward(s);
      else held.push(s);
    };
    // After a reconnect or a hidden spell, anything the feed missed (the game drops duplicates).
    const resync = async () => {
      if (!initSent) return;
      const swings = await getSwings(id, game);
      if (alive && swings) swings.forEach(forward);
    };
    resyncRef.current = () => void resync();

    // Asks the finish route; with loop, keeps asking every 5 s while the game is still on.
    async function finish(loop: boolean) {
      if (results) return post({ type: 'mp-result', results });
      if (loop) loopUntil = Date.now() + FINISH_WAIT_MS;
      if (finishing) return;
      finishing = true;
      try {
        while (alive) {
          const r = await postFinish(id, game);
          if (!alive || r === 'stop') return;
          if (r?.status === 'finished') {
            results = r.results;
            post({ type: 'mp-result', results });
            refreshRef.current();
            return;
          }
          if (Date.now() + FINISH_RETRY_MS > loopUntil) return;
          await sleep(FINISH_RETRY_MS);
        }
      } finally {
        finishing = false;
      }
    }

    function left(slot: number) {
      if (slot === mySlot || leftSlots.has(slot)) return;
      leftSlots.add(slot);
      if (initSent) post({ type: 'mp-left', slot });
      void finish(true);
    }

    async function init() {
      initSent = false;
      held = [];
      for (let tries = 0; alive && tries < 6; tries++) {
        const [l, rows, swings] = await Promise.all([getLobby(code!), getPlayers(id), getSwings(id, game)]);
        if (!alive) return;
        if (l && l.game !== game) return; // a rematch began: the room takes over
        if (l?.settings && rows && swings) {
          post({ type: 'mp-init', settings: l.settings, players: rows.map((p) => ({ slot: p.slot, name: p.name })), me: mySlot, swings });
          initSent = true;
          const early = held;
          held = [];
          early.forEach(forward);
          leftSlots.forEach((slot) => post({ type: 'mp-left', slot })); // seen before the game was up
          for (const p of rows) if (p.leftAt) left(p.slot);
          if (results) post({ type: 'mp-result', results });
          return;
        }
        await sleep(2000);
      }
      if (alive) setNotice('The game couldn’t load. Reload the page to try again.');
    }

    // My swings go to the stored log, in order; the other players get them from its feed.
    async function save() {
      if (saving) return;
      saving = true;
      while (alive && queue.length) {
        const r = await saveSwing(id, game, queue[0]);
        if (r === 'failed') {
          await sleep(Math.min(10_000, 500 * 2 ** fails++)); // never drop one: a gap would stall the game
          continue;
        }
        fails = 0;
        if (r === 'closed') queue.length = 0; // the game is over (or the swing is bad): stop
        else queue.shift();
      }
      saving = false;
    }

    async function playAgain() {
      let r = await rematch(id);
      if ('error' in r && r.error === 'not_finished') {
        await finish(false);
        r = await rematch(id);
      }
      if (!alive) return;
      if ('error' in r) setNotice(errorText(r.error));
      else await send('rematch');
      refreshRef.current();
    }

    function onMessage(e: MessageEvent) {
      if (e.origin !== location.origin || e.source !== iframeRef.current?.contentWindow) return;
      const m = e.data as { type?: unknown; swing?: unknown } | null;
      if (!m || typeof m !== 'object') return;
      if (m.type === 'mp-ready') void init();
      else if (m.type === 'mp-swing') {
        const s = parseSwing(m.swing);
        if (s && s.slot === mySlot) { queue.push(s); void save(); }
      } else if (m.type === 'mp-done') void finish(true);
      else if (m.type === 'mp-rematch') void playAgain();
      else if (m.type === 'mp-leave') void leaveRoom();
    }

    // An opponent missing from presence for 60 s may have dropped; the finish route decides.
    const awayTimer = setInterval(() => {
      const now = Date.now();
      for (const slot of presentPlayers(presentRef.current, playersRef.current)) lastHere.set(slot, now);
      const away = playersRef.current.some((p) => p.slot !== mySlot && !p.leftAt && now - (lastHere.get(p.slot) ?? started) > AWAY_MS);
      if (away) void finish(false);
    }, FINISH_RETRY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void resync(); };

    relayRef.current = { left, finished: () => void finish(false) };
    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      clearInterval(awayTimer);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisible);
      swingSink.current = null;
      resyncRef.current = null;
      relayRef.current = null;
    };
  }, [inGame, me, code, game, leaveRoom, send]);

  // Refreshes tell the relay who has left, and when the game has been recorded.
  const status = lobby?.status;
  useEffect(() => {
    const relay = relayRef.current;
    if (!relay) return;
    for (const p of players) if (p.leftAt) relay.left(p.slot);
    if (status === 'finished') relay.finished();
  }, [players, status]);

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
  const here = new Set([...presentPlayers(present, players), me.slot]);
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

function Seg<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="club-lobby-field" role="group" aria-label={label}>
      <span className="club-lobby-label">{label}</span>
      <span className="club-lobby-seg">
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => o.value !== value && onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </span>
    </div>
  );
}

function SettingsEditor({ settings, visibility, today, onChange }: {
  settings: LobbySettings; visibility: Visibility; today: string;
  onChange: (s: LobbySettings, v: Visibility) => void;
}) {
  const spec = settings.spec;
  const setSpec = (next: CourseSpec) => onChange({ ...settings, spec: next }, visibility);
  return (
    <div className="club-lobby-settings">
      <div className="club-lobby-field">
        <label className="club-lobby-label" htmlFor="lobby-course">Course</label>
        <select
          id="lobby-course"
          className="club-lobby-input"
          value={courseChoice(spec)}
          onChange={(e) => setSpec(specFor(e.target.value, spec.kind === 'real' ? spec.mode : 'front', today))}
        >
          <option value="daily">Today’s daily nine</option>
          <option value="random">A random nine</option>
          {REAL_COURSES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {spec.kind === 'real' && (
        <Seg label="Holes" value={spec.mode} options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
          onChange={(mode) => setSpec({ ...spec, mode, day: today })} />
      )}
      {spec.kind === 'random' && (
        <div className="club-lobby-field">
          <span className="club-lobby-label">Random nine</span>
          <button type="button" className="club-lobby-quiet" onClick={() => setSpec(specFor('random', 'front', today))}>Deal another</button>
        </div>
      )}
      <Seg label="Format" value={settings.format} options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }))}
        onChange={(format) => onChange({ ...settings, format }, visibility)} />
      <Seg label="Pace" value={settings.pace} options={PACES.map((p) => ({ value: p, label: PACE_LABEL[p] }))}
        onChange={(pace) => onChange({ ...settings, pace }, visibility)} />
      <Seg label="Who can join" value={visibility}
        options={[{ value: 'private', label: 'Link only' }, { value: 'public', label: 'Public' }]}
        onChange={(v) => onChange(settings, v)} />
    </div>
  );
}
