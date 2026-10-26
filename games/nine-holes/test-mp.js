// Self-check for the multiplayer rules: node test-mp.js
const assert = require('node:assert/strict');
const DH = require('./game.js');
const victoria = require('./courses/victoria/victoria.json');

// A fixed, deterministic way to swing: the suggested club, a line wobbling round the suggested one,
// and a cycle of powers. n is the swing's number in the round.
const V = [0.97, 0.83, 1.03, 0.7, 0.9], OFF = [0, 0.03, -0.04, 0.01, -0.02];
function swingFor(st, n) {
  const h = DH.holeOf(st), club = DH.autoClub(h, st.ball, st.lie);
  return { club, aim: DH.aimTarget(h, st.ball, st.lie, DH.CLUBS[club]) + OFF[n % 5], v: V[n % 5] };
}
// Plays a whole round live through play(), returning the swing log it made.
function playLive(st, slot = 0, n0 = 0) {
  const log = [];
  for (let n = n0; !st.done; n++) {
    const s = swingFor(st, n), entry = { slot, hole: st.holeIdx, shot: st.shotIdx, club: s.club, aim: s.aim, v: s.v, lie: st.lie };
    const res = DH.play(st, s.aim, s.club, s.v);
    log.push(entry);
    if (res.score != null) DH.nextHole(st);
  }
  return log;
}

// Solo unchanged: these were recorded from game.js before the multiplayer rules were added.
{
  const st = DH.newRound('2026-10-23');
  playLive(st);
  assert.deepEqual(st.scores, [2, 9, 3, 7, 4, 6, 8, 8, 5]);
  assert.deepEqual([st.longest, st.pured, st.shots], [301, 7, 31]);
  const c = DH.makeRealCourse(victoria, 'front', '2026-10-23'), rs = DH.newRound(c.seed, c);
  playLive(rs);
  assert.deepEqual(rs.scores, [3, 7, 6, 6, 3, 10, 7, 9, 8]);
  assert.deepEqual([rs.longest, rs.pured, rs.shots], [306, 9, 42]);
}

// courseFromSpec builds what the solo game builds for the same course
assert.deepEqual(DH.courseFromSpec({ kind: 'daily', seed: '2026-10-23' }), DH.makeCourse('2026-10-23'));
assert.deepEqual(DH.courseFromSpec({ kind: 'random', seed: 'abc123' }), DH.makeCourse('abc123'));
assert.deepEqual(DH.courseFromSpec({ kind: 'real', id: 'victoria', mode: 'back', day: '2026-10-23' }, victoria),
  DH.makeRealCourse(victoria, 'back', '2026-10-23'));
assert.throws(() => DH.courseFromSpec({ kind: 'real', id: 'augusta', mode: 'all', day: '2026-10-23' }, victoria));

// Salt: the same swing from two slots scatters differently
{
  const p0 = DH.newRound('2026-10-23', null, '#p0'), p1 = DH.newRound('2026-10-23', null, '#p1');
  const s = swingFor(p0, 0);
  const r0 = DH.play(p0, s.aim, s.club, s.v), r1 = DH.play(p1, s.aim, s.club, s.v);
  assert.notDeepEqual(r0.land, r1.land);
  assert.equal(DH.newRound('x').salt, '');
}

