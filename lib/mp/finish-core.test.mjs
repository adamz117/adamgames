// Self-check for the finish route's decision: node lib/mp/finish-core.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { decideResult, courseLabel, finishSettings, resultRows, resultsFromRows, DROP_MS } from './finish-core.ts';

const require = createRequire(import.meta.url);
const DH = require('../../public/games/nine-holes/game.js');
const victoria = require('../../public/games/nine-holes/courses/victoria/victoria.json');

// Deterministic swings played live through game.js (as test-mp.js does): the suggested club, a line
// wobbling round the suggested one, and a cycle of powers starting at n0.
const V = [0.97, 0.83, 1.03, 0.7, 0.9], OFF = [0, 0.03, -0.04, 0.01, -0.02];
function playLive(st, slot, n0) {
  const log = [];
  for (let n = n0; !st.done; n++) {
    const h = DH.holeOf(st), club = DH.autoClub(h, st.ball, st.lie);
    const s = { club, aim: DH.aimTarget(h, st.ball, st.lie, DH.CLUBS[club]) + OFF[n % 5], v: V[n % 5] };
    log.push({ slot, hole: st.holeIdx, shot: st.shotIdx, ...s, timeout: false });
    if (DH.play(st, s.aim, s.club, s.v).score != null) DH.nextHole(st);
  }
  return log;
}
const gameLog = (seed, n0s) => n0s.flatMap((n0, slot) => playLive(DH.newRound(seed, null, '#p' + slot), slot, n0));

const NOW = Date.parse('2026-10-24T12:00:00Z');
const seen = (msAgo) => new Date(NOW - msAgo).toISOString();
const players = (over = [{}, {}]) => [
  { slot: 0, user_id: 'u0', name: 'Ada', guest: false, left_at: null, last_seen: seen(5000), ...over[0] },
  { slot: 1, user_id: 'u1', name: 'Bea', guest: true, left_at: null, last_seen: seen(5000), ...over[1] },
];
const stroke = (seed) => ({ spec: { kind: 'daily', seed }, format: 'stroke' });
const match = (seed) => ({ spec: { kind: 'daily', seed }, format: 'match' });
const decide = (settings, swings, over) => decideResult({ settings, players: players(over), swings, now: NOW, DH, realData: null });

// Stroke play: a win, once both cards are complete
const WIN = gameLog('2026-10-23', [4, 1]); // 52 v 61
{
  const d = decide(stroke('2026-10-23'), WIN);
  assert.deepEqual(d, { status: 'finished', results: [
    { slot: 0, result: 'win', detail: '52 v 61' }, { slot: 1, result: 'loss', detail: '52 v 61' }] });
  // The order swings are stored in doesn't matter
  assert.deepEqual(decide(stroke('2026-10-23'), [...WIN].reverse()), d);
  // One card still open: playing
  assert.deepEqual(decide(stroke('2026-10-23'), WIN.filter((s) => s.slot === 0 || s.hole < 8)), { status: 'playing', results: [] });
}
// Stroke play: a draw
{
  const d = decide(stroke('2026-10-25'), gameLog('2026-10-25', [0, 2])); // 55 v 55
  assert.equal(d.status, 'finished');
  assert.deepEqual(d.results.map((r) => [r.result, r.detail]), [['draw', '55 v 55'], ['draw', '55 v 55']]);
}

// Match play decided early: slot 0 is 3 up with 2 to play after the 7th, before anyone has finished
{
  const sw = WIN.filter((s) => s.hole < 7);
  const r = DH.replayGame(match('2026-10-23').spec, null, [{ slot: 0 }, { slot: 1 }], sw);
  assert.deepEqual(r.done, [false, false]);
  const m = DH.matchState(r.states[0].course.holes.map((h) => h.par), r.scores);
  assert.equal(m.label, '3 & 2');
  const d = decide(match('2026-10-23'), sw);
  assert.deepEqual(d, { status: 'finished', results: [
    { slot: 0, result: 'win', detail: m.label }, { slot: 1, result: 'loss', detail: m.label }] });
  // Before that it's still on
  assert.equal(decide(match('2026-10-23'), WIN.filter((s) => s.hole < 6)).status, 'playing');
  // Halved over all nine
  const h = decide(match('2026-10-23'), gameLog('2026-10-23', [3, 4]));
  assert.deepEqual(h.results.map((x) => [x.result, x.detail]), [['draw', 'Halved'], ['draw', 'Halved']]);
}

