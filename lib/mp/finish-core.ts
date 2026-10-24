// Decides a multiplayer game from the stored swing log and who is still there. Pure: the sim (DH,
// public/games/nine-holes/game.js) and the real-course JSON are passed in; the finish route does the I/O.

export type FinishSpec =
  | { kind: 'daily' | 'random'; seed: string }
  | { kind: 'real'; id: string; mode: 'front' | 'back' | 'all'; day: string };
export type FinishSettings = { spec: FinishSpec; format: 'stroke' | 'match' };
export type FinishPlayer = {
  slot: number;
  user_id: string | null;
  name: string;
  guest: boolean;
  left_at: string | null;
  last_seen: string;
};
export type FinishSwing = { slot: number; hole: number; shot: number; club: number; aim: number; v: number; timeout: boolean };
export type Outcome = 'win' | 'loss' | 'draw';
export type SlotResult = { slot: number; result: Outcome; detail: string };
export type Decision = { status: 'playing' | 'finished'; results: SlotResult[] };

// The parts of game.js used here.
type Scores = (number | null | undefined)[][];
export type FinishDH = {
  replayGame(
    spec: FinishSpec,
    realData: unknown,
    players: { slot: number }[],
    log: FinishSwing[],
  ): { states: { course: { holes: { par: number }[] } }[]; scores: Scores; done: boolean[]; error: string | null };
  strokeResult(pars: number[], scores: Scores): { totals: number[]; winner: number | null };
  matchState(pars: number[], scores: Scores): { decided: boolean; winner: number | null; label: string };
};

export const DROP_MS = 60_000; // a player not seen for this long has left
const TIMEOUTS_TO_LEAVE = 3;

// The real courses a lobby can play (ids as in public/games/nine-holes/courses/<id>/<id>.json).
export const COURSE_NAME: Record<string, string> = {
  victoria: 'Victoria Country Club',
  'gary-player': 'Gary Player Country Club',
  'tpc-sawgrass': 'TPC Sawgrass Stadium Course',
  augusta: 'Augusta National',
};
const MODE_NAME = { front: 'front nine', back: 'back nine', all: '18 holes' } as const;

// Only what the finish route needs from lobbies.settings, checked; null if anything is off.
export function finishSettings(x: unknown): FinishSettings | null {
  if (!x || typeof x !== 'object') return null;
  const m = x as Record<string, unknown>, s = m.spec as Record<string, unknown> | null;
  if ((m.format !== 'stroke' && m.format !== 'match') || !s || typeof s !== 'object') return null;
  if ((s.kind === 'daily' || s.kind === 'random') && typeof s.seed === 'string' && s.seed)
    return { spec: { kind: s.kind, seed: s.seed }, format: m.format };
  if (s.kind === 'real' && typeof s.id === 'string' && Object.hasOwn(COURSE_NAME, s.id)
      && typeof s.mode === 'string' && Object.hasOwn(MODE_NAME, s.mode) && typeof s.day === 'string')
    return { spec: { kind: 'real', id: s.id, mode: s.mode as 'front' | 'back' | 'all', day: s.day }, format: m.format };
  return null;
}

// For match_results.course_label.
export function courseLabel(spec: FinishSpec): string {
  if (spec.kind !== 'real') return spec.kind === 'daily' ? `Daily nine ${spec.seed}` : 'Random nine';
  return `${COURSE_NAME[spec.id] ?? spec.id} · ${MODE_NAME[spec.mode]}`;
}

const byShot = (a: FinishSwing, b: FinishSwing) => a.hole - b.hole || a.shot - b.shot;

// Why a player has forfeited, or null if they haven't.
function forfeit(p: FinishPlayer, swings: FinishSwing[], now: number): string | null {
  if (p.left_at) return 'left';
  if (now - Date.parse(p.last_seen) > DROP_MS) return 'left';
  const last = swings.filter((s) => s.slot === p.slot).sort(byShot).slice(-TIMEOUTS_TO_LEAVE);
  if (last.length === TIMEOUTS_TO_LEAVE && last.every((s) => s.timeout)) return 'timed out';
  return null;
}

