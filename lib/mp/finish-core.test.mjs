// Self-check for the finish route's decision: node lib/mp/finish-core.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { decideResult, courseLabel, resultRows, resultsFromRows, parseField, DROP_MS } from './finish-core.ts';

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
const PLAYING = { status: 'playing', results: [], out: [] };
const decide = (settings, swings, over) => decideResult({ settings, players: players(over), swings, now: NOW, DH, realData: null });

// Stroke play: a win, once both cards are complete
const WIN = gameLog('2026-10-23', [4, 1]); // 52 v 61
{
  const d = decide(stroke('2026-10-23'), WIN);
  assert.deepEqual(d, { status: 'finished', out: [], results: [
    { slot: 0, result: 'win', detail: '52 v 61', place: 1 }, { slot: 1, result: 'loss', detail: '61 v 52', place: 2 }] }); // own total first
  // The order swings are stored in doesn't matter
  assert.deepEqual(decide(stroke('2026-10-23'), [...WIN].reverse()), d);
  // One card still open: playing
  assert.deepEqual(decide(stroke('2026-10-23'), WIN.filter((s) => s.slot === 0 || s.hole < 8)), PLAYING);
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
  assert.deepEqual(d, { status: 'finished', out: [], results: [
    { slot: 0, result: 'win', detail: m.label, place: 1 }, { slot: 1, result: 'loss', detail: m.label, place: 2 }] });
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
  // Not seen for longer than DROP_MS: gone, and loses; just under it: may still rejoin
  const gone = decide(stroke('2026-10-23'), MID, [{}, { last_seen: seen(DROP_MS + 1000) }]);
  assert.deepEqual(gone, { status: 'finished', out: [1], results: [
    { slot: 0, result: 'win', detail: 'Bea left', place: 1 }, { slot: 1, result: 'loss', detail: 'Bea left', place: 2 }] });
  assert.deepEqual(decide(stroke('2026-10-23'), MID, [{}, { last_seen: seen(DROP_MS - 1000) }]), PLAYING);
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
  assert.deepEqual(decide(stroke('2026-10-23'), WIN.filter((_, i) => i !== at)), PLAYING);
  assert.deepEqual(decide(stroke('2026-10-23'), WIN.map((s, i) => (i === at ? { ...s, v: 2 } : s))), PLAYING);
  assert.equal(decide(stroke('2026-10-23'), [...WIN, { ...WIN[0], slot: 3 }]).status, 'playing');
}

// A bad swing in one player's log never lets the other's leaving decide the game for them
{
  const sw = WIN.filter((s) => s.hole < 7); // Ada 3 & 2 up, by the valid swings
  const poison = [...sw, { slot: 1, hole: 8, shot: 29, club: 0, aim: 0, v: 1, timeout: false }];
  const adaLeft = [{ left_at: seen(1000), last_seen: seen(1000) }, { last_seen: seen(0) }];
  assert.deepEqual(decide(match('2026-10-23'), poison, adaLeft), PLAYING);
  assert.equal(decide(stroke('2026-10-23'), [...MID, { ...MID[MID.length - 1], shot: 29 }], adaLeft).status, 'playing');
  // ...dropping off counts no more than leaving
  assert.equal(decide(match('2026-10-23'), poison, [{ last_seen: seen(DROP_MS * 2) }, {}]).status, 'playing');
  // The player with the broken log can still forfeit
  const beaLeft = decide(match('2026-10-23'), poison, [{}, { left_at: seen(1000) }]);
  assert.deepEqual(beaLeft.results.map((r) => [r.result, r.detail]), [['win', 'Bea left'], ['loss', 'Bea left']]);
  // Both leave: only Bea's leaving counts
  assert.deepEqual(decide(match('2026-10-23'), poison, [adaLeft[0], { left_at: seen(500) }]).results.map((r) => r.result), ['win', 'loss']);
}

