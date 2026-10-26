// Multiplayer records, read from the player's own match_results rows. Pure: records-client.ts and
// records-server.ts do the fetching. Overall counts every finished game (guests too), by each row's
// own result. Head to head counts the games with one signed-in friend: in a game of three or four,
// who placed higher between the two of you (from the row's field).
import type { Format } from './protocol';
import { parseField, type FieldEntry, type Outcome } from './finish-core';

export type RecordRow = {
  lobby_id: string;
  user_id: string | null;
  game: number;
  opponent_id: string | null;
  opponent_name: string;
  course_label: string;
  format: Format;
  result: Outcome;
  detail: string;
  played_at: string;
  field: FieldEntry[]; // [] on rows from before 0005
};
export type Tally = { win: number; loss: number; draw: number };
export type MpRecord = Tally & { stroke: Tally; match: Tally };
export type HeadToHead = Tally & { games: RecordRow[] };

// Every column: field exists only once migration 0005 has run, and naming it before then fails the read.
export const RESULT_COLUMNS = '*';
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
    lobby_id: r.lobby_id, user_id: isStr(r.user_id) ? r.user_id : null, game: typeof r.game === 'number' ? r.game : 1,
    opponent_id: r.opponent_id, opponent_name: r.opponent_name, course_label: r.course_label, format: r.format,
    result: r.result, detail: r.detail, played_at: r.played_at, field: parseField(r.field),
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

// How a row's game went against friendId, or null if they weren't in it.
function against(r: RecordRow, friendId: string): Outcome | null {
  if (!r.field.length) return r.opponent_id === friendId ? r.result : null;
  const me = r.field.find((e) => r.user_id && e.id === r.user_id), them = r.field.find((e) => e.id === friendId);
  if (!me || !them || me === them) return null;
  return me.place < them.place ? 'win' : me.place > them.place ? 'loss' : 'draw';
}

// The record against one friend and the last few games together (rows newest first), each game's
// result being the one against them.
export function headToHead(rows: unknown, friendId: string | null | undefined): HeadToHead {
  const mine = friendId
    ? cleanRows(rows).flatMap((r) => { const result = against(r, friendId); return result ? [{ ...r, result }] : []; })
    : [];
  return { ...tally(mine), games: mine.slice(0, HEAD_TO_HEAD_GAMES) };
}

export const gamesPlayed = (t: Tally) => t.win + t.loss + t.draw;
export const formatRecord = (t: Tally) => `W ${t.win} · L ${t.loss} · D ${t.draw}`;