export function decideResult({ settings, players, swings, now, DH, realData }: {
  settings: FinishSettings;
  players: FinishPlayer[];
  swings: FinishSwing[];
  now: number;
  DH: FinishDH;
  realData: unknown;
}): Decision {
  const playing: Decision = { status: 'playing', results: [] };
  if (!players.length) return playing;
  const finished = (result: (k: number) => Outcome, detail: string): Decision => ({
    status: 'finished',
    results: players.map((p, k) => ({ slot: p.slot, result: result(k), detail })),
  });

  const r = DH.replayGame(settings.spec, realData, players.map((p) => ({ slot: p.slot })), swings);
  const pars = r.states[0].course.holes.map((h) => h.par);
  const allDone = r.done.every(Boolean);

  // Played out: match play decided (possibly early), or every card complete.
  if (!r.error) {
    if (settings.format === 'match' && players.length === 2) {
      const m = DH.matchState(pars, r.scores);
      if (m.decided || allDone) return finished((k) => (m.winner == null ? 'draw' : m.winner === k ? 'win' : 'loss'), m.label);
    } else if (allDone) {
      const s = DH.strokeResult(pars, r.scores), best = Math.min(...s.totals);
      return finished(
        (k) => (s.winner != null ? (s.winner === k ? 'win' : 'loss') : s.totals[k] === best ? 'draw' : 'loss'),
        s.totals.join(' v '),
      );
    }
  }

  // Forfeits. A player who has already finished their round can't forfeit it.
  const why = players.map((p, k) => (r.done[k] ? null : forfeit(p, swings, now)));
  const out = players.filter((_, k) => why[k]);
  if (out.length === players.length) return finished(() => 'draw', 'Abandoned');
  if (out.length) {
    const detail = players.map((p, k) => (why[k] ? `${p.name} ${why[k]}` : '')).filter(Boolean).join(', ');
    return finished((k) => (why[k] ? 'loss' : 'win'), detail);
  }
  return playing; // still going, or a broken log (nothing is written)
}

// finish_lobby's p_rows: one per signed-in player (guests get no records).
export type ResultRow = {
  user_id: string;
  opponent_id: string | null;
  opponent_name: string;
  course_label: string;
  format: FinishSettings['format'];
  result: Outcome;
  detail: string;
};
export function resultRows(settings: FinishSettings, players: FinishPlayer[], results: SlotResult[]): ResultRow[] {
  const label = courseLabel(settings.spec);
  return players.flatMap((p) => {
    const mine = results.find((r) => r.slot === p.slot);
    if (p.guest || !p.user_id || !mine) return [];
    const others = players.filter((o) => o !== p), opp = others.length === 1 ? others[0] : null;
    return [{
      user_id: p.user_id,
      opponent_id: opp && !opp.guest && opp.user_id ? opp.user_id : null,
      opponent_name: others.map((o) => o.name).join(', ') || 'Guest',
      course_label: label,
      format: settings.format,
      result: mine.result,
      detail: mine.detail,
    }];
  });
}

// One result per slot from the stored match_results rows (which only signed-in players have). In a
// two-player game a guest's result is the other side of their opponent's; otherwise it comes from
// fallback (a fresh decision), if that has one.
const OTHER_SIDE: Record<Outcome, Outcome> = { win: 'loss', loss: 'win', draw: 'draw' };
export function resultsFromRows(
  players: FinishPlayer[],
  rows: { user_id: string; result: Outcome; detail: string }[],
  fallback: SlotResult[] = [],
): SlotResult[] {
  const rowOf = (p: FinishPlayer) => rows.find((r) => p.user_id && r.user_id === p.user_id);
  return players.flatMap((p) => {
    const own = rowOf(p);
    if (own) return [{ slot: p.slot, result: own.result, detail: own.detail }];
    const opp = players.length === 2 ? rowOf(players.find((o) => o !== p)!) : undefined;
    if (opp) return [{ slot: p.slot, result: OTHER_SIDE[opp.result], detail: opp.detail }];
    return fallback.filter((r) => r.slot === p.slot);
  });
}
