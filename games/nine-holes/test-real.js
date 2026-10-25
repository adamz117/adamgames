// Self-check for real courses (Victoria CC): node test-real.js
const assert = require('node:assert/strict');
const DH = require('./game.js');
const data = require('./courses/victoria/victoria.json');
const still = () => 0.5; // every gauss() is exactly 0
const DAY = '2026-10-23';

const inPoly = (p, pts) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
const centroid = pts => ({ x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length });
const pathLen = path => path.slice(1).reduce((a, p, i) => a + DH.dist(path[i], p), 0);
// A copy of the hole with no wind and flat ground, so a still shot carries exactly what it is given.
const calm = h => ({ ...h, wspd: 0, real: h.real && { ...h.real, heights: h.real.heights && { ...h.real.heights, z: h.real.heights.z.map(() => 0) } } });
// Plays a still, calm shot from `from` that carries exactly to `to`.
function shotTo(h, from, to, lie = 'fairway') {
  const d = DH.dist(from, to), lm = DH.LIE[lie];
  const club = [...DH.CLUBS].reverse().find(c => c.carry * lm.dist >= d * 1.02 && DH.clubAllowed(c, lie)) || DH.CLUBS[0];
  const v = DH.powerFor(d / (club.carry * lm.dist));
  return DH.resolveShot(calm(h), from, lie, club, Math.atan2(to.x - from.x, to.y - from.y), v, still);
}

