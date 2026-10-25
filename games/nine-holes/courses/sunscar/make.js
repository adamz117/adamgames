// Sunscar Canyon: an original desert course, designed here rather than traced. node courses/sunscar/make.js
// Its defining feature is the river: it winds through a red-rock canyon in a great horseshoe bend, and
// every hole crosses it. Some carry it off the tee, some on the approach, some make you choose between
// laying up and taking it on, the 15th runs along it, and the 8th's green sits on a butte in the middle of
// it, with a rope bridge to the far bank. Red slickrock ledges line the banks; desert washes and mesquite
// lie between the holes. The clubhouse is in the neck of land the river wraps round.
// Writes sunscar.json in the same format build.js makes for a traced course (course yards, x east, y north).
const fs = require('node:fs');
const path = require('node:path');

const HARD = { green: 1, fairway: 1 }; // the difficulty dials, tuned with ../fairness.js
const K = require('../fantasy-kit.js')('sunscar-canyon', HARD);
const { D2R, chaikin, pip, segNear, toWorld, toLocal, holeShapes, blob, rnd } = K;

// ── the holes, each in its own frame (as Ironmere's; see fantasy-kit.js), plus where it crosses the river:
// cross = [min, max] yards from the tee where the line may meet the middle of the river (the router picks, so
// each green and the next tee sit together); phi = [min, max] angle between the hole and the river there
// (90 = straight across, small = running along it); butte = the green is in the river. A hole's note gets
// what its crossing turned out to be (off the tee, in the driving zone, on the approach) added to it.
const HOLES = [
  { par: 4, name: 'Rim Shot', legs: [[405, 0]], cross: [150, 360], phi: [55, 80], gr: [13, 14], note: 'the opener, along the canyon rim',
    fw: [[150, 395, 15]], b: [[262, -19, 8, 12], [285, 19, 8, 11], [418, 12, 6, 6], [400, -14, 5, 6]] },
  { par: 4, name: 'First Leap', legs: [[265, 0], [165, 14]], cross: [100, 330], phi: [50, 80], gr: [13, 13], note: 'the fairway bends right',
    fw: [[180, 415, 14]], b: [[275, 22, 9, 13], [300, -20, 8, 11], [440, 13, 6, 7]] },
  { par: 3, name: 'The Gorge', legs: [[185, -4]], cross: [70, 140], phi: [60, 88], gr: [14, 14], up: [[0, 8]], note: 'from the rim, straight over the gorge',
    b: [[200, 8, 7, 4], [176, -14, 5, 6], [178, 15, 5, 6]] },
  { par: 5, name: 'The Decision', legs: [[300, 0], [255, -12]], cross: [150, 470], phi: [45, 75], gr: [13, 14], note: 'a par 5 of choices',
    fw: [[180, 530, 15]], b: [[290, -21, 8, 13], [330, 20, 8, 12], [470, -16, 7, 10], [572, 13, 6, 7]] },
  { par: 4, name: 'Lay Up or Leap', legs: [[460, 0]], cross: [110, 330], phi: [55, 80], gr: [13, 14], note: 'long and straight',
    fw: [[150, 440, 15]], b: [[220, 20, 8, 11], [430, -14, 6, 8], [438, 14, 6, 7]] },
  { par: 4, name: 'Long Gorge', legs: [[425, 4]], cross: [110, 330], phi: [55, 85], gr: [13, 13], note: 'a long iron in to a narrow green',
    fw: [[180, 410, 14]], b: [[280, -19, 8, 12], [305, 18, 8, 12], [440, 10, 6, 6]] },
  { par: 5, name: 'Diagonal', legs: [[300, 0], [235, -28]], cross: [140, 420], phi: [40, 65], gr: [13, 14], note: 'the river slants across it: bite off as much as you dare',
    fw: [[200, 520, 15]], b: [[310, 22, 9, 13], [420, -18, 8, 12], [555, 14, 6, 7]] },
  { par: 3, name: 'The Butte', legs: [[150, 0]], cross: [150, 150], phi: [60, 88], gr: [15, 15], up: [[150, 22]], butte: true, signature: true,
    note: 'the green is on a butte in the middle of the river; the rope bridge takes you on to the far bank' },
  { par: 4, name: 'Turn Back', legs: [[425, 6]], cross: [70, 330], phi: [55, 80], gr: [13, 14], note: 'down at the bend',
    fw: [[150, 415, 15]], b: [[268, -20, 8, 12], [292, 20, 8, 11], [440, -12, 6, 7]] },

  { par: 5, name: 'Sidewinder', legs: [[305, 0], [255, 10]], cross: [150, 440], phi: [45, 72], gr: [13, 14], note: 'a long climb up the far rim',
    fw: [[230, 545, 15]], b: [[320, -20, 8, 12], [460, 19, 8, 12], [578, -12, 6, 7]] },
  { par: 4, name: 'Copper Rim', legs: [[435, 0]], cross: [110, 340], phi: [50, 80], gr: [13, 13], note: 'to a green on the copper-red rim',
    fw: [[150, 425, 14]], b: [[250, 19, 8, 12], [280, -19, 8, 12], [448, 12, 6, 7]] },
  { par: 3, name: 'Sunscar', legs: [[222, 0]], cross: [80, 170], phi: [55, 85], gr: [15, 15], up: [[0, 12]], signature: true, note: 'off the highest rim over the deepest stretch of the gorge',
    b: [[238, 10, 7, 4], [214, -16, 5, 7]] },
  { par: 4, name: 'The Elbow', legs: [[270, 0], [165, -18]], cross: [110, 330], phi: [50, 75], gr: [13, 13], note: 'a dogleg left',
    fw: [[150, 425, 14]], b: [[230, 22, 9, 12], [452, -12, 6, 7]] },
  { par: 4, name: 'Crown Butte', legs: [[362, 0]], cross: [100, 280], phi: [55, 85], gr: [12, 12], note: 'short, but the green sits in a crown of bunkers',
    fw: [[170, 330, 16]], ring: [6, 17, 0] },
  { par: 4, name: 'Rimrock', legs: [[445, 0]], cross: [300, 410], phi: [18, 32], gr: [13, 14], note: 'it runs along the canyon, the river creeping in from one side',
    fw: [[150, 430, 15]], b: [[275, 22, 8, 12]] },
  { par: 5, name: 'Long Haul', legs: [[310, 0], [300, -10]], cross: [150, 480], phi: [50, 80], gr: [13, 14], note: 'the longest hole on the course',
    fw: [[180, 590, 15]], b: [[300, -21, 8, 12], [335, 21, 8, 12], [622, 12, 6, 7]] },
  { par: 3, name: 'Flash Flood', legs: [[168, 0]], cross: [60, 125], phi: [55, 88], gr: [12, 12], note: 'a short iron to a small green',
    b: [[182, 0, 8, 4], [160, -14, 5, 6], [160, 14, 5, 6]] },
  { par: 4, name: 'Homecoming', legs: [[300, 0], [152, -8]], cross: [110, 360], phi: [50, 80], gr: [14, 14], note: 'home to the green below the clubhouse',
    fw: [[150, 442, 15]], b: [[285, -20, 8, 12], [310, 20, 8, 12], [466, 12, 6, 7]] },
];

