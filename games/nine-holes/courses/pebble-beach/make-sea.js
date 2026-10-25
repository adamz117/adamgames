// The Pacific for Pebble Beach: node make-sea.js (after setup.js has made grid.json and shapes.json).
// OSM maps the sea as coastline ways (land on the left), not as a lake, so they are chained end to end
// and closed far out to sea. The whole polygon goes in landmarks.json (water beyond the boundary, drawn
// under the course); the part over the map also goes in shapes.json manual.water, so the tracer keeps
// trees, fairways and bunkers off it and it plays as water inside the boundary too.
const fs = require('node:fs');
const path = require('node:path');
const { maths } = require('C:/Users/adamz/.claude/skills/real-golf-course/scripts/geo.js');

const dir = __dirname;
const raw = JSON.parse(fs.readFileSync(path.join(dir, 'coast-raw.json'), 'utf8')).elements;
const key = p => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
const open = raw.filter(e => key(e.geometry[0]) !== key(e.geometry.at(-1))); // closed ways are offshore rocks
// start at the way no other way ends at, then follow end -> start
let cur = open.find(e => !open.some(o => o !== e && key(o.geometry.at(-1)) === key(e.geometry[0])));
const chain = [], used = new Set();
while (cur && !used.has(cur.id)) {
  used.add(cur.id);
  chain.push(...(chain.length ? cur.geometry.slice(1) : cur.geometry));
  cur = open.find(o => !used.has(o.id) && key(o.geometry[0]) === key(cur.geometry.at(-1)));
}
if (used.size !== open.length) throw new Error(`coastline did not chain: ${used.size} of ${open.length} ways`);
const coast = chain.map(p => [p.lat, p.lon]), a = coast[0], b = coast.at(-1);
// close it out at sea: south of the last point, then west, then north past the first point
const sea = [...coast, [b[0] - 0.006, b[1]], [b[0] - 0.006, -121.99], [a[0], -121.99]];
const lodge = JSON.parse(fs.readFileSync(path.join(dir, 'lodge-raw.json'), 'utf8')).elements[0].geometry.map(p => [p.lat, p.lon]);
fs.writeFileSync(path.join(dir, 'landmarks.json'), JSON.stringify([
  { name: 'Pacific Ocean', kind: 'water', ll: sea },
  { name: 'The Lodge at Pebble Beach', kind: 'building', ll: lodge },
]));

// the same polygon in map px, clipped to the map (Sutherland-Hodgman against each edge of the rectangle)
const G = maths(JSON.parse(fs.readFileSync(path.join(dir, 'grid.json'), 'utf8')));
const clip = (poly, inside, cut) => poly.flatMap((p, i) => {
  const q = poly[(i + poly.length - 1) % poly.length], out = [];
  if (inside(p)) { if (!inside(q)) out.push(cut(q, p)); out.push(p); } else if (inside(q)) out.push(cut(q, p));
  return out;
});
const at = (q, p, t) => [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t];
let px = sea.map(ll => G.llToPx(ll));
px = clip(px, p => p[0] >= 0, (q, p) => at(q, p, (0 - q[0]) / (p[0] - q[0])));
px = clip(px, p => p[0] <= G.W, (q, p) => at(q, p, (G.W - q[0]) / (p[0] - q[0])));
px = clip(px, p => p[1] >= 0, (q, p) => at(q, p, (0 - q[1]) / (p[1] - q[1])));
px = clip(px, p => p[1] <= G.H, (q, p) => at(q, p, (G.H - q[1]) / (p[1] - q[1])));
const S = JSON.parse(fs.readFileSync(path.join(dir, 'shapes.json'), 'utf8'));

