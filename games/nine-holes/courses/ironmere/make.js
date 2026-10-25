// Ironmere Quarry: an original course, designed here rather than traced. node courses/ironmere/make.js
// Eighteen holes through a flooded slate quarry: water-filled pits, slate waste, pot bunkers, a creek,
// two island greens. Hard, but every hazard has a way round it: no forced carry longer than a 4 iron,
// every island green has a land bridge, every narrow drive has a wider lay-up short of it.
// Writes ironmere.json in the same format build.js makes for a traced course (course yards, x east, y north).
const fs = require('node:fs');
const path = require('node:path');
// the difficulty dials, tuned with sim.js: every green and fairway is drawn this much smaller than its spec
const HARD = { green: 0.9, fairway: 0.86 };
const K = require('../fantasy-kit.js')('ironmere-quarry', HARD);
const { D2R, chaikin, holeShapes, toWorld, segNear } = K, inPoly = K.pip;

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

// ── routing: two loops of nine round the clubhouse at (0, 0), placed hole by hole so no two holes
// come within SEP yards of each other (their corridors never touch) ──
const SEP = 95;
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

const shapes = HOLES.map(H => holeShapes(H));
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
const GR = K.grid(X0, X1, Y0, Y1, CELL), { NX, NY, cx, cy } = GR;
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
out.boundary = chaikin(GR.outline(inside).map(([i, j]) => [cx(i), cy(j)]), 2, true).map(p => p.map(r1));
// the pines: outside every hole's corridor (which breathes with a little noise), off the water, sand, greens and tees
const hazards = [...out.water, ...out.bunkers, ...out.greens, ...out.tees].map(s => s.pts);
const hBox = hazards.map(p => [Math.min(...p.map(q => q[0])) - 8, Math.min(...p.map(q => q[1])) - 8, Math.max(...p.map(q => q[0])) + 8, Math.max(...p.map(q => q[1])) + 8]);
const noise = (x, y) => Math.sin(x / 37 + 1.3) * Math.cos(y / 41 - 0.7) + 0.5 * Math.sin((x + y) / 19);
// the flooded pits: inside each loop, everything more than ~84 yards from play is deep water
const inB = GR.fill(out.boundary); // inside the boundary outline (the loops' middles too)
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
for (const ring of GR.pieces(lake, 3000)) out.water.push({ pts: chaikin(ring, 2, true).map(p => p.map(r1)) });
for (const ring of GR.pieces(pines, 18, 1, lake)) out.trees.push({ pts: chaikin(ring, 1, true).map(p => p.map(r1)) });

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