// ── the river: a horseshoe bend, flowing south down the west arm, round the bend and north up the east arm ──
const CTRL = [[-300, 900], [-290, 350], [-360, -150], [-640, -650], [-720, -1250], [-480, -1800], [0, -1990], [480, -1800], [720, -1250], [640, -650], [360, -150], [290, 350], [300, 900]];
const RIV = (() => {
  const sm = chaikin(CTRL, 5, false), cum = [0];
  for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]));
  // a little meander on top of the big bend, so the banks aren't drawn with a compass
  const line = sm.map((p, i) => {
    const a = sm[Math.max(0, i - 1)], b = sm[Math.min(sm.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nl = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
    const m = 14 * Math.sin(cum[i] / 140) + 7 * Math.sin(cum[i] / 53 + 1);
    return [p[0] + nl[0] * m, p[1] + nl[1] * m];
  });
  const c2 = [0]; for (let i = 1; i < line.length; i++) c2.push(c2[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  return { line, cum: c2, total: c2.at(-1) };
})();
const width = s => 34 + 9 * Math.sin(s / 310) + 5 * Math.sin(s / 97 + 2); // water, bank to bank
const POOL = 58, pool = (s, bS) => (bS == null ? 0 : POOL * Math.exp(-(((s - bS) / 70) ** 2))); // the river opens round the butte
const riverAt = s => { // point, downstream tangent and left normal at s yards along the river
  const { line, cum } = RIV; let i = 1; while (i < line.length - 1 && cum[i] < s) i++;
  const a = line[i - 1], b = line[i], t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const tan = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t: tan, nl: [-tan[1], tan[0]] };
};
// where a point is from the river: distance from the middle, which bank (+1 left of the flow, -1 right) and s
const fromRiver = p => {
  const n = segNear(p, RIV.line), r = riverAt(n.d);
  return { dist: n.dist, s: n.d, side: Math.sign((p[0] - r.p[0]) * r.nl[0] + (p[1] - r.p[1]) * r.nl[1]) || 1 };
};

// the same, from a 6-yard map worked out once: routing asks it hundreds of thousands of times
const FAST = (() => {
  const C = 6, x0 = -1300, y1 = 1200, nx = Math.ceil(2600 / C), ny = Math.ceil(3500 / C), dist = new Float32Array(nx * ny), s = new Float32Array(nx * ny), side = new Int8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const f = fromRiver([x0 + (i + 0.5) * C, y1 - (j + 0.5) * C]), k = j * nx + i; dist[k] = f.dist; s[k] = f.s; side[k] = f.side; }
  return p => {
    const i = Math.floor((p[0] - x0) / C), j = Math.floor((y1 - p[1]) / C);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return fromRiver(p);
    const k = j * nx + i; return { dist: dist[k], s: s[k], side: side[k] };
  };
})();

