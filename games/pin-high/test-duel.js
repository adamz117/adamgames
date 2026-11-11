// node games/pin-high/test-duel.js : the duel rules, for two to four players.
const assert = require('assert');
const path = require('path');
const D = require(path.join(__dirname, '../../public/games/pin-high/duel-core.js'));
const manifest = require(path.join(__dirname, '../../public/games/pin-high/data/manifest.json'));

const ALL2 = [true, true, false, false], ALL3 = [true, true, true, false], ALL4 = [true, true, true, true];
const round = (r, idx, tiers, alive) => D.resolveRound(r, D.pad(idx), D.pad(tiers), alive);

// multiplier: 1, 1, then up by a half each hole
assert.deepStrictEqual([1, 2, 3, 4, 5, 10].map(D.multiplier), [1, 1, 1.5, 2, 2.5, 5]);

// ---- two players: the same as the one-against-one rules ----
assert.deepStrictEqual(round(1, [5, 0], [3, 0], ALL2).damage, [0, 75, 0, 0]);
assert.deepStrictEqual(round(4, [5, 0], [3, 0], ALL2).damage, [0, 150, 0, 0]);
assert.deepStrictEqual(round(3, [0, 9], [0, 2], ALL2).damage, [75, 0, 0, 0]);
assert.deepStrictEqual(round(1, [-1, 3], [-1, 4], ALL2).damage, [100, 0, 0, 0]);   // a miss scores nothing
assert.deepStrictEqual(round(5, [-1, -1], [-1, -1], ALL2).damage, [0, 0, 0, 0]);  // two misses: level
assert.deepStrictEqual(round(5, [1, 2], [2, 2], ALL2).damage, [0, 0, 0, 0]);      // same lie, different answers
const same = round(6, [7, 7], [4, 4], ALL2);                                        // same answer cancels
assert.deepStrictEqual([same.cancelled.slice(0, 2), same.scores.slice(0, 2), same.damage], [[true, true], [0, 0], [0, 0, 0, 0]]);
assert.deepStrictEqual(round(1, [-1, -1], [-1, -1], ALL2).cancelled, [false, false, false, false]); // two misses are not the same answer

// ---- three and four players: the top score takes nothing, everyone else the gap to it ----
assert.deepStrictEqual(round(1, [1, 2, 3], [3, 0, 2], ALL3).damage, [0, 75, 25, 0]);
assert.deepStrictEqual(round(3, [1, 2, 3, 4], [0, 1, 2, 4], ALL4).damage, [135, 105, 60, 0]);
// two share the top: neither is hurt
assert.deepStrictEqual(round(1, [1, 2, 3], [3, 3, 0], ALL3).damage, [0, 0, 75, 0]);
// two give the same answer: both score 0, and the third player's score is the top
const pair = round(2, [8, 8, 3], [4, 4, 1], ALL3);
assert.deepStrictEqual([pair.scores, pair.damage], [[0, 0, 30, 0], [30, 30, 0, 0]]);
// a player who is out neither answers nor takes damage, and their old score is ignored
assert.deepStrictEqual(round(1, [1, 2, 3], [0, 4, 2], [true, false, true, false]).damage, [50, 0, 0, 0]);

// ---- health and the end of the duel ----
assert.deepStrictEqual(D.applyRound([40, 300, 0, 0], { damage: [150, 0, 0, 0] }), [0, 300, 0, 0]);
assert.strictEqual(D.outcome([300, 300, 0, 0], 3), null);
assert.deepStrictEqual(D.outcome([0, 120, 0, 0], 5), { winners: [1] });
assert.strictEqual(D.outcome([0, 120, 40, 0], 5), null);                            // two still standing
assert.deepStrictEqual(D.outcome([200, 150, 80, 0], D.MAX_ROUNDS), { winners: [0] });
assert.deepStrictEqual(D.outcome([150, 150, 80, 0], D.MAX_ROUNDS), { winners: [0, 1] }); // tie shares
// everyone left goes out on the same hole: most health before it wins
assert.deepStrictEqual(D.outcome([0, 0, 0, 0], 6, [40, 70, 0, 0]), { winners: [1] });

