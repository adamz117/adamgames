// Golf sim core: pure and deterministic from a seed string, so two players on the same seed get the
// same course and the same shot outcomes. Units are yards. Angles: 0 = straight up the hole (+y),
// positive = clockwise (towards +x).
(function (root) {
'use strict';

const rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const dirOf = a => ({ x: Math.sin(a), y: Math.cos(a) });
const rightOf = a => ({ x: Math.cos(a), y: -Math.sin(a) });
const add = (p, v, k = 1) => ({ x: p.x + v.x * k, y: p.y + v.y * k });
const lerp = (a, b, t) => a + (b - a) * t;
const q4 = x => Math.round(x * 1e4) / 1e4; // inputs are rounded so a logged shot replays exactly

function hashStr(s) { // FNV-1a
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = r => (r() + r() + r() - 1.5) / 0.5; // unit standard deviation

// carry: full pure strike at the bottom of the pure band. disp: sideways spread (deg sd).
// fan: how far the aim line sweeps either side (deg). sweep: aim sweep period (s).
// climb: seconds for the power needle to rise from empty to the top.
const CLUBS = [
  { id: 'DR', name: 'Driver',   carry: 278, roll: 26, disp: 1.17, fan: 11.0, sweep: 2.05, climb: 1.32 },
  { id: '3W', name: '3 Wood',   carry: 243, roll: 20, disp: 1.07, fan: 10.2, sweep: 2.10, climb: 1.38 },
  { id: '5W', name: '5 Wood',   carry: 221, roll: 16, disp: 0.97, fan: 9.6,  sweep: 2.15, climb: 1.43 },
  { id: '4i', name: '4 Iron',   carry: 199, roll: 13, disp: 0.90, fan: 9.0,  sweep: 2.20, climb: 1.47 },
  { id: '6i', name: '6 Iron',   carry: 179, roll: 10, disp: 0.80, fan: 8.5,  sweep: 2.25, climb: 1.51 },
  { id: '8i', name: '8 Iron',   carry: 156, roll: 7,  disp: 0.70, fan: 8.0,  sweep: 2.32, climb: 1.55 },
  { id: 'PW', name: 'Pitching', carry: 131, roll: 5,  disp: 0.63, fan: 7.4,  sweep: 2.38, climb: 1.60 },
  { id: 'SW', name: 'Sand',     carry: 97,  roll: 3,  disp: 0.57, fan: 6.9,  sweep: 2.44, climb: 1.66 },
  { id: 'LW', name: 'Lob',      carry: 63,  roll: 2,  disp: 0.50, fan: 6.3,  sweep: 2.50, climb: 1.72 },
];

// Playing from a lie: dist = carry kept, acc = spread multiplier, roll = rollout kept.
const LIE = {
  tee:     { dist: 1.00, acc: 1.00, roll: 1.00, label: 'TEE' },
  fairway: { dist: 1.00, acc: 1.00, roll: 1.00, label: 'FAIRWAY' },
  green:   { dist: 1.00, acc: 1.00, roll: 1.00, label: 'GREEN' },
  rough:   { dist: 0.84, acc: 1.75, roll: 0.80, label: 'ROUGH' },
  deep:    { dist: 0.62, acc: 2.45, roll: 0.60, label: 'DEEP ROUGH' },
  bunker:  { dist: 0.70, acc: 1.90, roll: 0.50, label: 'BUNKER', maxCarry: 160 },
  leaves:  { dist: 0.70, acc: 1.90, roll: 0.50, label: 'PILE OF LEAVES', maxCarry: 160 },
  cart:    { dist: 0.92, acc: 1.55, roll: 1.00, label: 'CART PATH' },
  bridge:  { dist: 0.94, acc: 1.45, roll: 1.00, label: 'THE BRIDGE' },
  portal:  { dist: 1.00, acc: 1.00, roll: 1.00, label: 'PORTAL GREEN' },
  trees:   { dist: 0.62, acc: 2.45, roll: 0.60, label: 'TREES' },
};
// How far a ball runs over each surface, relative to its budget (fairway = baseline 1.45).
const SURF_ROLL = { tee: 1.25, fairway: 1.45, green: 2.10, rough: 0.30, deep: 0.14, bunker: 0.07, leaves: 0.07, water: 0, ob: 0.5,
                    cart: 3.0, bridge: 5.2, portal: 0.18, trees: 0.14 };

const PURE_LO = 0.945, PURE_HI = 1.0, SOLID = 0.72, METER_MAX = 1.15;
const HOLE_R = 0.36;        // cup capture radius for a running ball, yards
const ISLAND_BANK = 28;     // playable deep rough past an island green's lake
const PORTAL_ADVANCE = 430; // how far a portal carries you on a hole too long to reach the green
const CHIP_YDS = 20;        // a chip: this close to the pin (the needle slows, and a chip struck in the band is tidy)

// The pure-band bonus ramps across the band so carry never steps backwards as the meter rises.
function smash(v) {
  if (v < PURE_LO) return 1;
  if (v <= PURE_HI) return 1 + 0.08 * (v - PURE_LO) / (PURE_HI - PURE_LO);
  return 1.08;
}
// Fraction of a club's full carry for meter position v. Past full, meter buys only 35% as much.
const carryFactor = v => (Math.min(v, 1) + Math.max(0, v - 1) * 0.35) * smash(v);
// Inverse of carryFactor by bisection: what meter position carries `frac` of the club's number?
function powerFor(frac) {
  let lo = 0.02, hi = METER_MAX;
  for (let i = 0; i < 34; i++) { const m = (lo + hi) / 2; if (carryFactor(m) < frac) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
const grade = v => v > PURE_HI + 0.005 ? 'overswing' : v >= PURE_LO ? 'pure' : v >= SOLID ? 'solid' : 'controlled';
// Needle positions over time, for the two timing taps.
const powerAt = (club, sec) => { const ph = (sec / (club.climb * 2)) % 1; return (ph < 0.5 ? ph * 2 : (1 - ph) * 2) * METER_MAX; };
const aimAt = (center, club, sec) => center + rad(club.fan) * Math.sin(sec * 2 * Math.PI / club.sweep);

// ── geometry ──
function nearest(p, pts) {
  let best = Infinity, point = pts[0], along = 0, acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, L = Math.sqrt(L2);
    const t = L2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1) : 0;
    const px = a.x + dx * t, py = a.y + dy * t, d = Math.hypot(p.x - px, p.y - py);
    if (d < best) { best = d; point = { x: px, y: py }; along = acc + L * t; }
    acc += L;
  }
  return { dist: best, point, along, total: acc };
}
function pointAt(pts, s) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], L = dist(a, b);
    if (acc + L >= s) { const t = (s - acc) / L; return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) }; }
    acc += L;
  }
  return pts[pts.length - 1];
}
// Unit normal (to the right of travel) at distance s, from the line a yard either side.
function normalAt(pts, s) {
  const a = pointAt(pts, Math.max(0, s - 1)), b = pointAt(pts, s + 1), L = dist(a, b) || 1;
  return { x: (b.y - a.y) / L, y: -(b.x - a.x) / L };
}
// Unit direction of travel along a path at distance s.
function tangentAt(pts, s) {
  const a = pointAt(pts, Math.max(0, s - 3)), b = pointAt(pts, s + 3), L = dist(a, b) || 1;
  return { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
}
function inEllipse(p, e) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot), dx = p.x - e.x, dy = p.y - e.y;
  const u = (dx * c + dy * s) / e.rx, v = (-dx * s + dy * c) / e.ry;
  return u * u + v * v <= 1;
}

// ── course generation ──
const NAME_A = ['Birch', 'Heather', 'Osprey', 'Flint', 'Marsh', 'Juniper', 'Copper', 'Willow', 'Granite', 'Sorrel', 'Bracken', 'Pike', 'Lark', 'Ash'];
const NAME_B = ['wood', 'hollow', 'ford', 'crest', 'haven', 'brook', 'field', 'moor', 'leigh', 'stone', 'mere', 'wick'];
const NAME_C = ['Links', 'Golf Club', 'Downs', 'Heath', 'Park', 'Common'];
const PAR_MIX = [[3,3,4,4,4,4,4,5,5], [3,3,4,4,4,4,4,4,5], [3,3,3,4,4,4,4,5,5], [3,4,4,4,4,4,4,5,5],
                 [3,3,4,4,4,4,5,5,5], [3,3,4,4,4,4,4,5,6], [3,3,4,4,4,4,5,5,6], [3,3,4,4,4,4,4,4,7]];