// ── routing: hole by hole down the river, each crossing it once, the next tee beside the last green ──
const CLUB = [0, 380]; // the clubhouse, in the neck of the horseshoe
const SEP = 78;
const shapes0 = HOLES.map(H => holeShapes(H));
const S0 = fromRiver(CLUB).s, total = 18;
const sFirst = fromRiver([-260, 200]).s, sLast = fromRiver([260, 200]).s; // where the crossings start and end
function place(i, prev, bS) {
  const H = HOLES[i], sh = shapes0[i], wAt = s => width(s) + pool(s, bS);
  const fromSide = prev ? prev.endSide : FAST(CLUB).side, target = sFirst + (sLast - sFirst) * (i + 0.5) / total, cands = [];
  for (let X = H.cross[0]; X <= H.cross[1]; X += 20) {
  const C = sh.F(X), aL = Math.atan2(C.v[0], C.v[1]);
  for (let s = prev ? prev.s + 40 : sFirst - 200; s <= (prev ? prev.s + 700 : sFirst + 300); s += 12) {
    const R = riverAt(s), hw = width(s) / 2;
    for (let phi = H.phi[0]; phi <= H.phi[1]; phi += 6) {
      const sn = Math.sin(phi * D2R), cs = Math.cos(phi * D2R), k = fromSide > 0 ? -1 : 1; // head for the other bank
      const dir = [R.t[0] * cs + R.nl[0] * sn * k, R.t[1] * cs + R.nl[1] * sn * k];
      const h = Math.atan2(dir[0], dir[1]) - aL, rot = toWorld([0, 0], h)(C.p), tee = [R.p[0] - rot[0], R.p[1] - rot[1]], W = toWorld(tee, h);
      // the walk from the last green (or from the clubhouse to the first tee)
      const gap = Math.hypot(tee[0] - (prev ? prev.green[0] : CLUB[0]), tee[1] - (prev ? prev.green[1] : CLUB[1]));
      const want = prev ? prev.after : 60;
      if (gap < want - 12 || gap > want + 130) continue; // a walk to the next tee: short is best, up to ~160 yards is fine
      // one crossing, where it was designed; everywhere else well clear of the water
      const win = (hw + 14) / sn + 6, smp = [];
      let ok = true;
      for (let d = 0; d <= sh.L + 0.1 && ok; d += 10) {
        const p = W(sh.F(d).p), f = FAST(p);
        smp.push({ d, p });
        if (Math.abs(d - X) <= win) continue;
        if (f.dist < wAt(f.s) / 2 + 13) ok = false;
        else if (d < X && f.side !== fromSide) ok = false;
        else if (d > X && !H.butte && f.side === fromSide) ok = false;
      }
      if (!ok) continue;
      const green = W(sh.pin), N = HOLES[i + 1];
      // look ahead: the next tee (beside this green) must be as far from the river as the next hole's crossing needs
      let ahead = 0;
      if (N && !H.butte) {
        const dg = FAST(green).dist, lo = N.cross[0] * Math.sin(N.phi[0] * D2R) - 30, hi = N.cross[1] * Math.sin(N.phi[1] * D2R) + 30;
        ahead = dg < lo ? (lo - dg) * 4 : dg > hi ? (dg - hi) * 4 : 0;
      }
      cands.push({ X, s, phi, h, tee, W, smp, green, endSide: -fromSide, cost: Math.abs(gap - want) * 1.2 + Math.abs(s - target) * 0.25 + ahead });
    }
  }
  }
  return cands.sort((a, b) => a.cost - b.cost);
}
function clearOf(c, placed, i) { // no two holes within SEP, except a green and the next tee, and the ends at the clubhouse
  for (const o of placed) for (const a of c.smp) for (const b of o.smp) {
    const dd = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
    const joint = (o.i === i - 1 && a.d < 90 && o.L - b.d < 90) || (Math.hypot(a.p[0] - CLUB[0], a.p[1] - CLUB[1]) < 170 && Math.hypot(b.p[0] - CLUB[0], b.p[1] - CLUB[1]) < 170);
    if (dd < (joint ? 30 : SEP)) return false;
  }
  return true;
}
let routed = null, tries = 0;
(function dfs(i, placed) {
  if (routed || ++tries > 20000) return;
  if (i === HOLES.length) { if (Math.hypot(placed.at(-1).green[0] - CLUB[0], placed.at(-1).green[1] - CLUB[1]) < 170) routed = placed.slice(); return; }
  const prev = placed.at(-1);
  const prevInfo = prev && { s: prev.s, green: prev.green, endSide: prev.endSide, after: HOLES[i - 1].butte ? 95 : 36 };
  const bS = placed.find(c => HOLES[c.i].butte)?.s; // once the butte is placed, later holes keep out of its pool
  // the best few, each from a different crossing point, so a dead end can back up into a real alternative
  const seenX = new Set(), pick = [];
  for (const c of place(i, prevInfo, bS)) { if (pick.length >= 5) break; if (seenX.has(c.X) || !clearOf(c, placed, i)) continue; seenX.add(c.X); pick.push(c); }
  for (const c of pick) {
    c.i = i; c.L = shapes0[i].L; placed.push(c); dfs(i + 1, placed); placed.pop();
    if (routed) return;
  }
})(0, []);
if (!routed) throw new Error(`could not route the course (${tries} tries)`);
console.log('routed in', tries, 'tries');

