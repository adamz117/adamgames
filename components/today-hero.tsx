'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { venueById, type Venue } from '@/lib/venues';
import { formatToPar } from '@/lib/nine-holes-stats';

// The parts of the game's sim (public/games/nine-holes/game.js) these plates read.
type Pt = { x: number; y: number };
type Ellipse = Pt & { rx: number; ry: number; rot: number; kind?: string };
type Hole = {
  index: number; par: number; len: number; path: Pt[]; fw: number; rgh: number; deep: number;
  green: Pt; gr: number; pin: Pt; bunkers: Ellipse[]; water: Ellipse[]; trees: (Pt & { r: number })[];
  island?: boolean; moat?: number; arch?: { isles: (Pt & { r: number })[] };
};
type Course = { name: string; theme: string; par: number; holes: Hole[] };
declare global {
  interface Window { DH?: { makeCourse(seed: string): Course } }
}

// One hole as a yardage-book plate, in the venue's own colours.
function drawPlate(canvas: HTMLCanvasElement, h: Hole, v: Venue) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2), W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = v.colors;

  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const grow = (p: Pt, r: number) => { x0 = Math.min(x0, p.x - r); x1 = Math.max(x1, p.x + r); y0 = Math.min(y0, p.y - r); y1 = Math.max(y1, p.y + r); };
  h.path.forEach((p) => grow(p, h.arch ? 40 : h.rgh + 6));
  grow(h.green, (h.island && h.moat ? h.moat : h.gr) + 8);
  h.arch?.isles.forEach((is) => grow(is, is.r));
  const s = Math.min(W / (x1 - x0), H / (y1 - y0)) * 0.9;
  const ox = W / 2 - ((x0 + x1) / 2) * s, oy = H / 2 + ((y0 + y1) / 2) * s;
  const X = (p: Pt) => ox + p.x * s, Y = (p: Pt) => oy - p.y * s;

  const ground = ctx.createLinearGradient(0, 0, W * 0.35, H);
  ground.addColorStop(0, c.ground[0]); ground.addColorStop(0.55, c.ground[1]); ground.addColorStop(1, c.ground[2]);
  ctx.fillStyle = h.arch ? c.sea : ground;
  ctx.fillRect(0, 0, W, H);

  const band = (half: number, color: string) => {
    ctx.beginPath();
    h.path.forEach((p, i) => (i ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))));
    ctx.lineWidth = half * 2 * s; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
  };
  const disc = (p: Pt, r: number, color: string) => { ctx.beginPath(); ctx.arc(X(p), Y(p), r * s, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
  const ellipse = (e: Ellipse, color: string) => { ctx.beginPath(); ctx.ellipse(X(e), Y(e), e.rx * s, e.ry * s, -e.rot, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };

  if (h.arch) {
    for (const is of h.arch.isles) { disc(is, is.r, c.rough); disc(is, is.r * 0.72, c.fw); }
  } else {
    band(h.deep, c.deep); band(h.rgh, c.rough); band(h.fw + 0.7, c.fwEdge); band(h.fw, c.fw);
    // the tree line, as the course has it: a soft shadow under each crown
    for (const t of h.trees) {
      ctx.beginPath(); ctx.arc(X(t) + t.r * s * 0.35, Y(t) + t.r * s * 0.45, t.r * s, 0, Math.PI * 2); ctx.fillStyle = 'rgba(12,24,16,.28)'; ctx.fill();
      ctx.beginPath(); ctx.arc(X(t), Y(t), t.r * s, 0, Math.PI * 2); ctx.fillStyle = c.trees; ctx.fill();
    }
    if (h.island && h.moat) { disc(h.green, h.moat, c.water); disc(h.green, h.gr + 7, c.fw); }
  }
  h.water.forEach((w) => ellipse(w, w.kind === 'lava' ? '#F06A2A' : c.water));
  h.bunkers.forEach((b) => ellipse(b, c.sand));
  disc(h.green, h.gr + 1.6, c.collar);
  disc(h.green, h.gr, c.green);

  // the tee and the flag, sized to the plate so they read on the small ones too
  const k = Math.min(1, W / 220), t = h.path[0];
  ctx.strokeStyle = 'rgba(30,40,32,.65)'; ctx.lineWidth = 1.2;
  ctx.strokeRect(X(t) - 4.5 * s, Y(t) - 2.5 * s, 9 * s, 5 * s);
  const px = X(h.pin), py = Y(h.pin);
  ctx.beginPath(); ctx.arc(px, py, 2.6 * k + 0.6, 0, Math.PI * 2); ctx.fillStyle = '#1B241D'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 20 * k); ctx.lineWidth = 1.6; ctx.strokeStyle = '#22301F'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py - 20 * k); ctx.lineTo(px + 11 * k, py - 15.5 * k); ctx.lineTo(px, py - 11 * k); ctx.closePath(); ctx.fillStyle = '#C2401F'; ctx.fill();
}

