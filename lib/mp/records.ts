// 1v1 records, read from the player's own match_results rows. Pure: records-client.ts and
// records-server.ts do the fetching. Overall counts every finished game (guests too); head to
// head only the games against one signed-in opponent (guests have no opponent_id).
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
};
export type Tally = { win: number; loss: number; draw: number };
export type MpRecord = Tally & { stroke: Tally; match: Tally };
export type HeadToHead = Tally & { games: RecordRow[] };

export const RESULT_COLUMNS = 'lobby_id, game, opponent_id, opponent_name, course_label, format, result, detail, played_at';
export const HEAD_TO_HEAD_GAMES = 5;

const isStr = (x: unknown): x is string => typeof x === 'string';

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
    detail: r.detail, played_at: r.played_at,
  };
}

// Valid rows only, newest first.
export function cleanRows(rows: unknown): RecordRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map(parseRow).filter((r): r is RecordRow => r !== null)
    .sort((a, b) => Date.parse(b.played_at) - Date.parse(a.played_at));
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

// The record against one opponent and the last few games together.
export function headToHead(rows: unknown, friendId: string | null | undefined): HeadToHead {
  const mine = friendId ? cleanRows(rows).filter((r) => r.opponent_id === friendId) : [];
  return { ...tally(mine), games: mine.slice(0, HEAD_TO_HEAD_GAMES) };
}

export const gamesPlayed = (t: Tally) => t.win + t.loss + t.draw;
export const formatRecord = (t: Tally) => `W ${t.win} · L ${t.loss} · D ${t.draw}`;
