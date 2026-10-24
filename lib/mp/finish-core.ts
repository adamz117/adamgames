// Decides a multiplayer game from the stored swing log and who is still there. Pure: the sim (DH,
// public/games/nine-holes/game.js) and the real-course JSON are passed in; the finish route does the I/O.
import type { CourseSpec, LobbySettings, Swing } from './protocol';

// Only the parts of the lobby settings a result depends on.
export type FinishSettings = Pick<LobbySettings, 'spec' | 'format'>;
export type FinishPlayer = {
  slot: number;
  user_id: string | null;
  name: string;
  guest: boolean;
  left_at: string | null;
  last_seen: string;
};
export type Outcome = 'win' | 'loss' | 'draw';
export type SlotResult = { slot: number; result: Outcome; detail: string };
export type Decision = { status: 'playing' | 'finished'; results: SlotResult[] };

// The parts of game.js used here.
type Scores = (number | null | undefined)[][];
export type FinishDH = {
  replayGame(
    spec: CourseSpec,
    realData: unknown,
    players: { slot: number }[],
    log: Swing[],
  ): { states: { course: { holes: { par: number }[] } }[]; scores: Scores; done: boolean[]; error: string | null };
  strokeResult(pars: number[], scores: Scores): { totals: number[]; winner: number | null };
  matchState(pars: number[], scores: Scores): { decided: boolean; winner: number | null; label: string };
};

export const DROP_MS = 60_000; // a player not seen for this long has left
const TIMEOUTS_TO_LEAVE = 3;

// Names for course_label (ids as in COURSE_PAR and public/games/nine-holes/courses/<id>/<id>.json).
export const COURSE_NAME: Record<string, string> = {
  victoria: 'Victoria Country Club',
  'gary-player': 'Gary Player Country Club',
  'tpc-sawgrass': 'TPC Sawgrass Stadium Course',
  augusta: 'Augusta National',
};
const MODE_NAME = { front: 'front nine', back: 'back nine', all: '18 holes' } as const;

// For match_results.course_label.
export function courseLabel(spec: CourseSpec): string {
  if (spec.kind !== 'real') return spec.kind === 'daily' ? `Daily nine ${spec.seed}` : 'Random nine';
  return `${Object.hasOwn(COURSE_NAME, spec.id) ? COURSE_NAME[spec.id] : spec.id} · ${MODE_NAME[spec.mode]}`;
}

const byShot = (a: Swing, b: Swing) => a.hole - b.hole || a.shot - b.shot;

// Why a player has forfeited, or null if they haven't.
// now is null to ignore last_seen.
function forfeit(p: FinishPlayer, swings: Swing[], now: number | null): string | null {
  if (p.left_at) return 'left';
  if (now != null && now - Date.parse(p.last_seen) > DROP_MS) return 'left';
  const last = swings.filter((s) => s.slot === p.slot).sort(byShot).slice(-TIMEOUTS_TO_LEAVE);
  if (last.length === TIMEOUTS_TO_LEAVE && last.every((s) => s.timeout)) return 'timed out';
  return null;
}

// now: the server's clock, or null to ignore last_seen (re-deciding a game already recorded, so
// every later call agrees).
export function decideResult({ settings, players, swings, now, DH, realData }: {
  settings: FinishSettings;
  players: FinishPlayer[];
  swings: Swing[];
  now: number | null;
  DH: FinishDH;
  realData: unknown;
}): Decision {
  const playing: Decision = { status: 'playing', results: [] };
  if (!players.length) return playing;
  const finished = (result: (k: number) => Outcome, detail: string | ((k: number) => string)): Decision => ({
    status: 'finished',
    results: players.map((p, k) => ({ slot: p.slot, result: result(k), detail: typeof detail === 'string' ? detail : detail(k) })),
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
        (k) => [s.totals[k], ...s.totals.filter((_, j) => j !== k)].join(' v '), // their own total first
      );
    }
  }

  // Forfeits. A player who has already finished their round can't forfeit it. If anyone's own swings
  // don't replay (rounds are independent per slot), only those players can: a bad swing must never
  // turn the honest player's leaving into a win for whoever stored it.
  const broken = players.map((p) =>
    DH.replayGame(settings.spec, realData, [{ slot: p.slot }], swings.filter((s) => s.slot === p.slot)).error != null);
  const anyBroken = broken.some(Boolean);
  const why = players.map((p, k) => (r.done[k] || (anyBroken && !broken[k]) ? null : forfeit(p, swings, now)));
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
// two-player game a guest's result is the other side of their opponent's (if that row names them:
// after a rematch the slot may hold someone new); otherwise it comes from fallback, if that has one.
const OTHER_SIDE: Record<Outcome, Outcome> = { win: 'loss', loss: 'win', draw: 'draw' };
const otherView = (detail: string) => (/^\d+ v \d+$/.test(detail) ? detail.split(' v ').reverse().join(' v ') : detail);
export function resultsFromRows(
  players: FinishPlayer[],
  rows: { user_id: string; opponent_name: string; result: Outcome; detail: string }[],
  fallback: SlotResult[] = [],
): SlotResult[] {
  const rowOf = (p: FinishPlayer) => rows.find((r) => p.user_id && r.user_id === p.user_id);
  return players.flatMap((p) => {
    const own = rowOf(p);
    if (own) return [{ slot: p.slot, result: own.result, detail: own.detail }];
    const opp = players.length === 2 ? rowOf(players.find((o) => o !== p)!) : undefined;
    if (opp && opp.opponent_name === p.name) return [{ slot: p.slot, result: OTHER_SIDE[opp.result], detail: otherView(opp.detail) }];
    return fallback.filter((r) => r.slot === p.slot);
  });
}