// Replay equals live, whatever order the two players' swings arrive in
const SPEC = { kind: 'daily', seed: '2026-10-23' }, PLAYERS = [{ slot: 0 }, { slot: 1 }];
const live = PLAYERS.map(p => DH.newRound('2026-10-23', null, '#p' + p.slot));
const LOG = [...playLive(live[0], 0, 0), ...playLive(live[1], 1, 2)];
{
  const r = DH.replayGame(SPEC, null, PLAYERS, LOG);
  assert.equal(r.error, null);
  assert.deepEqual(r.scores, live.map(s => s.scores));
  assert.deepEqual(r.done, [true, true]);
  assert.deepEqual(r.states.map(s => s.ball), live.map(s => s.ball));
  assert.notDeepEqual(r.scores[0], r.scores[1]);
  let x = 7; // deterministic shuffle
  const shuffled = LOG.map(e => ({ e, k: (x = (x * 48271) % 2147483647) })).sort((a, b) => a.k - b.k).map(o => o.e);
  assert.deepEqual(DH.replayGame(SPEC, null, PLAYERS, shuffled).scores, r.scores);
  // A part-played log replays to the same position as live play stopped there.
  const part = DH.replayGame(SPEC, null, PLAYERS, LOG.filter(e => e.hole < 4));
  assert.deepEqual(part.scores, live.map(s => s.scores.slice(0, 4)));
  assert.deepEqual(part.done, [false, false]);
  assert.deepEqual(part.states.map(s => [s.holeIdx, s.shotIdx]), [[4, 0], [4, 0]]);
}
// Real course replay
{
  const spec = { kind: 'real', id: 'victoria', mode: 'front', day: '2026-10-23' }, c = DH.courseFromSpec(spec, victoria);
  const st = DH.newRound(c.seed, c, '#p0'), log = playLive(st, 0);
  assert.deepEqual(DH.replayGame(spec, victoria, [{ slot: 0 }], log).scores, [st.scores]);
}

// Bad logs: a duplicate or a missing shot stops that player's replay there, with an error
{
  const p0 = LOG.filter(e => e.slot === 0), dupAt = 5;
  const dup = DH.replayGame(SPEC, null, PLAYERS, [...LOG, { ...p0[dupAt] }]);
  assert.ok(dup.error && /duplicate/.test(dup.error), dup.error);
  const at = p0[dupAt];
  assert.deepEqual([dup.states[0].holeIdx, dup.states[0].shotIdx], [at.hole, at.shot + 1]);
  assert.deepEqual(dup.done, [false, true]);
  const gap = DH.replayGame(SPEC, null, PLAYERS, LOG.filter(e => e !== at));
  assert.ok(gap.error && /missing/.test(gap.error), gap.error);
  assert.deepEqual([gap.states[0].holeIdx, gap.states[0].shotIdx], [at.hole, at.shot]);
  assert.ok(/unknown/.test(DH.replayGame(SPEC, null, PLAYERS, [{ ...at, slot: 3 }]).error));
  const extra = { slot: 1, hole: 9, shot: 0, club: 0, aim: 0, v: 0.5 };
  assert.ok(DH.replayGame(SPEC, null, PLAYERS, [...LOG, extra]).error);
  assert.equal(DH.replayGame(SPEC, null, PLAYERS, []).error, null);
  // Illegal swings: power off the meter, or a club the lie doesn't allow
  for (const v of [-0.01, DH.METER_MAX + 0.01]) {
    const r = DH.replayGame(SPEC, null, PLAYERS, LOG.map(e => e === at ? { ...e, v } : e));
    assert.ok(/bad swing/.test(r.error), r.error);
    assert.deepEqual([r.states[0].holeIdx, r.states[0].shotIdx], [at.hole, at.shot]);
  }
  const upTo = LOG.slice(0, LOG.indexOf(at)); // slot 0's swings come first in LOG
  assert.equal(DH.replayGame(SPEC, null, PLAYERS, [...upTo, { ...at, v: DH.METER_MAX }]).error, null);
  const tight = LOG.find(e => !DH.clubAllowed(DH.CLUBS[0], e.lie));
  assert.ok(tight, 'the log has a shot from a lie that bars the driver');
  assert.ok(/bad swing/.test(DH.replayGame(SPEC, null, PLAYERS, LOG.map(e => e === tight ? { ...e, club: 0 } : e)).error));
}

