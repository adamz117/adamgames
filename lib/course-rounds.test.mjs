// Self-check for real-course rounds: node lib/course-rounds.test.mjs
import assert from 'node:assert/strict';
import { parseRealRound, COURSE_PAR } from './course-rounds.ts';

const msg = (over = {}) => ({ type: 'nine-holes-real-round', course: 'victoria', mode: 'all', strokes: 76, par: 71, day: '2026-10-23', ...over });

// A finished round on each of the three ways to play
assert.deepEqual(parseRealRound(msg()), { course: 'victoria', mode: 'all', strokes: 76, par: 71, day: '2026-10-23' });
assert.deepEqual(parseRealRound(msg({ mode: 'front', par: 35, strokes: 38 })), { course: 'victoria', mode: 'front', strokes: 38, par: 35, day: '2026-10-23' });
assert.deepEqual(parseRealRound(msg({ mode: 'back', par: 36, strokes: 40 })), { course: 'victoria', mode: 'back', strokes: 40, par: 36, day: '2026-10-23' });
assert.deepEqual(COURSE_PAR.victoria, { front: 35, back: 36, all: 71 });

// Anything else is ignored
assert.equal(parseRealRound({ ...msg(), type: 'nine-holes-round' }), null, 'a daily round is not a real-course round');
assert.equal(parseRealRound(msg({ course: 'augusta' })), null, 'unknown course');
assert.equal(parseRealRound(msg({ mode: 'middle' })), null, 'unknown mode');
for (const strokes of [0, -3, 2.5, '76', NaN]) assert.equal(parseRealRound(msg({ strokes })), null, `strokes ${strokes}`);
assert.equal(parseRealRound(msg({ mode: 'front', par: 36 })), null, 'par must match the mode');
for (const day of ['2026-10-32', '23/10/2026', '', 20261023]) assert.equal(parseRealRound(msg({ day })), null, `day ${day}`);
assert.equal(parseRealRound(null), null);
assert.equal(parseRealRound('nine-holes-real-round'), null);


console.log('course rounds: ok');
