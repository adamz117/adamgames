// The multiplayer protocol: lobby settings, swings, names and codes, checked field by field.
// Pure (no Supabase); everything from the network or the game iframe goes through these.
import { COURSE_PAR } from '../course-rounds';
import type { CourseMode } from '../course-rounds';

export type Format = 'stroke' | 'match';
export type Pace = 'own' | 'turns';
export type Visibility = 'private' | 'public';
export type CourseSpec =
  | { kind: 'daily' | 'random'; seed: string }
  | { kind: 'real'; id: string; mode: CourseMode; day: string };
export type PlayerCount = 2 | 3 | 4;
export const PLAYER_COUNTS: PlayerCount[] = [2, 3, 4];
export type LobbySettings = { spec: CourseSpec; format: Format; pace: Pace; clock: 30; maxPlayers: PlayerCount };
export type Swing = { slot: number; hole: number; shot: number; club: number; aim: number; v: number; timeout: boolean };

export const FORMATS: Format[] = ['stroke', 'match'];
export const PACES: Pace[] = ['own', 'turns'];
// Broadcast refresh hints. 'swing': one was just stored, so re-read the log now (the database's own
// change feed can lag on phones). Swings themselves only ever come from the stored log.
export const LOBBY_EVENTS = ['settings', 'ready', 'start', 'left', 'rematch', 'swing'] as const;
export type LobbyEvent = (typeof LOBBY_EVENTS)[number];
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const MODES: CourseMode[] = ['front', 'back', 'all'];
const obj = (x: unknown): Record<string, unknown> | null =>
  x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
const isDay = (d: unknown): d is string => {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};
const intIn = (x: unknown, lo: number, hi: number): x is number => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const numIn = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;

function parseSpec(x: unknown): CourseSpec | null {
  const s = obj(x);
  if (!s) return null;
  if (s.kind === 'daily') return isDay(s.seed) ? { kind: 'daily', seed: s.seed } : null;
  if (s.kind === 'random')
    return typeof s.seed === 'string' && /^[A-Za-z0-9-]{1,32}$/.test(s.seed) ? { kind: 'random', seed: s.seed } : null;
  if (s.kind === 'real') {
    const known = typeof s.id === 'string' && Object.prototype.hasOwnProperty.call(COURSE_PAR, s.id);
    if (!known || !MODES.includes(s.mode as CourseMode) || !isDay(s.day)) return null;
    return { kind: 'real', id: s.id as string, mode: s.mode as CourseMode, day: s.day };
  }
  return null;
}

// A fresh object with only the known fields, or null.
export function parseSettings(x: unknown): LobbySettings | null {
  const m = obj(x);
  if (!m) return null;
  const spec = parseSpec(m.spec);
  if (!spec || !FORMATS.includes(m.format as Format) || !PACES.includes(m.pace as Pace)) return null;
  if (m.clock !== 30 || !PLAYER_COUNTS.includes(m.maxPlayers as PlayerCount)) return null;
  if (m.format === 'match' && m.maxPlayers !== 2) return null; // match play is one against one
  return { spec, format: m.format as Format, pace: m.pace as Pace, clock: 30, maxPlayers: m.maxPlayers as PlayerCount };
}

// The same ranges as the swings table. Stored rows' extra columns (lobby_id, game) are dropped.
export function parseSwing(x: unknown): Swing | null {
  const m = obj(x);
  if (!m) return null;
  const { slot, hole, shot, club, aim, v } = m;
  const timeout = m.timeout ?? false;
  if (!intIn(slot, 0, 3) || !intIn(hole, 0, 17) || !intIn(shot, 0, 29) || !intIn(club, 0, 8)) return null;
  if (!numIn(aim, -10, 10) || !numIn(v, 0, 1.15) || typeof timeout !== 'boolean') return null;
  return { slot, hole, shot, club, aim, v, timeout };
}

// Same rule as the database's clean_name: control/invisible characters and <> removed, spaces
// trimmed, 2–20 characters.
const STRIP = /[\u0000-\u001f\u007f-\u009f<>\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;
export function cleanName(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const n = s.replace(STRIP, '').replace(/^ +| +$/g, '');
  const len = [...n].length;
  return len >= 2 && len <= 20 ? n : null;
}

// A signed-in member's shown name, as the database's display_name: "Member" while the username is
// blank or still the email prefix (compared case-insensitively, untrimmed); capped at 20.
export function memberName(username: unknown, email: unknown): string {
  const u = typeof username === 'string' ? username : '';
  const prefix = typeof email === 'string' ? email.split('@')[0] : '';
  if (!u.replace(/^ +| +$/g, '') || u.toLowerCase() === prefix.toLowerCase()) return 'Member';
  return [...u].slice(0, 20).join('');
}

export function makeCode(): string {
  const n = new Uint32Array(6);
  globalThis.crypto.getRandomValues(n);
  return Array.from(n, x => CODE_ALPHABET[x % CODE_ALPHABET.length]).join('');
}

// A typed or linked code, trimmed and upper-cased; null unless it could be a lobby code.
export function parseCode(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const c = s.trim().toUpperCase();
  return c.length === 6 && [...c].every(ch => CODE_ALPHABET.includes(ch)) ? c : null;
}

// The user ids (presence keys) in a channel's presenceState().
export function presenceUserIds(state: unknown): string[] {
  const s = obj(state);
  return s ? Object.keys(s).filter(k => Array.isArray(s[k]) && (s[k] as unknown[]).length > 0) : [];
}

// The slots of the players present, from the lobby's own player rows (never presence metadata).
export function presentPlayers(userIds: readonly string[], players: readonly { userId: string; slot: number }[]): number[] {
  const here = new Set(userIds);
  return [...new Set(players.filter(p => here.has(p.userId)).map(p => p.slot))].sort((a, b) => a - b);
}