// ── the river as water: both banks, widened round the butte, with the butte cut out and a rope bridge to it ──
const butteIdx = HOLES.findIndex(H => H.butte), butte = routed[butteIdx], butteR = shapes0[butteIdx].greenR + 9; // rock round the green: a miss that holds the butte isn't wet
const bS = butte.s;
const widthAt = s => width(s) + pool(s, bS);
const riverPoly = (() => {
  const L = [], R = [];
  for (let s = 0; s <= RIV.total; s += 6) { const r = riverAt(s), w = widthAt(s) / 2; L.push([r.p[0] + r.nl[0] * w, r.p[1] + r.nl[1] * w]); R.push([r.p[0] - r.nl[0] * w, r.p[1] - r.nl[1] * w]); }
  // the butte: a ring the other way round, reached by a slit from the bank the next tee is on (the rope bridge)
  const g = butte.green, ring = [];
  for (let k = 0; k < 40; k++) { const a = (k / 40) * 2 * Math.PI; ring.push([g[0] + Math.cos(a) * butteR * (1 + 0.06 * Math.sin(3 * a)), g[1] + Math.sin(a) * butteR * (1 + 0.06 * Math.sin(3 * a))]); }
  const area = p => p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + q[0] * r[1] - r[0] * q[1]; }, 0);
  const nextSide = routed[butteIdx + 1] ? fromRiver(routed[butteIdx + 1].tee).side : 1, bank = nextSide > 0 ? L : R;
  const bi = bank.reduce((best, p, k) => (Math.hypot(p[0] - g[0], p[1] - g[1]) < Math.hypot(bank[best][0] - g[0], bank[best][1] - g[1]) ? k : best), 0);
  const ri = ring.reduce((best, p, k) => (Math.hypot(p[0] - bank[bi][0], p[1] - bank[bi][1]) < Math.hypot(ring[best][0] - bank[bi][0], ring[best][1] - bank[bi][1]) ? k : best), 0);
  const bankPt = bank[bi], outer = [...L, ...[...R].reverse()];
  const loop = [...ring.slice(ri), ...ring.slice(0, ri), ring[ri]];
  const sign = Math.sign(area(outer)), inner = Math.sign(area(ring)) === sign ? loop.reverse() : loop;
  const at = outer.indexOf(bankPt);
  return [...outer.slice(0, at + 1), ...inner, ...outer.slice(at)];
})();

