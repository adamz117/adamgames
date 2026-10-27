// Decides a multiplayer game from the stored swing log and who is still there. Pure: the sim (DH,
// public/games/nine-holes/game.js) and the real-course JSON are passed in; the finish route does the I/O.
import type { CourseSpec, LobbySettings, Swing, TeamMode, Teams } from './protocol';

// Only the parts of the lobby settings a result depends on.
export type FinishSettings = Pick<LobbySettings, 'spec' | 'format' | 'teams'>;
export type FinishPlayer = {
  slot: number;
  user_id: string | null;
  name: string;
  guest: boolean;
  left_at: string | null;
  last_seen: string;
};
export type Outcome = 'win' | 'loss' | 'draw';
// place: 1 for the winner (and everyone tied for first), then by score; forfeits come last.
export type SlotResult = { slot: number; result: Outcome; detail: string; place: number };
// out: slots that have forfeited (in a game of three or four the rest play on).
export type Decision = { status: 'playing' | 'finished'; results: SlotResult[]; out: number[] };

// The parts of game.js used here.
type Scores = (number | null | undefined)[][];
export type FinishDH = {
  replayGame(
    spec: CourseSpec,
    realData: unknown,
    players: { slot: number }[],
    log: Swing[],
    teams?: Teams,
    gone?: number[],
  ): { states: { course: { holes: { par: number }[] } }[]; scores: Scores; done: boolean[]; error: string | null };
  sideScores(teams: Teams, players: { slot: number }[], states: unknown[], gone?: number[]): Scores;
  sidesDone(teams: Teams, players: { slot: number }[], states: unknown[], gone?: number[]): boolean[];
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
  'champagne-sports': 'Champagne Sports Resort',
  'cotswold-downs': 'Cotswold Downs',
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

const ORDINAL = ['1st', '2nd', '3rd', '4th'];
export const TEAM_LABEL: Record<TeamMode, string> = { bestball: 'Best ball', alternate: 'Alternate shot', scramble: 'Scramble' };
const andList = (a: string[]) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

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
  if (!players.length) return { status: 'playing', results: [], out: [] };
  if (settings.teams) return decideTeams({ settings, teams: settings.teams, players, swings, now, DH, realData });
  const spec = settings.spec;
  const r = DH.replayGame(spec, realData, players.map((p) => ({ slot: p.slot })), swings);
  const pars = r.states[0].course.holes.map((h) => h.par);

  // Match play (two players): decided, possibly early, or all nine played.
  if (!r.error && settings.format === 'match' && players.length === 2) {
    const m = DH.matchState(pars, r.scores);
    if (m.decided || r.done.every(Boolean)) {
      return {
        status: 'finished', out: [],
        results: players.map((p, k) => {
          const result: Outcome = m.winner == null ? 'draw' : m.winner === k ? 'win' : 'loss';
          return { slot: p.slot, result, detail: m.label, place: result === 'loss' ? 2 : 1 };
        }),
      };
    }
  }

  // Forfeits. A player who has already finished their round can't forfeit it. If anyone's own swings
  // don't replay (rounds are independent per slot), only those players can: a bad swing must never
  // turn the honest player's leaving into a win for whoever stored it.
  const broken = players.map((p) =>
    DH.replayGame(spec, realData, [{ slot: p.slot }], swings.filter((s) => s.slot === p.slot)).error != null);
  const anyBroken = broken.some(Boolean);
  const why = players.map((p, k) => (r.done[k] || (anyBroken && !broken[k]) ? null : forfeit(p, swings, now)));
  const out = players.filter((_, k) => why[k]).map((p) => p.slot);
  const rest = players.filter((_, k) => !why[k]);
  const playing: Decision = { status: 'playing', results: [], out };
  const finished = (results: SlotResult[]): Decision => ({ status: 'finished', results, out });
  const gone = players.map((p, k) => (why[k] ? `${p.name} ${why[k]}` : '')).filter(Boolean).join(', ');

  if (!rest.length) return finished(players.map((p) => ({ slot: p.slot, result: 'draw', detail: 'Abandoned', place: 1 })));
  if (out.length && rest.length === 1)
    return finished(players.map((p, k) => ({ slot: p.slot, result: why[k] ? 'loss' : 'win', detail: gone, place: why[k] ? 2 : 1 })));
  if (settings.format === 'match') return playing;

  // Stroke play, once every card still in play is complete (the forfeits' swings left out).
  const rr = out.length
    ? DH.replayGame(spec, realData, rest.map((p) => ({ slot: p.slot })), swings.filter((s) => !out.includes(s.slot)))
    : r;
  if (rr.error || !rr.done.every(Boolean)) return playing;
  const totals = DH.strokeResult(pars, rr.scores).totals, n = players.length;
  return finished(players.map((p, k) => {
    if (why[k]) return { slot: p.slot, result: 'loss', detail: gone, place: rest.length + 1 };
    const j = rest.indexOf(p), t = totals[j];
    const place = 1 + totals.filter((x) => x < t).length, tied = totals.filter((x) => x === t).length > 1;
    const vs = [t, ...totals.filter((_, i) => i !== j)].join(' v '); // their own total first
    const detail = n === 2 ? vs : `${tied ? 'T' : ''}${ORDINAL[place - 1]} of ${n} · ${vs}${gone ? ` · ${gone}` : ''}`;
    return { slot: p.slot, result: place > 1 ? 'loss' : tied ? 'draw' : 'win', detail, place };
  }));
}