function makeHole(r, par, idx, dayWind, dayGust) {
  const len = par === 3 ? 132 + r() * 82 : par === 4 ? 302 + r() * 140 : par === 5 ? 468 + r() * 118
            : par === 6 ? 780 + r() * 140 : 1030 + r() * 170;
  // Centreline: straight for par 3s, bending one to three times otherwise.
  const bends = par === 3 ? 0 : par >= 6 ? (r() < 0.5 ? 3 : 2) : (r() < 0.42 ? 2 : 1);
  const path = [{ x: 0, y: 0 }];
  let heading = 0, at = 0;
  for (let b = 0; b < bends; b++) {
    const seg = len * (b === 0 ? (bends === 1 ? 0.55 + r() * 0.15 : 0.36 + r() * 0.10) : 0.30 + r() * 0.10);
    path.push(add(path[path.length - 1], dirOf(heading), seg)); at += seg;
    heading += (r() < 0.5 ? -1 : 1) * rad(11 + r() * 20);
  }
  path.push(add(path[path.length - 1], dirOf(heading), len - at));

  const fw = par === 3 ? 12 + r() * 4 : 12 + r() * 5; // half-widths
  const rgh = fw + 12 + r() * 8;
  const deep = rgh + 11 + r() * 7;
  const green = path[path.length - 1];
  const gr = par === 3 ? 11 + r() * 3 : par === 5 ? 12 + r() * 4 : 11.5 + r() * 3.5;
  const pinA = r() * Math.PI * 2, pinR = gr * (0.15 + r() * 0.5);
  const pin = { x: green.x + Math.cos(pinA) * pinR, y: green.y + Math.sin(pinA) * pinR };

  const bunkers = [], water = [];
  const nB = (par === 3 ? 1 : 2) + ((r() * 2.4) | 0) + (par >= 6 ? 2 : 0) + (par >= 7 ? 1 : 0);
  for (let i = 0; i < nB; i++) {
    const greenside = i < 2 && r() < (par === 3 ? 0.9 : 0.5);
    const s = Math.min(len, greenside ? len - r() * 4 : len * (0.42 + r() * 0.42));
    const c = pointAt(path, s), n = normalAt(path, s), side = r() < 0.5 ? -1 : 1;
    const off = greenside ? gr + 3 + r() * 5 : fw + 1 + r() * 7;
    bunkers.push({ ...add(c, n, off * side), rx: 5 + r() * 6, ry: 3.4 + r() * 3.4, rot: r() * Math.PI });
  }
  for (let wi = 0; wi < (par >= 7 ? 2 : 1); wi++) if (r() < (par >= 6 ? 0.62 : 0.36)) {
    const s = len * (par === 3 ? 0.42 + r() * 0.2 : 0.52 + r() * 0.3);
    const c = pointAt(path, s), n = normalAt(path, s), side = r() < 0.5 ? -1 : 1;
    const rx = 11 + r() * 13, ry = 8 + r() * 12;
    water.push({ ...add(c, n, (fw + 7 + r() * 9 + Math.max(rx, ry) * 0.55) * side), rx, ry, rot: r() * Math.PI });
  }
  // Trees in the deep band are drawn only: the band itself is the hazard.
  const trees = [];
  for (let i = 0; i < 170; i++) {
    const s = r() * len, c = pointAt(path, s), n = normalAt(path, s);
    const t = { ...add(c, n, (rgh + 2 + r() * (deep - rgh + 16)) * (r() < 0.5 ? -1 : 1)), r: 1.6 + r() * 2.6 };
    if (nearest(t, path).dist > rgh + 1) trees.push(t);
  }
  return {
    index: idx + 1, par, len: Math.round(len), total: len, path, fw, rgh, deep, green, gr, pin, bunkers, water, trees,
    leafPiles: [], boulders: [], lavaRocks: [],
    wind: dayWind + (r() - 0.5) * 1.1, wspd: Math.max(1, dayGust + (r() - 0.5) * 7),
    slopeDir: r() * Math.PI * 2, slopePct: 0.010 + r() * 0.034,
  };
}

// ── the special hazards ──

// The burn: a river cut across the fairway on a hard diagonal, so "how much do I carry" is a
// sliding scale. Placed by yardage from the tee and kept 90 yards short of the green.
function makeBurn(r, h) {
  const s = Math.min(215 + r() * 55, h.len - 90);
  const c = pointAt(h.path, s), nrm = normalAt(h.path, s);
  const lean = (0.52 + r() * 0.40) * (r() < 0.5 ? -1 : 1); // 30 to 53 degrees
  const cs = Math.cos(lean), sn = Math.sin(lean);
  const dir = { x: nrm.x * cs - nrm.y * sn, y: nrm.x * sn + nrm.y * cs }, per = { x: -dir.y, y: dir.x };
  const L = (h.deep + 40) / Math.max(0.4, cs); // spans the whole corridor even when leaned: no way round
  const w = 8.6 + r() * 1.7;                   // half-width: 17 to 21 yards bank to bank
  const pts = [], ph = r() * 6.2832, amp = 3.4 + r() * 3.4;
  for (let i = 0; i < 5; i++) { // a lazy wander, so it reads as a river rather than a ditch
    const t = -1 + i / 2, off = Math.sin(ph + t * 2.3) * amp * (1 - Math.abs(t) * 0.25);
    pts.push({ x: c.x + dir.x * L * t + per.x * off, y: c.y + dir.y * L * t + per.y * off });
  }
  return { pts, w, at: Math.round(s) };
}
// Where the cart path crosses the burn, if it does.
function burnCartHit(h) {
  if (!h.burn || !h.cart) return null;
  const C = h.cart, B = h.burn.pts;
  for (let i = 0; i < C.length - 1; i++) {
    const p = C[i], q = C[i + 1], rr = { x: q.x - p.x, y: q.y - p.y };
    for (let j = 0; j < B.length - 1; j++) {
      const a = B[j], b = B[j + 1], v = { x: b.x - a.x, y: b.y - a.y }, den = rr.x * v.y - rr.y * v.x;
      if (!den) continue;
      const t = ((a.x - p.x) * v.y - (a.y - p.y) * v.x) / den, u = ((a.x - p.x) * rr.y - (a.y - p.y) * rr.x) / den;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const L = Math.hypot(rr.x, rr.y) || 1;
      return { p: { x: p.x + rr.x * t, y: p.y + rr.y * t }, d: { x: rr.x / L, y: rr.y / L } };
    }
  }
  return null;
}
// Half of all burns get a bridge near the middle; it steps clear of the cart path's own deck.
function placeBridge(r, h) {
  const keep = r() < 0.5, pts = h.burn.pts, w = h.burn.w;
  const a = pts[1], b = pts[3], seg = dist(a, b), d = { x: (b.x - a.x) / seg, y: (b.y - a.y) / seg };
  const half = 7 + r() * 2, span = w + 12 + r() * 4;
  let shift = (r() - 0.5) * 32;
  if (!keep) return;
  const hit = burnCartHit(h);
  if (hit) {
    const along = (hit.p.x - pts[2].x) * d.x + (hit.p.y - pts[2].y) * d.y, need = half + 11;
    if (Math.abs(shift - along) < need) shift = Math.abs(along - need) <= Math.abs(along + need) ? along - need : along + need;
  }
  h.burn.bridge = { c: nearest({ x: pts[2].x + d.x * shift, y: pts[2].y + d.y * shift }, pts).point, d, span, half };
}
// The deck is a rectangle laid across the water: long axis bank to bank, short axis the landing width.
function onBridge(b, p) {
  const dx = p.x - b.c.x, dy = p.y - b.c.y;
  return Math.abs(dx * b.d.x + dy * b.d.y) <= b.half && Math.abs(-dx * b.d.y + dy * b.d.x) <= b.span;
}
// The cart path runs down one side of the rough.
function buildCart(r, h) {
  const side = r() < 0.5 ? -1 : 1, off = h.fw + 10 + r() * 4, pts = [];
  for (let s = h.len * 0.12; s <= h.len * 0.93; s += 12) pts.push(add(pointAt(h.path, s), normalAt(h.path, s), off * side));
  return pts.length > 1 ? pts : null;
}
// The arm: a sweeping bar squarely on a landing zone.
function makeMill(r, h) {
  const s = h.par === 5 ? h.len * (0.44 + r() * 0.14) : Math.min(h.len * 0.86, 262 + r() * 46);
  const c = pointAt(h.path, s);
  return { x: c.x, y: c.y, r: 20 + r() * 9, along: s, period: 3.0 + r() * 2.0, phase: r() * Math.PI * 2, cw: r() < 0.5 };
}
const millAngle = (m, tSec) => m.phase + (m.cw ? -1 : 1) * tSec * 2 * Math.PI / m.period;
// A small satellite green off the line. Stop on it and you come out by the pin, or 430 yards on.
function makePortal(r, h) {
  const s = Math.min(h.len * 0.55, 150 + r() * 85);
  const c = pointAt(h.path, s), n = normalAt(h.path, s), side = r() < 0.5 ? -1 : 1;
  const rr = 9.5 + r() * 3, q = { ...add(c, n, (h.fw + 9 + r() * 10) * side), r: rr, along: s };
  if (dist(q, h.green) < h.gr + rr + 25) return null;
  if (h.mill && dist(q, h.mill) < h.mill.r + rr + 8) return null;
  if (h.total - s <= PORTAL_ADVANCE + 50) {
    q.onGreen = true; q.gain = Math.round(h.total - s);
    // marked behind the green so it never sits on the putt rings
    const a = pointAt(h.path, Math.max(0, h.total - 8)), dx = h.green.x - a.x, dy = h.green.y - a.y, L = Math.hypot(dx, dy) || 1;
    q.mark = { x: h.green.x + dx / L * (h.gr + 14), y: h.green.y + dy / L * (h.gr + 14) };
    q.exit = { ...h.pin };
  } else {
    q.onGreen = false; q.gain = PORTAL_ADVANCE;
    q.exit = pointAt(h.path, s + PORTAL_ADVANCE); q.mark = { ...q.exit };
  }
  return q;
}
// A band of fast air across the hole; only flight that crosses it is pushed.
function makeGust(r, h) {
  const along = h.len * (0.28 + r() * 0.40), width = 32 + r() * 28;
  const a = pointAt(h.path, along), b = pointAt(h.path, along + 8), head = Math.atan2(b.x - a.x, b.y - a.y);
  return { along, width, dir: head + (r() < 0.5 ? -1 : 1) * (Math.PI / 2) + (r() - 0.5) * 0.7, spd: 22 + r() * 20 };
}
// The island green: the par 3 is pulled in to 118-164 yards and ringed by a lake with a thin,
// uneven collar you can just hold, plus a drop zone on a headland of the near bank.
function makeIsland(r, h, seed) {
  const k = Math.min(1, (118 + r() * 46) / h.len);
  h.path = h.path.map(q => ({ x: q.x * k, y: q.y * k }));
  h.trees = h.trees.map(t => ({ x: t.x * k, y: t.y * k, r: t.r }));
  h.len = Math.round(h.len * k); h.total = h.len;
  h.green = h.path[h.path.length - 1];
  const pa = r() * Math.PI * 2, pr = h.gr * (0.15 + r() * 0.45);
  h.pin = { x: h.green.x + Math.cos(pa) * pr, y: h.green.y + Math.sin(pa) * pr };
  h.island = true; h.moat = h.gr + 26 + r() * 8;
  const s = Math.max(20, h.len - 38), side = r() < 0.5 ? -1 : 1;
  h.drop = add(pointAt(h.path, s), normalAt(h.path, s), 7 * side);
  h.bunkers = []; h.water = [];
  // Shapes from their own stream so they never shift the rest of the course.
  const sr = rng(hashStr(`shore|${seed}|${h.index}`));
  const w = [0.5 + sr() * 0.5, 0.25 + sr() * 0.45, 0.15 + sr() * 0.35], t = w[0] + w[1] + w[2];
  h.shore = { c: 7, k: 4.5, w1: w[0] / t, w2: w[1] / t, w3: w[2] / t, p1: sr() * 6.2832, p2: sr() * 6.2832, p3: sr() * 6.2832, m: 3 + sr() * 3, pm: sr() * 6.2832 };
  const da = Math.atan2(h.drop.y - h.green.y, h.drop.x - h.green.x);
  const dd = Math.max(dist(h.drop, h.green), shoreR(h, da) + 12 + 7.5);
  h.drop = { x: h.green.x + Math.cos(da) * dd, y: h.green.y + Math.sin(da) * dd };
  h.shore.da = da; h.shore.dd = dd;
}
// The island's edge, and the far bank of its lake, on a bearing from the green (atan2(dy, dx)).
function shoreR(h, a) {
  const s = h.shore;
  return h.gr + s.c + s.k * (s.w1 * Math.sin(a + s.p1) + s.w2 * Math.sin(2 * a + s.p2) + s.w3 * Math.sin(3 * a + s.p3));
}
function moatR(h, a) {
  const s = h.shore;
  let r = h.moat + s.m * Math.sin(2 * a + s.pm) + s.m * 0.6 * Math.sin(3 * a + s.p1);
  let d = a - s.da; d = Math.atan2(Math.sin(d), Math.cos(d));
  const w = 15 / s.dd;
  if (Math.abs(d) < w) { const k = Math.cos(Math.PI / 2 * d / w) ** 2; r += (Math.min(r, s.dd - 7.5) - r) * k; } // the headland
  return Math.max(shoreR(h, a) + 12, r);
}
// The crossing: the whole hole is open water, crossed island to island. Worth an extra shot of par.
function makeArch(r, h, seed) {
  if (h.par === 3) { // a par 3 crossing is two real carries, not a chip over a puddle
    const k = (300 + r() * 80) / h.len;
    h.path = h.path.map(q => ({ x: q.x * k, y: q.y * k }));
    h.len = Math.round(h.len * k); h.total = h.len;
    h.green = h.path[h.path.length - 1];
  }
  h.gr *= 1.7 + r() * 0.4; // the green is the last island, so it grows into a fair target
  const pa = r() * Math.PI * 2, pr = h.gr * (0.15 + r() * 0.45);
  h.pin = { x: h.green.x + Math.cos(pa) * pr, y: h.green.y + Math.sin(pa) * pr };
  const n = h.par <= 4 ? 3 : Math.min(5, h.par - 1), isles = [];
  for (let i = 0; i < n; i++) {
    const s = Math.min(h.len * (i / (n - 1)), h.len), c = pointAt(h.path, s), nrm = normalAt(h.path, s);
    const last = i === n - 1, off = i === 0 || last ? 0 : (r() - 0.5) * 2 * (22 + r() * 26); // stepping stones stagger
    isles.push({ ...(last ? { x: h.green.x, y: h.green.y } : add(c, nrm, off)), r: last ? h.gr : 33 + r() * 18,
      w1: last ? 0 : 0.07 + r() * 0.09, p1: r() * 6.2832, w2: last ? 0 : 0.03 + r() * 0.07, p2: r() * 6.2832 });
  }
  const sr = rng(hashStr(`isles|${seed}|${h.index}`));
  for (const is of isles) {
    if (is === isles[isles.length - 1]) { is.r = h.gr * 1.22; is.w1 = 0.07 + sr() * 0.04; is.w2 = 0.03 + sr() * 0.025; is.w3 = 0.02 + sr() * 0.015; }
    else is.w3 = 0.03 + sr() * 0.04;
    is.p3 = sr() * 6.2832;
  }
  h.bunkers = []; h.water = []; h.trees = [];
  h.wspd = Math.max(h.wspd, 13 + r() * 9); // nothing breaks the weather out on the water
  h.par += 1;
  return { isles };
}
// An island's shoreline on the bearing you approach from.
function isleR(is, p) {
  const a = Math.atan2(p.y - is.y, p.x - is.x);
  return is.r * (1 + is.w1 * Math.sin(a + is.p1) + is.w2 * Math.sin(2 * a + is.p2) + (is.w3 || 0) * Math.sin(3 * a + is.p3));
}

