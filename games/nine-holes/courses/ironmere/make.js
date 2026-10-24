// Ironmere Quarry: an original course, designed here rather than traced. node courses/ironmere/make.js
// Eighteen holes through a flooded slate quarry: water-filled pits, slate waste, pot bunkers, a creek,
// two island greens. Hard, but every hazard has a way round it: no forced carry longer than a 4 iron,
// every island green has a land bridge, every narrow drive has a wider lay-up short of it.
// Writes ironmere.json in the same format build.js makes for a traced course (course yards, x east, y north).
const fs = require('node:fs');
const path = require('node:path');
const DH = require('../../game.js');

const RNG = DH.rng(DH.hashStr('ironmere-quarry'));
const D2R = Math.PI / 180;
const rnd = (a, b) => a + (b - a) * RNG();
// the difficulty dials, tuned with sim.js: every green and fairway is drawn this much smaller than its spec
const HARD = { green: 0.9, fairway: 0.86 };

// ── the holes, each in its own frame: tee at the origin, +y down the hole, +x to the right ──
// legs: [length, turn°] (+ is right). Along the line, d = yards from the tee and off = yards right of it:
// fw: [from, to, halfWidth, off?]; b: bunkers [d, off, rx, ry, rot°] (rx across, ry along); w: ponds, same;
// t: tree stands, same; creek: { at: [[d, off], ...], w }; ring: pot bunkers round the green [count, radius, gap°];
// isle: water round the green { rIn, rOut, gap, half } (angles round the green: 0 = the front, 90 = right).
// gr: green [across, along] radii. up: [d, yards] raises the ground there (an elevated green, a high tee).
const HOLES = [
  { par: 4, name: 'Slate Gate', legs: [[265, 0], [200, 12]], gr: [11, 13],
    note: 'a long, narrow opener: bunkers pinch the drive at 270, pot bunkers guard the green',
    fw: [[170, 445, 14]], b: [[270, -19, 8, 15, 10], [292, 19, 8, 13, -10], [450, -13, 6, 8], [458, 13, 6, 7], [485, 6, 7, 4]] },
  { par: 5, name: 'The Causeway', legs: [[290, 0], [360, -14]], gr: [12, 14],
    note: 'out of reach in two: a narrow causeway between the pit and the slate waste, the bar bunker across the lay-up',
    fw: [[185, 300, 16], [322, 630, 12, 3]], w: [[470, -30, 18, 150], [638, -24, 14, 18]],
    b: [[460, 30, 13, 48, 4], [498, 2, 13, 4.5], [665, 15, 6, 7], [300, 22, 8, 10]] },
  { par: 3, name: 'The Pit', legs: [[192, 6]], gr: [13, 13], up: [[0, 9]], signature: true,
    note: 'downhill to an island green in the old pit; the land bridge is front right',
    isle: { rIn: 15, rOut: 50, gap: 42, half: 18 }, b: [[168, 12, 4, 4]] },
  { par: 4, name: 'Quarry Dog', legs: [[265, 0], [215, -40]], gr: [12, 13],
    note: 'dogleg left round a flooded pit: carry the corner or play out right for a long second',
    fw: [[170, 458, 14]], w: [[268, -63, 44, 60, 15]], b: [[282, 24, 9, 14], [306, 22, 8, 11], [466, 13, 6, 8], [488, -11, 5, 6]] },
  { par: 4, name: 'The Crown', legs: [[352, 4]], gr: [11, 11],
    note: 'driveable with a perfect strike, but the green sits in a crown of pot bunkers; the lay-up has a pond right',
    fw: [[150, 262, 18], [312, 334, 8]], w: [[215, 36, 17, 48]], ring: [7, 16, 0] },
  { par: 3, name: 'Slate Sea', legs: [[236, -4]], gr: [13, 14],
    note: 'all carry over a sea of slate waste; the bail-out apron is left, a pond waits right',
    fw: [[165, 220, 10, -27]], b: [[120, 2, 30, 70], [252, -10, 6, 4]], w: [[230, 28, 13, 22]] },
  { par: 5, name: 'The Serpent', legs: [[305, 10], [190, -26], [170, 22]], gr: [12, 13],
    note: 'an S down the valley; the creek crosses at 335 and again just short of the green',
    fw: [[180, 312, 15], [352, 622, 13]], creek: { at: [[327, -70], [333, -20], [339, 0], [345, 25], [335, 70]], w: 4.5 },
    creek2: { at: [[637, -55], [635, -15], [633, 0], [631, 20], [637, 55]], w: 4 },
    b: [[295, -21, 8, 12], [490, 19, 9, 13], [525, -19, 7, 10], [675, 13, 5, 6]] },
  { par: 4, name: 'The Chute', legs: [[490, 2]], gr: [12, 13], up: [[490, 9]],
    note: 'out of a chute of pines to an elevated green: the longest par 4 on the course',
    fw: [[150, 470, 15]], t: [[150, -25, 7, 55], [150, 25, 7, 55], [245, -27, 8, 30], [240, 27, 8, 30]],
    b: [[300, -19, 8, 12], [325, 19, 8, 12], [475, -13, 6, 8], [480, 13, 6, 8]] },
  { par: 4, name: 'Home Pit', legs: [[270, 0], [205, -12]], gr: [12, 13],
    note: 'water all down the left, the green on a peninsula; bail out right into the sand',
    fw: [[175, 455, 14, 3]], w: [[340, -35, 15, 140], [462, -21, 17, 20]], b: [[290, 21, 8, 12], [470, 15, 7, 9]] },

  { par: 4, name: 'Split Decision', legs: [[440, -3]], gr: [12, 13],
    note: 'a field of bunkers splits the fairway: left is shorter, right gives the better angle',
    fw: [[165, 345, 10, -17], [165, 345, 10, 17], [340, 420, 13]], b: [[235, 0, 9, 9], [268, 0, 10, 9], [302, 0, 9, 9], [445, -12, 5, 7], [452, 13, 5, 7]] },
  { par: 3, name: 'Thimble', legs: [[158, 0]], gr: [9.5, 9.5],
    note: 'the smallest green on the course in a ring of pot bunkers, water long',
    ring: [6, 13.5, 0], w: [[184, 0, 30, 10]] },
  { par: 5, name: 'The Leap', legs: [[305, 0], [315, 22]], gr: [12, 12], signature: true,
    note: 'carry the pond off the tee, then lay up right of the water or take on the long carry to the green',
    fw: [[195, 335, 15], [380, 540, 11, 32]], w: [[110, 0, 30, 60], [535, -10, 40, 48, 10]], b: [[305, -21, 8, 12], [598, 15, 6, 8]] },
  { par: 4, name: 'Long Climb', legs: [[505, -5]], gr: [12, 13], up: [[505, 13]],
    note: 'long and uphill, bunkers staggered either side of the drive',
    fw: [[165, 485, 14]], b: [[272, -19, 8, 13], [300, 19, 8, 13], [332, -18, 7, 12], [490, -14, 6, 8], [492, 14, 6, 8]] },
  { par: 4, name: 'The Hook', legs: [[250, 0], [150, 45]], gr: [11, 12],
    note: 'dogleg right round a stand of pines; water right of the green',
    fw: [[165, 380, 14]], t: [[240, 40, 30, 45]], w: [[385, 22, 14, 26]], b: [[268, -21, 8, 12], [408, -12, 5, 7]] },
  { par: 3, name: 'The Abyss', legs: [[222, 0]], gr: [12, 12], up: [[0, 6]],
    note: 'over a flooded pit; the long way round on the left is dry',
    fw: [[75, 200, 9, -46]], w: [[110, 3, 31, 72]], b: [[240, 6, 7, 4], [208, 14, 5, 6]] },
  { par: 4, name: 'Twin Pits', legs: [[465, 3]], gr: [12, 13],
    note: 'two pits squeeze the driving zone; lay up short of them for a long second',
    fw: [[165, 250, 17], [250, 350, 11], [350, 445, 14]], w: [[292, -26, 14, 34], [312, 26, 14, 34]], b: [[452, -2, 6, 4.5], [470, 14, 5, 6]] },
  { par: 5, name: 'Last Island', legs: [[300, 0], [335, -8]], gr: [12, 12], signature: true,
    note: 'the green is an island: the brave go over the water, the land bridge comes in from the lay-up on the right',
    fw: [[180, 382, 16], [430, 595, 12, 40]], isle: { rIn: 14, rOut: 56, gap: 98, half: 18 }, b: [[350, -21, 8, 12], [550, 54, 7, 10]] },
  { par: 4, name: 'The Gauntlet', legs: [[292, 0], [200, -15]], gr: [12, 13],
    note: 'water down the whole left side and in front of the green, bunkers right: hold your nerve',
    fw: [[170, 470, 14, 4]], w: [[310, -33, 16, 190], [470, -20, 16, 16]], b: [[290, 22, 8, 13], [322, 21, 8, 12], [497, 15, 6, 8]] },
];

