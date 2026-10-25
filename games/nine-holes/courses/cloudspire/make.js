// Cloudspire Highlands: an original mountain course, designed here rather than traced. node courses/cloudspire/make.js
// Built for match play: every hole offers a short, dangerous line and a long, safe one. The front nine climbs
// the west face of Cloudspire from the clubhouse in the valley to the summit lodge; the back nine comes down
// the east face. Fairways run along ridge crests with scree falling away, greens sit on pinnacles and ledges,
// mountain streams cut across six holes and plunge off the edge of the course into named waterfalls, and
// above the treeline the core of the mountain is bare scree and tarns.
// Writes cloudspire.json in the same format build.js makes for a traced course (course yards, x east, y north).
const fs = require('node:fs');
const path = require('node:path');

const HARD = { green: 1, fairway: 1 }; // the difficulty dials, tuned with ../fairness.js
const K = require('../fantasy-kit.js')('cloudspire-highlands', HARD);
const { D2R, chaikin, pip, segNear, toWorld, toLocal, holeShapes, rnd } = K;

// ── the holes, each in its own frame (see fantasy-kit.js), plus:
// scree: [[from, to, off, halfWidth]] grey scree slopes along the line (a ridge falling away); ridge: [[from, to, z, off?]]
// raises a crest along the line by z yards; stream: d, a mountain stream crosses the hole there and runs off the course
// to a waterfall; up: [[d, z]] raises the ground at one spot (a tee up high, a green on a pinnacle).
const HOLES = [
  { par: 4, name: 'Meadow Gate', legs: [[255, 0], [150, 10]], gr: [14, 15],
    note: 'a gentle start through the valley meadows, before the climb',
    fw: [[150, 390, 17]], b: [[265, -21, 8, 13], [430, 13, 6, 7], [410, -15, 5, 6]] },
  { par: 5, name: 'Twin Ridges', legs: [[290, 0], [230, -8]], gr: [13, 14],
    note: 'two fairways: the left ridge is shorter but a knife edge, the right valley is wide and long',
    fw: [[190, 335, 8, -26], [190, 335, 15, 28], [355, 490, 14]], ridge: [[190, 335, 12, -26]], w: [[496, -27, 17, 22]],
    scree: [[190, 335, -14, 4], [190, 335, -38, 5], [205, 320, 1, 6]], b: [[535, -11, 6, 7], [522, 16, 6, 6]] },
  { par: 3, name: 'The Spire', legs: [[152, 0]], gr: [14, 14], up: [[152, 12]], signature: true,
    note: 'the green sits on a pinnacle of rock; miss it and you are on the scree, or worse',
    ring: [8, 17, 0], w: [[156, -42, 14, 30], [164, 42, 14, 26]], fw: [[95, 125, 8, -15]] },
  { par: 4, name: 'Cascade', legs: [[262, 0], [172, 38]], gr: [13, 14], stream: 250,
    note: 'a stream tumbles across the corner of the dogleg: carry it to cut the corner, or lay up short',
    fw: [[150, 420, 15]], w: [[250, 52, 22, 46, 20]], b: [[290, -22, 8, 12], [445, -13, 6, 7]] },
  { par: 4, name: 'Knife Edge', legs: [[318, 0]], gr: [12, 13],
    note: 'driveable along a ridge as narrow as a path, scree falling away on both sides',
    fw: [[140, 300, 9]], ridge: [[140, 300, 14]], scree: [[140, 300, -15, 5], [140, 300, 15, 5]], w: [[322, -30, 14, 22], [326, 30, 14, 20]], b: [[333, 6, 6, 4]] },
  { par: 5, name: 'Eagle’s Nest', legs: [[290, 0], [215, 6]], gr: [15, 15], signature: true,
    note: 'the green is out on a crag with a ravine all round: go for it in two over the drop, or lay up on the shelf to the right',
    fw: [[190, 345, 16], [380, 470, 13, 36]], isle: { rIn: 18, rOut: 36, gap: 115, half: 34 }, b: [[340, -21, 8, 12]] },
  { par: 4, name: 'Avalanche', legs: [[470, -4]], gr: [13, 14], up: [[0, 26]], stream: 395,
    note: 'from a tee high on the face, the ball flies forever; a scree fan waits on the right and a stream short of the green',
    fw: [[170, 445, 16]], scree: [[270, 330, 26, 9]], b: [[300, -22, 8, 12], [482, 12, 6, 7]] },
  { par: 3, name: 'Glassmere', legs: [[170, 0]], gr: [15, 15],
    note: 'all carry over a mountain tarn; the bail-out is right',
    w: [[85, -4, 34, 56]], fw: [[115, 155, 10, 30]], b: [[188, -6, 7, 4]] },
  { par: 4, name: 'Summit', legs: [[420, 4]], gr: [14, 15], up: [[420, 22]],
    note: 'the last of the climb, uphill all the way to the green below the summit lodge',
    fw: [[150, 400, 15]], b: [[268, -20, 8, 12], [292, 20, 8, 11], [428, 14, 6, 7]] },

  { par: 4, name: 'Cloud Walk', legs: [[240, 0], [92, -10]], gr: [13, 14], up: [[0, 20]],
    note: 'driveable off the top, down a ridge into the clouds, scree either side all the way to the green',
    fw: [[150, 315, 12]], ridge: [[150, 300, 10]], scree: [[150, 320, -18, 5], [150, 320, 18, 5]], w: [[356, -16, 16, 13]], b: [[342, 14, 6, 6]] },
  { par: 5, name: 'The Gorge', legs: [[295, 0], [235, 12]], gr: [13, 14], stream: 300,
    note: 'the stream cuts across the driving zone with a ravine down the left: a long carry, or lay up and go round',
    fw: [[170, 510, 15]], w: [[470, -36, 20, 60]], b: [[430, 24, 8, 12], [548, -12, 6, 7]] },
  { par: 3, name: 'Falls View', legs: [[158, 0]], gr: [15, 15], up: [[0, 10]], stream: 92,
    note: 'downhill over a stream to a green with the falls beyond',
    b: [[178, 10, 6, 5], [150, -15, 5, 6], [152, 15, 5, 6]] },
  { par: 4, name: 'Saddle', legs: [[312, 0]], gr: [12, 13],
    note: 'driveable: the green sits in a saddle between two tarns; lay up wide, or take them on',
    fw: [[150, 240, 18], [270, 295, 8]], w: [[305, -30, 16, 26], [305, 30, 16, 26]] },
  { par: 4, name: 'Rockfall', legs: [[455, 0]], gr: [13, 14],
    note: 'scree fields staggered down both sides of the fall line',
    fw: [[150, 435, 17]], scree: [[240, 300, -27, 7], [300, 360, 28, 7], [375, 420, -26, 6]], b: [[468, 12, 6, 7]] },
  { par: 4, name: 'High Road, Low Road', legs: [[440, 0]], gr: [13, 14],
    note: 'the high road is a narrow ridge on the left that shortens the hole; the low road on the right is safe and long',
    fw: [[180, 330, 8, -24], [180, 330, 15, 28], [345, 420, 14]], ridge: [[180, 330, 12, -24]],
    scree: [[180, 330, -12, 4], [180, 330, -36, 5], [195, 320, 2, 6]], b: [[455, 13, 6, 7]] },
  { par: 3, name: 'Hanging Green', legs: [[172, 0]], gr: [15, 15],
    note: 'a green on a ledge: the drop is right and long, scree on the left',
    w: [[185, 38, 15, 34], [205, 0, 26, 10]], scree: [[135, 185, -26, 7]] },
  { par: 4, name: 'Ravenhorn', legs: [[425, -6]], gr: [13, 14], stream: 270,
    note: 'the stream crosses the driving zone: lay up short, or carry it and leave a wedge',
    fw: [[150, 405, 15]], b: [[230, 22, 8, 12], [440, -13, 6, 7], [436, 14, 6, 6]] },
  { par: 5, name: 'Homeward Falls', legs: [[285, 0], [215, -14]], gr: [13, 14], stream: 430,
    note: 'a closing par 5 to settle a match: the stream and its pool guard the green, the lay-up is out to the left',
    fw: [[180, 420, 15], [405, 465, 11, -36]], w: [[468, 11, 24, 24]], b: [[300, 21, 8, 12], [524, 12, 6, 7]] },
];