// ── into course yards ──
const r1 = v => Math.round(v * 10) / 10, pts = (list, W) => list.map(W).map(p => p.map(r1));
const out = { id: 'sunscar', name: 'Sunscar Canyon', par: 0, boundary: [], holes: [], greens: [], tees: [], fairways: [], bunkers: [], water: [], trees: [], cart: [], benches: [], heights: null, approved: [], turnAfter: 9, landmarks: [] };
const worldHoles = [];
routed.forEach((c, i) => {
  const H = HOLES[i], W = c.W, inv = toLocal(c.tee, c.h);
  // the hole's shapes again, now with the river in its own frame so fairways stop short of the banks
  const sh = holeShapes(H, [riverPoly.map(inv)]);
  // what the river does on this hole, from where the router put the crossing
  const where = H.butte || H.par === 3 ? '' : c.X <= 210 ? `; carry the river off the tee (${c.X} yards out)`
    : c.X <= 300 ? `; the river crosses the driving zone at ${c.X}: lay up or carry it` : `; the river crosses ${c.X} yards out, in front of the ${H.par === 5 ? 'lay-up' : 'green'}`;
  out.holes.push({ n: i + 1, par: H.par, si: 0, cardYds: Math.round(sh.L), path: pts(sh.raw, W), note: `${H.name}: ${H.note}${where}`, hidden: false, signature: !!H.signature });
  out.greens.push({ hole: i + 1, pts: pts(sh.green, W) });
  out.tees.push({ hole: i + 1, pts: pts(sh.tee, W) });
  for (const f of sh.fairways) out.fairways.push({ hole: i + 1, pts: pts(f, W) });
  for (const b of sh.bunkers) out.bunkers.push({ pts: pts(b, W) });
  for (const w of sh.water) out.water.push({ pts: pts(w, W) });
  for (const t of sh.trees) out.trees.push({ pts: pts(t, W) });
  const t0 = sh.F(0); out.benches.push(W([-t0.u[0] * 10, -t0.u[1] * 10]).map(r1));
  worldHoles.push({ H, sh, W, raw: sh.raw.map(W) });
});
out.water.unshift({ pts: riverPoly.map(p => p.map(r1)) });
out.par = out.holes.reduce((a, h) => a + h.par, 0);