// ── a hole's frame ──
function legsToPath(legs) {
  const pts = [[0, 0]]; let dir = 0;
  for (const [len, turn] of legs) { dir += turn * D2R; const p = pts.at(-1); pts.push([p[0] + len * Math.sin(dir), p[1] + len * Math.cos(dir)]); }
  return pts;
}
const plen = pts => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
function chaikin(pts, n, closed) {
  for (let k = 0; k < n; k++) {
    const out = closed ? [] : [pts[0]], m = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); }
    if (!closed) out.push(pts.at(-1));
    pts = out;
  }
  return pts;
}
// the along-the-line frame: a smoothed copy of the path so doglegs bend instead of kinking
function frameOf(raw) {
  const sm = chaikin(raw, 4, false), cum = [0];
  for (let i = 1; i < sm.length; i++) cum.push(cum[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]));
  const L = cum.at(-1), scale = plen(raw) / L; // d is measured on the raw line (the card length)
  return (d, off = 0) => {
    const s = Math.max(0, Math.min(L, d / scale));
    let i = 1; while (i < sm.length - 1 && cum[i] < s) i++;
    const a = sm[i - 1], b = sm[i], t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const v = [(b[0] - a[0]) / len, (b[1] - a[1]) / len], u = [v[1], -v[0]]; // u: to the right
    const over = d / scale - s; // past the end: carry straight on
    return { p: [a[0] + (b[0] - a[0]) * t + u[0] * off + v[0] * over, a[1] + (b[1] - a[1]) * t + u[1] * off + v[1] * over], u, v };
  };
}
// an ellipse in the frame at (d, off): rx across the line, ry along it, a little wobble so it isn't a stamp
function blob(F, d, off, rx, ry, rot = 0, n = 22, wob = 0.08) {
  const { p, u, v } = F(d, off), c = Math.cos(rot * D2R), s = Math.sin(rot * D2R), out = [], ph = rnd(0, 6.28), ph2 = rnd(0, 6.28);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 2 * Math.PI, k = 1 + wob * Math.sin(3 * a + ph) + wob * 0.6 * Math.sin(5 * a + ph2);
    const ex = Math.cos(a) * rx * k, ey = Math.sin(a) * ry * k, x = ex * c - ey * s, y = ex * s + ey * c;
    out.push([p[0] + u[0] * x + v[0] * y, p[1] + u[1] * x + v[1] * y]);
  }
  return out;
}
// a fairway: the strip from..to along the line, rounded at both ends, its width breathing a little
function strip(F, a, b, w, off = 0) {
  const left = [], right = [], ph = rnd(0, 6.28), ww = d => w * (1 + 0.07 * Math.sin(d / 23 + ph));
  for (let d = a; d <= b + 0.01; d += 5) { const { p, u } = F(d, off), k = ww(d); left.push([p[0] - u[0] * k, p[1] - u[1] * k]); right.push([p[0] + u[0] * k, p[1] + u[1] * k]); }
  const cap = (d, sgn) => { const { p, u, v } = F(d, off), k = ww(d), out = []; for (let i = 1; i < 6; i++) { const t = (i / 6) * Math.PI, x = -Math.cos(t) * k, y = Math.sin(t) * k * 0.8 * sgn; out.push([p[0] + u[0] * x + v[0] * y, p[1] + u[1] * x + v[1] * y]); } return out; };
  return chaikin([...left, ...cap(b, 1), ...right.reverse(), ...cap(a, -1).reverse()], 1, true);
}
function creek(F, at, w) {
  const line = chaikin(at.map(([d, off]) => F(d, off).p), 3, false), L = [], R = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)], len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, n = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len], k = w * (1 + 0.15 * Math.sin(i * 0.7));
    L.push([line[i][0] - n[0] * k, line[i][1] - n[1] * k]); R.push([line[i][0] + n[0] * k, line[i][1] + n[1] * k]);
  }
  return [...L, ...R.reverse()];
}
// round the green: angle 0 is the front (towards the tee), 90 the right
const aroundGreen = (F, L, ang, r) => { const { p, u, v } = F(L), a = ang * D2R; return [p[0] - v[0] * Math.cos(a) * r + u[0] * Math.sin(a) * r, p[1] - v[1] * Math.cos(a) * r + u[1] * Math.sin(a) * r]; };
function isleWater(F, L, { rIn, rOut, gap, half }) {
  const outer = [], inner = [];
  for (let ang = gap + half; ang <= gap + 360 - half + 0.01; ang += 6) {
    const wob = 1 + 0.06 * Math.sin(ang * D2R * 3);
    outer.push(aroundGreen(F, L, ang, rOut * wob)); inner.push(aroundGreen(F, L, ang, rIn));
  }
  return [...outer, ...inner.reverse()];
}

