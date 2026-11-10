// node games/pin-high/test-duel.js : the duel rules.
const assert = require('assert');
const path = require('path');
const D = require(path.join(__dirname, '../../public/games/pin-high/duel-core.js'));
const manifest = require(path.join(__dirname, '../../public/games/pin-high/data/manifest.json'));

const A = (idx, tier) => ({ idx, tier });
const miss = A(-1, -1);

// multiplier: 1, 1, then up by a half each hole
assert.deepStrictEqual([1, 2, 3, 4, 5, 10].map(D.multiplier), [1, 1, 1.5, 2, 2.5, 5]);

// the lower scorer takes the gap times the multiplier
assert.deepStrictEqual(D.resolveRound(1, A(5, 3), A(0, 0)).damage, [0, 75]);
assert.deepStrictEqual(D.resolveRound(4, A(5, 3), A(0, 0)).damage, [0, 150]);
assert.deepStrictEqual(D.resolveRound(3, A(0, 0), A(9, 2)).damage, [75, 0]);
// a miss scores nothing
assert.deepStrictEqual(D.resolveRound(1, miss, A(3, 4)).scores, [0, 100]);
assert.deepStrictEqual(D.resolveRound(1, miss, A(3, 4)).damage, [100, 0]);
// two misses, or the same lie from different answers: no damage
assert.deepStrictEqual(D.resolveRound(5, miss, miss).damage, [0, 0]);
assert.deepStrictEqual(D.resolveRound(5, A(1, 2), A(2, 2)).damage, [0, 0]);
// the same answer cancels out, and two misses are not "the same answer"
const same = D.resolveRound(6, A(7, 4), A(7, 4));
assert.strictEqual(same.cancelled, true);
assert.deepStrictEqual([same.scores, same.damage], [[0, 0], [0, 0]]);
assert.strictEqual(D.resolveRound(1, miss, miss).cancelled, false);

// health never goes below zero; the duel ends when someone is out
assert.deepStrictEqual(D.applyRound([40, 300], { damage: [150, 0] }), [0, 300]);
assert.strictEqual(D.outcome([300, 300], 3), null);
assert.deepStrictEqual(D.outcome([0, 120], 5), { winner: 1 });
assert.deepStrictEqual(D.outcome([10, 0], 5), { winner: 0 });
// after the last hole the healthier player wins; level is a draw
assert.deepStrictEqual(D.outcome([200, 150], D.MAX_ROUNDS), { winner: 0 });
assert.deepStrictEqual(D.outcome([150, 150], D.MAX_ROUNDS), { winner: -1 });

// replay: green v bunker three times ends it on the third hole (75 + 75 + 112.5 rounded)
const h = { idx: [5, 0], tiers: [3, 0] };
const two = D.replay([h, h]);
assert.deepStrictEqual(two.hp, [300, 150]);
assert.strictEqual(two.outcome, null);
const three = D.replay([h, h, h]);
assert.deepStrictEqual(three.hp, [300, 37]);
const four = D.replay([h, h, h, h]);
assert.deepStrictEqual(four.hp, [300, 0]);
assert.deepStrictEqual(four.outcome, { winner: 0 });
// ten holes of level scores is a draw
assert.deepStrictEqual(D.replay(Array.from({ length: 10 }, () => ({ idx: [1, 2], tiers: [2, 2] }))).outcome, { winner: -1 });

// prompt order: the same for both players, ten holes, no family twice
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
