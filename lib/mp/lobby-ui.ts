// What the lobby pages show and build: default settings, course choices, labels and error text.
// Pure (no Supabase, no DOM).
import { COURSE_PAR } from '../course-rounds';
import type { CourseMode } from '../course-rounds';
import { COURSE_NAME, courseLabel } from './finish-core';
import type { CourseSpec, Format, LobbySettings, Pace, TeamMode } from './protocol';

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
// The 2v2 formats the game can play so far (the lobby offers only these).
export const PLAYABLE_TEAM_MODES: TeamMode[] = ['bestball', 'alternate', 'scramble'];
// A new 2v2: seats 1 and 3 against 2 and 4, until the host moves players round.
export const DEFAULT_SIDES: [[number, number], [number, number]] = [[0, 2], [1, 3]];
// The sides after the host swaps two players (on different sides); unchanged if they're on the same side.
export function swapSides(sides: [[number, number], [number, number]], a: number, b: number): [[number, number], [number, number]] {
  const sa = sides.findIndex((m) => m.includes(a)), sb = sides.findIndex((m) => m.includes(b));
  if (sa < 0 || sb < 0 || sa === sb) return sides;
  const swap = (m: [number, number]): [number, number] => m.map((x) => (x === a ? b : x === b ? a : x)) as [number, number];
  return [swap(sides[0]), swap(sides[1])];
}
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