// every hole's shapes in its own frame
function holeShapes(H) {
  const raw = legsToPath(H.legs), L = plen(raw), F = frameOf(raw), S = { fairways: [], bunkers: [], water: [], trees: [] };
  for (const x of H.b || []) S.bunkers.push(blob(F, ...x.slice(0, 4), x[4] || 0, 18, 0.1));
  for (const x of H.w || []) S.water.push(blob(F, ...x.slice(0, 4), x[4] || 0, 28, 0.07));
  for (const x of H.t || []) S.trees.push(blob(F, ...x.slice(0, 4), x[4] || 0, 16, 0.12));
  for (const c of [H.creek, H.creek2].filter(Boolean)) S.water.push(creek(F, c.at, c.w));
  if (H.ring) { const [n, r, gap] = H.ring; for (let i = 0; i < n; i++) { const ang = gap + 360 / n * (i + 0.5); S.bunkers.push(blobAt(aroundGreen(F, L, ang, r), 4.2, 3.6, ang)); } }
  if (H.isle) S.water.push(isleWater(F, L, H.isle));
  // fairways stop short of water: each spec is cut into its dry runs, ends (and their round caps) 3 yards clear
  const pip = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const wetAt = p => S.water.some(w => pip(p, w));
  for (const [a, b, w0, off = 0] of H.fw || []) {
    const w = Math.max(9, w0 * HARD.fairway), cap = 0.8 * w + 3, end = Math.min(b, L - 8), dry = [];
    for (let d = a - cap; d <= end + cap; d += 2) { const { p, u } = F(d, off); dry.push({ d, ok: [-1.2, -0.6, 0, 0.6, 1.2].every(k => !wetAt([p[0] + u[0] * w * k, p[1] + u[1] * w * k])) }); }
    let run = null;
    for (const s of [...dry, { d: Infinity, ok: false }]) {
      if (s.ok) { run = run || { from: s.d }; run.to = s.d; continue; }
      if (run) { const lo = Math.max(a, run.from + cap), hi = Math.min(end, run.to - cap); if (hi - lo >= 20) S.fairways.push(strip(F, lo, hi, w, off)); run = null; }
    }
  }
  const g = F(L), green = [];
  const [gx, gy] = H.gr.map(r => Math.max(9, r * HARD.green));
  for (let i = 0; i < 28; i++) { const a = (i / 28) * 2 * Math.PI, k = 1 + 0.05 * Math.sin(2 * a + 1); green.push([g.p[0] + (g.u[0] * Math.cos(a) * gx + g.v[0] * Math.sin(a) * gy) * k, g.p[1] + (g.u[1] * Math.cos(a) * gx + g.v[1] * Math.sin(a) * gy) * k]); }
  const t0 = F(0), tee = [[-6, -4], [6, -4], [6, 4], [-6, 4]].map(([x, y]) => [t0.u[0] * x + t0.v[0] * y, t0.u[1] * x + t0.v[1] * y]);
  // the walk to the next tee: past the moat after an island green
  const after = H.isle ? H.isle.rOut + 24 : 34;
  return { raw, L, F, ...S, green, tee, pin: g.p, after, widthAt: d => Math.max(14, ...(H.fw || []).filter(([a, b]) => d >= a - 15 && d <= b + 15).map(([, , w, off]) => w + Math.abs(off || 0))) };
}
function blobAt(c, rx, ry, rotDeg) {
  const out = [], r = rotDeg * D2R;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)]); }
  return out;
}