// Re-deciding a recorded game (now null) ignores last_seen, so later calls agree; left_at still counts
{
  const stale = [{ last_seen: seen(DROP_MS * 10) }, { last_seen: seen(DROP_MS * 10) }];
  assert.equal(decide(stroke('2026-10-23'), MID, stale).results[0].detail, 'Abandoned');
  const again = (over) => decideResult({ settings: stroke('2026-10-23'), players: players(over), swings: MID, now: null, DH, realData: null });
  assert.deepEqual(again(stale), PLAYING);
  assert.deepEqual(again([{}, { left_at: seen(1000), last_seen: seen(DROP_MS * 10) }]).results.map((r) => r.result), ['win', 'loss']);
  assert.deepEqual(again([{}, {}]).status, 'playing');
  assert.deepEqual(decideResult({ settings: stroke('2026-10-23'), players: players(), swings: WIN, now: null, DH, realData: null }).results[0].detail, '52 v 61');
}

// A real course
{
  const spec = { kind: 'real', id: 'victoria', mode: 'front', day: '2026-10-23' }, c = DH.courseFromSpec(spec, victoria);
  const sw = [0, 1].flatMap((slot) => playLive(DH.newRound(c.seed, c, '#p' + slot), slot, slot * 2));
  const d = decideResult({ settings: { spec, format: 'stroke' }, players: players(), swings: sw, now: NOW, DH, realData: victoria });
  assert.equal(d.status, 'finished');
  assert.match(d.results[0].detail, /^\d+ v \d+$/);
}

// Three players at stroke play: own total first, then the others in slot order
{
  const sw = gameLog('2026-10-23', [4, 1, 0]), three = [...players(), { slot: 2, user_id: 'u2', name: 'Cal', guest: false, left_at: null, last_seen: seen(0) }];
  const d = decideResult({ settings: stroke('2026-10-23'), players: three, swings: sw, now: NOW, DH, realData: null });
  const t = DH.replayGame(stroke('2026-10-23').spec, null, three, sw).scores.map((sc) => sc.reduce((a, x) => a + x, 0));
  const place = (k) => 1 + t.filter((x) => x < t[k]).length;
  assert.deepEqual(d.results.map((r) => r.detail.split(' · ')[1]), [`${t[0]} v ${t[1]} v ${t[2]}`, `${t[1]} v ${t[0]} v ${t[2]}`, `${t[2]} v ${t[0]} v ${t[1]}`]);
  assert.deepEqual(d.results.map((r) => r.place), [0, 1, 2].map(place));
}

