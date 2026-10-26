// What the lobby pages show and build: default settings, course choices, labels and error text.
// Pure (no Supabase, no DOM).
import { COURSE_PAR } from '../course-rounds';
import type { CourseMode } from '../course-rounds';
import { COURSE_NAME, courseLabel } from './finish-core';
import type { CourseSpec, Format, LobbySettings, LobbySize, Pace } from './protocol';

// The same day key the game seeds today's nine with.
export const todayKey = () => new Date().toLocaleDateString('en-CA');

export const defaultSettings = (day: string): LobbySettings => ({
  spec: { kind: 'daily', seed: day }, format: 'stroke', pace: 'own', clock: 30, maxPlayers: 2,
});

// The real courses a lobby can pick, in the game's own ids, named as on the results.
export const REAL_COURSES = Object.keys(COURSE_PAR).map((id) => ({ id, name: COURSE_NAME[id] ?? id }));

// The course picker's value for a spec: 'daily', 'random' or a real course id.
export const courseChoice = (spec: CourseSpec): string => (spec.kind === 'real' ? spec.id : spec.kind);

const randomSeed = () => 'r' + Math.floor(Math.random() * 36 ** 6).toString(36);

// The spec for a picked course. A random nine gets a fresh seed; real courses play today's pins.
export function specFor(choice: string, mode: CourseMode, day: string): CourseSpec {
  if (choice === 'daily') return { kind: 'daily', seed: day };
  if (choice === 'random') return { kind: 'random', seed: randomSeed() };
  return { kind: 'real', id: choice, mode, day };
}

export function courseText(spec: CourseSpec, today: string): string {
  if (spec.kind === 'daily' && spec.seed === today) return 'Today’s daily nine';
  return courseLabel(spec);
}
export const FORMAT_LABEL: Record<Format, string> = { stroke: 'Stroke play', match: 'Match play' };
export const PACE_LABEL: Record<Pace, string> = { own: 'Own pace', turns: 'Take turns' };

// A new lobby size; 3–4 players play stroke (match play is for 2).
export const sizeChange = (s: LobbySettings, maxPlayers: LobbySize): LobbySettings =>
  ({ ...s, maxPlayers, format: maxPlayers > 2 ? 'stroke' : s.format });

// The smallest lobby size that fits the players here in the slots they hold (slots can have gaps,
// e.g. 0 and 3 after two leave). The database refuses anything smaller.
export const minSize = (slots: readonly number[]) => Math.max(2, slots.length, ...slots.map((s) => s + 1));

// "Bea", "Bea and Cal", "Bea, Cal and Dee".
export const nameList = (names: readonly string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// Whether the host can start, and why not. The game starts with the players here (the database
// drops absent ones at the start), so away players don't hold it up or count against the size.
export type StartPlayer = { name: string; ready: boolean; host: boolean; here: boolean };
export function startCheck(players: readonly StartPlayer[], size: number) {
  const here = players.filter((p) => p.here);
  const away = players.filter((p) => !p.here).map((p) => p.name);
  const waitingOn = here.filter((p) => !p.host && !p.ready).map((p) => p.name);
  const why = here.length < 2 ? 'alone' : here.length > size ? 'too_many' : waitingOn.length ? 'waiting' : 'ready';
  return { can: why === 'ready', why, waitingOn: why === 'waiting' ? waitingOn : [], away } as const;
}

// Plain words for the lobby functions' error codes.
const ERRORS: Record<string, string> = {
  not_found: 'There’s no lobby with that code. Check it, or try again in a moment.',
  full: 'This lobby is full.',
  not_open: 'This game has already started without you.',
  closed: 'This lobby has closed.',
  left: 'You left this game, so it counts as a loss.',
  over: 'This game is over.',
  bad_name: 'Pick a name of 2 to 20 letters.',
  bad_code: 'Lobby codes are 6 letters and numbers.',
  sign_in_failed: 'We couldn’t sign you in to play. Try again in a moment.',
  not_signed_in: 'We couldn’t sign you in to play. Try again in a moment.',
  not_ready: 'Everyone here needs to be ready first.',
  not_started: 'The game couldn’t start. Try again.',
  not_finished: 'The last game is still being checked. Try again in a moment.',
  not_member: 'You’re no longer in this lobby.',
  too_many: 'That’s too few seats for the players in the lobby. Pick more players, or wait for someone to leave.',
};
export const errorText = (code: string) => ERRORS[code] ?? 'Something went wrong. Try again in a moment.';
