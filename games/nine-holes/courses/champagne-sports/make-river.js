// The rivers as water: node make-river.js (after setup.js). The Sterkspruit runs through the course in a
// wooded gorge (the 1st, 3rd, 10th and 18th cross it) and a smaller river crosses the 11th; both are mostly
// under the canopy, so colour can't find them. OSM maps them as lines: each is drawn HALF px either side of
// its line, traced round and put in shapes.json manual.water (re-running replaces them). OSM's lines stray
// up to ~35 m from the channel, so each is first snapped onto the darkest strip within SNAP px either side
// (the channel is a dark line on the satellite), with the shifts smoothed so it can't jump onto a shadow.
const fs = require('node:fs');
const path = require('node:path');
const { maths } = require('C:/Users/adamz/.claude/skills/real-golf-course/scripts/geo.js');

const dir = __dirname;
const SNAP = 20, SMOOTH = 6, MIN_CONTRAST = 12;
const RIVERS = [
  { way: 93585977, name: 'Sterkspruit', half: 6 },
  { way: 93560084, name: 'river by the 11th', half: 4 },
];

(async () => {
  const ids = RIVERS.map(r => r.way).join(','), raw = path.join(dir, 'osm-water.json');
  let data = fs.existsSync(raw) ? JSON.parse(fs.readFileSync(raw, 'utf8')) : null; // kept: Overpass is often busy
  if (!data) for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'nine-holes-course-research/1.0' }, body: 'data=' + encodeURIComponent(`[out:json][timeout:40];way(id:${ids});out geom;`) });
      if (r.ok) { data = await r.json(); break; }
    } catch (e) { /* try the next */ }
  }
  if (!data) throw new Error('Overpass is busy: try again in a minute');
  if (!fs.existsSync(raw)) fs.writeFileSync(raw, JSON.stringify(data));

  const G = maths(JSON.parse(fs.readFileSync(path.join(dir, 'grid.json'), 'utf8'))), W = Math.ceil(G.W), H = Math.ceil(G.H);
  const S = JSON.parse(fs.readFileSync(path.join(dir, 'shapes.json'), 'utf8'));
  S.manual = S.manual || {};
  S.manual.water = (S.manual.water || []).filter(w => !String(w.why).startsWith('river:'));
  const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const dp = (p, eps) => { // Douglas-Peucker
    if (p.length < 3) return p;
    const a = p[0], b = p[p.length - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let far = 0, at = 0;
    for (let i = 1; i < p.length - 1; i++) { const d = Math.abs((b[0] - a[0]) * (a[1] - p[i][1]) - (a[0] - p[i][0]) * (b[1] - a[1])) / L; if (d > far) { far = d; at = i; } }
    return far <= eps ? [a, b] : [...dp(p.slice(0, at + 1), eps).slice(0, -1), ...dp(p.slice(at), eps)];
  };

  // brightness of a map pixel, from the stitched satellite (.cache/course.rgb, 4 image px per map px)
  const img = fs.readFileSync(path.join(dir, '.cache', 'course.rgb')), IW = W * 4;
  const lum = (x, y) => { // a 2x2 map-px block, so one dark leaf doesn't count
    let s = 0, n = 0;
    for (let yy = Math.round(y * 4) - 4; yy < Math.round(y * 4) + 4; yy += 2) for (let xx = Math.round(x * 4) - 4; xx < Math.round(x * 4) + 4; xx += 2) {
      if (xx < 0 || yy < 0 || xx >= IW || yy >= H * 4) continue;
      const o = (yy * IW + xx) * 3; s += 0.3 * img[o] + 0.59 * img[o + 1] + 0.11 * img[o + 2]; n++;
    }
    return n ? s / n : 255;
  };
  function snap(raw) {
    const pts = []; // every 3 px along the line
    for (let k = 0; k + 1 < raw.length; k++) {
      const [ax, ay] = raw[k], [bx, by] = raw[k + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
      for (let i = 0; i < n; i++) pts.push([ax + (bx - ax) * i / n, ay + (by - ay) * i / n]);
    }
    pts.push(raw[raw.length - 1]);
    const off = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 2)], b = pts[Math.min(pts.length - 1, i + 2)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, prof = [];
      for (let o = -SNAP; o <= SNAP; o++) prof.push(lum(p[0] + nx * o, p[1] + ny * o));
      const min = Math.min(...prof), med = [...prof].sort((x, y) => x - y)[prof.length >> 1];
      return { nx, ny, o: med - min >= MIN_CONTRAST ? prof.indexOf(min) - SNAP : null };
    });
    return pts.map((p, i) => { // smoothed shift; points with no clear channel take their neighbours'
      let s = 0, n = 0;
      for (let j = Math.max(0, i - SMOOTH); j <= Math.min(pts.length - 1, i + SMOOTH); j++) if (off[j].o != null) { s += off[j].o; n++; }
      const o = n ? s / n : 0;
      return [p[0] + off[i].nx * o, p[1] + off[i].ny * o];
    });
  }

  for (const R of RIVERS) {
    const way = data.elements.find(e => e.id === R.way);
    if (!way) throw new Error(`no way ${R.way} from Overpass`);
    const line = snap(way.geometry.map(p => G.llToPx([p.lat, p.lon])));
    const m = new Uint8Array(W * H);
    for (let k = 0; k + 1 < line.length; k++) { // every pixel within R.half of the line
      const [ax, ay] = line[k], [bx, by] = line[k + 1], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let y = Math.max(0, Math.floor(Math.min(ay, by) - R.half)); y <= Math.min(H - 1, Math.ceil(Math.max(ay, by) + R.half)); y++)
        for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - R.half)); x <= Math.min(W - 1, Math.ceil(Math.max(ax, bx) + R.half)); x++) {
          const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / L2));
          if (Math.hypot(x + 0.5 - ax - t * dx, y + 0.5 - ay - t * dy) <= R.half) m[y * W + x] = 1;
        }
    }
    // each piece on the map, outlined (Moore neighbour, Jacob's stopping rule) and simplified
    const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];
    const seen = new Uint8Array(W * H); let pieces = 0;
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || seen[s]) continue;
      const comp = [s]; seen[s] = 1;
      for (let k = 0; k < comp.length; k++) { const i = comp[k], x = i % W, y = (i / W) | 0; for (const [dx, dy] of D8) { const nx = x + dx, ny = y + dy; if (on(nx, ny) && !seen[ny * W + nx]) { seen[ny * W + nx] = 1; comp.push(ny * W + nx); } } }
      if (comp.length < 30) continue;
      const sx = s % W, sy = (s / W) | 0, out = [[sx, sy]];
      let cx = sx, cy = sy, d = 6, first = -1;
      for (let guard = 0; guard < 400000; guard++) {
        let k = 0; for (; k < 8; k++) { const dd = (d + 6 + k) % 8; if (on(cx + D8[dd][0], cy + D8[dd][1])) { d = dd; break; } }
        if (k === 8) break;
        if (cx === sx && cy === sy && first >= 0 && d === first) break;
        if (first < 0) first = d;
        cx += D8[d][0]; cy += D8[d][1];
        if (!(cx === sx && cy === sy)) out.push([cx, cy]);
      }
      const pts = dp(out, 0.7).map(([x, y]) => [+(x + 0.5).toFixed(1), +(y + 0.5).toFixed(1)]);
      if (pts.length >= 3) { S.manual.water.push({ why: `river: the ${R.name} (OSM way ${R.way}), ${R.half * 2} px wide`, pts }); pieces++; }
    }
    console.log(`${R.name}: ${pieces} piece(s) on the map`);
  }
  fs.writeFileSync(path.join(dir, 'shapes.json'), JSON.stringify(S, null, 1));
})();