// Determinism, and the three ways to play
const all = DH.makeRealCourse(data, 'all', DAY);
assert.deepEqual(all, DH.makeRealCourse(data, 'all', DAY));
assert.notDeepEqual(all.holes.map(h => h.pin), DH.makeRealCourse(data, 'all', '2026-10-24').holes.map(h => h.pin));
assert.equal(all.holes.length, 18);
assert.equal(all.par, 71);
assert.equal(all.real, true);
assert.equal(all.seed, 'victoria|all|' + DAY);
const front = DH.makeRealCourse(data, 'front', DAY), back = DH.makeRealCourse(data, 'back', DAY);
assert.deepEqual(front.holes.map(h => h.index), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
assert.equal(front.par, 35);
// Review Focus 4: the back nine keeps its real numbers and stroke indexes
assert.deepEqual(back.holes.map(h => h.index), [10, 11, 12, 13, 14, 15, 16, 17, 18]);
assert.equal(back.par, 36);
assert.deepEqual(back.holes.map(h => h.si), [5, 7, 1, 15, 3, 9, 13, 17, 11]);
assert.equal(back.mode, 'back');

// Every hole starts on its tee, its pin is on its green, and it is the card's length
for (const h of all.holes) {
  const card = data.holes[h.index - 1].cardYds;
  assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee', `hole ${h.index} tee`);
  assert.equal(DH.surfaceAt(h, h.pin), 'green', `hole ${h.index} pin`);
  assert.equal(h.len, card);
  assert.ok(Math.abs(pathLen(h.path) - card) < 1, `hole ${h.index} path ${pathLen(h.path)} vs card ${card}`);
  assert.ok(h.gr > 4 && h.gr < 30, `hole ${h.index} green radius ${h.gr}`);
}

// Review Focus 1: another hole's green plays as fairway, and stopping there does not end the hole
{
  const h = all.holes[0], other = h.real.greens.find(g => g.hole === 2), c = centroid(other.pts);
  assert.equal(DH.surfaceAt(h, c), 'fairway');
  const st = DH.newRound(all.seed, all);
  const from = DH.add(c, DH.dirOf(Math.atan2(c.x, c.y) + Math.PI), 10);
  st.ball = from; st.lie = DH.surfaceAt(h, from) === 'tee' ? 'tee' : 'fairway';
  const club = DH.CLUBS.length - 1, v = DH.powerFor(10 / DH.CLUBS[club].carry);
  const res = DH.play(st, Math.atan2(c.x - from.x, c.y - from.y), club, v);
  assert.notEqual(res.restSurf, 'green');
  assert.equal(res.score, undefined);
}

// Review Focus 2: past the property line is out of bounds, replayed from where it was hit
{
  const h = all.holes[2], B = h.real.boundary.pts, bc = centroid(B);
  const v = B.reduce((a, p) => DH.dist(p, { x: 0, y: 0 }) < DH.dist(a, { x: 0, y: 0 }) ? p : a);
  const out = DH.add(v, { x: (v.x - bc.x) / DH.dist(v, bc), y: (v.y - bc.y) / DH.dist(v, bc) }, 5);
  assert.ok(!inPoly(out, B));
  assert.equal(DH.surfaceAt(h, out), 'ob');
  const from = DH.add(v, { x: (bc.x - v.x) / DH.dist(v, bc), y: (bc.y - v.y) / DH.dist(v, bc) }, 25);
  const s = shotTo(h, from, out);
  assert.equal(s.penalty, 1);
  assert.equal(s.note, 'OUT OF BOUNDS');
  assert.deepEqual(s.rest, from);
}

// Review Focus 3: a ball in a real pond is dropped on dry, in-bounds ground clear of the trees
let ponds = 0;
for (const n of [11, 12, 17]) {
  const h = all.holes[n - 1];
  for (const w of h.real.water) {
    const c = centroid(w.pts);
    if (!inPoly(c, w.pts)) continue;
    // hit from 140 yards back along the line to the tee, from wherever that is
    const back = Math.min(140, DH.dist(c, { x: 0, y: 0 })), from = DH.add(c, { x: -c.x / DH.dist(c, { x: 0, y: 0 }), y: -c.y / DH.dist(c, { x: 0, y: 0 }) }, back);
    const lie = DH.surfaceAt(h, from);
    if (['water', 'ob', 'bunker'].includes(lie)) continue;
    const s = shotTo(h, from, c, lie === 'green' ? 'fairway' : lie);
    assert.equal(s.penalty, 1, `hole ${n} pond shot`);
    assert.equal(s.note, 'WATER');
    assert.ok(!['water', 'ob', 'trees'].includes(DH.surfaceAt(h, s.rest)), `hole ${n} drop on ${DH.surfaceAt(h, s.rest)}`);
    ponds++;
  }
}
assert.ok(ponds >= 3, `ponds tested: ${ponds}`);

// Trees: a ball landing in a stand lies in the trees; a ball rolling into one stops at its edge
{
  const h = all.holes[3];
  const area = p => Math.abs(p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q.x * r.y - r.x * q.y; }, 0) / 2);
  const stands = h.real.trees.filter(t => inPoly(centroid(t.pts), t.pts) && DH.dist(centroid(t.pts), { x: 0, y: 0 }) < 230)
    .sort((a, b) => area(b.pts) - area(a.pts));
  const t = stands[0], c = centroid(t.pts);
  assert.equal(DH.surfaceAt(h, c), 'trees');
  const landed = shotTo(h, { x: 0, y: 0 }, c, 'tee');
  assert.equal(landed.restSurf, 'trees');
  let rolled = 0;
  for (const v of t.pts) {
    const u = { x: (v.x - c.x) / DH.dist(v, c), y: (v.y - c.y) / DH.dist(v, c) }, from = DH.add(v, u, 4);
    if (!['rough', 'fairway'].includes(DH.surfaceAt(h, from))) continue;
    const r = DH.rollOut(h, from, { x: -u.x, y: -u.y }, 30);
    assert.notEqual(r.surf, 'trees');
    rolled++;
  }
  assert.ok(rolled > 0, 'some stand edge was tried');
}

