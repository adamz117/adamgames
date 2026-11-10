// Pin High: a daily round of seven "name a ..." holes. One answer a hole, 25 seconds each.
// The better known your answer, the worse your lie: bunker, rough, fairway, green, cup.
(() => {
'use strict';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const TIERS = [
  { id: 'bunker', name: 'Bunker', pts: 10, color: '#e3c27a', blurb: 'The answer everyone blurts out', emoji: '🟨' },
  { id: 'rough', name: 'Rough', pts: 30, color: '#8fa856', blurb: 'Well known. Half the field is in here', emoji: '🟫' },
  { id: 'fairway', name: 'Fairway', pts: 60, color: '#58b368', blurb: 'Uncommon. A proper strike', emoji: '🟩' },
  { id: 'green', name: 'Green', pts: 85, color: '#a8e07a', blurb: 'Few people would go here', emoji: '🟢' },
  { id: 'cup', name: 'In the cup', pts: 100, color: '#f2b93b', blurb: 'The least-known answer on the card', emoji: '⛳' },
];
const WATER = { id: 'water', name: 'In the water', pts: 0, color: '#6fb6d6', emoji: '🌊' };
const tierOf = (t) => (t >= 0 ? TIERS[t] : WATER);
const BANDS = [
  { min: 0, range: '0–150', name: 'Sunday hacker', line: 'Plenty of course left out there.' },
  { min: 151, range: '151–250', name: 'Club golfer', line: 'Playing with the pack.' },
  { min: 251, range: '251–350', name: 'Single figures', line: 'Finding fairways. Nice.' },
  { min: 351, range: '351–449', name: 'Scratch', line: 'A seriously tidy round.' },
  { min: 450, range: '450+', name: 'Tour card', line: 'Pin high all day. Absurd.' },
];
const bandFor = (s) => [...BANDS].reverse().find((b) => s >= b.min);
const HOLES = 7, PREVIEW_MS = 3000, ANSWER_MS = 25000;
const EPOCH = '2026-11-10'; // round No. 1
const LS = { stats: 'pinhigh:stats:v1', game: 'pinhigh:game:v1', mute: 'pinhigh:mute' };

// ---------- small helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function rng(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = h >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = (arr, r) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const dateStr = (d = new Date()) => d.toLocaleDateString('en-CA');
const dayNo = (s) => Math.round((Date.parse(s + 'T00:00:00Z') - Date.parse(EPOCH + 'T00:00:00Z')) / 864e5) + 1;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- answer matching ----------
// norm() must stay the same as the one in games/pin-high/build-data.js.
const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, '');
const STOP = new Set(['the', 'of', 'and', 'in', 'for', 'von', 'van', 'der', 'del', 'los', 'las', 'san', 'saint', 'new', 'united']);

function buildIndex(answers) {
  const exact = new Map();   // every accepted spelling -> answer
  const parts = new Map();   // a word or run of words from a name -> best-known answer with it
  const keys = [];           // [spelling, answer] pairs for the typo search
  const add = (k, i) => { if (k && !exact.has(k)) { exact.set(k, i); keys.push([k, i]); } };
  answers.forEach((a, i) => { add(norm(a[0]), i); });
  answers.forEach((a, i) => { for (let j = 3; j < a.length; j++) add(norm(a[j]), i); });
  for (const [k, i] of [...keys]) if (k.includes(' ')) { const s = k.replace(/ /g, ''); if (!exact.has(s)) exact.set(s, i); }
  answers.forEach((a, i) => {
    const t = norm(a[0]).split(' ');
    if (t.length < 2) return;
    for (let n = 1; n < t.length; n++) for (let s = 0; s + n <= t.length; s++) {
      const k = t.slice(s, s + n).join(' ');
      if (k.length < 3 || (n === 1 && STOP.has(k)) || exact.has(k) || parts.has(k)) continue;
      parts.set(k, i);
    }
  });
  return { exact, parts, keys };
}

// Damerau-Levenshtein, giving up once the distance must exceed max.
function editDistance(a, b, max) {
  const la = a.length, lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = null, prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2 = prev; prev = cur;
  }
  return prev[lb];
}

// -> { i, sure } where sure means it was typed as an accepted spelling; null when nothing is close.
function resolve(index, text) {
  const k = norm(text);
  if (!k) return null;
  if (index.exact.has(k)) return { i: index.exact.get(k), sure: true };
  const squashed = k.replace(/ /g, '');
  if (index.exact.has(squashed)) return { i: index.exact.get(squashed), sure: true };
  if (index.parts.has(k)) return { i: index.parts.get(k), sure: false };
  const max = k.length < 4 ? 0 : k.length < 6 ? 1 : k.length < 10 ? 2 : 3;
  if (!max) return null;
  let best = null, bestD = max + 1;
  const scan = (list) => { for (const [key, i] of list) { const d = editDistance(k, key, Math.min(max, bestD)); if (d < bestD || (d === bestD && best !== null && i < best)) { bestD = d; best = i; } } };
  scan(index.keys);
  if (best === null) { bestD = Math.min(max, 2) + 1; scan(index.parts); }
  return best === null ? null : { i: best, sure: false };
}

// ---------- sound ----------
const sfx = (() => {
  let ac = null, muted = store.get(LS.mute, false);
  const ctx = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; };
  function tone(f0, f1, dur, peak, type = 'sine', delay = 0) {
    const a = ctx(); if (!a || muted) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, peak, f0, f1, delay = 0) {
    const a = ctx(); if (!a || muted) return;
    const t = a.currentTime + delay, n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), flt = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; flt.type = 'bandpass'; flt.Q.value = 0.8;
    flt.frequency.setValueAtTime(f0, t); flt.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(flt).connect(g).connect(a.destination); src.start(t);
  }
  const play = {
    swing() { noise(0.22, 0.35, 500, 3200); tone(900, 300, 0.07, 0.25, 'triangle', 0.16); },
    thud() { tone(150, 60, 0.16, 0.4); noise(0.08, 0.12, 900, 300); },
    sand() { noise(0.3, 0.3, 2400, 700); tone(110, 50, 0.12, 0.25); },
    splash() { noise(0.55, 0.35, 1800, 300); tone(300, 90, 0.25, 0.15); },
    cup() { tone(640, 620, 0.09, 0.3, 'triangle'); noise(0.12, 0.12, 2600, 1800, 0.05); [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.5, 0.16, 'sine', 0.22 + i * 0.09)); },
    green() { tone(150, 60, 0.14, 0.3); [659, 880].forEach((f, i) => tone(f, f, 0.35, 0.12, 'sine', 0.5 + i * 0.1)); },
    tick() { tone(1000, 900, 0.05, 0.12, 'square'); },
    no() { tone(180, 120, 0.18, 0.2, 'sawtooth'); },
    go() { tone(520, 780, 0.12, 0.14, 'triangle'); },
    click() { tone(700, 500, 0.05, 0.1, 'triangle'); },
  };
  return {
    play(name) { try { play[name]?.(); } catch {} },
    get muted() { return muted; },
    toggle() { muted = !muted; store.set(LS.mute, muted); return muted; },
  };
})();

