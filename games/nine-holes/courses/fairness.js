// The fairness bot: node courses/fairness.js [rounds] [course ...]
// Plays like a good golfer: before each shot it tries every club on several lines, simulates each a few
// times with the game's own physics, and takes the one that leaves the fewest strokes on average; then it
// swings with a little human error. A hard hole costs it strokes; an unfair one (no safe way to play it)
// shows up as a hole it can't get round near par even playing well.
// SAVE=1 writes each course's per-hole hardness to courses/<id>/hardness.json, which a fantasy course's
// make.js turns into its stroke index (only when asked, so a rating run never reshuffles a scorecard).
const fs = require('node:fs');
const path = require('node:path');
const DH = require('../game.js');

const ROUNDS = +process.argv[2] || 8;
const SLOPPY = +process.env.SLOPPY || 1; // 2 or 3: a club golfer's timing and aim
const COURSES = process.argv.slice(3).length ? process.argv.slice(3) : ['ironmere'];
const TABLE = [[0, 1.5], [5, 2.1], [20, 2.4], [50, 2.65], [100, 2.85], [150, 3.0], [200, 3.2], [250, 3.45], [300, 3.7], [400, 4.05], [500, 4.5], [650, 5.0]];
const LIE_ADD = { tee: 0, fairway: 0, rough: 0.22, bunker: 0.38, trees: 0.75 };
const base = d => { for (let i = 1; i < TABLE.length; i++) if (d <= TABLE[i][0]) { const [a, x] = TABLE[i - 1], [b, y] = TABLE[i]; return x + (y - x) * (d - a) / (b - a); } return 5 + (d - 650) / 250; };
const playable = s => (s === 'water' || s === 'ob' ? 'rough' : s);
const est = (h, p, surf) => (surf === 'green' ? DH.puttsFrom(h, p) : base(DH.dist(p, h.pin)) + (LIE_ADD[surf] ?? 0.15));

function choose(h, ball, lie, salt) {
  let best = null;
  const pinDir = Math.atan2(h.pin.x - ball.x, h.pin.y - ball.y);
  for (let ci = 0; ci < DH.CLUBS.length; ci++) {
    if (!DH.clubAllowed(DH.CLUBS[ci], lie)) continue;
    const c = DH.CLUBS[ci], b = DH.targetBand(h, ball, lie, c), v = ((b.lo + b.hi) / 2) * DH.METER_MAX;
    const lines = [...new Set([DH.aimTarget(h, ball, lie, c), pinDir])];
    for (const line of lines) for (const off of [-9, -5, -2, 0, 2, 5, 9]) {
      const aim = line + off * Math.PI / 180;
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        const r = DH.resolveShot(h, ball, lie, c, aim, v, DH.rng(DH.hashStr(`${salt}|${ci}|${off}|${line}|${k}`)));
        sum += 1 + r.penalty + (r.holed ? 0 : est(h, r.rest, playable(r.restSurf)));
      }
      if (!best || sum < best.score) best = { score: sum, ci, aim, v };
    }
  }
  return best;
}

const DAYS = Array.from({ length: ROUNDS }, (_, i) => `2026-11-${String(1 + i).padStart(2, '0')}`);
for (const id of COURSES) {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, id, id + '.json'), 'utf8'));
  const per = data.holes.map(() => []), wet = data.holes.map(() => 0);
  for (const day of DAYS) {
    const st = DH.newRound(day, DH.makeRealCourse(data, 'all', day)), noise = DH.rng(DH.hashStr('human|' + day));
    let guard = 0;
    while (!st.done && guard++ < 400) {
      const h = DH.holeOf(st), pick = choose(h, st.ball, st.lie, `${day}|${st.holeIdx}|${st.shotIdx}`);
      const res = DH.play(st, pick.aim + (noise() - 0.5) * 0.035 * SLOPPY, pick.ci, pick.v + (noise() - 0.5) * 0.05 * SLOPPY * DH.METER_MAX);
      if (res.penalty) wet[st.holeIdx]++;
      if (res.score != null) { per[st.holeIdx].push(res.score - h.par); DH.nextHole(st); }
    }
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const total = DAYS.map((_, r) => per.reduce((a, p) => a + p[r], 0));
  console.log(`\n${data.name}: ${ROUNDS} rounds, average ${mean(total) >= 0 ? '+' : ''}${mean(total).toFixed(1)} (best ${Math.min(...total)}, worst ${Math.max(...total)})`);
  data.holes.forEach((h, i) => console.log(`  ${String(h.n).padStart(2)} par ${h.par} ${String(h.cardYds).padStart(3)}y  avg ${mean(per[i]) >= 0 ? '+' : ''}${mean(per[i]).toFixed(2)}  worst +${Math.max(...per[i])}  penalties ${wet[i]}`));
  if (process.env.SAVE) fs.writeFileSync(path.join(__dirname, id, 'hardness.json'), JSON.stringify(per.map(mean)));
}
