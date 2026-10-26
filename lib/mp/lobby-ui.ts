// What the lobby pages show and build: default settings, course choices, labels and error text.
// Pure (no Supabase, no DOM).
import { COURSE_PAR } from '../course-rounds';
import type { CourseMode } from '../course-rounds';
import { COURSE_NAME, courseLabel } from './finish-core';
import type { CourseSpec, Format, LobbySettings, Pace } from './protocol';

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
  not_ready: 'Everyone needs to be here and ready first.',
  not_started: 'The game couldn’t start. Try again.',
  not_finished: 'The last game is still being checked. Try again in a moment.',
  not_member: 'You’re no longer in this lobby.',
};
export const errorText = (code: string) => ERRORS[code] ?? 'Something went wrong. Try again in a moment.';