// 2v2: the two sides' scores decide it (best ball: each side's best ball per hole; alternate shot and scramble: its
// one ball), and everyone on a side gets the side's result. A side plays on while either member is still playing;
// once both have gone (forfeited, or never there) the other side wins.
function decideTeams({ settings, teams, players, swings, now, DH, realData }: {
  settings: FinishSettings; teams: Teams; players: FinishPlayer[]; swings: Swing[]; now: number | null; DH: FinishDH; realData: unknown;
}): Decision {
  const spec = settings.spec, ball = teams.mode !== 'bestball', label = TEAM_LABEL[teams.mode];
  const sideOf = (slot: number) => teams.sides.findIndex((m) => m.includes(slot));
  // scramble: those who pressed Leave are gone for certain, so their partner's shots settle without them
  const left = teams.mode === 'scramble' ? players.filter((p) => p.left_at).map((p) => p.slot) : [];
  const r = DH.replayGame(spec, realData, players.map((p) => ({ slot: p.slot })), swings, teams, left);
  const pars = r.states[0].course.holes.map((h) => h.par);
  // Forfeits, as in a game of players: a round already finished can't be forfeited, and a bad swing only lets
  // its own player (best ball) or side (one ball) forfeit.
  const doneOf = (p: FinishPlayer, k: number) => (ball ? r.done[sideOf(p.slot)] : r.done[k]);
  const broken = players.map((p) => {
    const mine = ball ? teams.sides[sideOf(p.slot)] : [p.slot];
    return DH.replayGame(spec, realData, mine.filter((s) => players.some((q) => q.slot === s)).map((slot) => ({ slot })),
      swings.filter((s) => mine.includes(s.slot)), ball ? teams : undefined, left).error != null;
  });
  const anyBroken = broken.some(Boolean);
  const why = players.map((p, k) => (doneOf(p, k) || (anyBroken && !broken[k]) ? null : forfeit(p, swings, now)));
  const out = players.filter((_, k) => why[k]).map((p) => p.slot);
  const absent = (slot: number) => out.includes(slot) || !players.some((p) => p.slot === slot);
  const sideOut = teams.sides.map((m) => m.every(absent));
  const finished = (result: (side: number) => Outcome, detail: (side: number) => string): Decision => ({
    status: 'finished', out,
    results: players.map((p) => { const sd = sideOf(p.slot), res = result(sd); return { slot: p.slot, result: res, detail: detail(sd), place: res === 'loss' ? 2 : 1 }; }),
  });
  if (sideOut[0] && sideOut[1]) return finished(() => 'draw', () => 'Abandoned');
  if (sideOut[0] || sideOut[1]) {
    const gone = players.filter((_, k) => why[k]), reasons = new Set(gone.map((p) => why[players.indexOf(p)]));
    const note = reasons.size === 1 ? `${andList(gone.map((p) => p.name))} ${[...reasons][0]}` : gone.map((p) => `${p.name} ${why[players.indexOf(p)]}`).join(', ');
    return finished((sd) => (sideOut[sd] ? 'loss' : 'win'), () => note);
  }
  const playing: Decision = { status: 'playing', results: [], out };
  // Scramble: a shot only waiting for someone who has gone settles with the partner's ball, so replay knowing who.
  const g = teams.mode === 'scramble' && out.length ? DH.replayGame(spec, realData, players.map((p) => ({ slot: p.slot })), swings, teams, out) : r;
  if (g.error) return playing;
  const scores = DH.sideScores(teams, players, g.states, out), done = DH.sidesDone(teams, players, g.states, out);
  if (settings.format === 'match') {
    const m = DH.matchState(pars, scores);
    if (!m.decided && !done.every(Boolean)) return playing;
    return finished((sd) => (m.winner == null ? 'draw' : m.winner === sd ? 'win' : 'loss'), () => `${label} · ${m.label}`);
  }
  if (!done.every(Boolean)) return playing;
  const totals = scores.map((sc) => sc.reduce((a: number, x) => a + (x ?? 0), 0));
  return finished((sd) => (totals[sd] < totals[1 - sd] ? 'win' : totals[sd] > totals[1 - sd] ? 'loss' : 'draw'),
    (sd) => `${label} · ${totals[sd]} v ${totals[1 - sd]}`);
}

