// Rounds on the real courses (Victoria Country Club first). They never touch the daily record
// in nine-holes-stats.ts; they are kept one row per finished round in `course_rounds`.

export type CourseMode = 'front' | 'back' | 'all';
export type RealRound = { course: string; mode: CourseMode; strokes: number; par: number; day: string };

export const COURSE_PAR: Record<string, Record<CourseMode, number>> = {
  victoria: { front: 35, back: 36, all: 71 },
  'gary-player': { front: 36, back: 36, all: 72 },
  'tpc-sawgrass': { front: 36, back: 36, all: 72 },
  augusta: { front: 36, back: 36, all: 72 },
  'pebble-beach': { front: 36, back: 36, all: 72 },
};
export const MODE_LABEL: Record<CourseMode, string> = { front: 'Front 9', back: 'Back 9', all: '18 holes' };
export const MODES: CourseMode[] = ['front', 'back', 'all'];

// A player's record on one course, for each way to play: the best round and how many rounds finished.
export type ModeRecord = { best: { strokes: number; par: number } | null; played: number };
export function summariseRounds(rows: { mode: string; strokes: number; par: number }[]): Record<CourseMode, ModeRecord> {
  const out = Object.fromEntries(MODES.map((m) => [m, { best: null, played: 0 }])) as Record<CourseMode, ModeRecord>;
  for (const r of rows) {
    const rec = out[r.mode as CourseMode];
    if (!rec) continue;
    rec.played++;
    if (!rec.best || r.strokes < rec.best.strokes) rec.best = { strokes: r.strokes, par: r.par };
  }
  return out;
}

const isDay = (d: unknown): d is string => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};

// The game's postMessage, checked field by field: anything off is ignored, never stored.
export function parseRealRound(data: unknown): RealRound | null {
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (m.type !== 'nine-holes-real-round' || typeof m.course !== 'string') return null;
  const pars = COURSE_PAR[m.course];
  if (!pars || typeof m.mode !== 'string' || !(m.mode in pars)) return null;
  const mode = m.mode as CourseMode;
  if (typeof m.strokes !== 'number' || !Number.isInteger(m.strokes) || m.strokes <= 0) return null;
  if (m.par !== pars[mode] || !isDay(m.day)) return null;
  return { course: m.course, mode, strokes: m.strokes, par: m.par, day: m.day };
}
