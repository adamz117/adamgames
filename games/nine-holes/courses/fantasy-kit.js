// Shared tools for the fantasy courses (Ironmere Quarry, Sunscar Canyon): each course's make.js
// describes its holes in their own frame and these turn them into shapes, in course yards.
//   const K = require('../fantasy-kit.js')(seed, { green, fairway });
// The seed drives the little wobbles in every shape, so the same make.js always draws the same course.
const DH = require('../game.js');

const D2R = Math.PI / 180;

// ── geometry ──
function legsToPath(legs) { // [length, turn°] legs (+ is right) from the tee at the origin, heading +y
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
const pip = (p, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
const dp = (p, eps) => { // Douglas-Peucker on an open line
  if (p.length < 3) return p;
  const a = p[0], b = p.at(-1), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; let best = 0, at = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > best) { best = d; at = i; } }
  return best <= eps ? [a, b] : [...dp(p.slice(0, at + 1), eps).slice(0, -1), ...dp(p.slice(at), eps)];
};
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
// a hole placed with its tee at `tee`, heading h radians clockwise from north
const toWorld = (tee, h) => ([x, y]) => [tee[0] + x * Math.cos(h) + y * Math.sin(h), tee[1] - x * Math.sin(h) + y * Math.cos(h)];
const toLocal = (tee, h) => ([x, y]) => { const dx = x - tee[0], dy = y - tee[1]; return [dx * Math.cos(h) - dy * Math.sin(h), dx * Math.sin(h) + dy * Math.cos(h)]; };
function blobAt(c, rx, ry, rotDeg) {
  const out = [], r = rotDeg * D2R;
  for (let i = 0; i < 16; i++) { const a = (i / 16) * 2 * Math.PI, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)]); }
  return out;
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

// ── rasters: a grid of square cells over a box of course yards ──
function grid(X0, X1, Y0, Y1, CELL) {
  const NX = Math.ceil((X1 - X0) / CELL), NY = Math.ceil((Y1 - Y0) / CELL), cx = i => X0 + (i + 0.5) * CELL, cy = j => Y1 - (j + 0.5) * CELL;
  const outline = mask => { // Moore-neighbour trace of the first piece, then Douglas-Peucker
    const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], on = (x, y) => x >= 0 && y >= 0 && x < NX && y < NY && mask[y * NX + x];
    const s = mask.findIndex(v => v), sx = s % NX, sy = (s / NX) | 0, ring = [[sx, sy]]; let x = sx, y = sy, dir = 0;
    for (let g = 0; g < 400000; g++) { let k = 0; for (; k < 8; k++) { const d = (dir + 6 + k) % 8; if (on(x + D8[d][0], y + D8[d][1])) { dir = d; break; } } if (k === 8) break; x += D8[dir][0]; y += D8[dir][1]; if (x === sx && y === sy) break; ring.push([x, y]); }
    return dp(ring, 0.9);
  };
  const fill = poly => { // inside a polygon, by scanline at cell centres
    const m = new Uint8Array(NX * NY);
    for (let j = 0; j < NY; j++) {
      const y = cy(j), xs = [];
      for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) if ((poly[a][1] > y) !== (poly[b][1] > y)) xs.push(poly[a][0] + (y - poly[a][1]) * (poly[b][0] - poly[a][0]) / (poly[b][1] - poly[a][1]));
      xs.sort((p, q) => p - q);
      for (let s = 0; s + 1 < xs.length; s += 2) for (let i = Math.max(0, Math.ceil((xs[s] - X0) / CELL - 0.5)); i <= Math.min(NX - 1, Math.floor((xs[s + 1] - X0) / CELL - 0.5)); i++) m[j * NX + i] = 1;
    }
    return m;
  };
  // 4-connected pieces of a mask, each outlined (grown by `grow` cells where `blocked` allows, so cut pieces overlap and the seams close)
  const pieces = (mask, min, grow = 0, blocked = null) => {
    const seen = new Uint8Array(NX * NY), rings = [];
    for (let s = 0; s < mask.length; s++) {
      if (!mask[s] || seen[s]) continue;
      const comp = [s]; seen[s] = 1;
      for (let q = 0; q < comp.length; q++) { const k = comp[q], x = k % NX, y = (k / NX) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < NX && ny < NY && mask[ny * NX + nx] && !seen[ny * NX + nx]) { seen[ny * NX + nx] = 1; comp.push(ny * NX + nx); } } }
      if (comp.length < min) continue;
      const m = new Uint8Array(NX * NY); for (const k of comp) m[k] = 1;
      for (let g = 0; g < grow; g++) for (const k of comp) for (const o of [1, -1, NX, -NX, NX + 1, NX - 1, -NX + 1, -NX - 1]) if (k + o >= 0 && k + o < m.length && !(blocked && blocked[k + o])) m[k + o] = 1;
      const ring = outline(m);
      if (ring.length >= 4) rings.push(ring.map(([i, j]) => [cx(i), cy(j)]));
    }
    return rings;
  };
  return { NX, NY, cx, cy, outline, fill, pieces };
}
// nearest point of a polyline: distance and how far along it
const segNear = (p, line) => { let best = { dist: Infinity, d: 0 }, acc = 0; for (let k = 1; k < line.length; k++) { const a = line[k - 1], b = line[k], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)), q = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); if (q < best.dist) best = { dist: q, d: acc + t * Math.sqrt(L2) }; acc += Math.sqrt(L2); } return best; };