// Leaving. Mid-game (hole 4), with nothing decided yet.
const MID = WIN.filter((s) => s.hole < 4);
{
  assert.equal(decide(stroke('2026-10-23'), MID).status, 'playing');
  // Last seen 61 s ago: gone, and loses; 59 s ago: may still rejoin
  const gone = decide(stroke('2026-10-23'), MID, [{}, { last_seen: seen(DROP_MS + 1000) }]);
  assert.deepEqual(gone, { status: 'finished', results: [
    { slot: 0, result: 'win', detail: 'Bea left' }, { slot: 1, result: 'loss', detail: 'Bea left' }] });
  assert.deepEqual(decide(stroke('2026-10-23'), MID, [{}, { last_seen: seen(DROP_MS - 1000) }]), { status: 'playing', results: [] });
  // Left on purpose: loses at once, even though just seen
  const left = decide(match('2026-10-23'), MID, [{ left_at: seen(1000), last_seen: seen(0) }, {}]);
  assert.deepEqual(left.results.map((r) => [r.result, r.detail]), [['loss', 'Ada left'], ['win', 'Ada left']]);
  // Both gone: abandoned
  const both = decide(stroke('2026-10-23'), MID, [{ left_at: seen(1000) }, { last_seen: seen(DROP_MS * 2) }]);
  assert.deepEqual(both.results.map((r) => [r.result, r.detail]), [['draw', 'Abandoned'], ['draw', 'Abandoned']]);
  // A player who has finished their round can't forfeit it; the one still out there can
  const p0done = WIN.filter((s) => s.slot === 0 || s.hole < 4);
  assert.equal(decide(stroke('2026-10-23'), p0done, [{ left_at: seen(1000) }, {}]).status, 'playing');
  const quit = decide(stroke('2026-10-23'), p0done, [{ left_at: seen(1000) }, { left_at: seen(500) }]);
  assert.deepEqual(quit.results.map((r) => [r.result, r.detail]), [['win', 'Bea left'], ['loss', 'Bea left']]);
}

// Three shot-clock timeouts in a row lose; two don't, and a real swing in between resets it
{
  const st = DH.replayGame(stroke('2026-10-23').spec, null, [{ slot: 0 }, { slot: 1 }], MID).states[1];
  const timeouts = [];
  for (let i = 0; i < 3; i++) {
    const t = DH.timeoutSwing(DH.holeOf(st), st.ball, st.lie);
    timeouts.push({ slot: 1, hole: st.holeIdx, shot: st.shotIdx, ...t, timeout: true });
    if (DH.play(st, t.aim, t.club, t.v).score != null) DH.nextHole(st);
  }
  const three = decide(stroke('2026-10-23'), [...MID, ...timeouts]);
  assert.deepEqual(three.results.map((r) => [r.result, r.detail]), [['win', 'Bea timed out'], ['loss', 'Bea timed out']]);
  assert.equal(decide(stroke('2026-10-23'), [...MID, ...timeouts.slice(0, 2)]).status, 'playing');
  const reset = [...MID, ...timeouts].map((s, i, a) => (i === a.length - 2 ? { ...s, timeout: false } : s));
  assert.equal(decide(stroke('2026-10-23'), reset).status, 'playing');
}

// A corrupted log stays playing (nothing is written), even when the cards would be complete
{
  const at = WIN.findIndex((s) => s.slot === 1 && s.hole === 5);
  assert.deepEqual(decide(stroke('2026-10-23'), WIN.filter((_, i) => i !== at)), { status: 'playing', results: [] });
  assert.deepEqual(decide(stroke('2026-10-23'), WIN.map((s, i) => (i === at ? { ...s, v: 2 } : s))), { status: 'playing', results: [] });
  assert.equal(decide(stroke('2026-10-23'), [...WIN, { ...WIN[0], slot: 3 }]).status, 'playing');
}

