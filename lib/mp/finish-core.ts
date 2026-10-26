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
// A decided result also carries its outcome against each other player (for head to head).
export type PairResult = { slot: number; result: Outcome };
export type DecidedResult = SlotResult & { opponents: PairResult[] };
export type Decision = { status: 'playing' | 'finished'; results: DecidedResult[] };

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

// A player not seen for this long has left: the 60 s to rejoin, plus 30 s because browsers run a
// hidden tab's heartbeat timer only about once a minute.
export const DROP_MS = 90_000;
const TIMEOUTS_TO_LEAVE = 3;

// Names for course_label (ids as in COURSE_PAR and public/games/nine-holes/courses/<id>/<id>.json).
export const COURSE_NAME: Record<string, string> = {
  victoria: 'Victoria Country Club',
  'gary-player': 'Gary Player Country Club',
  'tpc-sawgrass': 'TPC Sawgrass Stadium Course',
  augusta: 'Augusta National',
  'pebble-beach': 'Pebble Beach Golf Links',
  ironmere: 'Ironmere Quarry',
  sunscar: 'Sunscar Canyon',
  cloudspire: 'Cloudspire Highlands',
  'cypress-point': 'Cypress Point Club',
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
// Forfeiters lose. The rest are ranked by total once all their rounds are done: outright lowest wins,
// a tie for lowest draws, the others lose. With at most one player left in, the game ends at once.
// Match play (two players only) is decided by matchState unless someone forfeits first.
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
  // keys: lower beats higher, equal draws (forfeiters get Infinity, so two of them draw).
  const finished = (keys: number[], detail: (k: number) => string): Decision => {
    const best = Math.min(...keys), tied = keys.filter((x) => x === best).length > 1;
    const vs = (a: number, b: number): Outcome => (a < b ? 'win' : a > b ? 'loss' : 'draw');
    return {
      status: 'finished',
      results: players.map((p, k) => ({
        slot: p.slot,
        result: keys[k] !== best ? 'loss' : tied ? 'draw' : 'win',
        detail: detail(k),
        opponents: players.flatMap((o, j) => (j === k ? [] : [{ slot: o.slot, result: vs(keys[k], keys[j]) }])),
      })),
    };
  };

  const r = DH.replayGame(settings.spec, realData, players.map((p) => ({ slot: p.slot })), swings);
  const pars = r.states[0].course.holes.map((h) => h.par);
  const isMatch = settings.format === 'match' && players.length === 2;

  // Match play decided (possibly early), or both cards complete.
  if (!r.error && isMatch) {
    const m = DH.matchState(pars, r.scores);
    if (m.decided || r.done.every(Boolean)) return finished(players.map((_, k) => (m.winner == null || m.winner === k ? 0 : 1)), () => m.label);
  }

  // Forfeits. A player who has already finished their round can't forfeit it. If anyone's own swings
  // don't replay (rounds are independent per slot), only those players can: a bad swing must never
  // turn an honest player's leaving into a win for whoever stored it.
  const broken = players.map((p) =>
    DH.replayGame(settings.spec, realData, [{ slot: p.slot }], swings.filter((s) => s.slot === p.slot)).error != null);
  const anyBroken = broken.some(Boolean);
  const why = players.map((p, k) => (r.done[k] || (anyBroken && !broken[k]) ? null : forfeit(p, swings, now)));
  const note = (k: number) => `${players[k].name} ${why[k]}`;
  const outKs = players.flatMap((_, k) => (why[k] ? [k] : [])), inKs = players.flatMap((_, k) => (why[k] ? [] : [k]));
  const notes = outKs.map(note).join(', ');
  if (!inKs.length) return finished(players.map(() => Infinity), () => 'Abandoned');
  if (outKs.length && inKs.length === 1) return finished(why.map((w) => (w ? Infinity : 0)), (k) => (why[k] ? note(k) : notes));
  if (isMatch) return playing;

  // Stroke play: every round still in must be complete and replay cleanly (a stray swing, even for an
  // unknown slot, writes nothing). Leavers' swings don't count.
  const outSlots = new Set(outKs.map((k) => players[k].slot));
  const rIn = outKs.length
    ? DH.replayGame(settings.spec, realData, inKs.map((k) => ({ slot: players[k].slot })), swings.filter((s) => !outSlots.has(s.slot)))
    : r;
  if (rIn.error || !rIn.done.every(Boolean)) return playing; // still going, or a broken log (nothing is written)
  const totals = DH.strokeResult(pars, rIn.scores).totals;
  const keys = players.map((_, k) => (why[k] ? Infinity : totals[inKs.indexOf(k)]));
  return finished(keys, (k) => (why[k]
    ? note(k)
    : [k, ...inKs.filter((j) => j !== k)].map((j) => keys[j]).join(' v ') + (notes ? `, ${notes}` : ''))); // own total first
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
  // This player's outcome against each other player (head to head with friends); id null for a guest.
  opponents: { id: string | null; name: string; result: Outcome }[];
};
export function resultRows(
  settings: FinishSettings, players: FinishPlayer[], results: (SlotResult & { opponents?: PairResult[] })[],
): ResultRow[] {
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
      opponents: (mine.opponents ?? []).flatMap((o) => {
        const q = players.find((x) => x.slot === o.slot);
        return q ? [{ id: !q.guest && q.user_id ? q.user_id : null, name: q.name, result: o.result }] : [];
      }),
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