// Four players at stroke play: one leaving doesn't end it for the other three
{
  const four = [...players([{}, { guest: false }]),
    { slot: 2, user_id: 'u2', name: 'Cal', guest: false, left_at: null, last_seen: seen(0) },
    { slot: 3, user_id: 'u3', name: 'Dan', guest: false, left_at: null, last_seen: seen(0) }];
  const sw = gameLog('2026-10-23', [4, 1, 0, 2]);
  const four4 = (over = []) => four.map((p, k) => ({ ...p, ...over[k] }));
  const go = (swings, over, now = NOW) => decideResult({ settings: stroke('2026-10-23'), players: four4(over), swings, now, DH, realData: null });
  const danMid = sw.filter((s) => s.slot !== 3 || s.hole < 3); // Dan stopped after the 3rd
  assert.deepEqual(go(danMid), PLAYING, 'Dan may still come back');
  const danGone = [{}, {}, {}, { last_seen: seen(DROP_MS + 1000) }];
  assert.deepEqual(go(danMid.filter((s) => s.slot === 3 || s.hole < 5), danGone), { status: 'playing', results: [], out: [3] }, 'the rest play on');
  const d = go(danMid, danGone);
  assert.equal(d.status, 'finished');
  assert.deepEqual(d.out, [3]);
  const t = DH.replayGame(stroke('2026-10-23').spec, null, four.slice(0, 3), sw.filter((s) => s.slot < 3)).scores.map((sc) => sc.reduce((a, x) => a + x, 0));
  const place = (k) => 1 + t.filter((x) => x < t[k]).length;
  assert.deepEqual(d.results.map((r) => r.place), [place(0), place(1), place(2), 4]);
  assert.deepEqual(d.results[3], { slot: 3, result: 'loss', detail: 'Dan left', place: 4 });
  const ORD = ['1st', '2nd', '3rd'];
  assert.equal(d.results[0].detail, `${ORD[place(0) - 1]} of 4 · ${t[0]} v ${t[1]} v ${t[2]} · Dan left`);
  assert.deepEqual(d.results.slice(0, 3).map((r) => r.result), [0, 1, 2].map((k) => (place(k) === 1 ? 'win' : 'loss')));
  // Only one left standing: they win at once
  const lone = go(sw.filter((s) => s.hole < 3), [{}, { left_at: seen(1000) }, { left_at: seen(900) }, { last_seen: seen(DROP_MS * 2) }]);
  assert.deepEqual(lone.results.map((r) => [r.result, r.place]), [['win', 1], ['loss', 2], ['loss', 2], ['loss', 2]]);
  assert.equal(lone.results[0].detail, 'Bea left, Cal left, Dan left');
  assert.deepEqual(lone.out, [1, 2, 3]);
  // Re-deciding (now null): the drop no longer shows, which is why the route marks a dropped player as left
  assert.deepEqual(go(danMid, danGone, null), PLAYING);
  assert.equal(go(danMid, [{}, {}, {}, { left_at: seen(1000) }], null).status, 'finished');
}
// A tie for first among three is a draw for those two, shown as T1st
{
  const fake = { ...DH, strokeResult: () => ({ totals: [40, 38, 38], winner: null }) };
  const three = [...players(), { slot: 2, user_id: 'u2', name: 'Cal', guest: false, left_at: null, last_seen: seen(0) }];
  const d = decideResult({ settings: stroke('2026-10-23'), players: three, swings: gameLog('2026-10-23', [4, 1, 0]), now: NOW, DH: fake, realData: null });
  assert.deepEqual(d.results.map((r) => [r.result, r.place, r.detail]),
    [['loss', 3, '3rd of 3 · 40 v 38 v 38'], ['draw', 1, 'T1st of 3 · 38 v 40 v 38'], ['draw', 1, 'T1st of 3 · 38 v 40 v 38']]);
}
// Three players: rows carry the whole field; a guest's result is read back from it
{
  const three = [...players(), { slot: 2, user_id: 'u2', name: 'Cal', guest: false, left_at: null, last_seen: seen(0) }];
  const res = [{ slot: 0, result: 'win', detail: '1st of 3', place: 1 }, { slot: 1, result: 'loss', detail: '3rd of 3', place: 3 }, { slot: 2, result: 'loss', detail: '2nd of 3', place: 2 }];
  const rows = resultRows(stroke('2026-10-23'), three, res);
  assert.deepEqual(rows.map((r) => [r.user_id, r.opponent_id, r.opponent_name]), [['u0', null, 'Bea, Cal'], ['u2', null, 'Ada, Bea']]);
  assert.deepEqual(rows[0].field.map((e) => [e.slot, e.id, e.name, e.place]), [[0, 'u0', 'Ada', 1], [1, null, 'Bea', 3], [2, 'u2', 'Cal', 2]]);
  assert.ok(JSON.stringify(rows[0].field).length < 2000, 'fits the column');
  assert.deepEqual(resultsFromRows(three, [rows[1]]), res, 'Ada and Bea from Cal’s row');
  assert.deepEqual(resultsFromRows(three.map((p) => (p.slot === 1 ? { ...p, name: 'Eve' } : p)), [rows[1]]).map((r) => r.slot), [0, 2], 'not someone new in the slot');
  assert.deepEqual(parseField([null, { slot: 'x' }, { slot: 1, name: 'A', result: 'nope' }, { slot: 1, name: 'A', result: 'win' }]),
    [{ slot: 1, id: null, name: 'A', result: 'win', detail: '', place: 1 }]);
  assert.deepEqual(parseField('[]'), []);
}