// ── routing: the front nine up the west face from the clubhouse to the summit lodge, the back nine down the east ──
// the clubhouse, the summit lodge and the heart of the mountain; the mountain's size is found by the routing below
const CLUB = [0, 0]; let R = 1000, SUMMIT = [0, 2 * R], MASSIF = [0, R];
const SEP = 95;
const shapes0 = HOLES.map(H => holeShapes(H));
const samples = (sh, W) => { const out = []; for (let d = 0; d <= sh.L; d += 10) out.push({ d, p: W(sh.F(d).p) }); return out; };
const arc = (t, side) => { const a = -Math.PI / 2 + side * Math.PI * t; return [MASSIF[0] + R * 0.9 * Math.cos(a), MASSIF[1] + R * Math.sin(a)]; }; // t 0 at the clubhouse, 1 at the summit; side -1 west, +1 east
function route(idxs, side, firstTee, endAt, others) {
  const total = idxs.reduce((a, i) => a + shapes0[i].L + 40, 0);
  let cum = 0; const targets = idxs.map(i => { cum += shapes0[i].L + 40; return arc(side < 0 ? cum / total : 1 - cum / total, side < 0 ? -1 : 1); });
  targets[targets.length - 1] = endAt;
  let best = null, tries = 0;
  const near = (p, q, r) => Math.hypot(p[0] - q[0], p[1] - q[1]) < r;
  const dfs = (k, placed, prevGreen, oth) => {
    if (++tries > 4000 || best) return;
    if (k === idxs.length) { best = placed.slice(); return; }
    const i = idxs[k], sh = shapes0[i], cands = [];
    for (let deg = 0; deg < 360; deg += 5) {
      const h = deg * D2R, gap = k ? shapes0[idxs[k - 1]].after : 0;
      const tee = k === 0 ? firstTee : [prevGreen[0] + gap * Math.sin(h), prevGreen[1] + gap * Math.cos(h)], W = toWorld(tee, h), smp = samples(sh, W), green = W(sh.pin);
      let ok = true;
      if (k > 0) { // no tee in or beside the last hole's water
        const pw = shapes0[idxs[k - 1]].water.map(poly => poly.map(placed[k - 1].W));
        for (let a = 0; a < 8 && ok; a++) { const q = [tee[0] + 10 * Math.cos(a * Math.PI / 4), tee[1] + 10 * Math.sin(a * Math.PI / 4)]; if (pw.some(poly => pip(q, poly) || pip(tee, poly))) ok = false; }
      }
      for (const o of oth) { for (const a of smp) { for (const b of o.smp) {
        const dd = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
        const joint = (o.i === i - 1 && a.d < 80 && o.L - b.d < 80) || (near(a.p, CLUB, 150) && near(b.p, CLUB, 150)) || (near(a.p, SUMMIT, 150) && near(b.p, SUMMIT, 150));
        if (dd < (joint ? 26 : SEP)) { ok = false; break; }
      } if (!ok) break; } if (!ok) break; }
      if (ok) cands.push({ h, tee, W, smp, green, cost: Math.hypot(green[0] - targets[k][0], green[1] - targets[k][1]) });
    }
    cands.sort((a, b) => a.cost - b.cost);
    for (const c of cands.slice(0, 5)) {
      if (k === idxs.length - 1 && c.cost > 160) continue;
      c.i = i; c.L = sh.L; placed.push(c);
      dfs(k + 1, placed, c.green, [...oth, c]);
      placed.pop();
      if (best) return;
    }
  };
  dfs(0, [], null, others);
  return best;
}
let front = null, back = null;
for (const r of [1000, 1100, 900, 1200, 1300]) {
  R = r; SUMMIT = [0, 2 * R]; MASSIF = [0, R];
  front = route([0, 1, 2, 3, 4, 5, 6, 7, 8], -1, [-30, 20], [-40, SUMMIT[1] - 30], []);
  back = front && route([9, 10, 11, 12, 13, 14, 15, 16, 17], 1, [front[8].green[0] + 60, front[8].green[1] + 10], [40, 30], front);
  if (back) { console.log('mountain size', R); break; }
}
if (!front || !back) throw new Error('could not route the course');
const routed = [...front, ...back];
console.log('routed');