// Every player's result in a game, kept on each stored row (match_results.field), so head to head
// can count each pair of friends and a guest's result can be read back. id is null for a guest.
// team: the player's side in a 2v2 (0 or 1), absent otherwise.
export type FieldEntry = { slot: number; id: string | null; name: string; result: Outcome; detail: string; place: number; team?: number };
const OUTCOMES: Outcome[] = ['win', 'loss', 'draw'];
export function parseField(x: unknown): FieldEntry[] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((e) => {
    const m = e as Record<string, unknown> | null;
    if (!m || !Number.isInteger(m.slot) || typeof m.name !== 'string' || !OUTCOMES.includes(m.result as Outcome)) return [];
    return [{
      slot: m.slot as number,
      id: typeof m.id === 'string' ? m.id : null,
      name: m.name,
      result: m.result as Outcome,
      detail: typeof m.detail === 'string' ? m.detail : '',
      place: Number.isInteger(m.place) ? (m.place as number) : m.result === 'loss' ? 2 : 1,
      ...(m.team === 0 || m.team === 1 ? { team: m.team } : {}),
    }];
  });
}

// finish_lobby's p_rows: one per signed-in player (guests get no records).
export type ResultRow = {
  user_id: string;
  opponent_id: string | null; // only when there was exactly one other player
  opponent_name: string;
  course_label: string;
  format: FinishSettings['format'];
  result: Outcome;
  detail: string;
  field: FieldEntry[];
};
export function resultRows(settings: FinishSettings, players: FinishPlayer[], results: SlotResult[]): ResultRow[] {
  const label = courseLabel(settings.spec);
  const field = players.flatMap((o) => {
    const r = results.find((x) => x.slot === o.slot);
    const team = settings.teams ? settings.teams.sides.findIndex((m) => m.includes(o.slot)) : -1;
    return r ? [{ slot: o.slot, id: !o.guest && o.user_id ? o.user_id : null, name: o.name, result: r.result, detail: r.detail, place: r.place, ...(team >= 0 ? { team } : {}) }] : [];
  });
  return players.flatMap((p) => {
    const mine = results.find((r) => r.slot === p.slot);
    if (p.guest || !p.user_id || !mine) return [];
    // in a 2v2 the opponent is the other side ("Cal & Dan")
    const side = settings.teams?.sides.find((m) => m.includes(p.slot));
    const others = players.filter((o) => o !== p && !(side && side.includes(o.slot))), opp = others.length === 1 ? others[0] : null;
    return [{
      user_id: p.user_id,
      opponent_id: opp && !opp.guest && opp.user_id ? opp.user_id : null,
      opponent_name: others.map((o) => o.name).join(side ? ' & ' : ', ') || 'Guest',
      course_label: label,
      format: settings.format,
      result: mine.result,
      detail: mine.detail,
      field,
    }];
  });
}

// One result per slot from the stored match_results rows (which only signed-in players have). A
// guest's result comes from any row's field (if it names them: after a rematch the slot may hold
// someone new); rows from before field existed give, in a two-player game, the other side of their
// opponent's; otherwise it comes from fallback, if that has one.
const OTHER_SIDE: Record<Outcome, Outcome> = { win: 'loss', loss: 'win', draw: 'draw' };
const otherView = (detail: string) => (/^\d+ v \d+$/.test(detail) ? detail.split(' v ').reverse().join(' v ') : detail);
const placeOf = (r: Outcome) => (r === 'loss' ? 2 : 1);
export type StoredRow = { user_id: string; opponent_name: string; result: Outcome; detail: string; field?: unknown };
export function resultsFromRows(players: FinishPlayer[], rows: StoredRow[], fallback: SlotResult[] = []): SlotResult[] {
  const rowOf = (p: FinishPlayer) => rows.find((r) => p.user_id && r.user_id === p.user_id);
  return players.flatMap((p) => {
    const entryIn = (row: StoredRow) => parseField(row.field).find((e) => e.slot === p.slot && e.name === p.name);
    const own = rowOf(p);
    if (own) return [{ slot: p.slot, result: own.result, detail: own.detail, place: entryIn(own)?.place ?? placeOf(own.result) }];
    for (const row of rows) {
      const e = entryIn(row);
      if (e) return [{ slot: p.slot, result: e.result, detail: e.detail, place: e.place }];
    }
    const opp = players.length === 2 ? rowOf(players.find((o) => o !== p)!) : undefined;
    if (opp && opp.opponent_name === p.name) {
      const result = OTHER_SIDE[opp.result];
      return [{ slot: p.slot, result, detail: otherView(opp.detail), place: placeOf(result) }];
    }
    return fallback.filter((r) => r.slot === p.slot);
  });
}
