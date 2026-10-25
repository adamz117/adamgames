// Self-check for the course difficulty ratings: node lib/course-difficulty.test.mjs
import assert from 'node:assert/strict';
import { difficultyOf, CLUB_AVG } from './course-difficulty.ts';
import { COURSE_PAR } from './course-rounds.ts';

// every course you can play has been measured (a new course needs its bot run before it ships)
for (const id of Object.keys(COURSE_PAR)) assert.ok(Object.hasOwn(CLUB_AVG, id), `${id} has a measured difficulty`);

// the ratings keep the bots' order, Ironmere at the top, on a 1 to 10 scale
const order = ['gary-player', 'pebble-beach', 'cloudspire', 'victoria', 'augusta', 'sunscar', 'tpc-sawgrass', 'ironmere'];
const r = order.map((id) => difficultyOf(id).rating);
for (let i = 1; i < r.length; i++) assert.ok(r[i] >= r[i - 1], `${order[i]} rates at least ${order[i - 1]}`);
assert.equal(difficultyOf('ironmere').rating, 10);
assert.equal(difficultyOf('tpc-sawgrass').label, 'Hard');
for (const id of order) { const d = difficultyOf(id); assert.ok(d.rating >= 1 && d.rating <= 10 && Number.isInteger(d.rating), `${id} rating ${d.rating}`); }
assert.equal(difficultyOf('ironmere').overPar, 13, 'a club golfer averages 13 over');
assert.equal(difficultyOf('no-such-course'), null);

console.log('course difficulty: ok');
