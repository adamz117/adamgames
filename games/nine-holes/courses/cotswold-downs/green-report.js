// Each traced green against GolfPass: centre offset from the front/back midpoint, and radius against half the
// front-to-back depth (what greenScale should match). node green-report.js
const fs = require('node:fs');
const path = require('node:path');
const geo = require(path.join(process.env.USERPROFILE, '.claude/skills/real-golf-course/scripts/geo.js')).load(__dirname);
const S = JSON.parse(fs.readFileSync(path.join(__dirname, 'shapes.json'), 'utf8'));
const GP = JSON.parse(fs.readFileSync(path.join(__dirname, 'golfpass-layout.json'), 'utf8')).holes;
for (const g of S.greens) {
  const f = geo.llToPx(GP[g.hole].front), b = geo.llToPx(GP[g.hole].back), mid = [(f[0] + b[0]) / 2, (f[1] + b[1]) / 2];
  const c = g.pts.reduce((a, p) => [a[0] + p[0] / g.pts.length, a[1] + p[1] / g.pts.length], [0, 0]);
  const r = g.pts.reduce((a, p) => a + Math.hypot(p[0] - c[0], p[1] - c[1]), 0) / g.pts.length, want = Math.hypot(f[0] - b[0], f[1] - b[1]) / 2;
  console.log(`${g.hole}\toff ${Math.hypot(c[0] - mid[0], c[1] - mid[1]).toFixed(1)} px\tr ${r.toFixed(1)}\twant ${want.toFixed(1)}\tscale ${(want / r).toFixed(2)}\tmid ${mid.map(v => v.toFixed(1))}`);
}