// ── routing: two loops of nine round the clubhouse at (0, 0), placed hole by hole so no two holes
// come within SEP yards of each other (their corridors never touch) ──
const SEP = 95;
const toWorld = (tee, h) => ([x, y]) => [tee[0] + x * Math.cos(h) + y * Math.sin(h), tee[1] - x * Math.sin(h) + y * Math.cos(h)];
const samples = (sh, W) => { const out = []; for (let d = 0; d <= sh.L; d += 10) out.push({ d, p: W(sh.F(d).p) }); return out; };
function route(shapes, nineStart, centre, radius, sense, firstTee) {
  const total = shapes.reduce((a, s) => a + s.L + 40, 0);
  const ang0 = Math.atan2(-centre[1], -centre[0]);
  let cum = 0; const targets = shapes.map((s, i) => { cum += s.L + 40; const a = ang0 + sense * 2 * Math.PI * cum / total; return i === shapes.length - 1 ? [Math.sign(-centre[0]) * -60, 55] : [centre[0] + radius * Math.cos(a), centre[1] + radius * Math.sin(a)]; });
  let best = null, tries = 0;
  const dfs = (i, placed, prevGreen, others) => {
    if (++tries > 40000 || best) return;
    if (i === shapes.length) { best = placed.slice(); return; }
    const sh = shapes[i], cands = [];
    for (let deg = 0; deg < 360; deg += 5) {
      const h = deg * D2R, tee = i === 0 ? firstTee : [prevGreen[0] + shapes[i - 1].after * Math.sin(h), prevGreen[1] + shapes[i - 1].after * Math.cos(h)], W = toWorld(tee, h), smp = samples(sh, W);
      const green = W(sh.pin);
      let ok = true;
      if (i > 0) { // never a tee in or beside the last hole's water (the pond behind a green, an island's moat)
        const pw = shapes[i - 1].water.map(poly => poly.map(placed[i - 1].W)), pip = (p, poly) => { let c = false; for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) { const [xi, yi] = poly[a], [xj, yj] = poly[b]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
        for (let k = 0; k < 8 && ok; k++) { const q = [tee[0] + 10 * Math.cos(k * Math.PI / 4), tee[1] + 10 * Math.sin(k * Math.PI / 4)]; if (pw.some(poly => pip(q, poly) || pip(tee, poly))) ok = false; }
      }
      for (const o of others) {
        for (const a of smp) { for (const b of o.smp) {
          const dd = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
          // a green and the next tee sit together, and so do the four ends of the nines at the clubhouse
          const joint = (o.idx === i - 1 + nineStart && a.d < 80 && o.L - b.d < 80) || (Math.hypot(a.p[0], a.p[1]) < 150 && Math.hypot(b.p[0], b.p[1]) < 150);
          if (dd < (joint ? 26 : SEP)) { ok = false; break; }
        } if (!ok) break; }
        if (!ok) break;
      }
      // keep clear of the clubhouse except the first tee and the last green of each nine
      if (ok) for (const a of smp) { const dc = Math.hypot(a.p[0], a.p[1]); if (dc < 70 && !((i === 0 && a.d < 90) || (i === shapes.length - 1 && sh.L - a.d < 90))) { ok = false; break; } }
      if (ok) cands.push({ h, tee, W, smp, green, cost: Math.hypot(green[0] - targets[i][0], green[1] - targets[i][1]) });
    }
    cands.sort((a, b) => a.cost - b.cost);
    for (const c of cands.slice(0, 5)) {
      if (i === shapes.length - 1 && c.cost > 130) continue;
      placed.push(c);
      dfs(i + 1, placed, c.green, [...others, { idx: i + nineStart, smp: c.smp, L: sh.L }]);
      placed.pop();
      if (best) return;
    }
  };
  return { dfs: (others) => { best = null; tries = 0; dfs(0, [], null, others); return best; } };
}

const shapes = HOLES.map(holeShapes);
let front = null, back = null;
for (const R of [620, 660, 700, 740, 580, 780]) {
  front = route(shapes.slice(0, 9), 0, [-R - 40, 160], R, -1, [-30, 18]).dfs([]);
  if (!front) continue;
  const others = front.map((c, i) => ({ idx: i, smp: c.smp, L: shapes[i].L }));
  back = route(shapes.slice(9), 9, [R + 40, 160], R, 1, [30, 18]).dfs(others);
  if (back) { console.log('routed with loop radius', R); break; }
}
if (!front || !back) throw new Error('could not route the course');
const placed = [...front, ...back];

// ── into course yards ──
const r1 = v => Math.round(v * 10) / 10, pts = (list, W) => list.map(W).map(p => p.map(r1));
const out = { id: 'ironmere', name: 'Ironmere Quarry', par: 0, boundary: [], holes: [], greens: [], tees: [], fairways: [], bunkers: [], water: [], trees: [], cart: [], benches: [], heights: null, approved: [], turnAfter: 9, landmarks: [] };
const worldHoles = [];
placed.forEach((c, i) => {
  const H = HOLES[i], sh = shapes[i], W = c.W;
  out.holes.push({ n: i + 1, par: H.par, si: 0, cardYds: Math.round(sh.L), path: pts(sh.raw, W), note: `${H.name}: ${H.note}`, hidden: false, signature: !!H.signature });
  out.greens.push({ hole: i + 1, pts: pts(sh.green, W) });
  out.tees.push({ hole: i + 1, pts: pts(sh.tee, W) });
  for (const f of sh.fairways) out.fairways.push({ hole: i + 1, pts: pts(f, W) });
  for (const b of sh.bunkers) out.bunkers.push({ pts: pts(b, W) });
  for (const w of sh.water) out.water.push({ pts: pts(w, W) });
  for (const t of sh.trees) out.trees.push({ pts: pts(t, W) });
  const t0 = sh.F(0); out.benches.push(W([-t0.u[0] * 10, -t0.u[1] * 10]).map(r1));
  worldHoles.push({ H, sh, W, raw: sh.raw.map(W) });
});
out.par = out.holes.reduce((a, h) => a + h.par, 0);

// ── rasters at 3-yard cells: the boundary (everything near play) and the pines between the holes ──
const CELL = 3, all = worldHoles.flatMap(w => w.raw);
const X0 = Math.min(...all.map(p => p[0])) - 160, X1 = Math.max(...all.map(p => p[0])) + 160, Y0 = Math.min(...all.map(p => p[1])) - 160, Y1 = Math.max(...all.map(p => p[1])) + 160;
const NX = Math.ceil((X1 - X0) / CELL), NY = Math.ceil((Y1 - Y0) / CELL), cx = i => X0 + (i + 0.5) * CELL, cy = j => Y1 - (j + 0.5) * CELL;
const segNear = (p, line) => { let best = { dist: Infinity, d: 0 }, acc = 0; for (let k = 1; k < line.length; k++) { const a = line[k - 1], b = line[k], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), q = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); if (q < best.dist) best = { dist: q, d: acc + t * Math.sqrt(L2) }; acc += Math.sqrt(L2); } return best; };
const inPoly = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const near = new Float32Array(NX * NY).fill(1e9), clear = new Float32Array(NX * NY).fill(1e9);
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const p = [cx(i), cy(j)];
  for (const w of worldHoles) {
    const n = segNear(p, w.raw), k = j * NX + i;
    near[k] = Math.min(near[k], n.dist);
    clear[k] = Math.min(clear[k], n.dist - w.sh.widthAt(n.d) - 15); // < 0: inside the hole's playing corridor
  }
  near[j * NX + i] = Math.min(near[j * NX + i], Math.hypot(p[0], p[1]) - 30);
}
// the boundary: within 72 yards of play, gaps closed, outlined
const inside = new Uint8Array(NX * NY); for (let k = 0; k < inside.length; k++) inside[k] = near[k] < 72 ? 1 : 0;
const outline = (mask, W, H) => { // Moore-neighbour trace of the first piece, then Douglas-Peucker
  const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
  const s = mask.findIndex(v => v), sx = s % W, sy = (s / W) | 0, ring = [[sx, sy]]; let x = sx, y = sy, dir = 0;
  for (let g = 0; g < 400000; g++) { let k = 0; for (; k < 8; k++) { const d = (dir + 6 + k) % 8; if (on(x + D8[d][0], y + D8[d][1])) { dir = d; break; } } if (k === 8) break; x += D8[dir][0]; y += D8[dir][1]; if (x === sx && y === sy) break; ring.push([x, y]); }
  const dp = (p, eps) => { if (p.length < 3) return p; const a = p[0], b = p.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let best = 0, at = 0; for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > best) { best = d; at = i; } } return best <= eps ? [a, b] : [...dp(p.slice(0, at + 1), eps).slice(0, -1), ...dp(p.slice(at), eps)]; };
  return dp(ring, 0.9);
};
out.boundary = chaikin(outline(inside, NX, NY).map(([i, j]) => [cx(i), cy(j)]), 2, true).map(p => p.map(r1));
// the pines: outside every hole's corridor (which breathes with a little noise), off the water, sand, greens and tees
const hazards = [...out.water, ...out.bunkers, ...out.greens, ...out.tees].map(s => s.pts);
const hBox = hazards.map(p => [Math.min(...p.map(q => q[0])) - 8, Math.min(...p.map(q => q[1])) - 8, Math.max(...p.map(q => q[0])) + 8, Math.max(...p.map(q => q[1])) + 8]);
const noise = (x, y) => Math.sin(x / 37 + 1.3) * Math.cos(y / 41 - 0.7) + 0.5 * Math.sin((x + y) / 19);
// the flooded pits: inside each loop, everything more than ~84 yards from play is deep water
const inB = new Uint8Array(NX * NY); // inside the boundary outline (the loops' middles too), by scanline
for (let j = 0; j < NY; j++) {
  const y = cy(j), xs = [], B = out.boundary;
  for (let a = 0, b = B.length - 1; a < B.length; b = a++) if ((B[a][1] > y) !== (B[b][1] > y)) xs.push(B[a][0] + (y - B[a][1]) * (B[b][0] - B[a][0]) / (B[b][1] - B[a][1]));
  xs.sort((p, q) => p - q);
  for (let s = 0; s + 1 < xs.length; s += 2) for (let i = Math.max(0, Math.ceil((xs[s] - X0) / CELL - 0.5)); i <= Math.min(NX - 1, Math.floor((xs[s + 1] - X0) / CELL - 0.5)); i++) inB[j * NX + i] = 1;
}
const lake = new Uint8Array(NX * NY);
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i; lake[k] = inB[k] && near[k] > 84 + 7 * noise(cx(i) * 0.6, cy(j) * 0.6) ? 1 : 0; }
const pines = new Uint8Array(NX * NY), G = 14; // cut into 42-yard pieces so no stand's outline wraps round a fairway
for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
  const k = j * NX + i, p = [cx(i), cy(j)];
  if (!inB[k] || lake[k] || clear[k] < 6 * noise(p[0], p[1]) || near[k] > 80 || i % G === 0 || j % G === 0) continue;
  if (noise(p[0] * 1.7, p[1] * 1.7) > 1.15) continue; // glades
  let wet = false; for (let h = 0; h < hazards.length && !wet; h++) { const b = hBox[h]; if (p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3] && (inPoly(p, hazards[h]) || inPoly([p[0] + 6, p[1]], hazards[h]) || inPoly([p[0] - 6, p[1]], hazards[h]) || inPoly([p[0], p[1] + 6], hazards[h]) || inPoly([p[0], p[1] - 6], hazards[h]))) wet = true; }
  if (!wet) pines[k] = 1;
}
const pieces = (mask, min, grow = 0) => { // 4-connected pieces of a mask, each outlined (grown by `grow` cells, so cut pieces overlap and the seams close)
  const seen = new Uint8Array(NX * NY), rings = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    const comp = [s]; seen[s] = 1;
    for (let q = 0; q < comp.length; q++) { const k = comp[q], x = k % NX, y = (k / NX) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < NX && ny < NY && mask[ny * NX + nx] && !seen[ny * NX + nx]) { seen[ny * NX + nx] = 1; comp.push(ny * NX + nx); } } }
    if (comp.length < min) continue;
    const m = new Uint8Array(NX * NY); for (const k of comp) m[k] = 1;
    for (let g = 0; g < grow; g++) for (const k of comp) for (const o of [1, -1, NX, -NX, NX + 1, NX - 1, -NX + 1, -NX - 1]) if (k + o >= 0 && k + o < m.length && !lake[k + o]) m[k + o] = 1;
    const ring = outline(m, NX, NY);
    if (ring.length >= 4) rings.push(ring.map(([i, j]) => [cx(i), cy(j)]));
  }
  return rings;
};
for (const ring of pieces(lake, 3000)) out.water.push({ pts: chaikin(ring, 2, true).map(p => p.map(r1)) });
for (const ring of pieces(pines, 18, 1)) out.trees.push({ pts: chaikin(ring, 1, true).map(p => p.map(r1)) });