// ── the streams: from a tarn in the heart of the mountain, across their hole, and off the course to a waterfall ──
const FALLS = ['Silverveil Falls', 'Glassmere Falls', 'Ravenhorn Falls', 'Mistwater Falls', 'Thunder Falls', 'Heron Falls'];
const streams = [];
routed.forEach((c, i) => {
  const H = HOLES[i]; if (H.stream == null) return;
  const F = shapes0[i].F, at = F(H.stream), P = c.W(at.p), u = toWorld([0, 0], c.h)(at.u);
  const out = [P[0] - MASSIF[0], P[1] - MASSIF[1]], L = Math.hypot(...out), radial = [out[0] / L, out[1] / L];
  const sgn = u[0] * radial[0] + u[1] * radial[1] >= 0 ? 1 : -1;
  // across the hole, leaning outwards; turned if it would run into another hole
  for (const turn of [0, 20, -20, 40, -40]) {
    const base = [u[0] * sgn * 0.75 + radial[0] * 0.25, u[1] * sgn * 0.75 + radial[1] * 0.25], bl = Math.hypot(...base);
    const a = Math.atan2(base[1], base[0]) + turn * D2R, dir = [Math.cos(a), Math.sin(a)], nrm = [-dir[1], dir[0]];
    const line = [];
    for (let s = -260; s <= 340; s += 20) { const m = 9 * Math.sin(s / 47 + i) + 5 * Math.sin(s / 19 + 2 * i); line.push([P[0] + dir[0] * s + nrm[0] * m, P[1] + dir[1] * s + nrm[1] * m]); }
    const hits = routed.some((o, j) => j !== i && o.smp.some(q => line.some(p => Math.hypot(p[0] - q.p[0], p[1] - q.p[1]) < 40)));
    if (!hits || turn === -40) { streams.push({ hole: i, line, falls: FALLS[streams.length % FALLS.length] }); break; }
  }
});
const streamPoly = (line, w0) => { // the stream as water: a ribbon that narrows to a trickle at its source
  const L = [], R = [], sm = chaikin(line, 3, false);
  for (let k = 0; k < sm.length; k++) {
    const a = sm[Math.max(0, k - 1)], b = sm[Math.min(sm.length - 1, k + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    const w = w0 * (0.45 + 0.55 * k / (sm.length - 1)) * (1 + 0.15 * Math.sin(k * 0.9));
    L.push([sm[k][0] - n[0] * w, sm[k][1] - n[1] * w]); R.push([sm[k][0] + n[0] * w, sm[k][1] + n[1] * w]);
  }
  return [...L, ...R.reverse()];
};
for (const s of streams) s.poly = streamPoly(s.line, 5.5);

// ── into course yards ──
const r1 = v => Math.round(v * 10) / 10, pts = (list, W) => list.map(W).map(p => p.map(r1));
const out = { id: 'cloudspire', name: 'Cloudspire Highlands', par: 0, boundary: [], holes: [], greens: [], tees: [], fairways: [], bunkers: [], water: [], trees: [], cart: [], benches: [], heights: null, approved: [], turnAfter: 9, landmarks: [] };
const worldHoles = [];
routed.forEach((c, i) => {
  const H = HOLES[i], W = c.W, inv = toLocal(c.tee, c.h);
  const sh = holeShapes(H, streams.map(s => s.poly.map(inv))); // again, now that the streams exist: fairways stop short of them
  out.holes.push({ n: i + 1, par: H.par, si: 0, cardYds: Math.round(sh.L), path: pts(sh.raw, W), note: `${H.name}: ${H.note}`, hidden: false, signature: !!H.signature });
  out.greens.push({ hole: i + 1, pts: pts(sh.green, W) });
  out.tees.push({ hole: i + 1, pts: pts(sh.tee, W) });
  for (const f of sh.fairways) out.fairways.push({ hole: i + 1, pts: pts(f, W) });
  for (const b of sh.bunkers) out.bunkers.push({ pts: pts(b, W) });
  for (const w of sh.water) out.water.push({ pts: pts(w, W) });
  for (const t of sh.trees) out.trees.push({ pts: pts(t, W) });
  for (const [a, b, off, w] of H.scree || []) out.bunkers.push({ pts: pts(K.creek(sh.F, Array.from({ length: 6 }, (_, k) => [a + (b - a) * k / 5, off + 1.5 * Math.sin(k * 1.7 + i)]), w), W) });
  const t0 = sh.F(0); out.benches.push(W([-t0.u[0] * 10, -t0.u[1] * 10]).map(r1));
  worldHoles.push({ H, sh, W, raw: sh.raw.map(W) });
});
for (const s of streams) out.water.push({ pts: s.poly.map(p => p.map(r1)) });
out.par = out.holes.reduce((a, h) => a + h.par, 0);

// ── rasters at 3-yard cells: the boundary, the conifer forest, the scree above the treeline and its tarns ──
const CELL = 3, all = worldHoles.flatMap(w => w.raw);
const X0 = Math.min(...all.map(p => p[0])) - 170, X1 = Math.max(...all.map(p => p[0])) + 170, Y0 = Math.min(...all.map(p => p[1])) - 170, Y1 = Math.max(...all.map(p => p[1])) + 170;
const GR = K.grid(X0, X1, Y0, Y1, CELL), { NX, NY, cx, cy } = GR;
const near = new Float32Array(NX * NY).fill(1e9), clear = new Float32Array(NX * NY).fill(1e9);
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const p = [cx(i), cy(j)], k = j * NX + i;
  for (const w of worldHoles) { const n = segNear(p, w.raw); near[k] = Math.min(near[k], n.dist); clear[k] = Math.min(clear[k], n.dist - w.sh.widthAt(n.d) - 15); }
  near[k] = Math.min(near[k], Math.hypot(p[0] - CLUB[0], p[1] - CLUB[1]) - 30, Math.hypot(p[0] - SUMMIT[0], p[1] - SUMMIT[1]) - 30);
}
const inside = new Uint8Array(NX * NY); for (let k = 0; k < inside.length; k++) inside[k] = near[k] < 74 ? 1 : 0;
out.boundary = chaikin(GR.outline(inside).map(([i, j]) => [cx(i), cy(j)]), 2, true).map(p => p.map(r1));
const inB = GR.fill(out.boundary);
// smooth random noise (0..1), two octaves
const corner = new Map(), hc = (i, j) => { const key = i * 100003 + j; if (!corner.has(key)) corner.set(key, (K.DH.hashStr('cloudspire|' + i + '|' + j) % 10007) / 10007); return corner.get(key); };
const vn1 = (x, y, sc) => { const gx = x / sc, gy = y / sc, i = Math.floor(gx), j = Math.floor(gy), u = gx - i, v = gy - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (hc(i, j) * (1 - su) + hc(i + 1, j) * su) * (1 - sv) + (hc(i, j + 1) * (1 - su) + hc(i + 1, j + 1) * su) * sv; };
const vn = (x, y, sc) => 0.65 * vn1(x, y, sc) + 0.35 * vn1(x + 911, y - 377, sc / 2.3);
// tarns where the streams rise, if that's up in the heart of the mountain
const cellOf = p => { const i = Math.floor((p[0] - X0) / CELL), j = Math.floor((Y1 - p[1]) / CELL); return i < 0 || j < 0 || i >= NX || j >= NY ? -1 : j * NX + i; };
for (const s of streams) {
  const src = s.line[0], k = cellOf(src);
  if (k >= 0 && inB[k] && near[k] > 95) out.water.push({ pts: K.blobAt(src, 34, 26, rnd(0, 180)).map(p => p.map(r1)) });
}
// and a scatter of tarns across the scree, well away from play
for (let t = 0, made = 0; t < 400 && made < 5; t++) {
  const p = [MASSIF[0] + rnd(-0.75, 0.75) * R * 0.9, MASSIF[1] + rnd(-0.75, 0.75) * R], k = cellOf(p);
  if (k < 0 || !inB[k] || near[k] < 170 || out.water.some(w => Math.hypot(w.pts[0][0] - p[0], w.pts[0][1] - p[1]) < 220)) continue;
  out.water.push({ pts: K.blob(() => ({ p, u: [1, 0], v: [0, 1] }), 0, 0, rnd(28, 55), rnd(20, 38), rnd(0, 180), 26, 0.12).map(q => q.map(r1)) }); made++;
}
const wetPolys = out.water.map(w => w.pts), wet = new Uint8Array(NX * NY);
for (const poly of wetPolys) { const m = GR.fill(poly); for (let k = 0; k < m.length; k++) if (m[k]) wet[k] = 1; }
const keep = [...out.greens, ...out.tees, ...out.bunkers].map(s => s.pts), keepBox = keep.map(p => [Math.min(...p.map(q => q[0])) - 7, Math.min(...p.map(q => q[1])) - 7, Math.max(...p.map(q => q[0])) + 7, Math.max(...p.map(q => q[1])) + 7]);
const nearKeep = p => keepBox.some(b => p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3]);
// the treeline: conifers up to ~90 yards from play, broken by glades; beyond them, in the heart of the mountain, bare scree
const forest = new Uint8Array(NX * NY), scree = new Uint8Array(NX * NY), G = 14;
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const k = j * NX + i, p = [cx(i), cy(j)];
  if (!inB[k] || wet[k]) continue;
  if (near[k] > 96 + 30 * (vn(p[0], p[1], 110) - 0.5)) { if (!nearKeep(p)) scree[k] = 1; continue; }
  if (clear[k] < 7 * (vn(p[0] * 1.3, p[1] * 1.3, 40) - 0.4) || i % G === 0 || j % G === 0 || nearKeep(p)) continue;
  if (vn(p[0] + 300, p[1] - 200, 55) > 0.72) continue; // glades
  let damp = false; for (const [dx, dy] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) { const q = cellOf([p[0] + dx, p[1] + dy]); if (q >= 0 && wet[q]) damp = true; }
  if (!damp) forest[k] = 1; // trees stop short of the water
}
for (const ring of GR.pieces(scree, 400)) out.bunkers.push({ pts: chaikin(ring, 2, true).map(p => p.map(r1)) });
for (const ring of GR.pieces(forest, 18, 1, wet)) out.trees.push({ pts: chaikin(ring, 1, true).map(p => p.map(r1)) });