// ── the themes and their own hazards ──
// Four everyday venues picked from the seed; a date in the last ten days of October, or one
// seed in thirty, is the Spooky Forest (the pine forest at dusk).
const THEMES = ['forest', 'beach', 'alpine', 'volcanic', 'haunted'];
function themeFor(seed) {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(seed);
  if ((m && m[1] === '10' && +m[2] >= 21) || hashStr('haunted|' + seed) % 30 === 0) return 'haunted';
  return THEMES[hashStr('theme|' + seed) % 4];
}
// Clear of everything else already on the hole, by `pad` yards.
function clearOf(h, q, r, pad) {
  const R = e => Math.max(e.rx, e.ry);
  return dist(q, h.green) >= h.gr + r + pad + 2
    && !h.water.some(w => dist(q, w) < r + R(w) + pad) && !h.bunkers.some(b => dist(q, b) < r + R(b) + pad)
    && !h.leafPiles.some(b => dist(q, b) < r + R(b) + pad) && ![...h.boulders, ...h.lavaRocks].some(b => dist(q, b) < r + b.r + pad)
    && (!h.cart || nearest(q, h.cart).dist >= r + pad + 4) && (!h.burn || nearest(q, h.burn.pts).dist >= r + h.burn.w + pad)
    && (!h.portal || dist(q, h.portal) >= r + h.portal.r + pad) && (!h.mill || dist(q, h.mill) >= r + h.mill.r + pad);
}
// Fallen leaves: a low, ragged drift lying right in the mown corridor. Plays like a bunker.
function makeLeafPile(r, h) {
  for (let tries = 0; tries < 8; tries++) {
    const at = h.len * (0.30 + r() * 0.48), c = pointAt(h.path, at), n = normalAt(h.path, at);
    const rx = 6.6 + r() * 2.7, ry = 4.5 + r() * 2.0;
    const edge = Array.from({ length: 18 }, (_, i) => clamp(0.91 + (i % 2 ? -0.04 : 0.06) + (r() - 0.5) * 0.20, 0.76, 1.12));
    const q = { ...add(c, n, (r() - 0.5) * Math.max(0, h.fw - rx - 1.2)), rx, ry, rot: r() * Math.PI, edge, at };
    if (clearOf(h, q, Math.max(rx, ry), 2)) return q;
  }
  return null;
}
function inLeafPile(p, e) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot), dx = p.x - e.x, dy = p.y - e.y;
  const u = (dx * c + dy * s) / e.rx, v = (-dx * s + dy * c) / e.ry;
  let inside = false;
  for (let i = 0, j = e.edge.length - 1; i < e.edge.length; j = i++) {
    const ai = i / e.edge.length * 6.283, aj = j / e.edge.length * 6.283;
    const xi = Math.cos(ai) * e.edge[i], yi = Math.sin(ai) * e.edge[i], xj = Math.cos(aj) * e.edge[j], yj = Math.sin(aj) * e.edge[j];
    if ((yi > v) !== (yj > v) && u < (xj - xi) * (v - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// A rock in a landing lane: it stops a rolling ball, then kicks it hard up the hole. There is
// always room to play round it. Highland granite, volcanic basalt, or a pumpkin in the Spooky Forest.
function makeRock(r, h, kind) {
  for (let tries = 0; tries < 12; tries++) {
    const lava = kind === 'lava', at = h.len * (lava ? 0.28 + r() * 0.50 : 0.34 + r() * 0.42), c = pointAt(h.path, at), n = normalAt(h.path, at);
    const rr = lava ? 7.4 + r() * 4.2 : 8.4 + r() * 3.6;
    const q = { ...add(c, n, (r() - 0.5) * Math.max(0, h.fw - rr - 2.3)), r: rr, at, rot: r() * 6.283, kind,
      edge: Array.from({ length: lava ? 8 : 9 }, (_, i) => clamp(0.95 + (i % 2 ? 0.08 : -0.05) + (r() - 0.5) * 0.17, 0.78, 1.2)) };
    if (dist(q, h.green) >= h.gr + rr + 12 && clearOf(h, q, rr, 4)) return q;
  }
  return null;
}
// Molten lava cutting into one edge of a landing area. It is water by the rules: a stroke and a drop.
function makeLavaPool(r, h) {
  for (let tries = 0; tries < 12; tries++) {
    const at = h.len * (0.32 + r() * 0.44), c = pointAt(h.path, at), n = normalAt(h.path, at);
    const rx = 9 + r() * 7, ry = 6.5 + r() * 5, side = r() < 0.5 ? -1 : 1;
    const q = { ...add(c, n, (Math.max(rx * 0.45, h.fw - rx * 0.28) + r() * 3.5) * side), rx, ry, rot: r() * Math.PI, kind: 'lava', at };
    if (dist(q, h.green) >= h.gr + Math.max(rx, ry) + 8 && clearOf(h, q, Math.max(rx, ry), 3)) return q;
  }
  return null;
}

// Nothing sits on top of anything else: water and bunkers are shoved off the green, the path and
// the burn, and whatever still overlaps is dropped. Trees are scenery and simply go.
function tidyHole(h) {
  const R = e => Math.max(e.rx, e.ry);
  const away = (e, c, want) => { const L = dist(e, c) || 1, need = want - L; if (need <= 0) return 0; e.x += (e.x - c.x) / L * need; e.y += (e.y - c.y) / L * need; return need; };
  const onBridgeBy = (q, r) => { const b = h.burn && h.burn.bridge; if (!b) return false;
    const dx = q.x - b.c.x, dy = q.y - b.c.y; return Math.abs(dx * b.d.x + dy * b.d.y) <= b.half + r + 1.5 && Math.abs(-dx * b.d.y + dy * b.d.x) <= b.span + r + 1.5; };
  const clear = (e, r) => dist(e, h.green) >= h.gr + r + 0.5 && (!h.cart || nearest(e, h.cart).dist >= 6.6 + r)
    && (!h.burn || nearest(e, h.burn.pts).dist >= h.burn.w + r + 1) && !onBridgeBy(e, r);
  const untangle = (e, r) => {
    let moved = 0;
    for (let pass = 0; pass < 3; pass++) {
      moved += away(e, h.green, h.gr + r + 1);
      if (h.cart) moved += away(e, nearest(e, h.cart).point, 6.6 + r + 0.6);
      if (h.burn) moved += away(e, nearest(e, h.burn.pts).point, h.burn.w + r + 2);
    }
    return moved;
  };
  h.water = h.water.filter(w => untangle(w, R(w)) <= 15 && clear(w, R(w)));
  const kept = [];
  for (const b of h.bunkers) {
    const r = R(b);
    if (untangle(b, r) > 15 || !clear(b, r)) continue;
    if (h.water.some(w => dist(b, w) < r + R(w) + 2) || kept.some(k => dist(b, k) < r + R(k) + 2)) continue;
    kept.push(b);
  }
  h.bunkers = kept;
  // a rock the water was nudged onto goes, so the pool always wins cleanly
  h.boulders = h.boulders.filter(b => !h.water.some(w => dist(b, w) < b.r + R(w) + 2));
  h.lavaRocks = h.lavaRocks.filter(b => !h.water.some(w => dist(b, w) < b.r + R(w) + 2));
  h.trees = h.trees.filter(t => ![...h.boulders, ...h.lavaRocks].some(b => dist(t, b) < t.r + b.r + 3)
    && !h.leafPiles.some(b => dist(t, b) < t.r + R(b) + 1));
  h.trees = h.trees.filter(t => (!h.cart || nearest(t, h.cart).dist > 7.5) && (!h.burn || nearest(t, h.burn.pts).dist > h.burn.w + t.r + 1.5)
    && !onBridgeBy(t, t.r) && dist(t, h.green) > h.gr + t.r + 1 && !h.bunkers.some(b => dist(t, b) < t.r + R(b) + 1) && !h.water.some(w => dist(t, w) < t.r + R(w) + 1));
}

// Caps keep a nine from becoming an obstacle course: one island, one crossing, one burn.
function addFeatures(r, holes, seed, theme) {
  let island = 0, mill = 0, gust = 0, portal = 0, arch = 0, burn = 0, leaves = 0, boulders = 0, lavaRocks = 0, lavaPools = 0;
  const woodland = theme === 'forest' || theme === 'haunted', rocky = theme === 'alpine' || theme === 'haunted';
  for (const h of holes) {
    if (h.par === 3 && island < 1 && r() < 0.60) { makeIsland(r, h, seed); island++; }
    if (!h.island && h.par >= 3 && h.par <= 6 && arch < 1 && r() < (h.par === 4 ? 0.016 : 0.031)) { h.arch = makeArch(r, h, seed); arch++; }
    if (!h.island && !h.arch && h.par >= 4 && h.len >= 330 && burn < 1 && r() < 0.065) { h.burn = makeBurn(r, h); burn++; }
    const wantCart = r() < 0.45; // drawn either way; a burn hole always has a path, the path crosses the river
    if (!h.island && !h.arch && (h.burn || wantCart)) h.cart = buildCart(r, h);
    if (h.burn) placeBridge(r, h);
    const long = h.par >= 6; // the brutes get everything
    if (!h.island && !h.arch && h.par > 3 && (long || mill < 3) && (long || r() < 0.44)) { h.mill = makeMill(r, h); mill++; }
    if (!h.island && !h.arch && h.par > 3 && (long || portal < 2) && r() < (long ? 0.7 : 0.34)) { const q = makePortal(r, h); if (q) { h.portal = q; portal++; } }
    if ((long || gust < 3) && (long || r() < 0.34)) { h.gust = makeGust(r, h); gust++; }
    // The theme's own hazard, uncommon and capped so it stays a line choice rather than clutter.
    const open = !h.island && !h.arch && h.par >= 4;
    if (woodland && leaves < 2 && open && r() < 0.16) { const q = makeLeafPile(r, h); if (q) { h.leafPiles.push(q); leaves++; } }
    if (rocky && boulders < 3 && open && r() < 0.3) { const q = makeRock(r, h, theme === 'haunted' ? 'pumpkin' : 'granite'); if (q) { h.boulders.push(q); boulders++; } }
    if (theme === 'volcanic' && lavaRocks < 4 && open && r() < 0.38) { const q = makeRock(r, h, 'lava'); if (q) { h.lavaRocks.push(q); lavaRocks++; } }
    if (theme === 'volcanic' && lavaPools < 2 && open && r() < 0.30) { const q = makeLavaPool(r, h); if (q) { h.water.push(q); lavaPools++; } }
    // which side the sea or the forest river lies, for the scenery only
    h.waterSide = hashStr(`water-side|${seed}|${h.index}`) % 2 ? -1 : 1;
    tidyHole(h);
  }
}

function makeCourse(seed, theme = themeFor(seed)) {
  const r = rng(hashStr(seed));
  const name = NAME_A[(r() * NAME_A.length) | 0] + NAME_B[(r() * NAME_B.length) | 0] + ' ' + NAME_C[(r() * NAME_C.length) | 0];
  const pars = PAR_MIX[(r() * PAR_MIX.length) | 0].slice();
  for (let i = pars.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [pars[i], pars[j]] = [pars[j], pars[i]]; }
  const dayWind = r() * Math.PI * 2, dayGust = 4 + r() * 11;
  const holes = pars.map((par, i) => makeHole(r, par, i, dayWind, dayGust));
  addFeatures(r, holes, seed, theme);
  return { seed, name, theme, holes, par: holes.reduce((a, h) => a + h.par, 0) };
}

// ── real courses ──
// A real course is one shared map (course yards: x east, y north, from courses/<id>/<id>.json).
// Each hole sees it in its own frame: tee at the origin, the tee-to-green line along +y, scaled so
// the hole plays its card length. Other holes' shapes stay in play.
const REAL_MODES = { front: [0, 9], back: [9, 18], all: [0, 18] };

function polyOf(pts, tf) {
  const out = pts.map(tf);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of out) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { pts: out, box: [x0, y0, x1, y1] };
}
function inPoly(p, poly) {
  const b = poly.box;
  if (p.x < b[0] || p.x > b[2] || p.y < b[1] || p.y > b[3]) return false;
  let c = false;
  const pts = poly.pts;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], q = pts[j];
    if ((a.y > p.y) !== (q.y > p.y) && p.x < (q.x - a.x) * (p.y - a.y) / (q.y - a.y) + a.x) c = !c;
  }
  return c;
}
const polyArea = pts => Math.abs(pts.reduce((a, q, i) => { const r = pts[(i + 1) % pts.length]; return a + q.x * r.y - r.x * q.y; }, 0) / 2);
function edgeDist(p, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

function makeRealHole(data, i, day, dayWind, dayGust) {
  const d = data.holes[i], P = d.path.map(([x, y]) => ({ x, y })), T = P[0], G = P[P.length - 1];
  const th = Math.atan2(G.x - T.x, G.y - T.y), cs = Math.cos(th), sn = Math.sin(th);
  const traced = P.slice(1).reduce((a, p, j) => a + dist(P[j], p), 0), k = d.cardYds / traced;
  const tf = ([x, y]) => { const dx = x - T.x, dy = y - T.y; return { x: (dx * cs - dy * sn) * k, y: (dx * sn + dy * cs) * k }; };
  const polys = (list, keep = () => true) => list.filter(keep).map(s => ({ ...polyOf(s.pts, tf), ...(s.hole ? { hole: s.hole } : {}) }));
  const greens = polys(data.greens), ownGreen = greens.find(g => g.hole === d.n);
  const path = d.path.map(tf), green = path[path.length - 1];
  const gr = Math.sqrt(polyArea(ownGreen.pts) / Math.PI);
  // the pin: on the green, at least 3 yards from its edge, moved every day
  const r = rng(hashStr(`${data.id}-pin|${day}|${d.n}`));
  let pin = { ...green };
  for (let t = 0; t < 60; t++) {
    const a = r() * Math.PI * 2, q = { x: green.x + Math.cos(a) * gr * r(), y: green.y + Math.sin(a) * gr * r() };
    if (inPoly(q, ownGreen) && edgeDist(q, ownGreen.pts) >= 3) { pin = q; break; }
  }
  const hr = rng(hashStr(`${data.id}-hole|${day}|${d.n}`));
  return {
    index: d.n, par: d.par, si: d.si, note: d.note, hidden: !!d.hidden, signature: !!d.signature,
    len: d.cardYds, total: d.cardYds, path, fw: 14, rgh: 34, deep: 50, green, gr, pin,
    bunkers: [], water: [], trees: [], leafPiles: [], boulders: [], lavaRocks: [],
    // the day's wind blows one way over the whole course; each hole feels it at its own angle
    wind: dayWind - th + (hr() - 0.5) * 0.4, wspd: Math.max(1, dayGust + (hr() - 0.5) * 5),
    slopeDir: hr() * Math.PI * 2, slopePct: 0.010 + hr() * 0.034,
    real: {
      greens, ownGreen, tees: polys(data.tees), fairways: polys(data.fairways), bunkers: polys(data.bunkers),
      water: polys(data.water), trees: polys(data.trees), boundary: polyOf(data.boundary, tf),
      cart: data.cart.map(c => c.map(tf)), benches: data.benches.map(tf),
      lakes: (data.landmarks || []).filter(l => l.kind === 'water' && l.pts.length > 2).map(l => polyOf(l.pts, tf)),
      landmarks: (data.landmarks || []).map(l => ({ name: l.name, kind: l.kind, ...polyOf(l.pts, tf) })),
      heights: data.heights, T: { ...T }, th, k,
    },
  };
}

function makeRealCourse(data, mode, day) {
  const [a, b] = REAL_MODES[mode];
  const r = rng(hashStr(data.id + '-wind|' + day)), dayWind = r() * Math.PI * 2, dayGust = 4 + r() * 11;
  const holes = [];
  for (let i = a; i < b; i++) holes.push(makeRealHole(data, i, day, dayWind, dayGust));
  return { seed: `${data.id}|${mode}|${day}`, name: data.name, theme: data.id, real: true, mode, turnAfter: data.turnAfter || 10, holes, par: holes.reduce((s, h) => s + h.par, 0) };
}

// Ground height in yards (bilinear on the course grid); daily holes are flat.
function heightAt(h, p) {
  const R = h.real; if (!R || !R.heights) return 0;
  const g = R.heights, cs = Math.cos(R.th), sn = Math.sin(R.th), x = p.x / R.k, y = p.y / R.k;
  const cx = R.T.x + x * cs + y * sn, cy = R.T.y - x * sn + y * cs; // back into course yards
  const c = clamp((cx - g.x0) / g.step, 0, g.cols - 1.001), r = clamp((g.y0 - cy) / g.step, 0, g.rows - 1.001);
  const c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0, z = (i, j) => g.z[j * g.cols + i];
  return lerp(lerp(z(c0, r0), z(c0 + 1, r0), fc), lerp(z(c0, r0 + 1), z(c0 + 1, r0 + 1), fc), fr);
}
// How far a shot plays: about a yard more for every yard the target sits above you.
const playsLike = (h, from, to) => dist(from, to) + heightAt(h, to) - heightAt(h, from);
// The whole hole, for the card: its length along the fairway plus the climb from tee to pin.
const holePlaysLike = h => h.len + heightAt(h, h.pin) - heightAt(h, { x: 0, y: 0 });

function realSurface(h, p) {
  const R = h.real, any = list => list.some(s => inPoly(p, s));
  if (!inPoly(p, R.boundary)) return any(R.lakes) ? 'water' : 'ob'; // a landmark lake beyond the boundary is still a hazard
  if (inPoly(p, R.ownGreen)) return 'green'; // before water, so an island green plays as green
  if (any(R.water)) return 'water';
  if (any(R.bunkers)) return 'bunker';
  if (any(R.tees)) return 'tee';
  if (any(R.trees)) return 'trees'; // before fairways: a traced fairway's outline can enclose a lone tree
  if (any(R.fairways) || any(R.greens)) return 'fairway'; // another hole's green plays as fairway
  return 'rough';
}

function surfaceAt(h, p) {
  if (h.real) return realSurface(h, p);
  const dg = dist(p, h.green);
  if (dg <= h.gr) return 'green';
  if (h.arch) { // open water: islands only, no rough, no trees, no out of bounds
    for (let i = 0; i < h.arch.isles.length; i++) {
      const is = h.arch.isles[i], d = dist(p, is);
      if (d > is.r * 1.4) continue;
      const rr = isleR(is, p);
      if (d <= rr * 0.72) return i === 0 && d <= rr * 0.34 ? 'tee' : 'fairway';
      if (d <= rr) return 'rough'; // the rim that grabs a running ball
    }
    return 'water';
  }
  if (h.island) {
    const a = Math.atan2(p.y - h.green.y, p.x - h.green.x);
    if (dg <= shoreR(h, a)) return 'fairway'; // the collar
    if (dist(p, h.drop) <= 6) return 'fairway';
    if (dg <= moatR(h, a)) return 'water';
  }
  if (h.portal && dist(p, h.portal) <= h.portal.r) return 'portal';
  if (h.burn) {
    if (h.burn.bridge && onBridge(h.burn.bridge, p)) return 'bridge';
    if (nearest(p, h.burn.pts).dist <= h.burn.w) return h.cart && nearest(p, h.cart).dist <= 5.2 ? 'cart' : 'water'; // the path has its own deck
  }
  for (const w of h.water) if (inEllipse(p, w)) return 'water';
  for (const q of h.leafPiles || []) if (inLeafPile(p, q)) return 'leaves';
  for (const b of h.bunkers) if (inEllipse(p, b)) return 'bunker';
  const n = nearest(p, h.path);
  if (n.along <= 0.5 && p.y < -6 && n.dist > h.fw) return 'ob'; // behind the tee
  if (n.dist <= h.fw) return n.along < 8 ? 'tee' : 'fairway';
  if (h.cart && n.dist < h.rgh + 6 && nearest(p, h.cart).dist <= 5.2) return 'cart';
  if (n.dist <= h.rgh) return 'rough';
  if (n.dist <= h.deep) return 'deep';
  if (h.island && dg <= moatR(h, Math.atan2(p.y - h.green.y, p.x - h.green.x)) + ISLAND_BANK) return 'deep';
  return 'ob';
}

// ── shot resolution ──
// `base` is how far the ball would run on fairway; each step spends from it at the ground's rate.
// A crowned cart path funnels a running ball along itself.
function rollOut(h, from, dir, base) {
  const step = 1.5;
  let p = { ...from }, last = p, budget = base, d = { ...dir }, rockHit = null;
  const trace = [{ ...p }], rocks = [...(h.boulders || []), ...(h.lavaRocks || [])];
  for (let i = 0; i < 300; i++) {
    let q = add(p, d, step);
    const rock = !rockHit && rocks.find(b => dist(q, b) <= b.r);
    if (rock) {
      // The face stops the ball dead, then kicks it decisively up the hole: mostly along the
      // centreline, a little of its own line, plus the equivalent of 42 yards of fairway run.
      const f = tangentAt(h.path, rock.at), bx = f.x * 0.82 + d.x * 0.18, by = f.y * 0.82 + d.y * 0.18, BL = Math.hypot(bx, by) || 1;
      d = { x: bx / BL, y: by / BL };
      trace.push({ x: rock.x - d.x * rock.r, y: rock.y - d.y * rock.r });
      p = { x: rock.x + d.x * (rock.r + 1.8), y: rock.y + d.y * (rock.r + 1.8) };
      trace.push({ ...p });
      rockHit = rock; budget += 42;
      continue;
    }
    const sf = surfaceAt(h, q);
    if (sf === 'trees' && surfaceAt(h, p) !== 'trees') break; // a rolling ball stops at the edge of a stand
    if (sf === 'water') return { point: q, surf: 'water', trace, rockHit };
    if (sf === 'ob') return { point: last, surf: 'ob', trace, rockHit };
    // A ball with pace skids across the green; once the pace bleeds off the turf grabs it.
    const mult = sf === 'green' ? 0.85 + 1.55 * Math.pow(clamp(budget / 26, 0, 1), 0.75) : SURF_ROLL[sf];
    const cost = step / mult;
    if (cost > budget) break;
    budget -= cost; last = p; p = q;
    if (sf === 'cart' && h.cart) {
      const nc = nearest(p, h.cart);
      let t = tangentAt(h.cart, nc.along);
      if (t.x * d.x + t.y * d.y < 0) t = { x: -t.x, y: -t.y };
      d = { x: t.x * 0.85 + d.x * 0.15, y: t.y * 0.85 + d.y * 0.15 };
      const L = Math.hypot(d.x, d.y) || 1; d.x /= L; d.y /= L;
      p = { x: p.x + (nc.point.x - p.x) * 0.25, y: p.y + (nc.point.y - p.y) * 0.25 };
    }
    if (i % 5 === 0) trace.push({ ...p });
  }
  trace.push({ ...p });
  return { point: p, surf: surfaceAt(h, p), trace, rockHit };
}

// Water: the island has a drop zone; elsewhere walk back along the line onto dry ground.
function dropFromWater(h, ball, land) {
  if (h.island) return { ...h.drop };
  const L = dist(ball, land) || 1, u = { x: (ball.x - land.x) / L, y: (ball.y - land.y) / L };
  for (let s = 2; s < L; s += 2) {
    const q = add(land, u, s), sf = surfaceAt(h, q);
    if (sf !== 'water' && sf !== 'ob' && sf !== 'trees') {
      const q2 = add(q, u, 2), s2 = surfaceAt(h, q2);
      if (!h.real || (s2 !== 'water' && s2 !== 'ob' && s2 !== 'trees')) return q2;
    }
  }
  if (h.real) return { ...ball }; // real ponds sit off the line of the hole: replay it
  const n = nearest(land, h.path);
  return surfaceAt(h, n.point) === 'water' ? { ...ball } : n.point;
}

// A gust only pushes the ball for the part of the flight spent inside the band.
function gustPush(h, from, to, carry) {
  const g = h.gust; if (!g) return { x: 0, y: 0 };
  let inside = 0;
  for (let i = 1; i <= 14; i++) {
    const a = nearest({ x: lerp(from.x, to.x, i / 14), y: lerp(from.y, to.y, i / 14) }, h.path).along;
    if (a >= g.along && a <= g.along + g.width) inside++;
  }
  const w = dirOf(g.dir), k = g.spd * carry * 0.018 * (inside / 14);
  return { x: w.x * k, y: w.y * k };
}

function resolveShot(h, ball, lie, club, aim, v, r) {
  const lm = LIE[lie] || LIE.fairway;
  const quality = grade(v), pure = quality === 'pure', pf = carryFactor(v);
  let carry = club.carry * lm.dist * pf;

  // Every swing disperses a little; an overswing also curves, either way.
  let offDeg = gauss(r) * club.disp * lm.acc * (pure ? 0.62 : 1), curveDeg = 0;
  if (quality === 'overswing') { curveDeg = (0.45 + r() * 0.55) * (v - 1) * 75 * (r() < 0.5 ? -1 : 1); offDeg += curveDeg; }
  const flightA = aim + rad(offDeg), fd = dirOf(flightA), fr = rightOf(flightA);

  // Wind: the along part scales carry, the across part pushes the ball sideways.
  const w = dirOf(h.wind);
  const head = (w.x * fd.x + w.y * fd.y) * h.wspd, cross = (w.x * fr.x + w.y * fr.y) * h.wspd;
  carry *= 1 + head * 0.0042;
  if (h.real) carry -= clamp(heightAt(h, add(ball, fd, carry)) - heightAt(h, ball), -0.25 * carry, 0.25 * carry); // uphill comes up short
  const drift = cross * carry * 0.0032;

  // Contact adds an absolute miss. Off the tee it is a plain scatter; elsewhere it shrinks for
  // short shots (judging the weight is the hard part, not the line) and a chip always gets halfway.
  // A chip struck inside the band (the weight judged right) misses by half as much: otherwise its
  // ~2 yd floor was as big as the one-putt ring, and perfect chips still missed it.
  const b = lie !== 'tee' && dist(ball, h.pin) <= CHIP_YDS && targetBand(h, ball, lie, club), dialled = b && v >= b.lo * METER_MAX && v <= b.hi * METER_MAX;
  const tidy = dialled ? 0.5 : 1;
  const abs = 2.2 * lm.acc * (pure ? 0.72 : 1) * tidy;
  let land;
  if (lie !== 'tee') {
    const near = Math.min(1, carry / 80), qq = 2.2 * (pure ? 0.72 : 1) * tidy;
    const along = Math.max(qq * Math.pow(lm.acc, 0.4), abs * (0.4 + 0.6 * near));
    const ga = gauss(r), gs = gauss(r), lim = carry * 0.3 + 1.5;
    const da = Math.max(-carry * 0.5, ga * along);
    const ds = clamp(gs * along * (0.6 + 0.4 * near), -lim, lim);
    land = add(add(ball, fd, carry + da), fr, drift + ds);
  } else {
    land = add(add(add(ball, fd, carry), fr, drift), { x: gauss(r), y: gauss(r) }, abs);
  }
  land = add(land, gustPush(h, ball, land, carry));
  const landSurf = surfaceAt(h, land);

  // Tarmac kicks the ball along the path it landed on, which is what makes it worth aiming at.
  let rollDir = fd;
  if (landSurf === 'cart' && h.cart) {
    let t = tangentAt(h.cart, nearest(land, h.cart).along);
    if (t.x * fd.x + t.y * fd.y < 0) t = { x: -t.x, y: -t.y };
    const bx = t.x * 0.9 + fd.x * 0.1, by = t.y * 0.9 + fd.y * 0.1, L = Math.hypot(bx, by) || 1;
    rollDir = { x: bx / L, y: by / L };
  }
  const rollBase = Math.max(0, club.roll * lm.roll * (0.7 + pf * 0.4) * (1 + head * 0.006));
  const walked = rollOut(h, land, rollDir, rollBase);
  let rest = walked.point, restSurf = walked.surf, penalty = 0, note = '';
  if (landSurf === 'water' || restSurf === 'water') {
    const lava = w => w.kind === 'lava' && (inEllipse(land, w) || inEllipse(rest, w));
    penalty = 1; note = h.water.some(lava) ? 'LAVA' : 'WATER';
    rest = dropFromWater(h, ball, land); restSurf = surfaceAt(h, rest);
  } else if (landSurf === 'ob' || restSurf === 'ob') {
    penalty = 1; note = 'OUT OF BOUNDS';
    rest = { ...ball }; restSurf = lie;
  }
  // A running ball drops if it crosses the cup with little pace left.
  let holed = false;
  if (!penalty) {
    const runLen = dist(land, rest);
    let best = dist(rest, h.pin), bestT = 1;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, m = dist({ x: lerp(land.x, rest.x, t), y: lerp(land.y, rest.y, t) }, h.pin);
      if (m < best) { best = m; bestT = t; }
    }
    holed = best < HOLE_R && runLen * (1 - bestT) < 1.6;
  }
  return {
    from: { ...ball }, land, rest: holed ? { ...h.pin } : rest, restSurf: holed ? 'green' : restSurf,
    carry: dist(ball, land), total: dist(ball, land) + (penalty ? 0 : dist(land, rest)),
    quality, pure, curveDeg, penalty, note, holed, flightA, trace: walked.trace, cart: landSurf === 'cart',
    rock: !penalty && walked.rockHit ? walked.rockHit.kind : null,
  };
}