module.exports = function kit(seed, HARD = { green: 1, fairway: 1 }) {
  const RNG = DH.rng(DH.hashStr(seed)), rnd = (a, b) => a + (b - a) * RNG();
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

  // every hole's shapes in its own frame. moreWater: water from outside the hole's spec (a river), in its frame,
  // that fairways must stop short of too.
  // A hole spec: legs; fw [from, to, halfWidth, off?]; b bunkers / w ponds / t tree stands [d, off, rx, ry, rot°];
  // creek, creek2 { at: [[d, off], ...], w }; ring [count, radius, gap°]; isle { rIn, rOut, gap, half }; gr [across, along].
  function holeShapes(H, moreWater = []) {
    const raw = legsToPath(H.legs), L = plen(raw), F = frameOf(raw), S = { fairways: [], bunkers: [], water: [], trees: [] };
    for (const x of H.b || []) S.bunkers.push(blob(F, ...x.slice(0, 4), x[4] || 0, 18, 0.1));
    for (const x of H.w || []) S.water.push(blob(F, ...x.slice(0, 4), x[4] || 0, 28, 0.07));
    for (const x of H.t || []) S.trees.push(blob(F, ...x.slice(0, 4), x[4] || 0, 16, 0.12));
    for (const c of [H.creek, H.creek2].filter(Boolean)) S.water.push(creek(F, c.at, c.w));
    if (H.ring) { const [n, r, gap] = H.ring; for (let i = 0; i < n; i++) { const ang = gap + 360 / n * (i + 0.5); S.bunkers.push(blobAt(aroundGreen(F, L, ang, r), 4.2, 3.6, ang)); } }
    if (H.isle) S.water.push(isleWater(F, L, H.isle));
    // fairways stop short of water: each spec is cut into its dry runs, ends (and their round caps) 3 yards clear
    const wetAt = p => S.water.some(w => pip(p, w)) || moreWater.some(w => pip(p, w));
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
    return { raw, L, F, ...S, green, tee, pin: g.p, after, greenR: Math.max(gx, gy), widthAt: d => Math.max(14, ...(H.fw || []).filter(([a, b]) => d >= a - 15 && d <= b + 15).map(([, , w, off]) => w + Math.abs(off || 0))) };
  }

  return { DH, D2R, rnd, legsToPath, plen, chaikin, pip, dp, frameOf, toWorld, toLocal, blob, blobAt, strip, creek, aroundGreen, isleWater, holeShapes, grid, segNear };
};
