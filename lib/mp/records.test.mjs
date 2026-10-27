// Self-check for 1v1 records: node lib/mp/records.test.mjs
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// records.ts imports finish-core without an extension, as the site's bundler expects.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith('.') && !/.[cm]?[jt]s$/.test(spec)) return next(spec + '.ts', ctx);
    return next(spec, ctx);
  },
});
const { readRecord, headToHead, formatRecord } = await import('./records.ts');

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

// Games of three or four (no opponent_id): head to head compares places from the stored field
{
  const field = (places) => places.map(([id, place], slot) => ({ slot, id, name: `P${slot}`, result: place === 1 ? 'win' : 'loss', detail: '', place }));
  const four = row({ opponent_id: null, opponent_name: 'Sam, Oli, Guest', result: 'loss', detail: '2nd of 4 · 40 v 38 v 44 v 45',
    field: field([['me', 2], [FRIEND, 3], [OTHER, 1], [null, 4]]) });
  const tie = row({ opponent_id: null, result: 'draw', field: field([['me', 1], [FRIEND, 1], [OTHER, 3]]) });
  const without = row({ opponent_id: null, field: field([[FRIEND, 1], [OTHER, 2]]) }); // not my row's field: skipped
  const fh = headToHead([four, tie, without], FRIEND);
  assert.deepEqual({ win: fh.win, loss: fh.loss, draw: fh.draw }, { win: 1, loss: 0, draw: 1 });
  assert.deepEqual(fh.games.map((g) => [g.lobby_id, g.result, g.detail]), [[four.lobby_id, 'win', four.detail], [tie.lobby_id, 'draw', '34 to 37']], 'shown as the result against them');
  const oh = headToHead([four, tie], OTHER);
  assert.deepEqual({ win: oh.win, loss: oh.loss, draw: oh.draw }, { win: 1, loss: 1, draw: 0 });
  // A two-player row with a field agrees with its opponent_id
  const two = row({ result: 'loss', field: field([['me', 2], [FRIEND, 1]]) });
  assert.equal(headToHead([two], FRIEND).loss, 1);
  // The overall record still counts the row's own result
  assert.deepEqual(readRecord([four, tie]), { win: 0, loss: 1, draw: 1, stroke: { win: 0, loss: 1, draw: 1 }, match: zero });
}

// 2v2: a game with a friend as your partner isn't head to head; one against them is
{
  const field = (rows) => rows.map(([id, place, team], slot) => ({ slot, id, name: `P${slot}`, result: place === 1 ? 'win' : 'loss', detail: '', place, team }));
  const partners = row({ opponent_id: null, result: 'win', field: field([['me', 1, 0], [OTHER, 2, 1], [FRIEND, 1, 0], [null, 2, 1]]) });
  const against = row({ opponent_id: null, result: 'loss', field: field([['me', 2, 0], [FRIEND, 1, 1], [OTHER, 2, 0], [null, 1, 1]]) });
  const t = headToHead([partners, against], FRIEND);
  assert.deepEqual({ win: t.win, loss: t.loss, draw: t.draw, games: t.games.length }, { win: 0, loss: 1, draw: 0, games: 1 });
  assert.equal(headToHead([partners], OTHER).win, 1, 'beat the other side');
}

// Formatting
assert.equal(formatRecord({ win: 4, loss: 2, draw: 1 }), 'W 4 · L 2 · D 1');
assert.equal(formatRecord(zero), 'W 0 · L 0 · D 0');

console.log('records: ok');