// The shore: OSM's coastline is the waterline, but the course boundary runs along the clifftop, so the
// cliff faces, rocks and beach between them would play as out of bounds. At Pebble the whole coast is a
// penalty area, so ground outside the boundary within SHORE px of both the sea and the course is water too
// (extra landmark lakes: their edges sit on the surf line and the boundary, so they add almost no lines).
const SHORE = 30, W = Math.ceil(G.W), H = Math.ceil(G.H);
const fillPoly = pts => { // even-odd scanline fill at pixel centres
  const m = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const cy = y + 0.5, xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > cy) !== (yj > cy)) xs.push(xi + (cy - yi) * (xj - xi) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) m[y * W + x] = 1;
  }
  return m;
};
const near = (src, r) => { // chessboard distance <= r from any pixel of src
  const d = new Int16Array(W * H).fill(-1), q = [];
  for (let i = 0; i < src.length; i++) if (src[i]) { d[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i / W) | 0; if (d[i] >= r) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx; if (d[j] < 0) { d[j] = d[i] + 1; q.push(j); }
    }
  }
  return d.map(v => (v >= 0 ? 1 : 0));
};
const seaM = fillPoly(px), inB = fillPoly(S.boundary), nSea = near(seaM, SHORE), nB = near(inB, SHORE);
// the strip outside the boundary, grown 3 px into the sea and the course: pieces that only touched the sea and the
// boundary left hairline slivers of out of bounds between them once smoothed (water beyond the boundary only counts
// outside it, and the course is drawn over the rest, so the overlap changes nothing else)
const gap = new Uint8Array(W * H); for (let i = 0; i < gap.length; i++) gap[i] = !inB[i] && !seaM[i] && nSea[i] && nB[i] ? 1 : 0;
const strip = near(gap, 3);
for (let i = 0; i < strip.length; i++) if (strip[i] && !gap[i] && !seaM[i] && !inB[i]) strip[i] = 0; // grow into sea or course only
// each piece of the strip, outlined by Moore-neighbour tracing, then simplified
const seen = new Uint8Array(W * H), pieces = [];
const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && strip[y * W + x];
const dp = (p, eps) => { // Douglas-Peucker
  if (p.length < 3) return p;
  const [a, b] = [p[0], p.at(-1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  let best = 0, at = 0;
  for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > best) { best = d; at = i; } }
  return best <= eps ? [a, b] : [...dp(p.slice(0, at + 1), eps).slice(0, -1), ...dp(p.slice(at), eps)];
};
for (let s = 0; s < strip.length; s++) {
  if (!strip[s] || seen[s]) continue;
  const comp = [s]; seen[s] = 1;
  for (let k = 0; k < comp.length; k++) { const i = comp[k], x = i % W, y = (i / W) | 0; for (const [dx, dy] of D8) { const nx = x + dx, ny = y + dy; if (on(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; comp.push(ny * W + nx); } } }
  if (comp.length < 4) continue; // even a pocket of rock between the sea and a fairway is the sea's
  const start = comp.reduce((a, b) => (b < a ? b : a)), sx = start % W, sy = (start / W) | 0; // topmost, then leftmost
  // done only when back at the start heading the way it first left (Jacob's rule): a piece with a narrow neck
  // passes its start pixel part-way round, and stopping there cut it short
  const out = [[sx, sy]]; let cx = sx, cy = sy, dir = 6, first = -1;
  for (let guard = 0; guard < 200000; guard++) {
    let k = 0; for (; k < 8; k++) { const d = (dir + 6 + k) % 8; if (on(cx + D8[d][0], cy + D8[d][1])) { dir = d; break; } }
    if (k === 8) break;
    if (cx === sx && cy === sy && first >= 0 && dir === first) break;
    if (first < 0) first = dir;
    cx += D8[dir][0]; cy += D8[dir][1];
    if (!(cx === sx && cy === sy)) out.push([cx, cy]);
  }
  if (out.length < 4) continue;
  const simple = dp(out, 0.8).map(([x, y]) => [x + 0.5, y + 0.5]); // open outline: a closed one has equal ends and collapses
  if (simple.length >= 3) pieces.push(simple);
}
const L0 = JSON.parse(fs.readFileSync(path.join(dir, 'landmarks.json'), 'utf8'));
fs.writeFileSync(path.join(dir, 'landmarks.json'), JSON.stringify([...L0, ...pieces.map(p => ({ name: '', kind: 'water', ll: p.map(([x, y]) => G.toLL(x, y)) }))]));
console.log(`shore: ${pieces.length} pieces of cliff, rock and beach made water`);

S.manual = S.manual || {};
S.manual.water = (S.manual.water || []).filter(w => w.why !== 'Pacific Ocean (OSM coastline)');
S.manual.water.push({ why: 'Pacific Ocean (OSM coastline)', pts: px.map(p => p.map(v => +v.toFixed(1))) });
fs.writeFileSync(path.join(dir, 'shapes.json'), JSON.stringify(S, null, 1));
console.log(`sea: ${coast.length} coast points from ${used.size} ways; ${px.length} points over the map`);