// 2v2 best ball: the sides' best balls decide it, everyone on a side gets the side's result
{
  const four = [...players([{}, { guest: false }]),
    { slot: 2, user_id: 'u2', name: 'Cal', guest: false, left_at: null, last_seen: seen(0) },
    { slot: 3, user_id: 'u3', name: 'Dan', guest: false, left_at: null, last_seen: seen(0) }];
  const teams = { mode: 'bestball', sides: [[0, 2], [1, 3]] };
  const sw = gameLog('2026-10-23', [4, 1, 0, 2]);
  const go = (format, swings, over = [], now = NOW) => decideResult({ settings: { spec: { kind: 'daily', seed: '2026-10-23' }, format, teams }, players: four.map((p, k) => ({ ...p, ...over[k] })), swings, now, DH, realData: null });
  const r = DH.replayGame({ kind: 'daily', seed: '2026-10-23' }, null, four, sw), side = DH.sideScores(teams, four, r.states);
  const tot = side.map(sc => sc.reduce((a, x) => a + x, 0));
  const d = go('stroke', sw);
  assert.equal(d.status, 'finished');
  const want = tot[0] < tot[1] ? ['win', 'loss'] : tot[0] > tot[1] ? ['loss', 'win'] : ['draw', 'draw'];
  assert.deepEqual(d.results.map(x => x.result), [want[0], want[1], want[0], want[1]], 'by side, in slot order');
  assert.equal(d.results[0].detail, `Best ball · ${tot[0]} v ${tot[1]}`);
  assert.equal(d.results[1].detail, `Best ball · ${tot[1]} v ${tot[0]}`);
  assert.deepEqual(d.results.map(x => x.place), [want[0], want[1], want[0], want[1]].map(w => (w === 'loss' ? 2 : 1)));
  // match play: side against side, hole by hole
  const m = DH.matchState(DH.courseFromSpec({ kind: 'daily', seed: '2026-10-23' }).holes.map(h => h.par), side);
  const dm = go('match', sw);
  assert.equal(dm.status, 'finished');
  assert.equal(dm.results[0].detail, `Best ball · ${m.label}`);
  // one member leaves mid-round: the side plays on with the other; both leave: the other side wins
  const mid = sw.filter(x => x.slot !== 2 || x.hole < 3);
  assert.equal(go('stroke', mid, [{}, {}, { left_at: seen(1000) }]).status, 'finished', 'Ada carries her side home');
  assert.deepEqual(go('stroke', mid.filter(x => x.hole < 5), [{}, {}, { left_at: seen(1000) }]), { status: 'playing', results: [], out: [2] });
  const both = go('stroke', sw.filter(x => x.hole < 3 || x.slot % 2), [{ left_at: seen(900) }, {}, { left_at: seen(1000) }]);
  assert.deepEqual(both.results.map(x => [x.result, x.place]), [['loss', 2], ['win', 1], ['loss', 2], ['win', 1]]);
  assert.equal(both.results[1].detail, 'Ada and Cal left');
}

