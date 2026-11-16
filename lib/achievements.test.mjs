// Self-check for the trophy cabinet: node lib/achievements.test.mjs
import assert from 'node:assert/strict';
import { achievements, readPinHigh } from './achievements.ts';
import { EMPTY_STATS } from './nine-holes-stats.ts';

const noMp = { win: 0, loss: 0, draw: 0, stroke: { win: 0, loss: 0, draw: 0 }, match: { win: 0, loss: 0, draw: 0 } };
const earned = (list) => list.filter((a) => a.earned).map((a) => a.id);
const round = (toPar) => ({ seed: '2026-11-01', course: 'Test', strokes: 36 + toPar, par: 36, toPar, playedAt: '2026-11-01T10:00:00Z' });

// a new member has nothing, and the list has no repeated ids
const fresh = achievements(EMPTY_STATS, readPinHigh(null), noMp);
assert.deepEqual(earned(fresh), []);
assert.equal(new Set(fresh.map((a) => a.id)).size, fresh.length);

// stored Pin High stats of any shape read as safe numbers
assert.deepEqual(readPinHigh({ played: 3, bestScore: 280, junk: 1 }), { played: 3, bestScore: 280 });
assert.deepEqual(readPinHigh({ played: 'x', bestScore: -5 }), { played: 0, bestScore: 0 });

// thresholds: one round one under par, a 280 at Pin High, one multiplayer loss
const some = achievements({ ...EMPTY_STATS, rounds: 1, history: [round(-1)], best: round(-1) }, { played: 1, bestScore: 280 }, { ...noMp, loss: 1 });
assert.deepEqual(earned(some), ['nh-first', 'nh-par', 'nh-red', 'ph-first', 'ph-251', 'mp-first']);
assert.equal(some.find((a) => a.id === 'nh-10').progress, '1 of 10 rounds');
assert.equal(some.find((a) => a.id === 'nh-low').progress, 'Best so far: -1');

// everything
const all = achievements({ ...EMPTY_STATS, rounds: 50, history: [round(-3), round(0), round(1), round(2)], best: round(-3) }, { played: 10, bestScore: 450 }, { ...noMp, win: 10 });
assert.equal(earned(all).length, all.length);
console.log('ok achievements');
