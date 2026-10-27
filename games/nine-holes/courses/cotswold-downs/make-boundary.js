// The course outline. OSM maps only holes 1-4 as golf_course ways (1425236040-42, kept in osm-raw.json), and
// the holes are spread across the estate's valleys. So the boundary is those ways plus a BAND m strip round
// every GolfPass hole line and a WALK m path from each green to the next tee (so the pieces join), closed by
// CLOSE m, clipped to the estate (landuse=residential way 983645196, outline kept in estate-nominatim.json),
// traced round (Moore neighbour, Jacob's stopping rule) and simplified.
// node make-boundary.js — run before setup.js, which keeps boundary.json.
const fs = require('node:fs');
const path = require('node:path');

const IDS = ['W983645196'];
const BAND_ = 50, WALK = 12, CLOSE = 35, MINHOLE = 2000, HINT = 15; // metres (MINHOLE: m², smaller enclosed gaps stay course)
const GP = JSON.parse(fs.readFileSync(path.join(__dirname, 'golfpass-layout.json'), 'utf8')).holes;

(async () => {
  const eFile = path.join(__dirname, 'estate-nominatim.json');
  if (!fs.existsSync(eFile)) {
    const r = await fetch(`https://nominatim.openstreetmap.org/lookup?osm_ids=${IDS.join(',')}&polygon_geojson=1&format=json`,
      { headers: { 'User-Agent': 'nine-holes-course-research/1.0' } });
    fs.writeFileSync(eFile, await r.text());
  }
  const rings = JSON.parse(fs.readFileSync(eFile, 'utf8')).map(w => (w.geojson.type === 'Polygon' ? w.geojson.coordinates[0] : w.geojson.coordinates[0][0]));
  if (rings.length !== IDS.length) throw new Error(`got ${rings.length} of ${IDS.length} ways`);
  const golf = JSON.parse(fs.readFileSync(path.join(__dirname, 'osm-raw.json'), 'utf8')).elements
    .filter(e => e.tags && e.tags.leisure === 'golf_course').map(e => e.geometry.map(g => [g.lon, g.lat]));
  const holes = Object.values(GP), lines = holes.map(h => h.path.map(([lat, lon]) => [lon, lat]));
  const walks = holes.slice(1).map((h, k) => [lines[k].at(-1), [h.path[0][1], h.path[0][0]]]);

  // a 1 m grid in local metres
  const all = [...rings.flat(), ...lines.flat()], pad = 0.0012;
  const lat0 = Math.min(...all.map(p => p[1])) - pad, lon0 = Math.min(...all.map(p => p[0])) - pad;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540; // metres per degree
  const toM = ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky], toLL = ([x, y]) => [lat0 + y / ky, lon0 + x / kx];
  const W = Math.ceil(Math.max(...all.map(p => toM(p)[0])) + pad * kx), H = Math.ceil(Math.max(...all.map(p => toM(p)[1])) + pad * ky);
  const m = new Uint8Array(W * H), est = new Uint8Array(W * H);

  for (const ring of rings) { // the OSM ways, scanline-filled at cell centres
    const pts = ring.map(toM);
    for (let y = 0; y < H; y++) {
      const cy = y + 0.5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) est[y * W + x] = 1;
    }
  }
  for (const ring of golf) { // the golf_course ways, filled the same way
    const pts = ring.map(toM);
    for (let y = 0; y < H; y++) {
      const cy = y + 0.5, xs = [];
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); x++) m[y * W + x] = 1;
    }
  }
  const hints = holes.flatMap(h => h.extra.map(([, [lat, lon]]) => [[lon, lat], [lon, lat]])); // GolfPass's bunker/water hints are in play
  for (const [line, BAND] of [...lines.map(l => [l, BAND_]), ...walks.map(l => [l, WALK]), ...hints.map(l => [l, HINT])]) { // the band round each hole's line, the walks between
    const pts = line.map(toM);
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - BAND)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + BAND)); y++)
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - BAND)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + BAND)); x++) {
          const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / L2));
          if (Math.hypot(x + 0.5 - ax - t * dx, y + 0.5 - ay - t * dy) <= BAND) m[y * W + x] = 1;
        }
    }
  }

  // closing: grow by CLOSE, shrink back by CLOSE (3-4 chamfer distances, in metres)
  const distTo = (src, val) => {
    const d = new Float32Array(W * H).fill(1e9);
    for (let i = 0; i < d.length; i++) if (src[i] === val) d[i] = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (!d[i]) continue;
      if (x) d[i] = Math.min(d[i], d[i - 1] + 3);
      if (y) { d[i] = Math.min(d[i], d[i - W] + 3); if (x) d[i] = Math.min(d[i], d[i - W - 1] + 4); if (x < W - 1) d[i] = Math.min(d[i], d[i - W + 1] + 4); }
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; if (!d[i]) continue;
      if (x < W - 1) d[i] = Math.min(d[i], d[i + 1] + 3);
      if (y < H - 1) { d[i] = Math.min(d[i], d[i + W] + 3); if (x < W - 1) d[i] = Math.min(d[i], d[i + W + 1] + 4); if (x) d[i] = Math.min(d[i], d[i + W - 1] + 4); }
    }
    return d.map(v => v / 3);
  };
  const grown = Uint8Array.from(distTo(m, 1), v => (v <= CLOSE ? 1 : 0));
  const back = distTo(grown, 0), u = Uint8Array.from(back, (v, i) => ((v > CLOSE || m[i]) && est[i] ? 1 : 0)); // never loses a band, never leaves the estate

  // the outer outline: start at the topmost-leftmost cell of the biggest piece, walk round it
  const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && u[y * W + x];
  const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const seen = new Uint8Array(W * H); let best = null;
  for (let s0 = 0; s0 < u.length; s0++) {
    if (!u[s0] || seen[s0]) continue;
    const comp = [s0]; seen[s0] = 1;
    for (let k = 0; k < comp.length; k++) { const i = comp[k], x = i % W, y = (i / W) | 0; for (const [dx, dy] of D8) { const nx = x + dx, ny = y + dy; if (on(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; comp.push(ny * W + nx); } } }
    if (!best || comp.length > best.length) best = comp;
  }
  const walk = (inside, cells) => { // Moore neighbour tracing from the topmost-leftmost cell
    const s = cells.reduce((a, b) => (b < a ? b : a)), sx = s % W, sy = (s / W) | 0, out = [[sx, sy]];
    let cx = sx, cy = sy, dir = 6, first = -1;
    for (let guard = 0; guard < 2e6; guard++) {
      let k = 0; for (; k < 8; k++) { const d = (dir + 6 + k) % 8; if (inside(cx + D8[d][0], cy + D8[d][1])) { dir = d; break; } }
      if (k === 8) break;
      if (cx === sx && cy === sy && first >= 0 && dir === first) break;
      if (first < 0) first = dir;
      cx += D8[dir][0]; cy += D8[dir][1];
      if (!(cx === sx && cy === sy)) out.push([cx, cy]);
    }
    return out;
  };
  const out = walk(on, best);
  const dp = (p, eps) => { // Douglas-Peucker
    if (p.length < 3) return p;
    const a = p[0], b = p[p.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let far = 0, at = 0;
    for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > far) { far = d; at = i; } }
    return far <= eps ? [a, b] : [...dp(p.slice(0, at + 1), eps).slice(0, -1), ...dp(p.slice(at), eps)];
  };
  // Ground the course closes right round (the houses inside a loop of holes) is out of bounds too. The boundary
  // is one ring, so each such hole is joined to it by a zero-width bridge at their nearest points and walked the
  // other way round: the game fills the ring (non-zero) and tests points (even-odd) with that hole left out.
  const body = new Uint8Array(W * H); for (const i of best) body[i] = 1;
  const outside = new Uint8Array(W * H), q = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (!body[y * W + x]) { outside[y * W + x] = 1; q.push(y * W + x); }
  for (let y = 0; y < H; y++) for (const x of [0, W - 1]) if (!body[y * W + x] && !outside[y * W + x]) { outside[y * W + x] = 1; q.push(y * W + x); }
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H && !body[ny * W + nx] && !outside[ny * W + nx]) { outside[ny * W + nx] = 1; q.push(ny * W + nx); } } }
  const area = p => p.reduce((a, [x, y], i) => { const [u2, v2] = p[(i + 1) % p.length]; return a + x * v2 - u2 * y; }, 0) / 2;
  let ring = dp(out, 1.5); const cut = [];
  const isHole = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !body[y * W + x] && !outside[y * W + x], hseen = new Uint8Array(W * H);
  for (let s0 = 0; s0 < W * H; s0++) {
    if (!isHole(s0 % W, (s0 / W) | 0) || hseen[s0]) continue;
    const comp = [s0]; hseen[s0] = 1;
    for (let k = 0; k < comp.length; k++) { const i = comp[k], x = i % W, y = (i / W) | 0; for (const [dx, dy] of D8) { const nx = x + dx, ny = y + dy; if (isHole(nx, ny) && !hseen[ny * W + nx]) { hseen[ny * W + nx] = 1; comp.push(ny * W + nx); } } }
    if (comp.length < MINHOLE) continue;
    let h = dp(walk(isHole, comp), 1.5);
    if (Math.sign(area(h)) === Math.sign(area(ring))) h = h.reverse();
    let bi = 0, bj = 0, bd = Infinity;
    for (let i = 0; i < ring.length; i++) for (let j = 0; j < h.length; j++) { const d = Math.hypot(ring[i][0] - h[j][0], ring[i][1] - h[j][1]); if (d < bd) { bd = d; bi = i; bj = j; } }
    ring = [...ring.slice(0, bi + 1), ...h.slice(bj), ...h.slice(0, bj + 1), ...ring.slice(bi)];
    cut.push(`${(comp.length / 1e4).toFixed(1)} ha (bridge ${bd.toFixed(0)} m)`);
  }
  const simple = ring.map(([x, y]) => toLL([x + 0.5, y + 0.5]));
  fs.writeFileSync(path.join(__dirname, 'boundary.json'), JSON.stringify({
    source: `OSM golf_course ways 1425236040-42, a ${BAND_} m band round each GolfPass hole line a ${WALK} m walk to each next tee and ${HINT} m round each GolfPass hint, closed by ${CLOSE} m, clipped to the estate (OSM ${IDS.join(', ')}, nominatim)`,
    elements: [{ type: 'way', geometry: simple.map(([lat, lon]) => ({ lat: +lat.toFixed(7), lon: +lon.toFixed(7) })) }],
  }));
  console.log(`boundary: ${simple.length} points, ${(best.length / 1e4).toFixed(1)} ha (the bands alone: ${(m.reduce((a, v) => a + v, 0) / 1e4).toFixed(1)} ha), houses cut out: ${cut.join(', ') || 'none'}`);
})();