// ── rasters at 3-yard cells: the boundary, the slickrock ledges along the banks, washes and mesquite ──
const CELL = 3, all = worldHoles.flatMap(w => w.raw);
const X0 = Math.min(...all.map(p => p[0])) - 160, X1 = Math.max(...all.map(p => p[0])) + 160, Y0 = Math.min(...all.map(p => p[1])) - 160, Y1 = Math.max(...all.map(p => p[1])) + 160;
const GR = K.grid(X0, X1, Y0, Y1, CELL), { NX, NY, cx, cy } = GR;
const near = new Float32Array(NX * NY).fill(1e9), clear = new Float32Array(NX * NY).fill(1e9), rv = new Float32Array(NX * NY), rs = new Float32Array(NX * NY);
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const p = [cx(i), cy(j)], k = j * NX + i;
  for (const w of worldHoles) { const n = segNear(p, w.raw); near[k] = Math.min(near[k], n.dist); clear[k] = Math.min(clear[k], n.dist - w.sh.widthAt(n.d) - 14); }
  near[k] = Math.min(near[k], Math.hypot(p[0] - CLUB[0], p[1] - CLUB[1]) - 30);
}
// distance from the river's middle, cell by cell, from a coarse pass refined near the banks
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i; if (near[k] > 120 && (i % 4 || j % 4)) { rv[k] = 1e9; continue; } const f = fromRiver([cx(i), cy(j)]); rv[k] = f.dist; rs[k] = f.s; }
const inside = new Uint8Array(NX * NY); for (let k = 0; k < inside.length; k++) inside[k] = near[k] < 78 ? 1 : 0;
out.boundary = chaikin(GR.outline(inside).map(([i, j]) => [cx(i), cy(j)]), 2, true).map(p => p.map(r1));
const inB = GR.fill(out.boundary), wet = GR.fill(riverPoly);
const keep = [...out.greens, ...out.tees].map(s => s.pts), keepBox = keep.map(p => [Math.min(...p.map(q => q[0])) - 9, Math.min(...p.map(q => q[1])) - 9, Math.max(...p.map(q => q[0])) + 9, Math.max(...p.map(q => q[1])) + 9]);
const nearKeep = p => keepBox.some((b, h) => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3]);
// smooth random noise (0..1): hashed corners of a grid, blended, two octaves; no repeating stripes
const corner = new Map(), hc = (i, j) => { const key = i * 100003 + j; if (!corner.has(key)) corner.set(key, (K.DH.hashStr('sunscar|' + i + '|' + j) % 10007) / 10007); return corner.get(key); };
const vn1 = (x, y, sc) => { const gx = x / sc, gy = y / sc, i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (hc(i, j) * (1 - su) + hc(i + 1, j) * su) * (1 - sv) + (hc(i, j + 1) * (1 - su) + hc(i + 1, j + 1) * su) * sv; };
const vn = (x, y, sc) => 0.65 * vn1(x, y, sc) + 0.35 * vn1(x + 911, y - 377, sc / 2.3);
const cellOf = p => { const i = Math.floor((p[0] - X0) / CELL), j = Math.floor((Y1 - p[1]) / CELL); return i < 0 || j < 0 || i >= NX || j >= NY ? -1 : j * NX + i; };
// slickrock ledges: a band of red rock on both banks, broken into pieces, wherever the river is in play
const ledge = new Uint8Array(NX * NY);
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const k = j * NX + i; if (!inB[k] || wet[k] || near[k] > 150) continue;
  const p = [cx(i), cy(j)], edge = rv[k] - widthAt(rs[k]) / 2, band = 3 + 8 * vn(p[0], p[1], 40);
  if (edge > 0.5 && edge < band && vn(rs[k], 0, 30) > 0.32 && !nearKeep(p)) ledge[k] = 1;
}
for (const ring of GR.pieces(ledge, 20)) out.bunkers.push({ pts: chaikin(ring, 1, true).map(p => p.map(r1)) });
// open desert: everything inside the boundary well away from play (the heart of the horseshoe) is red sand waste
const desert = new Uint8Array(NX * NY), sand = new Uint8Array(NX * NY);
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const k = j * NX + i, p = [cx(i), cy(j)];
  if (!inB[k] || wet[k] || ledge[k] || rv[k] - widthAt(rs[k]) / 2 < 10 || nearKeep(p)) continue;
  if (near[k] > 92 + 26 * (vn(p[0], p[1], 90) - 0.5)) desert[k] = 1;
  else if (clear[k] > 6 && vn(p[0] + 500, p[1], 45) > 0.7) sand[k] = 1; // washes between the holes
}
for (const ring of GR.pieces(desert, 400)) out.bunkers.push({ pts: chaikin(ring, 2, true).map(p => p.map(r1)) });
for (const ring of GR.pieces(sand, 80)) out.bunkers.push({ pts: chaikin(ring, 2, true).map(p => p.map(r1)) });
// mesquite: single trees and little clumps, scattered off the play lines, thinner out in the desert
for (let y = Y0; y < Y1; y += 20) for (let x = X0; x < X1; x += 20) {
  const p = [x + rnd(-8, 8), y + rnd(-8, 8)], k = cellOf(p), roll = rnd(0, 1), r = rnd(2.6, 5.5);
  if (k < 0 || !inB[k] || wet[k] || ledge[k] || sand[k] || rv[k] - widthAt(rs[k]) / 2 < 12 || clear[k] < 3 || nearKeep(p)) continue;
  if (roll > (desert[k] ? 0.12 : 0.42 * vn(p[0], p[1], 70) + 0.08)) continue;
  out.trees.push({ pts: K.blobAt(p, r, r * rnd(0.8, 1), rnd(0, 180)).map(q => q.map(r1)) });
}

