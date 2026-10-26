// Self-check for the sim core: node test.js
const assert = require('node:assert/strict');
const DH = require('./game.js');
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const still = () => 0.5; // a "random" stream that makes every gauss() exactly 0

// Meter and carry curve
assert.equal(DH.grade(0.5), 'controlled');
assert.equal(DH.grade(0.72), 'solid');
assert.equal(DH.grade(0.945), 'pure');
assert.equal(DH.grade(1.0), 'pure');
assert.equal(DH.grade(1.01), 'overswing');
for (let v = 0.05, last = 0; v <= DH.METER_MAX; v += 0.01) { // never steps backwards
  assert.ok(DH.carryFactor(v) >= last); last = DH.carryFactor(v);
}
near(DH.carryFactor(DH.powerFor(0.6)), 0.6, 1e-6);
const dr = DH.CLUBS[0], pw = DH.CLUBS[6];
near(DH.powerAt(dr, 0), 0);
near(DH.powerAt(dr, dr.climb), DH.METER_MAX);
near(DH.powerAt(dr, dr.climb * 2), 0);

// Same seed, same course; different seed, different course
const a = DH.makeCourse('2026-10-23');
assert.deepEqual(a, DH.makeCourse('2026-10-23'));
assert.notDeepEqual(a, DH.makeCourse('2026-10-24'));
assert.equal(a.holes.length, 9);
for (const h of a.holes) {
  assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee');
  assert.equal(DH.surfaceAt(h, h.pin), 'green');
}

// Shot physics on a flat, windless test hole
const flat = (extra = {}) => ({
  par: 5, path: [{ x: 0, y: 0 }, { x: 0, y: 700 }], total: 700, fw: 30, rgh: 50, deep: 70,
  green: { x: 0, y: 700 }, gr: 14, pin: { x: 0, y: 700 }, bunkers: [], water: [],
  wind: 0, wspd: 0, slopePct: 0.02, ...extra,
});
const ball = { x: 0, y: 100 };
let s = DH.resolveShot(flat(), ball, 'fairway', dr, 0, DH.PURE_LO, still);
near(s.carry, 278 * DH.PURE_LO);
assert.equal(s.quality, 'pure');
assert.ok(s.total > s.carry + 15, 'rolls out on fairway');
near(DH.resolveShot(flat(), ball, 'fairway', dr, 0, 1, still).carry, 278 * 1.08);

s = DH.resolveShot(flat({ wind: Math.PI, wspd: 15 }), ball, 'fairway', dr, 0, DH.PURE_LO, still);
near(s.carry, 278 * DH.PURE_LO * (1 - 15 * 0.0042)); // headwind

near(DH.resolveShot(flat(), ball, 'rough', dr, 0, DH.PURE_LO, still).carry, 278 * DH.PURE_LO * 0.84);
assert.equal(DH.clubAllowed(dr, 'bunker'), false);
assert.ok(DH.CLUBS[DH.autoClub(flat(), ball, 'bunker')].carry <= 160);

s = DH.resolveShot(flat({ water: [{ x: 0, y: 378, rx: 20, ry: 20, rot: 0 }] }), ball, 'fairway', dr, 0, DH.PURE_LO, still);
assert.equal(s.penalty, 1);
assert.notEqual(DH.surfaceAt(flat({ water: [{ x: 0, y: 378, rx: 20, ry: 20, rot: 0 }] }), s.rest), 'water');

s = DH.resolveShot(flat(), ball, 'fairway', dr, Math.PI / 2, DH.PURE_LO, still); // straight out of bounds
assert.equal(s.note, 'OUT OF BOUNDS');
assert.deepEqual(s.rest, ball);

// Putt rings
const rr = DH.puttRings(flat());
assert.equal(DH.puttsFrom(flat(), { x: 0, y: 700 - rr.one * 0.9 }), 1);
assert.equal(DH.puttsFrom(flat(), { x: 0, y: 700 - rr.two * 0.9 }), 2);
assert.equal(DH.puttsFrom(flat(), { x: 0, y: 700 - 13 }), 3);

// The PIN band: in range it marks the power that carries the ball pin-high
const h = flat(), from = { x: 0, y: 700 - 110 };
const band = DH.targetBand(h, from, 'fairway', pw);
assert.equal(band.label, 'PIN');
const mid = (band.lo + band.hi) / 2 * DH.METER_MAX;
s = DH.resolveShot(h, from, 'fairway', pw, 0, mid, still);
assert.ok(Math.abs(DH.dist(s.rest, h.pin)) < 6, `band shot finished ${DH.dist(s.rest, h.pin)} yd away`);
assert.equal(DH.targetBand(h, ball, 'fairway', pw).label, '100'); // out of reach: the pure band

