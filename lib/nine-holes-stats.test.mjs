// Self-check for the Nine Holes record: node lib/nine-holes-stats.test.mjs
import assert from 'node:assert/strict';
import { readStats, recordRound, handicapOf, currentStreak, dayBefore, formatHandicap, EMPTY_STATS } from './nine-holes-stats.ts';

const play = (stats, day, strokes, seed = day) =>
  recordRound(stats, { seed, course: 'Test Links', strokes, par: 36 }, day, `${day}T12:00:00Z`);

assert.equal(dayBefore('2026-03-01'), '2026-02-28');
assert.equal(dayBefore('2026-01-01'), '2025-12-31');

// The streak grows on consecutive days and restarts after a gap
let s = play(EMPTY_STATS, '2026-10-20', 38);
s = play(s, '2026-10-21', 37);
assert.equal(s.streak, 2);
s = play(s, '2026-10-23', 35);
assert.equal(s.streak, 1);
assert.equal(currentStreak(s, '2026-10-24'), 1);
assert.equal(currentStreak(s, '2026-10-25'), 0, 'lapses after a missed day');

// Only the first finish of the day's course counts; replays and other seeds only add to rounds
const before = s.history.length;
s = play(s, '2026-10-23', 30);
s = play(s, '2026-10-23', 30, 'random-seed');
assert.equal(s.history.length, before);
assert.equal(s.rounds, 5);
assert.equal(s.best.toPar, -1);

// Handicap: none below 4 rounds, all rounds while fewer than 8, then the best 8 of the last 20
assert.equal(handicapOf(s.history), null);
s = play(s, '2026-10-24', 40);
assert.equal(s.handicap, (2 + 1 - 1 + 4) / 4);
const toParHistory = (vals) => vals.map((v, i) => ({ seed: `d${i}`, course: 'x', strokes: 36 + v, par: 36, toPar: v, playedAt: '' }));
assert.equal(handicapOf(toParHistory([5, 1, 3, 2, 4])), 3); // 5 rounds: the average of all 5
assert.equal(handicapOf(toParHistory([9, 0, 1, 2, 3, 4, 5, 6, 7, 8])), 3.5); // best 8 of 10: 0..7
assert.equal(handicapOf(toParHistory([...Array(20).fill(10), -5, -5])), 10); // only the last 20 count
assert.equal(formatHandicap(3.25), '3.3');
assert.equal(formatHandicap(-1.2), '+1.2');

// Older or missing records read back as a complete, empty record
assert.deepEqual(readStats(null), EMPTY_STATS);
assert.equal(readStats({ bestToPar: -3, rounds: 4 }).rounds, 4);
assert.equal(readStats({ history: [{ bad: true }] }).history.length, 0);

// A record survives being stored and read back
assert.deepEqual(readStats(JSON.parse(JSON.stringify(s))), s);
console.log('ok');
