// Multiplayer records, read from the player's own match_results rows. Pure: records-client.ts and
// records-server.ts do the fetching. Overall counts every finished game (guests too); head to
// head the games against one signed-in player, using that game's outcome against them (rows from
// before 2026-10-25 have no opponents list, so they fall back to opponent_id).
import type { Format } from './protocol';
import type { Outcome } from './finish-core';

export type RecordRow = {
  lobby_id: string;
  game: number;
  opponent_id: string | null;
  opponent_name: string;
  course_label: string;
  format: Format;
  result: Outcome;
  detail: string;
  played_at: string;
  opponents: { id: string | null; name: string; result: Outcome }[];
};
export type Tally = { win: number; loss: number; draw: number };
export type MpRecord = Tally & { stroke: Tally; match: Tally };
export type HeadToHead = Tally & { games: RecordRow[] };

export const RESULT_COLUMNS = 'lobby_id, game, opponent_id, opponent_name, course_label, format, result, detail, played_at, opponents';
export const HEAD_TO_HEAD_GAMES = 5;

const isStr = (x: unknown): x is string => typeof x === 'string';
const isOutcome = (x: unknown): x is Outcome => x === 'win' || x === 'loss' || x === 'draw';

// The opponents list, keeping only well-formed entries.
function parseOpponents(x: unknown): RecordRow['opponents'] {
  if (!Array.isArray(x)) return [];
  return x.flatMap((o) => {
    if (!o || typeof o !== 'object') return [];
    const { id, name, result } = o as Record<string, unknown>;
    return (id === null || isStr(id)) && isStr(name) && isOutcome(result) ? [{ id, name, result }] : [];
  });
}

// A row checked field by field; anything off is dropped.
function parseRow(x: unknown): RecordRow | null {
  if (!x || typeof x !== 'object') return null;
  const r = x as Record<string, unknown>;
  if (r.format !== 'stroke' && r.format !== 'match') return null;
  if (r.result !== 'win' && r.result !== 'loss' && r.result !== 'draw') return null;
  if (r.opponent_id !== null && !isStr(r.opponent_id)) return null;
  if (!isStr(r.lobby_id) || !isStr(r.opponent_name) || !isStr(r.course_label) || !isStr(r.detail)) return null;
  if (!isStr(r.played_at) || Number.isNaN(Date.parse(r.played_at))) return null;
  return {
    lobby_id: r.lobby_id, game: typeof r.game === 'number' ? r.game : 1, opponent_id: r.opponent_id,
    opponent_name: r.opponent_name, course_label: r.course_label, format: r.format, result: r.result,
    detail: r.detail, played_at: r.played_at, opponents: parseOpponents(r.opponents),
  };
}

// Valid rows only, in the order given (the readers fetch them newest first).
export function cleanRows(rows: unknown): RecordRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(parseRow).filter((r): r is RecordRow => r !== null);
}

const tally = (rows: RecordRow[]): Tally => {
  const t = { win: 0, loss: 0, draw: 0 };
  for (const r of rows) t[r.result]++;
  return t;
};

export function readRecord(rows: unknown): MpRecord {
  const all = cleanRows(rows);
  return {
    ...tally(all),
    stroke: tally(all.filter((r) => r.format === 'stroke')),
    match: tally(all.filter((r) => r.format === 'match')),
  };
}

// The record against one opponent and the last few games together (rows newest first). Each game
// counts with your outcome against them, which in a 3–4 player game can differ from your overall result.
export function headToHead(rows: unknown, friendId: string | null | undefined): HeadToHead {
  if (!friendId) return { ...tally([]), games: [] };
  const mine = cleanRows(rows).flatMap((r) => {
    const vs = r.opponents.find((o) => o.id === friendId);
    if (vs) return [{ ...r, result: vs.result }];
    return !r.opponents.length && r.opponent_id === friendId ? [r] : [];
  });
  return { ...tally(mine), games: mine.slice(0, HEAD_TO_HEAD_GAMES) };
}

export const gamesPlayed = (t: Tally) => t.win + t.loss + t.draw;
export const formatRecord = (t: Tally) => `W ${t.win} · L ${t.loss} · D ${t.draw}`;