function HolePlate({ hole, venue, i }: { hole: Hole; venue: Venue; i: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => drawPlate(canvas, hole, venue);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [hole, venue]);
  return (
    <div className="club-hole-core club-reveal" style={{ animationDelay: `${120 + i * 90}ms` }}>
      <canvas ref={ref} role="img" aria-label={`Hole ${hole.index}: par ${hole.par}, ${hole.len} yards`} />
    </div>
  );
}

// Pin High's door: one of its holes, side-on, with a shot in the air and the lies marked.
function PinHighArt() {
  const turf = 'M0 300 C 80 292, 140 304, 210 298 S 370 268, 460 268 S 600 262, 640 264';
  const lie = (from: number, to: number, color: string, width = 13) => (
    <path d={turf} pathLength={100} fill="none" stroke={color} strokeWidth={width} strokeDasharray={`${to - from} ${100 - (to - from)}`} strokeDashoffset={-from} />
  );
  const pill = (x: number, y: number, text: string, color: string) => (
    <g>
      <line x1={x} y1={y + 11} x2={x} y2={y + 34} stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity="0.7" />
      <rect x={x - 44} y={y - 11} width="88" height="22" rx="11" fill="rgba(15,34,25,.88)" stroke={color} strokeWidth="1.2" />
      <text x={x} y={y + 4} textAnchor="middle" fontSize="10.5" fontWeight="700" letterSpacing="1" fill={color}>{text}</text>
    </g>
  );
  return (
    <svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" role="img" aria-label="A golf hole seen from the side, with a ball in flight towards the flag">
      <defs>
        <linearGradient id="ph-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#39437a" /><stop offset="0.75" stopColor="#f4b08a" /></linearGradient>
        <linearGradient id="ph-earth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f6136" /><stop offset="0.45" stopColor="#1c4029" /><stop offset="1" stopColor="#0f2219" /></linearGradient>
        <radialGradient id="ph-sun"><stop offset="0" stopColor="#ffd9a8" stopOpacity="0.9" /><stop offset="1" stopColor="#ffd9a8" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="640" height="400" fill="url(#ph-sky)" />
      <circle cx="120" cy="190" r="120" fill="url(#ph-sun)" />
      <circle cx="120" cy="190" r="22" fill="#ffd9a8" />
      <g fill="rgba(255,255,255,.72)">
        <ellipse cx="420" cy="70" rx="64" ry="13" /><ellipse cx="396" cy="60" rx="30" ry="13" /><ellipse cx="442" cy="56" rx="36" ry="17" />
        <ellipse cx="250" cy="112" rx="44" ry="9" /><ellipse cx="264" cy="104" rx="24" ry="11" />
      </g>
      <path d="M0 250 C 120 205, 220 240, 330 226 S 540 190, 640 222 L640 400 L0 400Z" fill="#b98f7c" opacity="0.75" />
      <path d="M0 272 C 100 250, 200 268, 320 250 S 520 236, 640 250 L640 400 L0 400Z" fill="#6f7a62" />
      <g fill="#243c2b">
        {[[96, 286, 15], [176, 290, 19], [284, 280, 16], [336, 272, 21], [436, 258, 17], [600, 252, 20]].map(([x, y, r]) => (
          <g key={x}><rect x={x - 2} y={y - 4} width="4" height="18" /><circle cx={x} cy={y - 14} r={r} /><circle cx={x - r * 0.5} cy={y - 22} r={r * 0.65} /></g>
        ))}
        {[[234, 292], [500, 262]].map(([x, y]) => <path key={x} d={`M${x} ${y - 54} L${x - 17} ${y + 4} L${x + 17} ${y + 4}Z`} />)}
      </g>
      <path d={`${turf} L640 400 L0 400Z`} fill="url(#ph-earth)" />
      {lie(0, 100, '#4c7f3b')}
      {lie(2.5, 9, '#78c661')}
      {lie(11.5, 17.5, '#62b4d8')}
      {lie(20, 27.5, '#ecd698', 16)}
      {lie(43, 70, '#74c462')}
      {lie(73, 93, '#9bdc72')}
      <line x1="548" y1="266" x2="548" y2="204" stroke="#f4f1e4" strokeWidth="2.2" />
      <path d="M548 204 L520 211 L548 220Z" fill="#e2aa4e" />
      <ellipse cx="548" cy="267" rx="6" ry="2" fill="#0c1a12" />
      <path d="M40 292 Q 270 20 512 262" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="2 7" strokeLinecap="round" opacity="0.75" />
      <circle cx="390" cy="160" r="6.5" fill="#fff" />
      {pill(150, 246, 'BUNKER · 10', '#e3c27a')}
      {pill(362, 222, 'FAIRWAY · 60', '#58b368')}
      {pill(548, 168, 'CUP · 100', '#f2b93b')}
    </svg>
  );
}