// matchState
const P9 = [4, 4, 3, 4, 5, 4, 3, 4, 5], P18 = [...P9, ...P9];
{
  const A = [4, 4, 3], B = [5, 4, 4];
  let m = DH.matchState(P9, [A.slice(0, 2), B.slice(0, 2)]);
  assert.deepEqual([m.label, m.up, m.leader, m.decided, m.winner], ['1 up', 1, 0, false, null]);
  m = DH.matchState(P9, [A, B]);
  assert.deepEqual(m.holes.slice(0, 3), [0, null, 0]);
  assert.deepEqual([m.label, m.up, m.leader], ['2 up', 2, 0]);
  assert.equal(DH.matchState(P9, [[], []]).label, 'All square');
  assert.equal(DH.matchState(P9, [[4], [3]]).leader, 1);
  // B has played a hole A hasn't: ignored
  assert.equal(DH.matchState(P9, [[4, 4], [4, 4, 3]]).label, 'All square');
  // Stops at the first hole not scored by both
  const gap = DH.matchState(P9, [[4, null, 3], [5, 4, 4]]);
  assert.deepEqual([gap.label, gap.holes[2]], ['1 up', null]);
}
{
  // 18 holes, A 3 up with 2 to play
  const A = P18.slice(0, 16), B = P18.slice(0, 16).map((s, i) => i < 3 ? s + 1 : s);
  const m = DH.matchState(P18, [A, B]);
  assert.deepEqual([m.decided, m.winner, m.label], [true, 0, '3 & 2']);
  // Dormie: 2 up with 2 to play
  const d = DH.matchState(P18, [A, B.map((s, i) => i === 0 ? s - 1 : s)]);
  assert.deepEqual([d.decided, d.label], [false, 'Dormie 2']);
  // Holes played after the match is decided don't change it
  const later = DH.matchState(P18, [P18, P18.map((s, i) => i < 3 ? s + 1 : i > 15 ? s - 1 : s)]);
  assert.equal(later.label, '3 & 2');
}
{
  const h = DH.matchState(P9, [P9, P9]);
  assert.deepEqual([h.decided, h.winner, h.label, h.up], [true, null, 'Halved', 0]);
  const B = P9.map((s, i) => i === 0 ? s + 1 : i === 3 ? s - 1 : i === 8 ? s + 1 : s); // A 1 up on the 9th
  const m = DH.matchState(P9, [P9, B]);
  assert.deepEqual([m.decided, m.winner, m.label], [true, 0, '1 up']);
  const two = DH.matchState(P9, [P9, P9.map((s, i) => i === 0 || i === 8 ? s + 1 : s)]);
  assert.deepEqual([two.decided, two.label], [true, '2 up']);
}

// strokeResult
assert.deepEqual(DH.strokeResult(P9.slice(0, 3), [[4, 5, 3], [4, 4, 3]]), { totals: [12, 11], winner: 1 });
assert.deepEqual(DH.strokeResult(P9.slice(0, 2), [[4, 5], [5, 4]]), { totals: [9, 9], winner: null });
assert.deepEqual(DH.strokeResult(P9.slice(0, 2), [[4, 5], [4]]), { totals: [9, 4], winner: null }); // partial card

// nextToPlay
{
  const c = DH.makeCourse('2026-10-23'), h = c.holes[0];
  const at = (yds, shotIdx = 1, holeIdx = 0) => {
    const st = DH.newRound(c.seed, c, '#p'); st.holeIdx = holeIdx; st.shotIdx = shotIdx;
    st.ball = { x: h.pin.x, y: h.pin.y - yds }; return st;
  };
  assert.equal(DH.nextToPlay([at(150), at(90)], 0), 0);
  assert.equal(DH.nextToPlay([at(90), at(150)], 0), 1);
  assert.equal(DH.nextToPlay([at(90), at(90)], 1), 0); // tie: lower index
  const tee = () => DH.newRound(c.seed, c, '#p');
  assert.equal(DH.nextToPlay([tee(), tee()], 1), 1);
  assert.equal(DH.nextToPlay([tee(), tee()], 0), 0);
  // Holed out (already moved to the next tee) is skipped, even though that ball is farther away
  const holed = tee(); holed.holeIdx = 1;
  assert.equal(DH.nextToPlay([holed, at(30)], 0), 1);
  const done = at(300); done.done = true;
  assert.equal(DH.nextToPlay([done, at(30)], 0), 1);
  // Scored but not yet moved on (the UI calls nextHole later) is skipped too
  const scored = at(300); scored.scores[0] = 4;
  assert.equal(DH.nextToPlay([scored, at(30)], 0), 1);
  assert.equal(DH.nextToPlay([scored, holed], 0), 1);
  assert.equal(DH.nextToPlay([scored, done], 0), -1);
}

