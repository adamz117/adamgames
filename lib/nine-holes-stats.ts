// A player's Nine Holes record, kept in their game_stats row. Only daily courses count towards
// the streak, best round and handicap, and only the first finished round of each day, so none of
// them can be improved by replaying an easy course. Every finished round adds to `rounds`.

export interface NineHolesRound {
  seed: string; // the daily course's date, YYYY-MM-DD
  course: string;
  strokes: number;
  par: number;
  toPar: number;
  playedAt: string;
}

export interface NineHolesStats {
  history: NineHolesRound[]; // the last 20 daily rounds, newest first
  rounds: number;
  streak: number;
  lastDaily: string | null;
  best: NineHolesRound | null;
  handicap: number | null;
  lastPlayedAt: string | null;
}

export const HANDICAP_WINDOW = 20;
export const HANDICAP_BEST = 8;
export const HANDICAP_MIN = 4;

const EMPTY: NineHolesStats = { history: [], rounds: 0, streak: 0, lastDaily: null, best: null, handicap: null, lastPlayedAt: null };

const isRound = (r: unknown): r is NineHolesRound => {
  const o = r as Record<string, unknown> | null;
  return !!o && typeof o.seed === 'string' && typeof o.course === 'string'
    && typeof o.strokes === 'number' && typeof o.par === 'number' && typeof o.toPar === 'number' && typeof o.playedAt === 'string';
};

// Whatever is stored (nothing, or an older shape) comes back as a complete record.
export function readStats(raw: unknown): NineHolesStats {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const history = Array.isArray(o.history) ? o.history.filter(isRound).slice(0, HANDICAP_WINDOW) : [];
  return {
    history,
    rounds: typeof o.rounds === 'number' ? o.rounds : 0,
    streak: typeof o.streak === 'number' ? o.streak : 0,
    lastDaily: typeof o.lastDaily === 'string' ? o.lastDaily : null,
    best: isRound(o.best) ? o.best : null,
    handicap: handicapOf(history),
    lastPlayedAt: typeof o.lastPlayedAt === 'string' ? o.lastPlayedAt : null,
  };
}

// The average over par of the best 8 of the last 20 daily rounds (all of them while there are
// fewer than 8), once there are at least 4. One decimal place.
export function handicapOf(history: NineHolesRound[]): number | null {
  const recent = history.slice(0, HANDICAP_WINDOW);
  if (recent.length < HANDICAP_MIN) return null;
  const best = recent.map((r) => r.toPar).sort((a, b) => a - b).slice(0, HANDICAP_BEST);
  return Math.round((best.reduce((a, b) => a + b, 0) / best.length) * 10) / 10;
}

// The rounds the handicap is currently made of, so the account page can mark them.
export function countingRounds(history: NineHolesRound[]): Set<NineHolesRound> {
  const recent = history.slice(0, HANDICAP_WINDOW);
  if (recent.length < HANDICAP_MIN) return new Set();
  return new Set([...recent].sort((a, b) => a.toPar - b.toPar).slice(0, HANDICAP_BEST));
}

export function dayBefore(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

// The streak as it stands today: it lapses once a whole day goes by without the daily course.
export function currentStreak(stats: NineHolesStats, today: string): number {
  if (!stats.lastDaily) return 0;
  return stats.lastDaily === today || stats.lastDaily === dayBefore(today) ? stats.streak : 0;
}

export function recordRound(
  prev: NineHolesStats,
  played: { seed: string; course: string; strokes: number; par: number },
  today: string,
  now: string
): NineHolesStats {
  const next: NineHolesStats = { ...prev, rounds: prev.rounds + 1, lastPlayedAt: now };
  const daily = played.seed === today && prev.lastDaily !== today && !prev.history.some((r) => r.seed === today);
  if (!daily) return next;

  const round: NineHolesRound = { ...played, toPar: played.strokes - played.par, playedAt: now };
  next.history = [round, ...prev.history].slice(0, HANDICAP_WINDOW);
  next.streak = prev.lastDaily === dayBefore(today) ? prev.streak + 1 : 1;
  next.lastDaily = today;
  if (!prev.best || round.toPar < prev.best.toPar) next.best = round;
  next.handicap = handicapOf(next.history);
  return next;
}

export const formatToPar = (n: number) => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n));
// Golf writes a better-than-scratch handicap with a plus sign.
export const formatHandicap = (h: number) => (h < 0 ? `+${Math.abs(h).toFixed(1)}` : h.toFixed(1));

export const EMPTY_STATS = EMPTY;