// ── the special hazards ──
const solo = (hh, ball, lie = 'fairway') => ({ seed: 'test', course: { holes: [hh] }, holeIdx: 0, ball, lie, strokes: 0,
  shotIdx: 0, scores: [], log: [], longest: 0, pured: 0, shots: 0, aces: [] });
const vFor = (club, yds) => DH.powerFor(yds / club.carry);

// Burn: water across the fairway; the bridge deck is playable
const burnPts = [{ x: -120, y: 400 }, { x: -60, y: 400 }, { x: 0, y: 400 }, { x: 60, y: 400 }, { x: 120, y: 400 }];
let hb = flat({ burn: { pts: burnPts, w: 9 } });
assert.equal(DH.surfaceAt(hb, { x: 0, y: 400 }), 'water');
s = DH.resolveShot(hb, { x: 0, y: 140 }, 'fairway', dr, 0, DH.PURE_LO, still); // lands at y≈403, in the burn
assert.equal(s.note, 'WATER');
assert.ok(s.rest.y < 391 && DH.surfaceAt(hb, s.rest) === 'fairway', 'dropped short of the burn');
hb = flat({ burn: { pts: burnPts, w: 9, bridge: { c: { x: 0, y: 400 }, d: { x: 1, y: 0 }, half: 8, span: 22 } } });
assert.equal(DH.surfaceAt(hb, { x: 0, y: 400 }), 'bridge');
assert.equal(DH.surfaceAt(hb, { x: 20, y: 400 }), 'water');

// Cart path: a ball runs about twice as far on it as on fairway
const hc = flat({ fw: 10, rgh: 50, cart: [{ x: 20, y: 0 }, { x: 20, y: 700 }] });
assert.equal(DH.surfaceAt(hc, { x: 20, y: 300 }), 'cart');
const onCart = DH.rollOut(hc, { x: 20, y: 300 }, { x: 0, y: 1 }, 20), onFw = DH.rollOut(flat(), { x: 0, y: 300 }, { x: 0, y: 1 }, 20);
assert.ok(DH.dist(onCart.point, { x: 20, y: 300 }) > 1.8 * DH.dist(onFw.point, { x: 0, y: 300 }), 'cart runs further');
assert.ok(Math.abs(onCart.point.x - 20) < 2, 'stays on the path');

// Gust: flight through the band is pushed sideways; a shot that stays short of it is not
const hg = flat({ gust: { along: 200, width: 60, dir: Math.PI / 2, spd: 30 } });
assert.ok(DH.resolveShot(hg, { x: 0, y: 0 }, 'tee', dr, 0, DH.PURE_LO, still).land.x > 10, 'pushed by the gust');
near(DH.resolveShot(hg, { x: 0, y: 0 }, 'tee', pw, 0, vFor(pw, 100), still).land.x, 0);

// Portal: stop on it and come out at the exit, no stroke added
const hp = flat({ portal: { x: 0, y: 300, r: 40, along: 300, onGreen: false, gain: 300, exit: { x: 0, y: 600 }, mark: { x: 0, y: 600 } } });
let sp = solo(hp, { x: 0, y: 200 });
let rp = DH.play(sp, 0, 6, vFor(pw, 100));
assert.ok(rp.portal, 'went through the portal');
assert.deepEqual(sp.ball, { x: 0, y: 600 });
assert.equal(sp.strokes, 1);
const hpg = flat({ portal: { ...hp.portal, onGreen: true, exit: { x: 0, y: 700 } } });
for (let i = 0; i < 50; i++) assert.ok(DH.puttsFrom(hpg, DH.portalOut(hpg, DH.rng(i)).ball) <= 2, 'portal by the pin leaves one or two putts');

// The arm: a ball at rest inside its circle is flung clear of it
const hm = flat({ mill: { x: 0, y: 300, r: 24, along: 300, period: 4, phase: 0, cw: false } });
const hit = DH.millStrike(hm, { x: 6, y: 300 }, DH.rng(3));
assert.ok(DH.dist(hit.rest, hm.mill) > hm.mill.r, 'flung out of the circle');
let sm = solo(hm, { x: 0, y: 200 });
rp = DH.play(sm, 0, 6, vFor(pw, 100));
assert.ok(rp.arm, 'the arm struck');
assert.ok(!DH.inMillZone(hm, sm.ball));