// ── the ground: the mountain itself, its ridges, the streams' little valleys and the high tees and pinnacles (yards) ──
const STEP = 30, cols = Math.ceil((X1 - X0) / STEP) + 1, rows = Math.ceil((Y1 - Y0) / STEP) + 1, bumps = [];
worldHoles.forEach(w => {
  for (const [d, z] of w.H.up || []) bumps.push({ p: w.W(w.sh.F(d).p), z, r: 40 });
  for (const [a, b, z, off = 0] of w.H.ridge || []) for (let d = a; d <= b; d += 25) bumps.push({ p: w.W(w.sh.F(d, off).p), z: z * 0.5, r: 28 });
});
const z = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const x = X0 + c * STEP, y = Y1 - r * STEP;
  let e = 40 + 95 * Math.exp(-(((x - MASSIF[0]) / 620) ** 2 + ((y - SUMMIT[1] + 250) / 900) ** 2) / 2) + 4 * Math.sin(x / 140) * Math.cos(y / 170);
  for (const b of bumps) e += b.z * Math.exp(-(((x - b.p[0]) ** 2 + (y - b.p[1]) ** 2) / (2 * b.r * b.r)));
  for (const s of streams) { const n = segNear([x, y], s.line); e -= 8 * Math.exp(-((n.dist / 35) ** 2)); }
  z.push(r1(e));
}
out.heights = { x0: X0, y0: Y1, step: STEP, cols, rows, z };