// A real course
{
  const spec = { kind: 'real', id: 'victoria', mode: 'front', day: '2026-10-23' }, c = DH.courseFromSpec(spec, victoria);
  const sw = [0, 1].flatMap((slot) => playLive(DH.newRound(c.seed, c, '#p' + slot), slot, slot * 2));
  const d = decideResult({ settings: { spec, format: 'stroke' }, players: players(), swings: sw, now: NOW, DH, realData: victoria });
  assert.equal(d.status, 'finished');
  assert.match(d.results[0].detail, /^\d+ v \d+$/);
}

// The rows finish_lobby writes: signed-in players only, with their opponent
{
  const S = stroke('2026-10-23'), res = [{ slot: 0, result: 'win', detail: '52 v 61' }, { slot: 1, result: 'loss', detail: '52 v 61' }];
  const row = { opponent_name: 'Bea', course_label: 'Daily nine 2026-10-23', format: 'stroke', result: 'win', detail: '52 v 61' };
  assert.deepEqual(resultRows(S, players(), res), [{ user_id: 'u0', opponent_id: null, ...row }]); // Bea is a guest
  const two = players([{}, { guest: false }]);
  assert.deepEqual(resultRows(S, two, res), [
    { user_id: 'u0', opponent_id: 'u1', ...row },
    { user_id: 'u1', opponent_id: 'u0', ...row, opponent_name: 'Ada', result: 'loss' }]);
  assert.deepEqual(resultRows(S, players([{ guest: true }, {}]), res), []);
  // Back from the stored rows: one result per slot, the guest's the other side of their opponent's
  assert.deepEqual(resultsFromRows(players(), [{ user_id: 'u0', result: 'win', detail: '52 v 61' }]), res);
  assert.deepEqual(resultsFromRows(players(), [{ user_id: 'u0', result: 'draw', detail: 'Halved' }]).map((r) => r.result), ['draw', 'draw']);
  assert.deepEqual(resultsFromRows(two, [{ user_id: 'u1', result: 'loss', detail: '52 v 61' }, { user_id: 'u0', result: 'win', detail: '52 v 61' }]), res);
  assert.deepEqual(resultsFromRows(players(), [], res), res); // two guests: a fresh decision
  assert.deepEqual(resultsFromRows(players(), []), []);
}

// course_label and the settings check
assert.equal(courseLabel({ kind: 'daily', seed: '2026-10-24' }), 'Daily nine 2026-10-24');
assert.equal(courseLabel({ kind: 'random', seed: 'abc' }), 'Random nine');
assert.equal(courseLabel({ kind: 'real', id: 'augusta', mode: 'back', day: '2026-10-24' }), 'Augusta National · back nine');
assert.equal(courseLabel({ kind: 'real', id: 'victoria', mode: 'all', day: '2026-10-24' }), 'Victoria Country Club · 18 holes');
assert.deepEqual(finishSettings({ spec: { kind: 'daily', seed: '2026-10-24' }, format: 'match', pace: 'own' }),
  { spec: { kind: 'daily', seed: '2026-10-24' }, format: 'match' });
assert.deepEqual(finishSettings({ spec: { kind: 'real', id: 'tpc-sawgrass', mode: 'front', day: '2026-10-24' }, format: 'stroke' }),
  { spec: { kind: 'real', id: 'tpc-sawgrass', mode: 'front', day: '2026-10-24' }, format: 'stroke' });
for (const bad of [null, 'x', {}, { spec: { kind: 'daily', seed: 'x' }, format: 'skins' },
  { spec: { kind: 'real', id: '../../etc', mode: 'front', day: 'x' }, format: 'stroke' },
  { spec: { kind: 'real', id: 'toString', mode: 'front', day: 'x' }, format: 'stroke' },
  { spec: { kind: 'real', id: 'victoria', mode: 'middle', day: 'x' }, format: 'stroke' }])
  assert.equal(finishSettings(bad), null, JSON.stringify(bad));

console.log('finish core: ok');