// Elevation: uphill plays longer, downhill shorter
{
  const tee = { x: 0, y: 0 };
  const h13 = all.holes[12], h1 = all.holes[0], h11 = all.holes[10];
  assert.ok(DH.playsLike(h13, tee, h13.pin) > DH.dist(tee, h13.pin), '13 plays uphill');
  assert.ok(DH.playsLike(h1, tee, h1.pin) < DH.dist(tee, h1.pin), '1 plays downhill');
  assert.ok(DH.playsLike(h11, tee, h11.pin) < DH.dist(tee, h11.pin), '11 plays downhill');
  assert.equal(DH.heightAt(DH.makeCourse('2026-10-23').holes[0], tee), 0); // daily holes are flat

  // flat ground: a still pure drive from the fairway carries exactly as on the flat test hole
  const fw = all.holes[3].path[1], s = DH.resolveShot(calm(all.holes[3]), fw, 'fairway', DH.CLUBS[0], 0, DH.PURE_LO, still);
  assert.ok(Math.abs(s.carry - 278 * DH.PURE_LO) < 0.01, `flat carry ${s.carry}`);

  // a rise shortens the carry by the rise: on 13, a calm 7-iron straight at the pin
  const h = { ...h13, wspd: 0 }, c7 = DH.CLUBS.find(c => c.id === 'PW');
  const aim = Math.atan2(h.pin.x, h.pin.y), carry0 = c7.carry * DH.carryFactor(DH.PURE_LO);
  const rise = DH.heightAt(h, DH.add(tee, DH.dirOf(aim), carry0)) - DH.heightAt(h, tee);
  assert.ok(rise > 2, `13 rises ${rise}`);
  const up = DH.resolveShot(h, tee, 'tee', c7, aim, DH.PURE_LO, still);
  assert.ok(Math.abs(up.carry - (carry0 - rise)) < 0.5, `uphill carry ${up.carry} vs ${carry0 - rise}`);
}

// The tee card's "plays" figure: the hole's length plus the climb, so uphill doglegs play longer
for (const n of [2, 5, 13, 14, 18]) assert.ok(DH.holePlaysLike(all.holes[n - 1]) > all.holes[n - 1].len, `${n} plays longer than its length`);
for (const n of [1, 11]) assert.ok(DH.holePlaysLike(all.holes[n - 1]) < all.holes[n - 1].len, `${n} plays shorter than its length`);

// Review Focus 5: with the green hidden on 3 and 18, the default club and line still go at the pin
for (const n of [3, 18]) {
  const h = all.holes[n - 1];
  const ball = DH.pointAt(h.path, Math.max(0, h.total - 200));
  const ci = DH.autoClub(h, ball, 'fairway'), c = DH.CLUBS[ci];
  assert.ok(ci === 0 || c.carry + c.roll * 0.55 >= 0.99 * DH.playsLike(h, ball, h.pin), `hole ${n} club reaches`);
  if (DH.dist(ball, h.pin) <= c.carry * 1.06) {
    const a = DH.aimTarget(h, ball, 'fairway', c), want = Math.atan2(h.pin.x - ball.x, h.pin.y - ball.y);
    assert.ok(Math.abs(a - want) < 1e-9, `hole ${n} aims at the pin`);
  }
}

// Gary Player CC: every tee and pin plays, the turn is after the 9th, and the Sun City lake is water, not OB
{
  const gp = DH.makeRealCourse(require('./courses/gary-player/gary-player.json'), 'all', DAY);
  assert.equal(gp.par, 72);
  assert.equal(gp.turnAfter, 9);
  assert.equal(all.turnAfter, 10); // Victoria's 10th walks back to the clubhouse
  for (const h of gp.holes) {
    assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee', `GP hole ${h.index} tee`);
    assert.equal(DH.surfaceAt(h, h.pin), 'green', `GP hole ${h.index} pin`);
  }
  // every fairway is really there: down each hole's line the ball finds fairway, not trees (holes 6-8 once vanished under woods)
  for (const h of gp.holes) for (let t = h.par === 3 ? 0.75 : 0.3; t <= 0.9; t += 0.1) {
    const sf = DH.surfaceAt(h, DH.pointAt(h.path, h.total * t));
    assert.notEqual(sf, 'trees', `GP hole ${h.index} at ${Math.round(t * 100)}% is ${sf}`);
  }
  assert.ok(gp.holes[8].gr > 17, `the 9th green is big enough (${gp.holes[8].gr})`);
  const h17 = gp.holes[16], lk = h17.real.lakes[0];
  assert.equal(DH.surfaceAt(h17, { x: (lk.box[0] + lk.box[2]) / 2, y: (lk.box[1] + lk.box[3]) / 2 }), 'water');
}

