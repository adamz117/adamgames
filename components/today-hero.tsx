'use client';

import Link from 'next/link';
import Script from 'next/script';
import { useEffect, useRef, useState } from 'react';
import { venueById, type Venue } from '@/lib/venues';
import { formatToPar } from '@/lib/nine-holes-stats';

// The parts of the game's sim (public/games/nine-holes/game.js) this plate reads.
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

// Today's opening hole as a yardage-book plate, in the venue's own colours.
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

  // the tee and the flag
  const t = h.path[0];
  ctx.strokeStyle = 'rgba(30,40,32,.65)'; ctx.lineWidth = 1.4;
  ctx.strokeRect(X(t) - 4.5 * s, Y(t) - 2.5 * s, 9 * s, 5 * s);
  const px = X(h.pin), py = Y(h.pin);
  ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fillStyle = '#1B241D'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 22); ctx.lineWidth = 2; ctx.strokeStyle = '#22301F'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(px, py - 22); ctx.lineTo(px + 13, py - 17); ctx.lineTo(px, py - 12); ctx.closePath(); ctx.fillStyle = '#C2401F'; ctx.fill();
}

// latest: the newest round on the member's card, so the hero can tell them today's is already in.
export default function TodayHero({ signedIn, latest }: { signedIn: boolean; latest: { seed: string; toPar: number; strokes: number } | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const playedToday = !!latest && latest.seed === today;
  const venue = course ? venueById(course.theme) : null;
  const first = course?.holes[0];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !first || !venue) return;
    const draw = () => drawPlate(canvas, first, venue);
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [first, venue]);

  return (
    <section className="club-wrap club-hero">
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
      <div>
        <h1 className="club-arrive">Today&rsquo;s nine</h1>
        <p className="club-lede club-arrive club-arrive-2">
          {course && venue && latest && playedToday
            ? `${course.name} is on your card: ${formatToPar(latest.toPar)}, ${latest.strokes} strokes. Tomorrow brings a new course.`
            : course && venue
              ? `${course.name}, ${venue.name}. Par ${course.par}, and a new course every morning.`
              : 'A new nine-hole course every morning, the same for everyone.'}
        </p>
        <div className="club-hero-actions club-arrive club-arrive-3">
          <Link href="/games/nine-holes" className="club-button">{playedToday ? 'Play it again for practice' : 'Play today’s nine'}</Link>
          {!signedIn && <Link href="/login" className="club-link">Sign in to keep a handicap</Link>}
        </div>
      </div>
      <figure style={{ margin: 0 }}>
        <div className="club-plate">
          <div className="club-plate-core club-reveal">
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={first ? `Plan of today's first hole: par ${first.par}, ${first.len} yards` : "Plan of today's first hole"}
            />
          </div>
        </div>
        <figcaption className="club-plate-caption">
          {first ? (<><strong>Hole 1</strong><span>Par {first.par}, {first.len} yards</span></>) : <span>&nbsp;</span>}
        </figcaption>
      </figure>
    </section>
  );
}