// Generated courses: every hazard turns up, and every hole still has a tee and a green
const seen = { island: 0, arch: 0, burn: 0, bridge: 0, cart: 0, mill: 0, portal: 0, gust: 0 };
let islandHole = null, archHole = null;
for (let i = 0; i < 400; i++) {
  for (const hh of DH.makeCourse('s' + i).holes) {
    for (const k of Object.keys(seen)) if (k === 'bridge' ? hh.burn && hh.burn.bridge : hh[k]) seen[k]++;
    if (hh.island && !islandHole) islandHole = hh;
    if (hh.arch && !archHole) archHole = hh;
    assert.equal(DH.surfaceAt(hh, { x: 0, y: 0 }), 'tee', `tee on s${i} hole ${hh.index}`);
    assert.equal(DH.surfaceAt(hh, hh.pin), 'green', `pin on s${i} hole ${hh.index}`);
  }
}
for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, `no ${k} in 400 courses`);
console.log('hazards in 400 courses:', JSON.stringify(seen));

// Island green: collar, lake, drop zone; a miss into the lake goes to the drop zone
{
  const hh = islandHole, g = hh.green, a = 0.3, at = r => ({ x: g.x + Math.cos(a) * r, y: g.y + Math.sin(a) * r });
  assert.equal(DH.surfaceAt(hh, at(DH.shoreR(hh, a) - 0.5)), 'fairway');
  assert.equal(DH.surfaceAt(hh, at((DH.shoreR(hh, a) + DH.moatR(hh, a)) / 2)), 'water');
  assert.equal(DH.surfaceAt(hh, hh.drop), 'fairway');
  const lake = at((DH.shoreR(hh, a) + DH.moatR(hh, a)) / 2), aim = Math.atan2(lake.x, lake.y);
  const r2 = DH.resolveShot(hh, { x: 0, y: 0 }, 'tee', pw, aim, vFor(pw, Math.hypot(lake.x, lake.y)), still);
  assert.equal(r2.note, 'WATER');
  assert.deepEqual(r2.rest, hh.drop);
}
// Crossing: open water between islands, a tee island, and an extra shot of par
{
  const hh = archHole;
  assert.ok(hh.par >= 4);
  assert.equal(DH.surfaceAt(hh, { x: 0, y: 0 }), 'tee');
  assert.equal(DH.surfaceAt(hh, { x: 250, y: hh.len / 2 }), 'water');
}

// ── themes and their own hazards ──
assert.equal(DH.themeFor('2026-10-23'), 'haunted'); // the last ten days of October are spooky
const themeCount = {};
for (let i = 0; i < 300; i++) themeCount[DH.themeFor('t' + i)] = (themeCount[DH.themeFor('t' + i)] || 0) + 1;
for (const t of DH.THEMES) assert.ok(themeCount[t] > 0, `theme ${t} never chosen`);
assert.equal(DH.makeCourse('x', 'alpine').theme, 'alpine');

// Leaves play like a bunker
const hl = flat({ leafPiles: [{ x: 0, y: 300, rx: 8, ry: 6, rot: 0, edge: Array(18).fill(1) }] });
assert.equal(DH.surfaceAt(hl, { x: 0, y: 300 }), 'leaves');
assert.equal(DH.clubAllowed(dr, 'leaves'), false);
// A rock stops a rolling ball and kicks it on up the hole
const hk = flat({ boulders: [{ x: 0, y: 320, r: 8, at: 320, kind: 'granite' }] });
const kicked = DH.rollOut(hk, { x: 0, y: 300 }, { x: 0.3, y: 0.95 }, 10), plain = DH.rollOut(flat(), { x: 0, y: 300 }, { x: 0.3, y: 0.95 }, 10);
assert.ok(kicked.rockHit && kicked.point.y > 330 && kicked.point.y > plain.point.y + 25, 'kicked forward off the rock');
// Lava is water by the rules, with its own name
s = DH.resolveShot(flat({ water: [{ x: 0, y: 378, rx: 20, ry: 20, rot: 0, kind: 'lava' }] }), ball, 'fairway', dr, 0, DH.PURE_LO, still);
assert.equal(s.note, 'LAVA');
assert.equal(s.penalty, 1);