// TPC Sawgrass Stadium: every tee and pin plays, fairways are clear of trees, and 17 is an island
{
  const tpc = DH.makeRealCourse(require('./courses/tpc-sawgrass/tpc-sawgrass.json'), 'all', DAY);
  assert.equal(tpc.par, 72);
  assert.equal(tpc.turnAfter, 9);
  for (const h of tpc.holes) {
    assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee', `TPC hole ${h.index} tee`);
    assert.equal(DH.surfaceAt(h, h.pin), 'green', `TPC hole ${h.index} pin`);
    for (let t = h.par === 3 ? 0.75 : 0.3; t <= 0.9; t += 0.1)
      assert.notEqual(DH.surfaceAt(h, DH.pointAt(h.path, h.total * t)), 'trees', `TPC hole ${h.index} at ${Math.round(t * 100)}%`);
  }
  // the 17th: water all the way from tee to the island green
  const h17 = tpc.holes[16];
  assert.equal(DH.surfaceAt(h17, DH.pointAt(h17.path, h17.total * 0.6)), 'water');
}

// Augusta National: every tee and pin plays, fairways are clear of trees, Rae's Creek guards the 12th
{
  const aug = DH.makeRealCourse(require('./courses/augusta/augusta.json'), 'all', DAY);
  assert.equal(aug.par, 72);
  assert.equal(aug.turnAfter, 9);
  for (const h of aug.holes) {
    assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee', `Augusta hole ${h.index} tee`);
    assert.equal(DH.surfaceAt(h, h.pin), 'green', `Augusta hole ${h.index} pin`);
    for (let t = h.par === 3 ? 0.75 : 0.3; t <= 0.9; t += 0.1)
      assert.notEqual(DH.surfaceAt(h, DH.pointAt(h.path, h.total * t)), 'trees', `Augusta hole ${h.index} at ${Math.round(t * 100)}%`);
  }
  const h12 = aug.holes[11], h16 = aug.holes[15];
  const creek = []; for (let t = 0.5; t <= 0.96; t += 0.01) creek.push(DH.surfaceAt(h12, DH.pointAt(h12.path, h12.total * t)));
  assert.ok(creek.includes('water'), "Rae's Creek in front of the 12th");
  assert.equal(DH.surfaceAt(h16, DH.pointAt(h16.path, h16.total * 0.5)), 'water');
}

// Pebble Beach: every tee and pin plays, fairways are clear of trees, the 8th carries the chasm, and the Pacific is water
{
  const pb = DH.makeRealCourse(require('./courses/pebble-beach/pebble-beach.json'), 'all', DAY);
  assert.equal(pb.par, 72);
  assert.equal(pb.turnAfter, 9);
  for (const h of pb.holes) {
    assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee', `Pebble hole ${h.index} tee`);
    assert.equal(DH.surfaceAt(h, h.pin), 'green', `Pebble hole ${h.index} pin`);
    for (let t = h.par === 3 ? 0.75 : 0.3; t <= 0.9; t += 0.1)
      assert.notEqual(DH.surfaceAt(h, DH.pointAt(h.path, h.total * t)), 'trees', `Pebble hole ${h.index} at ${Math.round(t * 100)}%`);
  }
  const h8 = pb.holes[7], chasm = [];
  for (let t = 0.5; t <= 0.9; t += 0.01) chasm.push(DH.surfaceAt(h8, DH.pointAt(h8.path, h8.total * t)));
  assert.ok(chasm.includes('water'), 'the 8th carries the chasm');
  assert.ok(!chasm.slice(chasm.indexOf('water')).includes('fairway'), 'no fairway beyond the chasm on the 8th, only water to the green');
  const h7 = pb.holes[6], sea = h7.real.lakes[0];
  assert.equal(DH.surfaceAt(h7, { x: (sea.box[0] + sea.box[2]) / 2, y: (sea.box[1] + sea.box[3]) / 2 }), 'water', 'the Pacific is water, not OB');
}