// ── the ground: rolling, with the high tees and raised greens the holes ask for (yards) ──
const STEP = 30, hx0 = X0, hy0 = Y1, cols = Math.ceil((X1 - X0) / STEP) + 1, rows = Math.ceil((Y1 - Y0) / STEP) + 1, bumps = [];
worldHoles.forEach(w => (w.H.up || []).forEach(([d, z]) => bumps.push({ p: w.W(w.sh.F(d).p), z })));
const z = [];
for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
  const x = hx0 + c * STEP, y = hy0 - r * STEP;
  let e = 60 + 7 * Math.sin(x / 210) + 6 * Math.cos(y / 260 + 1) + 3 * Math.sin((x + y) / 130);
  for (const b of bumps) e += b.z * Math.exp(-(((x - b.p[0]) ** 2 + (y - b.p[1]) ** 2) / (2 * 45 * 45)));
  z.push(r1(e));
}
out.heights = { x0: hx0, y0: hy0, step: STEP, cols, rows, z };

// ── the clubhouse, where the four nines meet ──
out.landmarks.push({ name: 'Clubhouse', kind: 'building', pts: [[-22, -12], [22, -12], [22, 12], [-22, 12]] });
out.approved = out.holes.map(h => h.n);

// stroke index: from the hardness the fairness bot measured (sim.js writes hardness.json), front odd, back even
const hardFile = path.join(__dirname, 'hardness.json');
const hard = fs.existsSync(hardFile) ? JSON.parse(fs.readFileSync(hardFile, 'utf8')) : out.holes.map(h => h.cardYds / h.par);
for (const [nine, start] of [[out.holes.slice(0, 9), 1], [out.holes.slice(9), 2]]) [...nine].sort((a, b) => hard[b.n - 1] - hard[a.n - 1]).forEach((h, i) => { h.si = start + 2 * i; });

fs.writeFileSync(path.join(__dirname, 'ironmere.json'), JSON.stringify(out));
console.log(`Ironmere Quarry: par ${out.par}, ${out.holes.reduce((a, h) => a + h.cardYds, 0)} yards; ${out.fairways.length} fairways, ${out.bunkers.length} bunkers, ${out.water.length} water, ${out.trees.length} tree stands`);
