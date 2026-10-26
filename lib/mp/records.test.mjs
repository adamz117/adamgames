// Self-check for multiplayer records: node lib/mp/records.test.mjs
import assert from 'node:assert/strict';
import { readRecord, headToHead, formatRecord } from './records.ts';

const FRIEND = '11111111-1111-1111-1111-111111111111';
const OTHER = '22222222-2222-2222-2222-222222222222';
let n = 0;
const row = (over = {}) => ({
  lobby_id: `lobby-${++n}`, game: 1, user_id: 'me', opponent_id: FRIEND, opponent_name: 'Sam',
  course_label: 'Today’s nine', format: 'stroke', result: 'win', detail: '34 to 37',
  played_at: new Date(Date.UTC(2026, 9, 1) + n * 3600e3).toISOString(), ...over,
});
const zero = { win: 0, loss: 0, draw: 0 };

// No rows: zeros everywhere
assert.deepEqual(readRecord([]), { ...zero, stroke: zero, match: zero });
assert.deepEqual(readRecord(null), { ...zero, stroke: zero, match: zero });
assert.deepEqual(headToHead([], FRIEND), { ...zero, games: [] });

// Counts by result and by format; games against guests count towards the overall record
const rows = [
  row({ result: 'win' }),
  row({ result: 'win', format: 'match', detail: '3 & 2' }),
  row({ result: 'loss', opponent_id: null, opponent_name: 'Guest' }),
  row({ result: 'draw', format: 'match', opponent_id: OTHER, detail: 'Halved' }),
  row({ result: 'loss', format: 'match', opponent_id: OTHER }),
  row({ result: 'win', opponent_id: null }),
];
assert.deepEqual(readRecord(rows), {
  win: 3, loss: 2, draw: 1,
  stroke: { win: 2, loss: 1, draw: 0 },
  match: { win: 1, loss: 1, draw: 1 },
});

// Head to head counts only rows with that opponent_id, newest first
const h = headToHead(rows, FRIEND);
assert.deepEqual({ win: h.win, loss: h.loss, draw: h.draw }, { win: 2, loss: 0, draw: 0 });
assert.deepEqual(h.games.map((g) => g.lobby_id), [rows[0].lobby_id, rows[1].lobby_id], 'kept in the order given (newest first)');
const o = headToHead(rows, OTHER);
assert.deepEqual({ win: o.win, loss: o.loss, draw: o.draw }, { win: 0, loss: 1, draw: 1 });
assert.deepEqual(headToHead(rows, null), { ...zero, games: [] }, 'no friend id: no head to head (guests have none)');

// Head to head keeps the newest 5 games together (rows come newest first), counts all of them
const many = Array.from({ length: 8 }, (_, i) => row({ result: i < 6 ? 'win' : 'loss' })).reverse();
const hm = headToHead(many, FRIEND);
assert.equal(hm.win + hm.loss + hm.draw, 8);
assert.equal(hm.games.length, 5);
assert.deepEqual(hm.games.map((g) => g.lobby_id), many.slice(0, 5).map((g) => g.lobby_id));

// Malformed rows are ignored
const bad = [
  null, 'win', 42, {},
  row({ result: 'won' }), row({ result: null }),
  row({ format: 'skins' }), row({ format: undefined }),
  row({ played_at: 'yesterday' }), row({ played_at: 7 }),
  row({ opponent_name: 5 }), row({ opponent_id: 9 }),
];
assert.deepEqual(readRecord([...bad, row({ result: 'draw', format: 'match' })]), {
  win: 0, loss: 0, draw: 1, stroke: zero, match: { win: 0, loss: 0, draw: 1 },
});
const hb = headToHead([...bad, row({ result: 'loss' })], FRIEND);
assert.deepEqual({ win: hb.win, loss: hb.loss, draw: hb.draw, games: hb.games.length }, { win: 0, loss: 1, draw: 0, games: 1 });

// Formatting
assert.equal(formatRecord({ win: 4, loss: 2, draw: 1 }), 'W 4 · L 2 · D 1');
assert.equal(formatRecord(zero), 'W 0 · L 0 · D 0');

// 3–4 player games: head to head uses your outcome against that friend, not your overall result
{
  const four = row({ result: 'loss', opponent_id: null, opponent_name: 'Sam, Lee, Kit', detail: '40 v 38 v 42 v 45',
    opponents: [{ id: FRIEND, name: 'Sam', result: 'win' }, { id: OTHER, name: 'Lee', result: 'loss' }, { id: null, name: 'Kit', result: 'win' }] });
  const old = row({ result: 'draw' }); // before opponents were stored: falls back to opponent_id
  const h = headToHead([four, old], FRIEND);
  assert.deepEqual({ win: h.win, loss: h.loss, draw: h.draw }, { win: 1, loss: 0, draw: 1 });
  assert.equal(h.games[0].result, 'win');
  assert.equal(headToHead([four], OTHER).loss, 1);
  assert.equal(readRecord([four]).loss, 1); // the overall record keeps the game's result
  // Malformed entries are dropped, and a row whose list doesn't name the friend doesn't count
  assert.equal(headToHead([row({ opponent_id: null, opponents: [{ id: 5 }, null, { id: OTHER, name: 'Lee', result: 'win' }] })], FRIEND).win, 0);
}

console.log('records: ok');