// Ironmere Quarry (designed, not traced): every tee and pin plays, fairway lines are clear of trees, the island
// greens are ringed by water but keep a dry land bridge, the creek crosses the 7th, and no fairway or green is wet
{
  const im = DH.makeRealCourse(require('./courses/ironmere/ironmere.json'), 'all', DAY);
  assert.equal(im.par, 72);
  assert.equal(im.turnAfter, 9);
  for (const h of im.holes) {
    assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee', `Ironmere hole ${h.index} tee`);
    assert.equal(DH.surfaceAt(h, h.pin), 'green', `Ironmere hole ${h.index} pin`);
    for (let t = h.par === 3 ? 0.75 : 0.3; t <= 0.9; t += 0.05)
      assert.notEqual(DH.surfaceAt(h, DH.pointAt(h.path, h.total * t)), 'trees', `Ironmere hole ${h.index} at ${Math.round(t * 100)}%`);
    for (const fw of h.real.fairways.filter(f => f.hole === h.index)) for (const p of fw.pts.filter((_, i) => i % 4 === 0))
      assert.ok(!h.real.water.some(w => DH.surfaceAt(h, p) === 'water'), `Ironmere hole ${h.index} fairway edge is dry`);
  }
  for (const [n, gap] of [[3, 42], [17, 98]]) {
    const h = im.holes[n - 1], g = h.green, back = DH.pointAt(h.path, h.total - 40), vx = (g.x - back.x) / 40, vy = (g.y - back.y) / 40;
    const at = (deg, r) => { const a = deg * Math.PI / 180; return { x: g.x - vx * Math.cos(a) * r + vy * Math.sin(a) * r, y: g.y - vy * Math.cos(a) * r - vx * Math.sin(a) * r }; };
    const ring = [0, 60, 120, 180, 240, 300].filter(d => Math.abs(((d - gap + 540) % 360) - 180) > 30);
    for (const d of ring) assert.equal(DH.surfaceAt(h, at(d, 30)), 'water', `Ironmere ${n}: water round the island at ${d}°`);
    for (let r = 16; r <= 60; r += 4) assert.notEqual(DH.surfaceAt(h, at(gap, r)), 'water', `Ironmere ${n}: the land bridge is dry ${r} yds out`);
  }
  const h7 = im.holes[6], creek = [];
  for (let t = 0.45; t <= 0.58; t += 0.003) creek.push(DH.surfaceAt(h7, DH.pointAt(h7.path, h7.total * t)));
  assert.ok(creek.includes('water'), 'the creek crosses the 7th');
}

// Sunscar Canyon (designed): every tee and pin plays, fairway lines are clear of trees, no fairway edge is wet,
// every hole crosses the river, the 8th's green is a butte with water all round, and the river beyond the boundary is water
{
  const sc = DH.makeRealCourse(require('./courses/sunscar/sunscar.json'), 'all', DAY);
  assert.equal(sc.par, 72);
  assert.equal(sc.turnAfter, 9);
  for (const h of sc.holes) {
    assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee', `Sunscar hole ${h.index} tee`);
    assert.equal(DH.surfaceAt(h, h.pin), 'green', `Sunscar hole ${h.index} pin`);
    for (let t = h.par === 3 ? 0.75 : 0.3; t <= 0.9; t += 0.05)
      assert.notEqual(DH.surfaceAt(h, DH.pointAt(h.path, h.total * t)), 'trees', `Sunscar hole ${h.index} at ${Math.round(t * 100)}%`);
    for (const fw of h.real.fairways.filter(f => f.hole === h.index)) for (const p of fw.pts.filter((_, i) => i % 4 === 0))
      assert.notEqual(DH.surfaceAt(h, p), 'water', `Sunscar hole ${h.index} fairway edge is dry`);
    const line = []; for (let t = 0; t <= 1; t += 0.004) line.push(DH.surfaceAt(h, DH.pointAt(h.path, h.total * t)));
    assert.ok(line.includes('water'), `Sunscar hole ${h.index} crosses the river`);
  }
  const h8 = sc.holes[7], g = h8.green;
  for (let a = 0; a < 360; a += 30) {
    const q = { x: g.x + Math.cos(a * Math.PI / 180) * (h8.gr + 16), y: g.y + Math.sin(a * Math.PI / 180) * (h8.gr + 16) };
    assert.equal(DH.surfaceAt(h8, q), 'water', `Sunscar 8: water round the butte at ${a}°`);
  }
  // upstream of the course, well outside the boundary, the river is still water, not out of bounds
  const h1 = sc.holes[0], { T, th, k } = h1.real, cs = Math.cos(th), sn = Math.sin(th);
  const frame = ([x, y]) => { const dx = x - T.x, dy = y - T.y; return { x: (dx * cs - dy * sn) * k, y: (dx * sn + dy * cs) * k }; };
  assert.equal(DH.surfaceAt(h1, frame([-299, 880])), 'water', 'the river beyond the boundary is water');
  assert.equal(DH.surfaceAt(h1, frame([-160, 880])), 'ob', 'the desert beyond the boundary is out of bounds');
}