// ---------- the hole, drawn side-on ----------
const scene = (() => {
  const cv = $('#scene'), g = cv.getContext('2d');
  const WORLD = 356, TEE = 24;
  // sky top, sky bottom, sun, overall tint, tint strength: dawn through to dusk across the round
  const SKIES = [
    ['#39437a', '#f4b08a', '#ffd9a8', '#ff9e7a', 0.14],
    ['#4a8fd4', '#d6ebf5', '#fff3c9', '#ffe2b0', 0.05],
    ['#3a84d8', '#c3e2f6', '#fff7da', '#ffffff', 0],
    ['#2f7bd6', '#aedaf7', '#fffbe6', '#ffffff', 0],
    ['#4b84c6', '#f1e3b4', '#fff0bd', '#ffd98a', 0.07],
    ['#5a68a6', '#f7b56b', '#ffd28a', '#ff9a4d', 0.15],
    ['#33295e', '#ee8660', '#ffb07a', '#b0507a', 0.22],
  ];
  let W = 0, H = 0, dpr = 1, ppy = 4, vs = 5, ts = 1, groundY = 0, cam = 0, camTo = 0;
  let hole = null, pending = null, fade = 0, fadeDir = 0;
  let ball = { state: 'tee', x: TEE, lift: 0, alpha: 1, sink: 0 };
  let flight = null, trail = [], parts = [], rings = [], markers = 0, markersOn = false, flagShake = 0, flash = 0, swingT = -1;
  let last = performance.now(), time = 0;

  function makeHole(i, seed) {
    const r = rng(seed + ':' + i);
    const h = {
      i, sky: SKIES[i % SKIES.length],
      p1: r() * 6.28, p2: r() * 6.28, a1: 2.6 + r() * 2.6, a2: 0.9 + r() * 1.4, f1: 0.016 + r() * 0.01, f2: 0.043 + r() * 0.02,
      water: [40, 64], bunker: [73, 99], fw: [156 + r() * 10, 246 + r() * 8], green: [264, 326], pin: 298 + r() * 10,
      trees: [], bushes: [], clouds: [], hills: [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28],
    };
    for (let x = -20; x < WORLD + 60; x += 9 + r() * 16) h.trees.push({ x, s: 0.7 + r() * 0.9, pine: r() < 0.4, tone: r() });
    for (const x of [108 + r() * 20, 140 + r() * 10, 252 + r() * 6, 330 + r() * 6, 342 + r() * 8]) h.bushes.push({ x, s: 0.8 + r() * 0.7, tone: r(), pine: r() < 0.3 });
    for (let c = 0; c < 6; c++) h.clouds.push({ x: r(), y: 0.08 + r() * 0.28, s: 0.6 + r() * 0.9, v: 0.004 + r() * 0.006 });
    const raw = (x) => h.a1 * Math.sin(x * h.f1 + h.p1) + h.a2 * Math.sin(x * h.f2 + h.p2);
    const teeE = raw(TEE), greenE = raw((h.green[0] + h.green[1]) / 2) + 1.4;
    h.waterE = Math.min(raw(h.water[0] - 3), raw(h.water[1] + 3)) - 1.1;
    h.elev = (x) => {
      let e = raw(x);
      e = lerp(e, teeE, smooth(4, 12, x) * (1 - smooth(32, 38, x)));
      e = lerp(e, greenE, smooth(h.green[0] - 10, h.green[0], x) * (1 - smooth(h.green[1], h.green[1] + 10, x)));
      if (x > h.bunker[0] && x < h.bunker[1]) e -= 2.3 * Math.sin(Math.PI * (x - h.bunker[0]) / (h.bunker[1] - h.bunker[0]));
      e -= 4.4 * smooth(h.water[0] - 3, h.water[0] + 2, x) * (1 - smooth(h.water[1] - 2, h.water[1] + 3, x));
      return e;
    };
    return h;
  }

  const sx = (x) => (x - cam) * ppy;
  const sy = (x) => groundY - hole.elev(x) * vs;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = cv.clientWidth; H = cv.clientHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ppy = Math.max(W / WORLD, 2.5);
    vs = Math.min(ppy * 1.7, 8);
    ts = clamp(W / 1000, 0.8, 1.35);
    groundY = H * (H < 620 ? 0.8 : 0.72);
    cam = clamp(cam, 0, Math.max(0, WORLD - W / ppy));
  }

  function setHole(i, seed, instant) {
    const h = makeHole(i, seed);
    if (instant || !hole) { hole = h; reset(); return; }
    pending = h; fadeDir = 1;
  }
  function reset() {
    ball = { state: 'tee', x: TEE, lift: 0, alpha: 1, sink: 0 };
    flight = null; trail = []; parts = []; rings = []; markersOn = false; markers = 0; flagShake = 0; camTo = 0; cam = 0; swingT = -1;
  }

  // path along the turf from x0 to x1, then back `depth` pixels lower
  function strip(x0, x1, depth, color, lift = 0) {
    g.beginPath();
    const a = Math.max(x0, cam - 4), b = Math.min(x1, cam + W / ppy + 4);
    if (b <= a) return;
    for (let x = a; x <= b; x += 1.5) g.lineTo(sx(x), sy(x) - lift);
    g.lineTo(sx(b), sy(b) - lift);
    for (let x = b; x >= a; x -= 1.5) g.lineTo(sx(x), sy(x) + depth);
    g.lineTo(sx(a), sy(a) + depth);
    g.closePath(); g.fillStyle = color; g.fill();
  }

  function tree(px, py, s, pine, tone, dark) {
    const c1 = dark ? `hsl(${140 + tone * 14} 34% ${15 + tone * 5}%)` : `hsl(${128 + tone * 18} 38% ${21 + tone * 7}%)`;
    const c2 = dark ? `hsl(${140 + tone * 14} 32% ${19 + tone * 5}%)` : `hsl(${122 + tone * 18} 40% ${27 + tone * 7}%)`;
    const sway = Math.sin(time * 0.9 + px * 0.02) * 1.6 * s;
    g.fillStyle = dark ? '#1a2f22' : '#3b2f22';
    g.fillRect(px - 1.6 * s, py - 16 * s, 3.2 * s, 17 * s);
    if (pine) {
      for (let k = 0; k < 3; k++) {
        g.fillStyle = k % 2 ? c2 : c1;
        g.beginPath(); g.moveTo(px + sway * (k + 1) * 0.4, py - (58 - k * 6) * s); g.lineTo(px - (10 + k * 5) * s, py - (14 + (2 - k) * 13) * s + 12 * s); g.lineTo(px + (10 + k * 5) * s, py - (14 + (2 - k) * 13) * s + 12 * s); g.fill();
      }
    } else {
      g.fillStyle = c1; g.beginPath(); g.arc(px + sway * 0.5, py - 30 * s, 17 * s, 0, 7); g.fill();
      g.fillStyle = c2; g.beginPath(); g.arc(px - 7 * s + sway, py - 38 * s, 12 * s, 0, 7); g.arc(px + 9 * s + sway, py - 34 * s, 10 * s, 0, 7); g.fill();
    }
  }

  function pill(text, x, y, color, alpha) {
    g.font = '700 11px Archivo, sans-serif';
    const w = g.measureText(text).width + 18;
    g.globalAlpha = alpha;
    g.fillStyle = 'rgba(15,34,25,.86)';
    g.beginPath(); g.roundRect(x - w / 2, y - 11, w, 22, 11); g.fill();
    g.strokeStyle = color; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x, y + 0.5);
    g.globalAlpha = 1;
  }

  function burst(x, y, colors, n, speed, up = 1, grav = 520) {
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.95, v = speed * (0.35 + Math.random() * 0.75);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * up, life: 0.5 + Math.random() * 0.6, t: 0, r: 1.2 + Math.random() * 2.2, c: colors[k % colors.length], grav });
    }
  }

  // where a ball in each lie comes to rest (in yards from the left edge)
  function restX(tier, r) {
    const h = hole;
    if (tier < 0) return (h.water[0] + h.water[1]) / 2 + (r - 0.5) * 8;
    if (tier === 0) return (h.bunker[0] + h.bunker[1]) / 2 + (r - 0.5) * 8;
    if (tier === 1) return 114 + r * 30;
    if (tier === 2) return lerp(h.fw[0] + 26, h.fw[1] - 14, r);
    if (tier === 3) { const side = h.pin + (r < 0.6 ? -1 : 1) * (9 + r * 9); return clamp(side, h.green[0] + 6, h.green[1] - 5); }
    return h.pin;
  }
  const MARKS = [-1, 0, 1, 2, 3, 4];
  const markX = (t) => (t === 1 ? 128 : t === 2 ? (hole.fw[0] + hole.fw[1]) / 2 : t === 3 ? hole.green[0] + 12 : restX(t, 0.5));

  function launch(tier, onImpact, onDone) {
    const r = Math.random(), end = restX(tier, r);
    const arc = (x0, x1, apex, dur) => ({ kind: 'arc', x0, x1, apex, dur });
    const roll = (x0, x1, dur) => ({ kind: 'roll', x0, x1, dur });
    const big = (x1) => { const d = x1 - TEE; return arc(TEE, x1, Math.min(groundY * 0.5, 40 + d * ppy * 0.3), (reduced ? 500 : 950) + d * 5.2); };
    let segs;
    if (tier < 0) segs = [big(end)];
    else if (tier === 0) segs = [big(end)];
    else if (tier === 1) segs = [big(end - 6), arc(end - 6, end, 9, 300)];
    else if (tier === 2) segs = [big(end - 30), arc(end - 30, end - 13, 24, 430), arc(end - 13, end - 5, 9, 280), roll(end - 5, end, 700)];
    else if (tier === 3) { const l = Math.max(hole.green[0] + 2, Math.min(end, hole.pin) - 16); segs = [big(l), arc(l, l + 6, 13, 340), roll(l + 6, end, 1100)]; }
    else segs = [big(end - 24), arc(end - 24, end - 15, 13, 340), roll(end - 15, end, 1300)];
    flight = { tier, segs, k: 0, t: 0, onImpact, onDone, hit: false };
    ball = { state: 'fly', x: TEE, lift: 0, alpha: 1, sink: 0 };
    trail = []; markersOn = true; markers = 0; swingT = 0;
  }

  function impact(first) {
    const t = flight.tier, x = sx(ball.x), y = sy(ball.x);
    if (t < 0) {
      const wy = groundY - hole.waterE * vs;
      burst(x, wy, ['#cfeaf6', '#8ccbe6', '#ffffff'], 26, 300, 1, 700);
      rings.push({ x: ball.x, t: 0 }, { x: ball.x, t: -0.18 });
      ball.state = 'gone';
    } else if (t === 0) burst(x, y, ['#f0dca4', '#e3c27a', '#c9a45c'], 30, 240, 0.9, 620);
    else if (first) burst(x, y, t === 1 ? ['#5d8a3f', '#7aa64f', '#3f6b30'] : ['#8fd06c', '#6dbb5a'], t === 1 ? 16 : 9, 150, 0.8, 600);
    if (first) flight.onImpact?.();
  }

  function finish() {
    const f = flight;
    flight = null;
    if (f.tier === 4) {
      ball.state = 'drop';
      setTimeout(() => {
        const x = sx(hole.pin), y = sy(hole.pin);
        burst(x, y - 4, ['#f2b93b', '#ffe29a', '#ffffff', '#e2aa4e'], 70, 420, 1, 380);
        rings.push({ x: hole.pin, t: 0, gold: true });
        flagShake = 1; flash = 0.28;
        f.onDone?.();
      }, 260);
    } else {
      if (ball.state !== 'gone') ball.state = 'rest';
      f.onDone?.();
    }
  }

  function update(dt) {
    time += dt;
    if (fadeDir) {
      fade = clamp(fade + fadeDir * dt / (fadeDir > 0 ? 0.26 : 0.42), 0, 1);
      if (fade === 1 && fadeDir > 0) { hole = pending; pending = null; reset(); fadeDir = -1; }
      else if (fade === 0) fadeDir = 0;
    }
    if (swingT >= 0) { swingT += dt; if (swingT > 0.3) swingT = -1; }
    if (flight) {
      const f = flight; let s = f.segs[f.k];
      f.t += dt * 1000;
      while (s && f.t >= s.dur) {
        f.t -= s.dur; ball.x = s.x1; ball.lift = 0;
        if (s.kind === 'arc') { impact(!f.hit); f.hit = true; }
        f.k++; s = f.segs[f.k];
        if (ball.state === 'gone') s = null;
      }
      if (!s) finish();
      else {
        const u = f.t / s.dur;
        if (s.kind === 'arc') { ball.x = lerp(s.x0, s.x1, u); ball.lift = 4 * s.apex * u * (1 - u); }
        else { ball.x = lerp(s.x0, s.x1, easeOut(u)); ball.lift = 0; }
        if (ball.state === 'fly') trail.push({ x: ball.x, y: sy(ball.x) - ball.lift, a: 1 });
      }
    }
    if (ball.state === 'drop') { ball.sink = Math.min(1, ball.sink + dt * 5); ball.alpha = 1 - ball.sink; }
    for (const p of trail) p.a -= dt * 1.5;
    trail = trail.filter((p) => p.a > 0);
    for (const p of parts) { p.t += dt; p.vy += p.grav * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    parts = parts.filter((p) => p.t < p.life);
    for (const r of rings) r.t += dt;
    rings = rings.filter((r) => r.t < 1.3);
    if (markersOn) markers = Math.min(markers + dt * 2.6, MARKS.length + 1);
    flagShake = Math.max(0, flagShake - dt * 0.8);
    flash = Math.max(0, flash - dt * 0.9);
    const view = W / ppy, maxCam = Math.max(0, WORLD - view);
    camTo = clamp(ball.x - view * 0.38, 0, maxCam);
    cam = maxCam ? lerp(cam, camTo, 1 - Math.exp(-dt * 5)) : 0;
  }

  function draw() {
    const h = hole, [top, bot, sun, tint, tintA] = h.sky;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // sky
    let grad = g.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, top); grad.addColorStop(1, bot);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // sun
    const st = h.i / (SKIES.length - 1), sunX = W * (0.14 + 0.72 * st), sunY = groundY * (0.62 - Math.sin(Math.PI * st) * 0.42);
    grad = g.createRadialGradient(sunX, sunY, 0, sunX, sunY, 220);
    grad.addColorStop(0, sun + 'cc'); grad.addColorStop(0.16, sun + '66'); grad.addColorStop(1, sun + '00');
    g.fillStyle = grad; g.fillRect(sunX - 220, sunY - 220, 440, 440);
    g.fillStyle = sun; g.beginPath(); g.arc(sunX, sunY, 26, 0, 7); g.fill();
    // clouds
    g.fillStyle = 'rgba(255,255,255,.78)';
    for (const c of h.clouds) {
      const x = ((c.x + time * c.v) % 1.3 - 0.15) * W - cam * ppy * 0.05, y = c.y * groundY, s = c.s * Math.min(1.2, W / 900 + 0.45);
      g.beginPath(); g.ellipse(x, y, 60 * s, 13 * s, 0, 0, 7); g.ellipse(x - 26 * s, y - 9 * s, 30 * s, 13 * s, 0, 0, 7); g.ellipse(x + 20 * s, y - 13 * s, 36 * s, 17 * s, 0, 0, 7); g.fill();
    }
    // far hills
    const hillLayer = (par, base, amp, f, p, color) => {
      g.beginPath(); g.moveTo(0, H);
      for (let px = 0; px <= W + 8; px += 8) { const wx = px + cam * ppy * par; g.lineTo(px, groundY - base - amp * Math.sin(wx * f + p) - amp * 0.4 * Math.sin(wx * f * 2.7 + p * 1.7)); }
      g.lineTo(W, H); g.closePath(); g.fillStyle = color; g.fill();
    };
    hillLayer(0.12, groundY * 0.2, groundY * 0.07, 0.0042, h.hills[0], `color-mix(in srgb, ${bot} 58%, #2f5f58)`);
    hillLayer(0.25, groundY * 0.11, groundY * 0.05, 0.0068, h.hills[1], `color-mix(in srgb, ${bot} 32%, #285443)`);
    // tree line
    for (const t of h.trees) { const px = (t.x - cam * 0.72) * ppy * 1.02; if (px > -60 && px < W + 60) tree(px, groundY - h.elev(clamp(t.x, 0, WORLD)) * vs * 0.55 - 5, t.s * 0.95 * ts, t.pine, t.tone, true); }

    // the ground itself
    const x0 = cam - 6, x1 = cam + W / ppy + 6;
    g.beginPath(); g.moveTo(sx(x0), H);
    for (let x = x0; x <= x1; x += 1.5) g.lineTo(sx(x), sy(x));
    g.lineTo(sx(x1), H); g.closePath();
    grad = g.createLinearGradient(0, groundY - 30, 0, H);
    grad.addColorStop(0, '#2f6136'); grad.addColorStop(0.3, '#1c4029'); grad.addColorStop(1, '#0f2219');
    g.fillStyle = grad; g.fill();
    for (const b of h.bushes) { const px = sx(b.x); if (px > -60 && px < W + 60) tree(px, sy(b.x) + 3, b.s * ts, b.pine, b.tone, false); }
    strip(x0, x1, 12, '#4c7f3b');                                   // rough everywhere
    strip(8, 38, 12, '#78c661');                                    // tee box
    // fairway, mown in stripes
    for (let x = h.fw[0], k = 0; x < h.fw[1]; x += 9, k++) strip(x, Math.min(x + 9, h.fw[1]), 13, k % 2 ? '#69b957' : '#74c462');
    strip(h.green[0] - 5, h.green[1] + 5, 13, '#79c962');           // fringe
    strip(h.green[0], h.green[1], 13, '#9bdc72');                   // green
    // bunker
    strip(h.bunker[0], h.bunker[1], 17, '#d2b46d');
    strip(h.bunker[0] + 1, h.bunker[1] - 1, 9, '#ecd698');
    // water
    const wy = groundY - h.waterE * vs, wa = sx(h.water[0] - 3), wb = sx(h.water[1] + 3);
    g.beginPath();
    for (let x = h.water[0] - 3; x <= h.water[1] + 3; x += 1) g.lineTo(sx(x), Math.max(wy, sy(x)));
    g.lineTo(wb, wy); g.lineTo(wa, wy); g.closePath();
    grad = g.createLinearGradient(0, wy, 0, wy + 30); grad.addColorStop(0, '#62b4d8'); grad.addColorStop(1, '#24608a');
    g.fillStyle = grad; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) { const fx = lerp(wa + 12, wb - 22, (k * 0.29 + time * 0.03 * (k % 2 ? 1 : -1) + 2) % 1), fy = wy + 3 + k * 2.5; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + 10 + k * 3, fy); g.stroke(); }
    for (const r of rings) if (r.t > 0 && !r.gold) { g.strokeStyle = `rgba(255,255,255,${0.7 * (1 - r.t / 1.3)})`; g.beginPath(); g.ellipse(sx(r.x), wy + 1, 6 + r.t * 34, 1.5 + r.t * 5, 0, 0, 7); g.stroke(); }
    // grass blades along the rough
    g.strokeStyle = '#6a9c4a'; g.lineWidth = 1.2; g.beginPath();
    for (let x = Math.ceil(x0 / 1.6) * 1.6; x < x1; x += 1.6) {
      if ((x > 8 && x < 38) || (x > h.water[0] - 4 && x < h.water[1] + 4) || (x > h.bunker[0] && x < h.bunker[1]) || (x > h.fw[0] && x < h.fw[1]) || (x > h.green[0] - 5 && x < h.green[1] + 5)) continue;
      const px = sx(x), py = sy(x), n = Math.sin(x * 12.9898) * 43758.5453, hgt = 3.5 + (n - Math.floor(n)) * 4.5;
      g.moveTo(px, py + 1); g.lineTo(px + Math.sin(time * 1.6 + x * 0.3) * 1.6 + 1, py - hgt);
    }
    g.stroke();

    // tee markers
    g.fillStyle = '#e2aa4e';
    for (const tx of [TEE - 7, TEE + 7]) { g.beginPath(); g.arc(sx(tx), sy(tx) - 2.5, 2.6, 0, 7); g.fill(); }
    // pin, flag and cup
    const px = sx(h.pin), py = sy(h.pin), fh = Math.max(46, Math.min(84, ppy * 15));
    g.fillStyle = '#0c1a12'; g.beginPath(); g.ellipse(px, py + 1, 5.5, 2, 0, 0, 7); g.fill();
    const lean = Math.sin(time * 38) * flagShake * 3.5;
    g.strokeStyle = '#f4f1e4'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px + lean, py - fh); g.stroke();
    g.fillStyle = '#e2aa4e'; g.beginPath(); g.moveTo(px + lean, py - fh);
    for (let k = 0; k <= 6; k++) { const u = k / 6; g.lineTo(px + lean - u * 24, py - fh + 2 + u * 6 + Math.sin(time * 5 + u * 4) * 2.2 * u); }
    for (let k = 6; k >= 0; k--) { const u = k / 6; g.lineTo(px + lean - u * 24, py - fh + 15 - u * 5 + Math.sin(time * 5 + u * 4 + 0.6) * 2.2 * u); }
    g.closePath(); g.fill();

    // lie markers, shown once the ball is away
    if (markersOn) MARKS.forEach((t, k) => {
      const a = clamp(markers - k * 0.45, 0, 1); if (!a) return;
      const T = tierOf(t), mx = sx(markX(t)), my = (t < 0 ? wy : sy(markX(t))), up = 40 + (k % 2) * 24 + (t === 4 ? fh - 24 : 0);
      g.globalAlpha = a * 0.7; g.strokeStyle = T.color; g.lineWidth = 1; g.setLineDash([3, 4]);
      g.beginPath(); g.moveTo(mx, my - 4); g.lineTo(mx, my - up * easeOut(a) + 10); g.stroke(); g.setLineDash([]);
      pill(`${t === 4 ? 'CUP' : T.name.toUpperCase().replace('IN THE ', '')} · ${T.pts}`, mx, my - up * easeOut(a), T.color, a);
    });

    // swing streak
    if (swingT >= 0) {
      const u = swingT / 0.3, bx = sx(TEE), by = sy(TEE);
      g.strokeStyle = `rgba(255,255,255,${0.85 * (1 - u)})`; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath(); g.arc(bx - 4, by - 30, 34, Math.PI * (0.95 - u * 0.2), Math.PI * (0.95 - u * 1.5), true); g.stroke(); g.lineCap = 'butt';
    }
    // ball
    const br = clamp(ppy * 1.5, 5, 7.5);
    for (let k = 1; k < trail.length; k++) { const p = trail[k], q = trail[k - 1]; g.strokeStyle = `rgba(255,255,255,${p.a * 0.55})`; g.lineWidth = br * 0.9 * p.a; g.beginPath(); g.moveTo(sx(q.x), q.y); g.lineTo(sx(p.x), p.y); g.stroke(); }
    if (ball.state !== 'gone') {
      const bx = sx(ball.x), gy = sy(ball.x);
      const onTee = ball.state === 'tee', plug = ball.state === 'rest' && ball.x > h.bunker[0] && ball.x < h.bunker[1] ? 2 : 0;
      const by = gy - br - ball.lift - (onTee ? 4 : 0) + plug + ball.sink * (br * 2 + 3);
      if (onTee) { g.fillStyle = '#f4f1e4'; g.fillRect(bx - 1, gy - 4, 2, 5); }
      g.fillStyle = `rgba(0,0,0,${0.28 * clamp(1 - ball.lift / 160, 0.15, 1) * ball.alpha})`;
      g.beginPath(); g.ellipse(bx, gy + 0.5, br * (1 + ball.lift / 200), br * 0.32, 0, 0, 7); g.fill();
      g.globalAlpha = ball.alpha;
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(bx, by, br, 0, 7); g.fill();
      g.fillStyle = 'rgba(160,170,160,.55)'; g.beginPath(); g.arc(bx + br * 0.25, by + br * 0.3, br * 0.62, 0, 7); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(bx - br * 0.12, by - br * 0.14, br * 0.72, 0, 7); g.fill();
      g.globalAlpha = 1;
    }
    for (const r of rings) if (r.gold && r.t > 0) { g.strokeStyle = `rgba(242,185,59,${1 - r.t / 1.3})`; g.lineWidth = 3 * (1 - r.t / 1.3) + 0.5; g.beginPath(); g.arc(sx(r.x), sy(r.x) - 6, 10 + easeOut(r.t / 1.3) * 150, 0, 7); g.stroke(); }
    for (const p of parts) { g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill(); }
    g.globalAlpha = 1;

    // time-of-day wash, flash, and the cut between holes
    if (tintA) { g.fillStyle = tint; g.globalAlpha = tintA; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    if (flash) { g.fillStyle = `rgba(255,226,154,${flash})`; g.fillRect(0, 0, W, H); }
    if (fade) { g.fillStyle = `rgba(15,34,25,${fade})`; g.fillRect(0, 0, W, H); }
  }

  function step(now, maxDt) {
    const dt = Math.min(maxDt, (now - last) / 1000); last = now;
    if (hole && W) { update(dt); draw(); }
  }
  function frame(now) { step(now, 0.05); requestAnimationFrame(frame); }
  // A hidden tab gets no animation frames: keep the shot moving so the round can still finish.
  setInterval(() => { const now = performance.now(); if (now - last > 400) step(now, 0.5); }, 250);
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
  return { setHole, launch, resize };
})();

