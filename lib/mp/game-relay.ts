// The page's side of a game in progress: between the game iframe and the lobby's stored swing log.
// A plain state machine (no React, no Supabase): the I/O comes in as dependencies, the events as calls.
//   message(data)   from the iframe (the caller checks origin and source)
//   swing(s, game)  the stored-swings feed
//   lobby(state)    after each refresh or presence change: who has left, who is here, the status
//   resync()        the channel (re)subscribed or the tab came back: re-read the log
//   tick()          every few seconds: the away check, and a periodic resync
import { parseSwing } from './protocol';
import type { LobbySettings, Swing } from './protocol';
import type { SlotResult } from './finish-core';
import type { FinishReply } from './finish-client';

export type RelayPlayer = { slot: number; name: string; leftAt: string | null };
export type RelayDeps = {
  lobbyId: string;
  code: string;
  game: number; // the lobby's game number this relay plays
  me: number; // my slot
  post(msg: object): void; // to the iframe
  getLobby(code: string): Promise<{ game: number; settings: LobbySettings | null } | null>;
  getPlayers(lobbyId: string): Promise<RelayPlayer[] | null>;
  getSwings(lobbyId: string, game: number): Promise<Swing[] | null>;
  saveSwing(lobbyId: string, game: number, swing: Swing): Promise<'stored' | 'closed' | 'failed'>;
  postFinish(lobbyId: string, game: number): Promise<FinishReply | 'stop' | null>;
  onRematch(): void; // "Play again"
  onLeave(): void; // "Leave"
  onFinished?(): void; // the result is recorded
  onError?(text: string): void;
  now?(): number;
  sleep?(ms: number): Promise<void>;
};
export type GameRelay = {
  message(data: unknown): void;
  swing(s: Swing, game: number): void;
  lobby(state: { players: { slot: number; leftAt: string | null }[]; present: number[]; status?: string }): void;
  resync(): void;
  tick(): void;
  dispose(): void;
};

export const AWAY_MS = 60_000; // an opponent gone from presence this long may have dropped: ask the finish route
export const FINISH_RETRY_MS = 5_000;
export const FINISH_WAIT_MS = 10 * 60_000; // how long to keep asking while the other player finishes
export const RESYNC_MS = 15_000;
export const AWAY_RETRY_MS = 30_000; // while they stay away (but may still be heartbeating): ask at most this often
const INIT_TRIES = 6;

export function createGameRelay(d: RelayDeps): GameRelay {
  const now = d.now ?? Date.now;
  const sleep = d.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const { lobbyId, game, me } = d;

  let alive = true;
  let initRun = 0, initSent = false, resyncWanted = false;
  let held: Swing[] = []; // opponents' swings that arrive before mp-init
  let results: SlotResult[] | null = null, resultPosted = false;
  let finishing = false, loopUntil = 0;
  const queue: Swing[] = []; // my swings, saved in order
  let saving = false;
  let players: { slot: number; leftAt: string | null }[] = [], present: number[] = [];
  const leftSlots = new Set<number>();
  const lastHere = new Map<number, number>();
  const started = now();
  let lastResync = started, lastAwayAsk = -Infinity;

  const forward = (s: Swing) => { if (s.slot !== me) d.post({ type: 'mp-swing', swing: s }); };
  // Once per mp-init: the game reopens its end card on every mp-result.
  const postResult = () => {
    if (!initSent || !results || resultPosted) return;
    resultPosted = true;
    d.post({ type: 'mp-result', results });
  };

  // The game is up (mp-ready, once per iframe load): build it from the stored log.
  async function init() {
    const run = ++initRun;
    initSent = false;
    resultPosted = false;
    for (let tries = 0; tries < INIT_TRIES; tries++) {
      const [l, rows, swings] = await Promise.all([d.getLobby(d.code), d.getPlayers(lobbyId), d.getSwings(lobbyId, game)]);
      if (!alive || run !== initRun) return;
      if (l && l.game !== game) return; // a rematch began: the room takes over
      if (l?.settings && rows && swings) {
        d.post({ type: 'mp-init', settings: l.settings, players: rows.map((p) => ({ slot: p.slot, name: p.name })), me, swings });
        initSent = true;
        const early = held;
        held = [];
        early.forEach(forward);
        leftSlots.forEach((slot) => d.post({ type: 'mp-left', slot }));
        for (const p of rows) if (p.leftAt) left(p.slot);
        postResult();
        // A resync asked for while the snapshot was in flight: the feed may have gone live after it.
        if (resyncWanted) void resync();
        return;
      }
      await sleep(2000);
      if (!alive || run !== initRun) return;
    }
    d.onError?.('The game couldn’t load. Reload the page to try again.');
  }

  // Anything the feed missed (the game drops duplicates).
  async function resync() {
    if (!initSent) { resyncWanted = true; return; }
    resyncWanted = false;
    lastResync = now();
    const swings = await d.getSwings(lobbyId, game);
    if (alive && initSent && swings) swings.forEach(forward);
  }

  async function save() {
    if (saving) return;
    saving = true;
    let fails = 0;
    while (alive && queue.length) {
      const r = await d.saveSwing(lobbyId, game, queue[0]);
      if (!alive) break;
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

  // Asks the finish route; with loop, keeps asking every 5 s while the game is still on.
  async function finish(loop: boolean) {
    if (results) return;
    if (loop) loopUntil = now() + FINISH_WAIT_MS;
    if (finishing) return;
    finishing = true;
    try {
      while (alive) {
        const r = await d.postFinish(lobbyId, game);
        if (!alive || r === 'stop') return;
        if (r?.status === 'finished') {
          results = r.results;
          postResult();
          d.onFinished?.();
          return;
        }
        if (now() + FINISH_RETRY_MS > loopUntil) return;
        await sleep(FINISH_RETRY_MS);
      }
    } finally {
      finishing = false;
    }
  }

  function left(slot: number) {
    if (slot === me || leftSlots.has(slot)) return;
    leftSlots.add(slot);
    if (initSent) d.post({ type: 'mp-left', slot });
    void finish(true);
  }

  function markHere() {
    const t = now();
    for (const slot of present) lastHere.set(slot, t);
    return t;
  }

  return {
    message(data) {
      const m = data as { type?: unknown; swing?: unknown } | null;
      if (!alive || !m || typeof m !== 'object') return;
      if (m.type === 'mp-ready') void init();
      else if (m.type === 'mp-swing') {
        const s = parseSwing(m.swing);
        if (s && s.slot === me) { queue.push(s); void save(); }
      } else if (m.type === 'mp-done') void finish(true);
      else if (m.type === 'mp-rematch') d.onRematch();
      else if (m.type === 'mp-leave') d.onLeave();
    },
    swing(s, g) {
      if (!alive || g !== game || s.slot === me) return;
      if (initSent) forward(s);
      else held.push(s);
    },
    lobby(state) {
      if (!alive) return;
      players = state.players;
      present = state.present;
      markHere();
      for (const p of players) if (p.leftAt) left(p.slot);
      if (state.status === 'finished') void finish(false);
    },
    resync() {
      if (alive) void resync();
    },
    tick() {
      if (!alive) return;
      const t = markHere();
      const away = players.some((p) => p.slot !== me && !p.leftAt && t - (lastHere.get(p.slot) ?? started) > AWAY_MS);
      if (away && !results && t - lastAwayAsk >= AWAY_RETRY_MS) {
        lastAwayAsk = t;
        void finish(false);
      }
      if (t - lastResync >= RESYNC_MS) void resync();
    },
    dispose() {
      alive = false;
    },
  };
}