// ── the ground: a mesa top, cut by the gorge, with the high tees the holes ask for (yards) ──
const STEP = 30, cols = Math.ceil((X1 - X0) / STEP) + 1, rows = Math.ceil((Y1 - Y0) / STEP) + 1, bumps = [];
worldHoles.forEach(w => (w.H.up || []).forEach(([d, z]) => bumps.push({ p: w.W(w.sh.F(d).p), z })));
const z = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const x = X0 + c * STEP, y = Y1 - r * STEP, f = fromRiver([x, y]);
  let e = 70 + 5 * Math.sin(x / 230) + 4 * Math.cos(y / 270 + 1) - 22 * Math.exp(-((f.dist / 48) ** 2));
  for (const b of bumps) e += b.z * Math.exp(-(((x - b.p[0]) ** 2 + (y - b.p[1]) ** 2) / (2 * 40 * 40)));
  z.push(r1(e));
}
out.heights = { x0: X0, y0: Y1, step: STEP, cols, rows, z };

// ── around it: the river beyond the boundary is still the river (a hazard, not out of bounds), and the clubhouse ──
out.landmarks.push({ name: '', kind: 'water', pts: riverPoly.map(p => p.map(r1)) });
out.landmarks.push({ name: 'Clubhouse', kind: 'building', pts: [[-22, 368], [22, 368], [22, 392], [-22, 392]] });
out.approved = out.holes.map(h => h.n);

// stroke index: from the hardness ../fairness.js measured (SAVE=1 writes hardness.json), front odd, back even
const hardFile = path.join(__dirname, 'hardness.json');
const hard = fs.existsSync(hardFile) ? JSON.parse(fs.readFileSync(hardFile, 'utf8')) : out.holes.map(h => h.cardYds / h.par);
for (const [nine, start] of [[out.holes.slice(0, 9), 1], [out.holes.slice(9), 2]]) [...nine].sort((a, b) => hard[b.n - 1] - hard[a.n - 1]).forEach((h, i) => { h.si = start + 2 * i; });

fs.writeFileSync(path.join(__dirname, 'sunscar.json'), JSON.stringify(out));
console.log(`Sunscar Canyon: par ${out.par}, ${out.holes.reduce((a, h) => a + h.cardYds, 0)} yards; ${out.fairways.length} fairways, ${out.bunkers.length} bunkers, ${out.water.length} water, ${out.trees.length} tree stands`);