// 2v2 rows: the opponent is the other side, and the field keeps each player's side
{
  const four = [...players([{}, { guest: false }]),
    { slot: 2, user_id: 'u2', name: 'Cal', guest: false, left_at: null, last_seen: seen(0) },
    { slot: 3, user_id: 'u3', name: 'Dan', guest: false, left_at: null, last_seen: seen(0) }];
  const S = { spec: { kind: 'daily', seed: '2026-10-23' }, format: 'stroke', teams: { mode: 'bestball', sides: [[0, 2], [1, 3]] } };
  const res = [0, 1, 2, 3].map(slot => ({ slot, result: slot % 2 ? 'loss' : 'win', detail: 'Best ball · 30 v 32', place: slot % 2 ? 2 : 1 }));
  const rows = resultRows(S, four, res);
  assert.deepEqual(rows.map(r => [r.user_id, r.opponent_id, r.opponent_name]), [['u0', null, 'Bea & Dan'], ['u1', null, 'Ada & Cal'], ['u2', null, 'Bea & Dan'], ['u3', null, 'Ada & Cal']]);
  assert.deepEqual(rows[0].field.map(e => e.team), [0, 1, 0, 1]);
  assert.deepEqual(parseField([{ slot: 1, name: 'A', result: 'win', team: 1 }])[0].team, 1);
  assert.equal(parseField([{ slot: 1, name: 'A', result: 'win' }])[0].team, undefined, 'no side outside 2v2');
}

// The rows finish_lobby writes: signed-in players only, with their opponent
{
  const S = stroke('2026-10-23'), res = [{ slot: 0, result: 'win', detail: '52 v 61', place: 1 }, { slot: 1, result: 'loss', detail: '61 v 52', place: 2 }];
  const field = (ids) => res.map((r, k) => ({ ...r, id: ids[k], name: ['Ada', 'Bea'][k] }));
  const row = { opponent_name: 'Bea', course_label: 'Daily nine 2026-10-23', format: 'stroke', result: 'win', detail: '52 v 61', field: field(['u0', null]) };
  assert.deepEqual(resultRows(S, players(), res), [{ user_id: 'u0', opponent_id: null, ...row }]); // Bea is a guest
  const two = players([{}, { guest: false }]);
  assert.deepEqual(resultRows(S, two, res), [
    { user_id: 'u0', opponent_id: 'u1', ...row, field: field(['u0', 'u1']) },
    { user_id: 'u1', opponent_id: 'u0', ...row, field: field(['u0', 'u1']), opponent_name: 'Ada', result: 'loss', detail: '61 v 52' }]);
  assert.deepEqual(resultRows(S, players([{ guest: true }, {}]), res), []);
  // Back from the stored rows: one result per slot, the guest's the other side of their opponent's
  const ada = { user_id: 'u0', opponent_name: 'Bea' };
  assert.deepEqual(resultsFromRows(players(), [{ ...ada, result: 'win', detail: '52 v 61' }]), res);
  assert.deepEqual(resultsFromRows(players(), [{ ...ada, result: 'draw', detail: 'Halved' }]).map((r) => r.result), ['draw', 'draw']);
  assert.deepEqual(resultsFromRows(two, [{ user_id: 'u1', opponent_name: 'Ada', result: 'loss', detail: '61 v 52' }, { ...ada, result: 'win', detail: '52 v 61' }]), res);
  // After a rematch someone new may hold the guest's slot: they get nothing from Ada's old row
  assert.deepEqual(resultsFromRows(players([{}, { name: 'Cal' }]), [{ ...ada, result: 'win', detail: '52 v 61' }]), [res[0]]);
  assert.deepEqual(resultsFromRows(players(), [], res), res); // two guests: a fresh decision
  assert.deepEqual(resultsFromRows(players(), []), []);
}

// course_label and the settings check
assert.equal(courseLabel({ kind: 'daily', seed: '2026-10-24' }), 'Daily nine 2026-10-24');
assert.equal(courseLabel({ kind: 'random', seed: 'abc' }), 'Random nine');
assert.equal(courseLabel({ kind: 'real', id: 'augusta', mode: 'back', day: '2026-10-24' }), 'Augusta National · back nine');
assert.equal(courseLabel({ kind: 'real', id: 'victoria', mode: 'all', day: '2026-10-24' }), 'Victoria Country Club · 18 holes');
assert.equal(courseLabel({ kind: 'real', id: 'toString', mode: 'front', day: '2026-10-24' }), 'toString · front nine'); // no name: the id

console.log('finish core: ok');