// replay: two players, green v bunker three times ends it on the fourth hole (75, 75, 112.5→113, 150)
const h = { idx: [5, 0], tiers: [3, 0] };
assert.deepStrictEqual(D.replay([0, 1], [h, h]).hp, [300, 150, 0, 0]);
assert.strictEqual(D.replay([0, 1], [h, h]).outcome, null);
assert.deepStrictEqual(D.replay([0, 1], [h, h, h]).hp, [300, 37, 0, 0]);
assert.deepStrictEqual(D.replay([0, 1], [h, h, h, h]).outcome, { winners: [0] });
// a two-player history from before 2026-11-11 (two-long arrays) still replays
assert.deepStrictEqual(D.replay([0, 1], [{ idx: [5, 0], tiers: [3, 0] }]).hp, [300, 225, 0, 0]);
// three players at seats 0, 1 and 3: seat 3 goes out first and stops being hurt
const three = D.replay([0, 1, 3], [
  { idx: [1, 2, -1, 3], tiers: [4, 3, -1, 0] }, // 100, 85, -, 10: seat 1 -15, seat 3 -90
  { idx: [1, 2, -1, 3], tiers: [4, 3, -1, 0] },
  { idx: [1, 2, -1, 3], tiers: [4, 3, -1, 0] }, // x1.5: seat 3 at 300-90-90-135 = 0
  { idx: [1, 2, -1, 3], tiers: [4, 0, -1, 4] }, // seat 3 is out: its cup is ignored
]);
assert.deepStrictEqual(three.hp, [300, 0 + Math.max(0, 300 - 15 - 15 - 23 - 180), 0, 0]);
assert.deepStrictEqual(three.rounds[3].damage, [0, 180, 0, 0]);
// ten holes of level scores is a shared win for whoever is standing
assert.deepStrictEqual(D.replay([0, 1, 2], Array.from({ length: 10 }, () => ({ idx: [1, 2, 3], tiers: [2, 2, 2] }))).outcome, { winners: [0, 1, 2] });

// a player who leaves goes out before the hole is scored, and takes no part in it
const quit = D.replay([0, 1, 2], [{ idx: [1, 2, 3], tiers: [3, 0, 2] }, { idx: [1, -1, 3], tiers: [3, -1, 1], quit: [1] }]);
assert.deepStrictEqual(quit.hp, [300, 0, 300 - 25 - 55, 0]);
assert.strictEqual(quit.outcome, null);
assert.deepStrictEqual(D.replay([0, 1], [{ idx: [-1, -1], tiers: [-1, -1], quit: [1] }]).outcome, { winners: [0] });

// prompt order: ten holes, no family twice, different for a different seed
const order = D.promptOrder(manifest.prompts, 'lobby:match');
assert.strictEqual(order.length, D.MAX_ROUNDS);
assert.deepStrictEqual(order.map((p) => p.id), D.promptOrder([...manifest.prompts].reverse(), 'lobby:match').map((p) => p.id));
assert.strictEqual(new Set(order.map((p) => p.id.split('-')[0])).size, order.length);
assert.notDeepStrictEqual(order.map((p) => p.id), D.promptOrder(manifest.prompts, 'lobby:other').map((p) => p.id));

// sealing: the same answer and nonce give the same hash; anything else differs
(async () => {
  const n = D.newNonce();
  const s = await D.seal('m1', 2, 14, n);
  assert.match(s, /^[0-9a-f]{64}$/);
  assert.strictEqual(s, await D.seal('m1', 2, 14, n));
  assert.notStrictEqual(s, await D.seal('m1', 2, 15, n));
  assert.notStrictEqual(s, await D.seal('m1', 3, 14, n));
  assert.notStrictEqual(s, await D.seal('m1', 2, 14, D.newNonce()));
  console.log('ok duel rules');
})();