// ---------- the round ----------
const ui = {
  intro: $('#intro'), play: $('#play'), end: $('#end'), pips: $('#pips'), score: $('#score'), scoreBox: $('#scoreBox'),
  holeLabel: $('#holeLabel'), clock: $('#clock'), prompt: $('#prompt'), timer: $('#timer'), bar: $('#timerBar'),
  form: $('#answer'), input: $('#input'), swing: $('#swing'), msg: $('#msg'), result: $('#result'),
  confirm: $('#confirm'), confirmFrom: $('#confirmFrom'), confirmName: $('#confirmName'),
};
const params = new URLSearchParams(location.search);
const today = dateStr();
let manifest = null, practice = params.has('practice'), seed = today;
let prompts = [], data = new Map(), indexes = new Map();
let phase = 'intro', hole = 0, results = [], shown = 0, endsAt = 0, lastTick = 9, suggestion = null, busy = false;

const stats = () => store.get(LS.stats, { history: {}, played: 0, total: 0, best: 0, streak: 0, maxStreak: 0, last: null });

function countTo(node, from, to, ms = 800) {
  const t0 = performance.now();
  const step = (now) => { const u = Math.min(1, (now - t0) / ms); node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - u, 4))); if (u < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// Seven prompts for a seed: no more than two from one subject, and never two of the same family
// (two country prompts, two golf prompts) in a round.
function pickPrompts(seedText) {
  const out = [], groups = {}, families = new Set();
  for (const p of shuffle(manifest.prompts, rng(seedText))) {
    const family = p.id.split('-')[0];
    if ((groups[p.group] || 0) >= 2 || families.has(family)) continue;
    groups[p.group] = (groups[p.group] || 0) + 1; families.add(family); out.push(p);
    if (out.length === HOLES) break;
  }
  return out;
}

async function loadPrompt(id) {
  if (!data.has(id)) data.set(id, fetch(`data/${id}.json`).then((r) => { if (!r.ok) throw new Error(id); return r.json(); }));
  return data.get(id);
}

function drawPips() {
  ui.pips.innerHTML = '';
  for (let i = 0; i < HOLES; i++) {
    const p = el('span', 'pip' + (i < results.length ? ' done' : i === hole && phase !== 'intro' && phase !== 'done' ? ' now' : ''));
    if (i < results.length) p.style.setProperty('--c', tierOf(results[i].tier).color);
    ui.pips.appendChild(p);
  }
}

function setScore(animated) {
  const total = results.reduce((a, r) => a + r.score, 0);
  if (animated && total !== shown) { countTo(ui.score, shown, total, 900); ui.scoreBox.classList.remove('bump'); void ui.scoreBox.offsetWidth; ui.scoreBox.classList.add('bump'); }
  else ui.score.textContent = total;
  shown = total;
}

function saveGame() {
  if (practice) return;
  store.set(LS.game, { date: today, results, hole, endsAt: phase === 'answering' ? endsAt : 0 });
}

async function prepare() {
  const dayIndex = params.has('day') ? Number(params.get('day')) - 1 : dayNo(today) - 1;
  if (params.has('day')) { practice = true; seed = 'day-' + params.get('day'); }
  prompts = pickPrompts(practice && !params.has('day') ? 'practice-' + seed : 'pin-high-round-' + (dayIndex + 1));
  const loaded = await Promise.all(prompts.map((p) => loadPrompt(p.id)));
  loaded.forEach((d) => indexes.set(d.id, buildIndex(d.answers)));
}

function showIntro() {
  phase = 'intro';
  const s = stats(), saved = store.get(LS.game, null);
  const resume = !practice && saved && saved.date === today && saved.results.length < HOLES && (saved.results.length || saved.endsAt);
  $('#introEyebrow').textContent = practice ? 'Practice round' : `The daily round · No. ${dayNo(today)}`;
  $('#legend').innerHTML = [...TIERS].reverse().map((t) => `<div><span class="lie" style="--c:${t.color}">${t.id === 'cup' ? 'Cup' : t.name}</span><b>${t.pts}</b><span>${t.blurb}</span></div>`).join('');
  $('#logline').textContent = s.played ? `Streak ${s.streak} · Played ${s.played} · Best ${s.best}` : 'Your first round';
  const btn = $('#teeOff');
  btn.disabled = false; btn.textContent = resume ? 'Resume round' : 'Tee off';
  btn.onclick = () => {
    sfx.play('go');
    ui.intro.hidden = true;
    if (resume) {
      results = saved.results; hole = results.length;
      // A hole that was on the clock when the page closed is lost unless there is still time on it.
      if (saved.endsAt && saved.endsAt <= Date.now()) { results.push(miss(prompts[hole], null)); hole++; saveGame(); }
      setScore(false);
      if (hole >= HOLES) return finishRound();
      beginHole(saved.endsAt > Date.now() ? saved.endsAt : 0);
    } else { results = []; hole = 0; shown = 0; setScore(false); beginHole(0); }
  };
  ui.intro.hidden = false; ui.play.hidden = true; ui.end.hidden = true;
  results = []; hole = 0; drawPips(); setScore(false);
  scene.setHole(0, seed, true);
}

function beginHole(resumeEndsAt) {
  const p = prompts[hole];
  scene.setHole(hole, seed, hole === 0 && !results.length);
  ui.play.hidden = false; ui.play.classList.remove('urgent');
  ui.holeLabel.textContent = `Hole ${hole + 1} of ${HOLES}`;
  ui.prompt.textContent = p.text;
  ui.prompt.classList.remove('swap'); void ui.prompt.offsetWidth; ui.prompt.classList.add('swap');
  ui.result.hidden = true; ui.result.innerHTML = '';
  ui.form.hidden = false; ui.timer.hidden = false; ui.msg.hidden = false;
  ui.input.value = ''; ui.msg.textContent = ''; ui.bar.style.transform = 'scaleX(1)';
  suggestion = null; busy = false; lastTick = 9;
  if (resumeEndsAt) { endsAt = resumeEndsAt; startAnswering(true); }
  else {
    phase = 'preview'; endsAt = Date.now() + PREVIEW_MS;
    ui.input.disabled = true; ui.swing.disabled = true; ui.input.placeholder = 'get ready…';
  }
  drawPips();
}

function startAnswering(resumed) {
  phase = 'answering';
  if (!resumed) endsAt = Date.now() + ANSWER_MS;
  ui.input.disabled = false; ui.swing.disabled = false; ui.input.placeholder = 'type one answer…';
  ui.input.focus({ preventScroll: true });
  saveGame();
}

const miss = (p, raw) => ({ promptId: p.id, promptText: p.text, raw, answer: null, tier: -1, score: 0 });

function closeConfirm() { ui.confirm.hidden = true; suggestion = null; }

// text: what was typed. final: the clock ran out, so take the nearest answer without asking.
function submit(text, final) {
  if (phase !== 'answering' || busy) return;
  const p = prompts[hole], d = indexes.get(p.id);
  const hit = text ? resolve(d, text) : null;
  if (hit && (hit.sure || final)) return land(hit.i, text);
  if (final) return land(null, text || null);
  if (hit) {
    suggestion = { i: hit.i, text };
    data.get(p.id).then((pd) => {
      if (!suggestion || suggestion.i !== hit.i) return;
      ui.confirmFrom.textContent = text; ui.confirmName.textContent = pd.answers[hit.i][0];
      ui.confirm.hidden = false; $('#confirmYes').focus();
    });
    return;
  }
  sfx.play('no');
  ui.msg.className = 'msg'; ui.msg.textContent = `“${text}” isn't on the card. Swing again.`;
  ui.form.classList.remove('shake'); void ui.form.offsetWidth; ui.form.classList.add('shake');
  ui.input.select();
}

async function land(i, raw) {
  busy = true; phase = 'flight';
  closeConfirm();
  const p = prompts[hole], pd = await data.get(p.id);
  const a = i == null ? null : pd.answers[i];
  const r = a ? { promptId: p.id, promptText: p.text, raw, answer: a[0], tier: a[1], score: TIERS[a[1]].pts, rank: i + 1, count: pd.answers.length, desc: a[2] } : miss(p, raw);
  results.push(r);
  saveGame();
  ui.play.classList.remove('urgent');
  ui.form.hidden = true; ui.timer.hidden = true; ui.msg.hidden = true; ui.clock.textContent = '';
  ui.input.blur();
  sfx.play('swing');
  scene.launch(r.tier, () => sfx.play(r.tier < 0 ? 'splash' : r.tier === 0 ? 'sand' : r.tier === 3 ? 'green' : 'thud'), () => {
    if (r.tier === 4) sfx.play('cup');
    showResult(r);
  });
}

function showResult(r) {
  phase = 'feedback';
  const T = tierOf(r.tier), lastHole = hole === HOLES - 1;
  const sub = r.answer
    ? `<b>${T.blurb}.</b> No. ${r.rank.toLocaleString()} of ${r.count.toLocaleString()} answers, best known first.${r.desc ? `<br>${esc(r.desc[0].toUpperCase() + r.desc.slice(1))}.` : ''}`
    : r.raw ? `<b>“${esc(r.raw)}”</b> isn't on the card.` : '<b>No answer in time.</b>';
  ui.result.style.setProperty('--c', T.color);
  ui.result.innerHTML = `<span class="lie" style="--c:${T.color}">${T.name}</span>
    <div class="res-row"><div class="res-name${r.answer ? '' : ' none'}">${r.answer ? esc(r.answer) : 'Lost ball'}</div><div class="res-pts">+<span id="pts">0</span><small>PTS</small></div></div>
    <div class="res-sub">${sub}</div>
    <div class="res-foot"><button class="btn" id="next" type="button">${lastHole ? 'Sign the card' : 'Next hole'}</button></div>`;
  ui.result.hidden = false;
  countTo($('#pts'), 0, r.score, 700);
  setScore(true); drawPips();
  const next = $('#next');
  next.onclick = () => { sfx.play('click'); if (lastHole) finishRound(); else { hole++; beginHole(0); } };
  next.focus({ preventScroll: true });
}

function finishRound() {
  phase = 'done';
  const score = results.reduce((a, r) => a + r.score, 0);
  let s = stats();
  if (!practice && !s.history[today]) {
    const y = new Date(); y.setDate(y.getDate() - 1);
    s.history[today] = { day: dayNo(today), score, results };
    s.played++; s.total += score; s.best = Math.max(s.best, score);
    s.streak = s.last === dateStr(y) ? s.streak + 1 : 1; s.maxStreak = Math.max(s.maxStreak, s.streak); s.last = today;
    store.set(LS.stats, s); store.del(LS.game);
    try { parent.postMessage({ type: 'pin-high-round', score, dayNumber: dayNo(today), bestScore: s.best, played: s.played, streak: s.streak }, location.origin); } catch {}
  }
  showEnd(results, true);
}

function shareText(res, score) {
  const head = practice ? 'Pin High practice' : `Pin High No. ${dayNo(today)}`;
  return `${head}: ${score}/700\n${res.map((r) => tierOf(r.tier).emoji).join('')}\n${bandFor(score).name}`;
}

function showEnd(res, fresh) {
  phase = 'done'; results = res; hole = HOLES;
  const score = res.reduce((a, r) => a + r.score, 0), band = bandFor(score), s = stats();
  ui.intro.hidden = true; ui.play.hidden = true;
  drawPips(); shown = score; ui.score.textContent = score;
  const e = ui.end; e.innerHTML = '';
  const col = el('div', 'end-col');
  col.appendChild(el('div', 'end-head', `<div class="eyebrow"><span>${practice ? 'Practice round' : `Round No. ${dayNo(today)}`} · card signed</span></div>
    <div class="total"><span id="total">${fresh ? 0 : score}</span><small>/ 700</small></div>
    <div class="band">${band.name}</div><div class="band-line">${band.line}</div>`));
  const acts = el('div', 'actions');
  const copy = el('button', 'btn', 'Copy result'); copy.type = 'button';
  copy.onclick = async () => { try { await navigator.clipboard.writeText(shareText(res, score)); copy.textContent = 'Copied'; } catch { copy.textContent = 'Copy failed'; } setTimeout(() => (copy.textContent = 'Copy result'), 1600); };
  const prac = el('button', 'btn ghost', 'Practice round'); prac.type = 'button';
  prac.onclick = () => { location.search = '?practice=' + Date.now().toString(36); };
  acts.append(copy, prac);
  if (practice) { const back = el('button', 'btn ghost', "Today's round"); back.type = 'button'; back.onclick = () => { location.search = ''; }; acts.append(back); }
  col.appendChild(acts);

  const card = el('div', 'panel', '<h2>Scorecard <span>tap a hole for every answer</span></h2>');
  res.forEach((r, i) => {
    const T = tierOf(r.tier), row = el('div', 'hole');
    const btn = el('button', '', `<span class="no">${i + 1}</span>
      <span><div class="q">${esc(r.promptText)}</div><div class="a${r.answer ? '' : ' none'}">${r.answer ? esc(r.answer) : r.raw ? `“${esc(r.raw)}”` : 'No answer'}</div></span>
      <span class="right"><span class="lie" style="--c:${T.color}">${r.tier === 4 ? 'Cup' : r.tier < 0 ? 'Water' : T.name}</span><b>${r.score}</b></span>`);
    btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
    btn.onclick = () => {
      const open = row.querySelector('.browse');
      if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
      btn.setAttribute('aria-expanded', 'true');
      const box = el('div', 'browse', '<div class="alist"><p>Loading…</p></div>');
      row.appendChild(box);
      loadPrompt(r.promptId).then((pd) => browse(box, pd, r)).catch(() => { box.innerHTML = '<div class="alist"><p>Could not load the answers.</p></div>'; });
    };
    row.appendChild(btn); card.appendChild(row);
  });
  col.appendChild(card);

  const avg = s.played ? Math.round(s.total / s.played) : 0;
  col.appendChild(el('div', 'panel', `<h2>Logbook</h2><div class="stats">
    <div><b>${s.streak}</b><span>Streak</span></div><div><b>${s.played}</b><span>Played</span></div><div><b>${avg}</b><span>Average</span></div><div><b>${s.best}</b><span>Best</span></div></div>`));
  col.appendChild(el('div', 'panel', `<h2>Handicaps</h2><div class="bands">${BANDS.map((b) => `<div class="${b === band ? 'on' : ''}"><b>${b.range}</b><span><i>${b.name}.</i> ${b.line}</span></div>`).join('')}</div>`));
  const next = el('div', 'next', 'Next round in <b id="countdown"></b>');
  col.appendChild(next);
  col.appendChild(el('div', 'credit', 'Answer lists come from Wikipedia and Wikidata.<br>How well known an answer is comes from how often its article is read.'));
  e.appendChild(col); e.hidden = false; e.scrollTop = 0;
  if (fresh) countTo($('#total'), 0, score, 1400);
  const tick = () => {
    if (e.hidden) return;
    const n = new Date(), m = new Date(n); m.setHours(24, 0, 0, 0);
    const d = Math.max(0, m - n), pad = (v) => String(Math.floor(v)).padStart(2, '0');
    const c = $('#countdown'); if (c) c.textContent = `${pad(d / 36e5)}:${pad((d / 6e4) % 60)}:${pad((d / 1e3) % 60)}`;
    setTimeout(tick, 1000);
  };
  tick();
}

// every answer for one hole, by lie, with a search box
function browse(box, pd, r) {
  const counts = [0, 0, 0, 0, 0];
  pd.answers.forEach((a) => counts[a[1]]++);
  let tier = null, query = '';
  const chips = el('div', 'chips'), search = el('input'), list = el('div', 'alist');
  search.type = 'search'; search.placeholder = 'Search all answers…'; search.setAttribute('aria-label', 'Search answers');
  const render = () => {
    const qn = norm(query);
    const rows = [];
    let total = 0;
    for (let i = 0; i < pd.answers.length; i++) {
      const a = pd.answers[i];
      if (tier !== null && a[1] !== tier) continue;
      if (qn && !norm(a[0]).includes(qn)) continue;
      total++;
      if (rows.length < 120) rows.push(`<div class="${a[0] === r.answer ? 'you' : ''}" style="--c:${TIERS[a[1]].color}"><span>${esc(a[0])}${a[2] ? `<small>${esc(a[2])}</small>` : ''}</span><b>+${TIERS[a[1]].pts}</b></div>`);
    }
    list.innerHTML = rows.join('') + (total > rows.length ? `<p>Showing ${rows.length} of ${total.toLocaleString()}. Search to narrow it down.</p>` : total ? '' : '<p>Nothing matches.</p>');
    chips.innerHTML = '';
    const mk = (label, n, t, color) => { const c = el('button', 'chip' + (tier === t ? ' on' : ''), `${label} ${n.toLocaleString()}`); c.type = 'button'; if (color) c.style.setProperty('--c', color); c.onclick = () => { tier = t; render(); }; chips.appendChild(c); };
    mk('All', pd.answers.length, null);
    for (let t = 4; t >= 0; t--) if (counts[t]) mk(t === 4 ? 'Cup' : TIERS[t].name, counts[t], t, TIERS[t].color);
  };
  search.oninput = () => { query = search.value; render(); };
  box.innerHTML = ''; box.append(chips, search, list);
  render();
}

// ---------- clock ----------
function loop() { tick(); requestAnimationFrame(loop); }
function tick() {
  const now = Date.now();
  if (phase === 'preview') {
    const left = endsAt - now;
    ui.clock.textContent = `starts in ${Math.max(1, Math.ceil(left / 1000))}`;
    if (left <= 0) startAnswering(false);
  } else if (phase === 'answering') {
    const left = Math.max(0, endsAt - now), secs = Math.ceil(left / 1000);
    ui.clock.textContent = `0:${String(secs).padStart(2, '0')}`;
    ui.bar.style.transform = `scaleX(${left / ANSWER_MS})`;
    ui.play.classList.toggle('urgent', left <= 3050);
    if (secs <= 3 && secs > 0 && secs < lastTick) { lastTick = secs; sfx.play('tick'); }
    if (left <= 0) {
      if (suggestion) land(suggestion.i, suggestion.text);
      else submit(ui.input.value.trim(), true);
    }
  }
}
setInterval(tick, 250); // the clock keeps running in a hidden tab, where there are no animation frames

// ---------- wiring ----------
ui.form.addEventListener('submit', (e) => { e.preventDefault(); const t = ui.input.value.trim(); if (t) submit(t, false); });
ui.input.addEventListener('input', () => { if (ui.msg.textContent) ui.msg.textContent = ''; });
$('#confirmYes').onclick = () => { if (suggestion) land(suggestion.i, suggestion.text); };
$('#confirmNo').onclick = () => { closeConfirm(); ui.input.focus(); ui.input.select(); };
window.addEventListener('keydown', (e) => {
  if (ui.confirm.hidden || e.repeat) return;
  if (e.key === 'Escape') { e.preventDefault(); $('#confirmNo').click(); }
  else if (e.key === 'Enter') { e.preventDefault(); $('#confirmYes').click(); }
});
const muteBtn = $('#mute');
const muteIcon = () => { muteBtn.innerHTML = sfx.muted
  ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/></svg>'
  : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>'; };
muteBtn.onclick = () => { sfx.toggle(); muteIcon(); };
muteIcon();

(async () => {
  scene.setHole(0, seed, true);
  drawPips();
  requestAnimationFrame(loop);
  try {
    manifest = await (await fetch('data/manifest.json')).json();
    if (practice && !params.has('day')) seed = params.get('practice') || String(Date.now());
    await prepare();
  } catch (err) {
    $('#teeOff').textContent = 'Could not load';
    console.error(err);
    return;
  }
  const done = !practice && stats().history[today];
  if (done) { scene.setHole(HOLES - 1, seed, true); showEnd(done.results, false); }
  else showIntro();
})();

// for the test page and the console
window.__pinHigh = { norm, buildIndex, resolve, editDistance };
})();