const PIN_HIGH_EPOCH = '2026-11-10'; // round No. 1, as in public/games/pin-high/game.js

// The two doors: today's nine holes of golf, or today's round of Pin High.
// latest: the newest golf round on the member's card. pinHigh: their last Pin High round.
export default function TodayHero({ latest, pinHigh }: {
  latest: { seed: string; toPar: number; strokes: number } | null;
  pinHigh: { dayNumber: number; score: number } | null;
}) {
  const [course, setCourse] = useState<Course | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const venue = course ? venueById(course.theme) : null;
  const playedToday = !!latest && latest.seed === today;
  const roundNo = today ? Math.round((Date.parse(today + 'T00:00:00Z') - Date.parse(PIN_HIGH_EPOCH + 'T00:00:00Z')) / 864e5) + 1 : null;
  const pinPlayed = !!pinHigh && pinHigh.dayNumber === roundNo;

  return (
    <section className="club-wrap club-choose">
      <Script
        src="/games/nine-holes/game.js"
        strategy="afterInteractive"
        // The course comes from the visitor's own date, the same one the game seeds today's nine with.
        onReady={() => {
          const day = new Date().toLocaleDateString('en-CA');
          setToday(day);
          if (window.DH) setCourse(window.DH.makeCourse(day));
        }}
      />
      <h1 className="club-arrive">Pick your game</h1>
      <div className="club-doors">
        <Link href="/games/nine-holes" className="club-door club-arrive club-arrive-2">
          <div className="club-door-art club-door-holes">
            {course && venue
              ? course.holes.slice(0, 3).map((h, i) => <HolePlate key={h.index} hole={h} venue={venue} i={i} />)
              : Array.from({ length: 3 }, (_, i) => <div className="club-hole-core" key={i} aria-hidden="true" />)}
          </div>
          <div className="club-door-body">
            <span className="club-door-kind">Golf · nine holes</span>
            <h2 className="club-door-title">Nine Holes</h2>
            <p className="club-door-lede">
              {course && venue && latest && playedToday
                ? `${course.name} is on your card: ${formatToPar(latest.toPar)}, ${latest.strokes} strokes. Tomorrow brings a new course.`
                : course && venue
                  ? `Today: ${course.name}, ${venue.name}, par ${course.par}. Time the line, time the swing, mind the hazards.`
                  : 'A new nine-hole course every morning. Time the line, time the swing, mind the hazards.'}
            </p>
            <span className="club-button club-door-go">{playedToday ? 'Play it again for practice' : 'Play today’s nine'}</span>
          </div>
        </Link>
        <Link href="/games/pin-high" className="club-door club-arrive club-arrive-3">
          <div className="club-door-art"><PinHighArt /></div>
          <div className="club-door-body">
            <span className="club-door-kind">Trivia · seven holes</span>
            <h2 className="club-door-title">Pin High</h2>
            <p className="club-door-lede">
              {pinPlayed && pinHigh
                ? `Round No. ${roundNo} is on your card: ${pinHigh.score} points. Tomorrow brings seven new holes.`
                : 'Name something on every hole, with 25 seconds each. The fewer people who’d think of your answer, the closer you land to the pin.'}
            </p>
            <span className="club-button club-door-go">{pinPlayed ? 'See today’s card' : 'Play today’s round'}</span>
          </div>
        </Link>
      </div>
      <p className="club-door-also club-arrive club-arrive-3">
        Playing with a friend? <Link href="/play" className="club-link">Nine Holes lobbies</Link> or a <Link href="/duel" className="club-link">Pin High duel</Link>.
      </p>
    </section>
  );
}
