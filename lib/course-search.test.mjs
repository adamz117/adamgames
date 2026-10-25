// Self-check for the courses page search: node lib/course-search.test.mjs
import assert from 'node:assert/strict';
import { filterCourses } from './course-search.ts';

const list = [
  { id: 'augusta', kind: 'real', name: 'Augusta National Golf Club', lede: 'Augusta, Georgia. Home of the Masters.' },
  { id: 'pebble-beach', kind: 'real', name: 'Pebble Beach Golf Links', lede: 'Pebble Beach, California. Clifftop holes on the Pacific.' },
  { id: 'ironmere', kind: 'fantasy', name: 'Ironmere Quarry', lede: 'Two loops round flooded slate pits.' },
];
const ids = (q, kind) => filterCourses(list, q, kind).map((c) => c.id);

assert.deepEqual(ids('', 'all'), ['augusta', 'pebble-beach', 'ironmere'], 'nothing typed: everything');
assert.deepEqual(ids('', 'fantasy'), ['ironmere'], 'fantasy only');
assert.deepEqual(ids('', 'real'), ['augusta', 'pebble-beach'], 'real only');
assert.deepEqual(ids('PEBBLE', 'all'), ['pebble-beach'], 'any case');
assert.deepEqual(ids('california', 'all'), ['pebble-beach'], 'the place counts too');
assert.deepEqual(ids('  quarry ', 'all'), ['ironmere'], 'spaces round the words are ignored');
assert.deepEqual(ids('golf augusta', 'all'), ['augusta'], 'every word has to match');
assert.deepEqual(ids('quarry', 'real'), [], 'the filter and the words both apply');
assert.deepEqual(ids('no such course', 'all'), []);

console.log('course search: ok');