// Cloudspire Highlands (designed): every tee and pin plays, fairway lines clear of trees, fairway edges dry, the six
// stream holes cross their streams, the waterfalls beyond the boundary are water (not OB), no stream near a tee or green
{
  const data = require('./courses/cloudspire/cloudspire.json'), cs = DH.makeRealCourse(data, 'all', DAY);
  assert.equal(cs.par, 72);
  assert.equal(cs.turnAfter, 9);
  for (const h of cs.holes) {
    assert.equal(DH.surfaceAt(h, { x: 0, y: 0 }), 'tee', `Cloudspire hole ${h.index} tee`);
    assert.equal(DH.surfaceAt(h, h.pin), 'green', `Cloudspire hole ${h.index} pin`);
    for (let t = h.par === 3 ? 0.75 : 0.3; t <= 0.9; t += 0.05)
      assert.notEqual(DH.surfaceAt(h, DH.pointAt(h.path, h.total * t)), 'trees', `Cloudspire hole ${h.index} at ${Math.round(t * 100)}%`);
    for (const fw of h.real.fairways.filter(f => f.hole === h.index)) for (const p of fw.pts.filter((_, i) => i % 4 === 0))
      assert.notEqual(DH.surfaceAt(h, p), 'water', `Cloudspire hole ${h.index} fairway edge is dry`);
  }
  for (const n of [4, 7, 11, 12, 17, 18]) {
    const h = cs.holes[n - 1], line = [];
    for (let t = 0; t <= 1; t += 0.004) line.push(DH.surfaceAt(h, DH.pointAt(h.path, h.total * t)));
    assert.ok(line.includes('water'), `Cloudspire ${n} crosses its stream`);
  }
  const falls = data.landmarks.filter(l => /Falls$/.test(l.name));
  assert.equal(falls.length, 6, 'six named waterfalls');
  const h1 = cs.holes[0], { T, th, k } = h1.real, c = Math.cos(th), s = Math.sin(th);
  const frame = ([x, y]) => { const dx = x - T.x, dy = y - T.y; return { x: (dx * c - dy * s) * k, y: (dx * s + dy * c) * k }; };
  for (const f of falls) {
    const mid = f.pts.reduce((a, p) => [a[0] + p[0] / f.pts.length, a[1] + p[1] / f.pts.length], [0, 0]);
    assert.equal(DH.surfaceAt(h1, frame(mid)), 'water', `${f.name} is water, not out of bounds`);
  }
  const streams = data.water.filter(w => w.pts.length > 300), segD = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  assert.equal(streams.length, 6, 'six streams');
  for (const sh of [...data.greens, ...data.tees]) {
    const mid = sh.pts.reduce((a, p) => [a[0] + p[0] / sh.pts.length, a[1] + p[1] / sh.pts.length], [0, 0]);
    for (const w of streams) assert.ok(w.pts.every((p, i) => segD(mid, p, w.pts[(i + 1) % w.pts.length]) > 20), `no stream beside the hole ${sh.hole} tee or green`);
  }
}

// The daily game is untouched
assert.equal(DH.hashStr(JSON.stringify(DH.makeCourse('2026-10-23'))), 980314489);

console.log('real courses: ok');