// Each theme gets its own hazards, and none of them breaks a tee or a green
const themed = {};
for (const t of DH.THEMES) for (let i = 0; i < 60; i++) for (const hh of DH.makeCourse('t' + i, t).holes) {
  const k = themed[t] = themed[t] || { leaves: 0, granite: 0, pumpkin: 0, lava: 0, lavaPool: 0 };
  k.leaves += hh.leafPiles.length;
  for (const b of [...hh.boulders, ...hh.lavaRocks]) k[b.kind]++;
  k.lavaPool += hh.water.filter(w => w.kind === 'lava').length;
  assert.equal(DH.surfaceAt(hh, { x: 0, y: 0 }), 'tee');
  assert.equal(DH.surfaceAt(hh, hh.pin), 'green');
  for (const q of hh.leafPiles) assert.equal(DH.surfaceAt(hh, q), 'leaves', 'a leaf pile is not covered by anything');
}
assert.ok(themed.forest.leaves > 0 && themed.haunted.leaves > 0 && themed.beach.leaves === 0);
assert.ok(themed.alpine.granite > 0 && themed.haunted.pumpkin > 0 && themed.forest.granite === 0);
assert.ok(themed.volcanic.lava > 0 && themed.volcanic.lavaPool > 0 && themed.alpine.lava === 0);
console.log('theme hazards in 60 courses each:', JSON.stringify(themed));

// A bot that aims at the default line and stops inside the band finishes every round,
// and replaying its shot log gives the same card.
for (const seed of ['a', 'b', 'c', '2026-10-23', ...Array.from({ length: 30 }, (_, i) => 's' + i)]) {
  const st = DH.newRound(seed), noise = DH.rng(DH.hashStr(seed));
  while (!st.done) {
    const hh = DH.holeOf(st), ci = DH.autoClub(hh, st.ball, st.lie), c = DH.CLUBS[ci];
    const b = DH.targetBand(hh, st.ball, st.lie, c);
    const v = ((b.lo + b.hi) / 2 + (noise() - 0.5) * 0.06) * DH.METER_MAX; // human-ish timing error
    const aim = DH.aimTarget(hh, st.ball, st.lie, c) + (noise() - 0.5) * 0.04;
    if (DH.play(st, aim, ci, v).score != null) DH.nextHole(st);
  }
  const total = st.scores.reduce((x, y) => x + y, 0);
  assert.equal(st.scores.length, 9);
  const re = DH.newRound(seed);
  for (const l of st.log) if (DH.play(re, l.aim, l.club, l.v).score != null) DH.nextHole(re);
  assert.deepEqual(re.scores, st.scores);
  if (!seed.startsWith('s')) console.log(seed, st.course.name, st.scores.join(' '), '=', total, `(par ${st.course.par})`);
}
// Chips from just off the green: struck inside the band they finish in one-putt range almost every
// time; mistimed they still scatter.
{
  let inBand = 0, inBandOne = 0, off = 0, offOne = 0;
  for (const day of ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']) for (const hh of DH.makeCourse(day).holes) {
    if (hh.arch) continue;
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, ball = { x: hh.green.x + Math.cos(a) * (hh.gr + 2), y: hh.green.y + Math.sin(a) * (hh.gr + 2) };
      const lie = DH.surfaceAt(hh, ball);
      if (lie !== 'fairway' || DH.dist(ball, hh.pin) > DH.CHIP_YDS) continue;
      const c = DH.CLUBS[DH.autoClub(hh, ball, lie)], b = DH.targetBand(hh, ball, lie, c), aim = Math.atan2(hh.pin.x - ball.x, hh.pin.y - ball.y);
      for (let s = 0; s < 10; s++) {
        const r = DH.rng(DH.hashStr(day + hh.index + k + '#' + s));
        const one = res => res.holed || (res.restSurf === 'green' && DH.puttsFrom(hh, res.rest) <= 1);
        inBand++; if (one(DH.resolveShot(hh, ball, lie, c, aim, (b.lo + (b.hi - b.lo) * (s + 0.5) / 10) * DH.METER_MAX, r))) inBandOne++;
        off++; if (one(DH.resolveShot(hh, ball, lie, c, aim, b.hi * DH.METER_MAX * 1.25, DH.rng(DH.hashStr(day + hh.index + k + '#o' + s))))) offOne++;
      }
    }
  }
  console.log(`chips from the fringe: ${Math.round(100 * inBandOne / inBand)}% one-putt or in when struck in the band, ${Math.round(100 * offOne / off)}% when 25% too hard (${inBand} each)`);
  assert.ok(inBand > 300);
  assert.ok(inBandOne / inBand >= 0.95, 'a chip struck in the band finishes in one-putt range');
  assert.ok(offOne / off < 0.6, 'a mistimed chip does not');
}
console.log('ok');