// ── the arm and the portal, applied after a ball comes to rest ──
const inMillZone = (h, p) => !!h.mill && dist(p, h.mill) <= h.mill.r;
// Somewhere on the fairway safely past the circle: the last resort for a ball thrown back into it.
const millSafeExit = h => pointAt(h.path, Math.min(h.total, h.mill.along + h.mill.r + 14));
// Has a blade reached this spot yet? Wall-clock, and only used to time the animation.
function millBladeOver(h, p, tSec) {
  const m = h.mill; if (!m || dist(p, m) > m.r) return false;
  const arm = millAngle(m, tSec), bearing = dist(p, m) < 0.8 ? arm : Math.atan2(p.x - m.x, p.y - m.y);
  const diff = Math.abs((((bearing - arm + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
  return Math.min(diff, Math.PI - diff) <= rad(34); // two blades, opposite each other
}
// The blow. It depends on where the ball sits, never on when the animation catches up.
function millStrike(h, land, r) {
  const m = h.mill, d = dist(land, m);
  const bearing = d < 0.8 ? 0 : Math.atan2(land.x - m.x, land.y - m.y);
  const dirv = dirOf(bearing + (m.cw ? -1 : 1) * Math.PI / 2 + (r() - 0.5) * 0.45);
  let fling = 30 + (d / m.r) * 40;
  const ex = land.x - m.x, ey = land.y - m.y, R = m.r + 9, bq = 2 * (ex * dirv.x + ey * dirv.y), cq = ex * ex + ey * ey - R * R, dq = bq * bq - 4 * cq;
  if (dq > 0) fling = Math.max(fling, (-bq + Math.sqrt(dq)) / 2 + 2); // clear of the circle, or it is caught again
  const w = rollOut(h, add(land, dirv, fling * 0.6), dirv, fling * 0.4);
  let rest = w.point, surf = w.surf, penalty = 0;
  if (surf === 'water') { penalty = 1; rest = dropFromWater(h, land, rest); surf = surfaceAt(h, rest); }
  else if (surf === 'ob') { penalty = 1; rest = millSafeExit(h); surf = surfaceAt(h, rest); }
  if (inMillZone(h, rest)) {
    rest = millSafeExit(h); surf = surfaceAt(h, rest);
    if (surf === 'water' || surf === 'ob') { penalty = Math.max(penalty, 1); rest = nearest(rest, h.path).point; surf = surfaceAt(h, rest); }
  }
  return { rest, surf, penalty, trace: [{ ...land }, ...w.trace, { ...rest }] };
}
// Through the portal costs no stroke. By the pin it lets you out inside the two-putt ring four
// times in five and the one-putt ring the fifth; on a long hole it carries you 430 yards on.
function portalOut(h, r) {
  const q = h.portal;
  let b = { ...q.exit };
  if (q.onGreen) {
    const rr = puttRings(h), one = r() < 0.2;
    const rad1 = one ? rr.one * (0.15 + r() * 0.7) : rr.one * 1.12 + r() * (rr.two * 0.92 - rr.one * 1.12);
    let c = null;
    for (let k = 0; k < 8 && !c; k++) { const a = r() * 6.2832, t = { x: h.pin.x + Math.cos(a) * rad1, y: h.pin.y + Math.sin(a) * rad1 }; if (dist(t, h.green) <= h.gr * 0.94) c = t; }
    if (!c) { const dx = h.green.x - h.pin.x, dy = h.green.y - h.pin.y, L = Math.hypot(dx, dy) || 1; c = { x: h.pin.x + dx / L * rad1, y: h.pin.y + dy / L * rad1 }; }
    b = c;
  }
  let lie = surfaceAt(h, b);
  if (lie === 'portal' || lie === 'water' || lie === 'ob') lie = 'fairway';
  return { ball: b, lie };
}

// ── scoring ──
function puttRings(h) {
  const k = Math.max(0.62, 1 - h.slopePct * 3.5); // a steeper green tightens them
  return { one: h.gr * 0.36 * k, two: h.gr * 0.86 * k }; // a touch more generous than the original's 0.32 / 0.78
}
function puttsFrom(h, p) {
  const d = dist(p, h.pin), rr = puttRings(h);
  return d <= rr.one ? 1 : d <= rr.two ? 2 : 3;
}
const strokeCap = h => Math.max(10, h.par + 4);

// ── shot setup helpers (what the UI shows before a swing) ──
const clubAllowed = (c, lie) => c.carry <= ((LIE[lie] || {}).maxCarry || Infinity);
const reachOf = (c, lm) => c.carry * lm.dist + c.roll * lm.roll * 0.55;
// The shortest club that gets there, else the longest one allowed.
function autoClub(h, ball, lie) {
  const d = h.real ? playsLike(h, ball, h.pin) : dist(ball, h.pin), lm = LIE[lie] || LIE.fairway;
  for (let i = CLUBS.length - 1; i >= 0; i--) if (clubAllowed(CLUBS[i], lie) && reachOf(CLUBS[i], lm) >= d * 0.99) return i;
  for (let i = 0; i < CLUBS.length; i++) if (clubAllowed(CLUBS[i], lie)) return i;
  return CLUBS.length - 1;
}
// Default line: at the pin if the club gets there, otherwise down the centreline by the club's carry.
function aimTarget(h, ball, lie, club) {
  const reach = club.carry * (LIE[lie] || LIE.fairway).dist, n = nearest(ball, h.path);
  const t = dist(ball, h.pin) <= reach * 1.06 ? h.pin : pointAt(h.path, Math.min(n.total, n.along + reach));
  return Math.atan2(t.x - ball.x, t.y - ball.y);
}
// The highlighted stretch of the power track, as fractions of the track. Inside the club's full
// number it slides down to the power that lands it pin-high; beyond it, it is the pure band.
function targetBand(h, ball, lie, club) {
  const lm = LIE[lie] || LIE.fairway, full = club.carry * lm.dist;
  const need = Math.max(2, (h.real ? playsLike(h, ball, h.pin) : dist(ball, h.pin)) - club.roll * lm.roll * 0.5);
  if (need < full * 1.05) return { lo: powerFor(need * 0.96 / full) / METER_MAX, hi: powerFor(need * 1.04 / full) / METER_MAX, label: 'PIN' };
  return { lo: PURE_LO / METER_MAX, hi: PURE_HI / METER_MAX, label: '100' };
}

// ── round state ──
// salt sets each player's own shot scatter in a multiplayer game ('#p' + slot); solo play has none.
function newRound(seed, real, salt = '') {
  const course = real || makeCourse(seed);
  return { seed, salt, course, holeIdx: 0, ball: { x: 0, y: 0 }, lie: 'tee', strokes: 0, shotIdx: 0,
           scores: [], log: [], done: false, longest: 0, pured: 0, shots: 0, aces: [] };
}
const holeOf = st => st.course.holes[st.holeIdx];
const playable = s => s === 'water' || s === 'ob' ? 'rough' : s;

// Plays one shot, then whatever happens where it stops (the arm, the portal). res.arm and
// res.portal describe those for the animation. res.score is set when the hole is over.
function play(st, aim, clubIdx, v) {
  aim = q4(aim); v = q4(v);
  const h = holeOf(st), c = CLUBS[clubIdx], key = st.seed + st.salt + '#' + st.holeIdx + '#' + st.shotIdx, cap = strokeCap(h);
  const res = resolveShot(h, st.ball, st.lie, c, aim, v, rng(hashStr(key)));
  st.log.push({ hole: st.holeIdx, club: clubIdx, aim, v });
  st.shotIdx++; st.shots++; st.strokes += 1 + res.penalty;
  if (res.pure) st.pured++;
  st.longest = Math.max(st.longest, Math.round(res.carry));
  let ball = res.rest, lie = playable(res.restSurf);
  if (!res.holed && st.strokes < cap && inMillZone(h, ball)) {
    const hit = millStrike(h, ball, rng(hashStr(key + '#arm')));
    res.arm = { from: ball, ...hit };
    st.strokes += hit.penalty; ball = hit.rest; lie = playable(hit.surf);
    if (dist(ball, h.pin) < HOLE_R) { res.holed = true; ball = { ...h.pin }; }
  }
  if (!res.holed && st.strokes < cap && lie === 'portal') {
    const o = portalOut(h, rng(hashStr(key + '#portal')));
    res.portal = { from: ball, to: o.ball, onGreen: h.portal.onGreen, gain: Math.round(dist(ball, h.pin) - dist(o.ball, h.pin)) };
    ball = o.ball; lie = o.lie;
  }
  st.ball = ball; st.lie = lie;
  if (res.holed) {
    res.score = Math.min(st.strokes, cap);
    if (st.strokes === 1) st.aces.push(st.holeIdx);
  } else if (st.strokes >= cap) {
    res.score = cap; res.pickedUp = true;
  } else if (lie === 'green') {
    res.putts = puttsFrom(h, ball);
    res.score = Math.min(st.strokes + res.putts, cap);
  }
  if (res.score != null) st.scores[st.holeIdx] = res.score;
  return res;
}

// The best swing from where the ball lies (the developer tools' perfect swing), found by trying them: a
// shot's scatter is fixed by its key, so resolveShot with that key's rng is exactly what play() will do.
// Holes out when any swing does; otherwise the lowest cost (a penalty worst, then off the green by distance
// and lie, then putts). Coarse over four clubs, then finer round the best; stops early on a hole-out, or
// at budgetMs with the best so far. Returns { club, aim, v, result } for play(st, aim, club, v).
const BEST_LIE_COST = { tee: 0, fairway: 0, green: 0, portal: 0, cart: 2, bridge: 2, rough: 8, bunker: 15, leaves: 15, deep: 20, trees: 30 };
function bestSwing(st, budgetMs = 1500) {
  const h = holeOf(st), key = st.seed + st.salt + '#' + st.holeIdx + '#' + st.shotIdx, t0 = Date.now();
  const cost = r => r.penalty ? 1e6 : r.holed ? -1
    : (inMillZone(h, r.rest) ? 40 : 0) + (r.restSurf === 'green' ? puttsFrom(h, r.rest) - 1 + dist(r.rest, h.pin) / 100
      : 10 + dist(r.rest, h.pin) + (BEST_LIE_COST[r.restSurf] ?? 10));
  const one = (ci, aim, v) => {
    aim = q4(aim); v = q4(clamp(v, 0.02, METER_MAX));
    const r = resolveShot(h, st.ball, st.lie, CLUBS[ci], aim, v, rng(hashStr(key)));
    return { club: ci, aim, v, result: r, c: cost(r) };
  };
  let best = null;
  const take = s => { if (!best || s.c < best.c) best = s; return s; };
  const done = () => best.c < 0 || Date.now() - t0 > budgetMs;
  const auto = autoClub(h, st.ball, st.lie);
  const clubs = [auto, auto + 1, auto - 1, auto + 2].filter(i => i >= 0 && i < CLUBS.length && clubAllowed(CLUBS[i], st.lie));
  const dv = (METER_MAX - 0.04) / 24, tried = [];
  for (const ci of clubs) { // coarse: every 1° within 6° of the club's default line, the whole power track
    const a0 = aimTarget(h, st.ball, st.lie, CLUBS[ci]);
    for (let da = -6; da <= 6; da++) for (let k = 0; k <= 24; k++) tried.push(take(one(ci, a0 + rad(da), 0.04 + k * dv)));
    if (done()) return best;
  }
  const around = (s, aStep, vStep, n) => { // a (2n+1)^2 grid round one swing
    for (let i = -n; i <= n && !done(); i++) for (let j = -n; j <= n; j++) take(one(s.club, s.aim + i * aStep, s.v + j * vStep));
  };
  for (const s of tried.sort((a, b) => a.c - b.c).slice(0, 3)) { around(s, rad(0.1), dv / 10, 10); if (done()) return best; }
  around(best, rad(0.01), 0.002, 10);
  if (!done()) around(best, rad(0.001), 0.0002, 10);
  return best;
}

function nextHole(st) {
  if (st.holeIdx >= st.course.holes.length - 1) { st.done = true; return; }
  st.holeIdx++; st.strokes = 0; st.shotIdx = 0; st.ball = { x: 0, y: 0 }; st.lie = 'tee';
}

// ── multiplayer ──
// spec: { kind: 'daily' | 'random', seed } or { kind: 'real', id, mode, day } (realData is courses/<id>/<id>.json).
function courseFromSpec(spec, realData) {
  if (spec.kind === 'daily' || spec.kind === 'random') return makeCourse(spec.seed);
  if (spec.kind === 'real' && realData && realData.id === spec.id && REAL_MODES[spec.mode]) return makeRealCourse(realData, spec.mode, spec.day);
  throw new Error('bad course spec');
}
// What a shot-clock expiry plays: the suggested club and line at power 0.55 (rounded as play() logs them).
function timeoutSwing(h, ball, lie) {
  const club = autoClub(h, ball, lie);
  return { club, aim: q4(aimTarget(h, ball, lie, CLUBS[club])), v: 0.55 };
}
const total = s => s.reduce((a, x) => a + (x || 0), 0);
// No winner until every card is complete.
function strokeResult(pars, scores) {
  const totals = scores.map(s => total(s.slice(0, pars.length))), best = Math.min(...totals);
  const full = scores.every(s => pars.every((_, i) => s[i] != null));
  return { totals, winner: full && totals.filter(t => t === best).length === 1 ? totals.indexOf(best) : null };
}
// Two players. Counts holes in order up to the first one not scored by both; holes after the match is decided don't change it.
// up is the leader's margin (always >= 0).
function matchState(pars, scores) {
  const n = pars.length, holes = new Array(n).fill(null);
  let margin = 0, played = 0, decided = false;
  for (let i = 0; i < n && !decided; i++) {
    const a = scores[0][i], b = scores[1][i];
    if (a == null || b == null) break;
    holes[i] = a < b ? 0 : b < a ? 1 : null;
    margin += a < b ? 1 : b < a ? -1 : 0;
    played = i + 1;
    decided = Math.abs(margin) > n - played || played === n;
  }
  const up = Math.abs(margin), left = n - played, leader = margin > 0 ? 0 : margin < 0 ? 1 : null;
  const label = decided ? (left > 0 ? `${up} & ${left}` : up ? `${up} up` : 'Halved')
    : !up ? 'All square' : up === left ? `Dormie ${up}` : `${up} up`;
  return { holes, up, leader, decided, winner: decided ? leader : null, label };
}
// ── 2v2 teams ── teams: { mode, sides: [[slot, slot], [slot, slot]] }. Best ball: everyone plays their own ball
// (a state per player) and a side's hole is its members' best. Alternate shot and scramble: one ball per side
// (a state per side). gone: slots that have left; their finished holes still count.
const TEAM_MODES = ['bestball', 'alternate', 'scramble'];
const teamBall = teams => !!teams && teams.mode !== 'bestball';
const sideOf = (teams, slot) => teams.sides.findIndex(m => m.includes(slot));
// Each side's score per hole: best ball counts a hole once every member still playing has finished it.
function sideScores(teams, players, states, gone = []) {
  if (teamBall(teams)) return states.map(s => s.scores);
  const n = states[0].course.holes.length;
  return teams.sides.map(m => {
    const idx = m.map(slot => players.findIndex(p => p.slot === slot)).filter(k => k >= 0);
    const live = idx.filter(k => !gone.includes(players[k].slot));
    return Array.from({ length: n }, (_, i) => {
      if (!live.length || live.some(k => states[k].scores[i] == null)) return null;
      return Math.min(...idx.map(k => states[k].scores[i]).filter(x => x != null));
    });
  });
}
// Whether each side has finished its round (every member still playing has; a side with nobody left has not).
function sidesDone(teams, players, states, gone = []) {
  if (teamBall(teams)) return states.map(s => s.done);
  return teams.sides.map(m => {
    const live = m.map(slot => players.findIndex(p => p.slot === slot)).filter(k => k >= 0 && !gone.includes(players[k].slot));
    return live.length > 0 && live.every(k => states[k].done);
  });
}
// Take-turns order. A player who holes out has already moved to the next tee, so the current hole is
// the lowest one anyone still on the course is playing; anyone past it, done, or whose hole is
// scored but not yet moved on from (the UI calls nextHole later) is skipped.
function nextToPlay(states, honour) {
  const live = states.map((s, i) => i).filter(i => !states[i].done && states[i].scores[states[i].holeIdx] == null);
  if (!live.length) return -1;
  const cur = Math.min(...live.map(i => states[i].holeIdx)), on = live.filter(i => states[i].holeIdx === cur);
  if (on.every(i => states[i].shotIdx === 0)) return on.includes(honour) ? honour : on[0];
  let best = on[0], far = -1;
  for (const i of on) { const d = dist(states[i].ball, holeOf(states[i]).pin); if (d > far) { far = d; best = i; } }
  return best;
}
// Applies one swing ({ slot, hole, shot, club, aim, v }) to that player's state (found by its salt).
// Swings must come in shot order: an earlier one is a 'duplicate', a later one is 'early' (the state is
// untouched, so the caller can retry once the missing shots arrive), an illegal one is 'bad'. A tee shot
// on the next hole moves a player on from a scored hole first. st.last keeps play()'s result for the animation.
function applySwing(states, sw) {
  const st = sw && states.find(s => s.salt === '#p' + sw.slot);
  if (!st || !Number.isInteger(sw.hole) || !Number.isInteger(sw.shot)) return 'bad';
  if (sw.hole < st.holeIdx || (sw.hole === st.holeIdx && sw.shot < st.shotIdx)) return 'duplicate';
  const moveOn = st.scores[st.holeIdx] != null, hole = st.holeIdx + (moveOn ? 1 : 0), shot = moveOn ? 0 : st.shotIdx;
  if (st.done || hole >= st.course.holes.length || sw.hole < hole) return 'bad';
  if (sw.hole !== hole || sw.shot !== shot) return 'early';
  if (!Number.isInteger(sw.club) || !CLUBS[sw.club] || !clubAllowed(CLUBS[sw.club], moveOn ? 'tee' : st.lie)
    || !Number.isFinite(sw.aim) || !Number.isFinite(sw.v) || sw.v < 0 || sw.v > METER_MAX) return 'bad';
  if (moveOn) nextHole(st);
  st.last = play(st, sw.aim, sw.club, sw.v);
  return 'applied';
}
// Rebuilds every player's round from a swing log ([{ slot, hole, shot, club, aim, v }], any order
// across players). Each player's swings must run 0, 1, 2… per hole; a gap or duplicate stops that
// player there and sets error.
function replayGame(spec, realData, players, log) {
  const course = courseFromSpec(spec, realData);
  const states = players.map(p => newRound(course.seed, course, '#p' + p.slot));
  let error = null;
  const fail = msg => { if (!error) error = msg; };
  for (const e of log) if (!players.some(p => p.slot === e.slot)) fail(`unknown slot ${e.slot}`);
  players.forEach((p, k) => {
    const st = states[k];
    const mine = log.filter(e => e.slot === p.slot).sort((a, b) => a.hole - b.hole || a.shot - b.shot);
    for (const e of mine) {
      const r = applySwing(states, e), at = `slot ${p.slot} hole ${e.hole} shot ${e.shot}`;
      if (r !== 'applied') { fail(r === 'duplicate' ? `duplicate ${at}` : r === 'early' ? `missing shot before ${at}` : st.done ? `swing after the round: ${at}` : `bad swing ${at}`); break; }
      if (st.scores[st.holeIdx] != null) nextHole(st);
    }
  });
  return { states, scores: states.map(s => s.scores), done: states.map(s => s.done), error };
}

const api = {
  CLUBS, LIE, PURE_LO, PURE_HI, SOLID, METER_MAX, CHIP_YDS, ISLAND_BANK, THEMES, themeFor, inLeafPile,
  carryFactor, powerFor, grade, powerAt, aimAt,
  makeCourse, makeRealCourse, realSurface, heightAt, playsLike, holePlaysLike, surfaceAt, resolveShot, rollOut, gustPush, puttRings, puttsFrom, strokeCap,
  millAngle, millBladeOver, millStrike, inMillZone, portalOut, burnCartHit, shoreR, moatR, isleR,
  clubAllowed, autoClub, aimTarget, targetBand,
  newRound, play, nextHole, holeOf, bestSwing,
  courseFromSpec, timeoutSwing, strokeResult, matchState, nextToPlay, applySwing, replayGame,
  TEAM_MODES, teamBall, sideOf, sideScores, sidesDone,
  nearest, pointAt, normalAt, tangentAt, dist, dirOf, add, rng, hashStr,
};
root.DH = api;
if (typeof module === 'object') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