// timeoutSwing
{
  const st = DH.newRound('2026-10-23'), h = DH.holeOf(st);
  const t = DH.timeoutSwing(h, st.ball, st.lie);
  assert.deepEqual(t, DH.timeoutSwing(h, st.ball, st.lie));
  assert.equal(t.v, 0.55);
  assert.equal(t.club, DH.autoClub(h, st.ball, st.lie));
  assert.equal(t.aim, Math.round(t.aim * 1e4) / 1e4);
  // A timed-out swing logged and replayed lands where the live one did.
  const r = DH.replayGame(SPEC, null, [{ slot: 0 }], [{ slot: 0, hole: 0, shot: 0, ...t }]);
  const p = DH.newRound('2026-10-23', null, '#p0');
  DH.play(p, t.aim, t.club, t.v);
  assert.deepEqual(r.states[0].ball, p.ball);
}

// applySwing: a scripted take-turns game, one swing at a time, as the game page applies them
{
  const c = DH.courseFromSpec(SPEC), states = PLAYERS.map(p => DH.newRound(c.seed, c, '#p' + p.slot));
  const log = [], snaps = [], honourOf = () => { // winner of the last hole, else the previous honour
    let h = 0;
    for (let j = 0; j < states[0].holeIdx; j++) { const sc = states.map(s => s.scores[j]), m = Math.min(...sc); if (sc.filter(x => x === m).length === 1) h = sc.indexOf(m); }
    return h;
  };
  const view = s => ({ holeIdx: s.holeIdx, shotIdx: s.shotIdx, ball: s.ball, lie: s.lie, strokes: s.strokes, scores: s.scores, done: s.done, log: s.log, shots: s.shots, longest: s.longest, pured: s.pured });
  for (let n = 0; ; n++) {
    let k = DH.nextToPlay(states, honourOf());
    if (k < 0) { // everyone has finished the hole: the page moves them all on
      for (const s of states) DH.nextHole(s);
      if (states.every(s => s.done)) break;
      k = DH.nextToPlay(states, honourOf());
    }
    const sw = { slot: PLAYERS[k].slot, hole: states[k].holeIdx, shot: states[k].shotIdx, ...swingFor(states[k], n), timeout: n % 7 === 3 };
    assert.equal(DH.applySwing(states, sw), 'applied');
    assert.ok(states[k].last && states[k].last.rest, 'keeps the play() result for the animation');
    log.push(sw); snaps.push(JSON.stringify(states.map(view)));
    // the same swing again (a network retry) changes nothing
    assert.equal(DH.applySwing(states, { ...sw }), 'duplicate');
    assert.equal(JSON.stringify(states.map(view)), snaps[snaps.length - 1]);
  }
  assert.ok(log.length > 40);
  // Rebuilding from the first N swings (a rejoin) gives the live position after N swings, for every N.
  // replayGame moves a player to the next tee as soon as a hole is scored; the page does it later.
  const moved = st => { const s = view(st); if (!s.done && s.scores[s.holeIdx] != null) Object.assign(s, s.holeIdx === c.holes.length - 1 ? { done: true } : { holeIdx: s.holeIdx + 1, shotIdx: 0, strokes: 0, ball: { x: 0, y: 0 }, lie: 'tee' }); return s; };
  for (let N = 0; N <= log.length; N++) {
    const r = DH.replayGame(SPEC, null, PLAYERS, log.slice(0, N));
    assert.equal(r.error, null);
    const live = N ? JSON.parse(snaps[N - 1]).map(s => moved({ ...s, course: c })) : states.map(() => moved(DH.newRound(c.seed, c)));
    assert.deepEqual(r.states.map(moved).map(s => JSON.parse(JSON.stringify(s))), live.map(s => JSON.parse(JSON.stringify(s))), `after ${N} swings`);
  }
}
// applySwing: order, duplicates, gaps, moving on, and bad swings
{
  const fresh = () => PLAYERS.map(p => DH.newRound('2026-10-23', null, '#p' + p.slot));
  // slot 0's hole 0 is one swing (then putts); hole 1 takes several
  const p0 = LOG.filter(e => e.slot === 0), s = fresh(), h1 = p0.findIndex(e => e.hole === 1);
  assert.ok(h1 === 1 && p0[h1 + 2].hole === 1);
  assert.equal(DH.applySwing(s, p0[1]), 'early'); // hole 1 before hole 0
  assert.deepEqual([s[0].holeIdx, s[0].shotIdx, s[0].log.length], [0, 0, 0]);
  assert.equal(DH.applySwing(s, p0[0]), 'applied');
  assert.ok(s[0].holeIdx === 0 && s[0].scores[0] != null); // scored; the page moves on later
  assert.equal(DH.applySwing(s, { ...p0[0], shot: 1 }), 'bad'); // a shot on a finished hole
  assert.equal(DH.applySwing(s, p0[2]), 'early');
  assert.equal(DH.applySwing(s, p0[1]), 'applied'); // the hole-1 tee shot moves the player on itself
  assert.deepEqual([s[0].holeIdx, s[0].shotIdx], [1, 1]);
  assert.equal(DH.applySwing(s, p0[1]), 'duplicate');
  assert.equal(DH.applySwing(s, p0[0]), 'duplicate');
  assert.equal(DH.applySwing(s, p0[3]), 'early');
  assert.equal(DH.applySwing(s, p0[2]), 'applied');
  assert.equal(DH.applySwing(s, p0[3]), 'applied');
  const i = 3;
  assert.deepEqual(s[1].log, []); // the other player is untouched
  // the result matches a straight replay of the same swings
  assert.deepEqual(s[0].ball, DH.replayGame(SPEC, null, PLAYERS, p0.slice(0, i + 1)).states[0].ball);
  const t = fresh(), sw = p0[0];
  for (const bad of [null, {}, { ...sw, slot: 5 }, { ...sw, v: -0.1 }, { ...sw, v: DH.METER_MAX + 0.1 }, { ...sw, aim: NaN }, { ...sw, club: 99 }, { ...sw, club: '0' }, { ...sw, hole: '0' }, { ...sw, shot: 0.5 }])
    assert.equal(DH.applySwing(t, bad), 'bad', JSON.stringify(bad));
  assert.deepEqual(t.map(x => x.log.length), [0, 0]);
  // after the round
  const done = fresh();
  for (const e of LOG) { const r = DH.applySwing(done, e); assert.equal(r, 'applied'); const st = done[e.slot]; if (st.scores[st.holeIdx] != null) DH.nextHole(st); }
  assert.deepEqual(done.map(x => x.done), [true, true]);
  assert.equal(DH.applySwing(done, LOG[LOG.length - 1]), 'duplicate');
  assert.equal(DH.applySwing(done, { slot: 1, hole: 9, shot: 0, club: 0, aim: 0, v: 0.5 }), 'bad');
}

// Four players: every round replays from one mixed log, and a player marked done (gone) is skipped
{
  const rounds = [0, 1, 2, 3].map((slot) => DH.newRound('2026-10-23', null, '#p' + slot));
  const log = rounds.flatMap((st, slot) => playLive(st, slot, slot * 2));
  const r = DH.replayGame({ kind: 'daily', seed: '2026-10-23' }, null, [0, 1, 2, 3].map((slot) => ({ slot })), [...log].reverse());
  assert.equal(r.error, null);
  assert.deepEqual(r.done, [true, true, true, true]);
  assert.deepEqual(r.scores, rounds.map((st) => st.scores));
  assert.equal(DH.strokeResult(P9, r.scores).totals.length, 4);
  const c = DH.makeCourse('2026-10-23'), tee = () => DH.newRound(c.seed, c, '#p');
  const gone = tee(); gone.done = true;
  assert.equal(DH.nextToPlay([tee(), gone, tee(), tee()], 1), 0, 'honour on a player who left passes on');
}

console.log('mp ok');