// ── beyond the boundary: each stream falls off the edge of the course into its waterfall's pool (named, and a hazard,
// not out of bounds); the clubhouse and the summit lodge, set just outside the course so they can be seen ──
for (const s of streams) {
  out.landmarks.push({ name: '', kind: 'water', pts: s.poly.map(p => p.map(r1)) });
  const end = s.line.at(-1), prev = s.line.at(-3), d = [end[0] - prev[0], end[1] - prev[1]], L = Math.hypot(...d);
  const c = [end[0] + d[0] / L * 30, end[1] + d[1] / L * 30];
  out.landmarks.push({ name: s.falls, kind: 'water', pts: K.blobAt(c, 42, 32, Math.atan2(d[1], d[0]) / D2R).map(p => p.map(r1)) });
}
const outside = (from, away) => { const v = [from[0] - away[0], from[1] - away[1]], L = Math.hypot(...v) || 1; return [from[0] + v[0] / L * 95, from[1] + v[1] / L * 95]; };
const house = (c, name, w, h) => out.landmarks.push({ name, kind: 'building', pts: [[c[0] - w, c[1] - h], [c[0] + w, c[1] - h], [c[0] + w, c[1] + h], [c[0] - w, c[1] + h]].map(p => p.map(r1)) });
house(outside(routed[0].tee, MASSIF), 'Clubhouse', 22, 12);
house(outside(routed[8].green, MASSIF), 'Summit Lodge', 16, 10);
out.approved = out.holes.map(h => h.n);

// stroke index: from the hardness ../fairness.js measured (SAVE=1 writes hardness.json), front odd, back even
const hardFile = path.join(__dirname, 'hardness.json');
const hard = fs.existsSync(hardFile) ? JSON.parse(fs.readFileSync(hardFile, 'utf8')) : out.holes.map(h => h.cardYds / h.par);
for (const [nine, start] of [[out.holes.slice(0, 9), 1], [out.holes.slice(9), 2]]) [...nine].sort((a, b) => hard[b.n - 1] - hard[a.n - 1]).forEach((h, i) => { h.si = start + 2 * i; });

fs.writeFileSync(path.join(__dirname, 'cloudspire.json'), JSON.stringify(out));
console.log(`Cloudspire Highlands: par ${out.par}, ${out.holes.reduce((a, h) => a + h.cardYds, 0)} yards; ${out.fairways.length} fairways, ${out.bunkers.length} bunkers, ${out.water.length} water, ${out.trees.length} tree stands, ${streams.length} streams`);
