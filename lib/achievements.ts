// The trophy cabinet: achievements worked out from records the site already keeps (the Nine Holes
// card, the Pin High card, the multiplayer record). Nothing is stored for them, so every one is
// built on a figure that never goes back down: rounds played, best scores, wins.
import type { NineHolesStats } from './nine-holes-stats';
import type { MpRecord } from './mp/records';

export type PinHighStats = { played: number; bestScore: number };
export type Achievement = {
  id: string;
  game: 'Nine Holes' | 'Pin High' | 'Multiplayer';
  title: string;
  how: string;       // what earns it
  earned: boolean;
  progress: string;  // where the player stands while it is locked ('' when there is no count)
};

// Whatever is stored for Pin High (nothing, or an older shape) as two safe numbers.
export function readPinHigh(raw: unknown): PinHighStats {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : 0);
  return { played: num(o.played), bestScore: num(o.bestScore) };
}

const count = (have: number, need: number, unit: string) => `${Math.min(have, need)} of ${need} ${unit}`;

export function achievements(golf: NineHolesStats, pin: PinHighStats, mp: MpRecord): Achievement[] {
  const best = golf.best ? golf.best.toPar : null;
  const games = mp.win + mp.loss + mp.draw;
  const bestGolf = (limit: number) => best !== null && best <= limit;
  const bestText = best === null ? 'No daily round yet' : `Best so far: ${best === 0 ? 'level par' : best > 0 ? `+${best}` : best}`;
  const pinText = pin.bestScore ? `Best so far: ${pin.bestScore}` : 'No round yet';
  return [
    { id: 'nh-first', game: 'Nine Holes', title: 'First tee', how: 'Finish a round of Nine Holes', earned: golf.rounds >= 1, progress: '' },
    { id: 'nh-10', game: 'Nine Holes', title: 'Regular', how: 'Finish 10 rounds', earned: golf.rounds >= 10, progress: count(golf.rounds, 10, 'rounds') },
    { id: 'nh-50', game: 'Nine Holes', title: 'Part of the furniture', how: 'Finish 50 rounds', earned: golf.rounds >= 50, progress: count(golf.rounds, 50, 'rounds') },
    { id: 'nh-card', game: 'Nine Holes', title: 'Card in hand', how: 'Earn a handicap with 4 daily rounds', earned: golf.history.length >= 4, progress: count(golf.history.length, 4, 'daily rounds') },
    { id: 'nh-par', game: 'Nine Holes', title: 'Level par', how: 'Finish a daily course at par or better', earned: bestGolf(0), progress: bestText },
    { id: 'nh-red', game: 'Nine Holes', title: 'Red numbers', how: 'Finish a daily course under par', earned: bestGolf(-1), progress: bestText },
    { id: 'nh-low', game: 'Nine Holes', title: 'Going low', how: 'Finish a daily course at 3 under or better', earned: bestGolf(-3), progress: bestText },
    { id: 'ph-first', game: 'Pin High', title: 'Card signed', how: 'Finish a daily round of Pin High', earned: pin.played >= 1, progress: '' },
    { id: 'ph-10', game: 'Pin High', title: 'Quiz regular', how: 'Finish 10 daily rounds', earned: pin.played >= 10, progress: count(pin.played, 10, 'rounds') },
    { id: 'ph-251', game: 'Pin High', title: 'Single figures', how: 'Score 251 or more in a round', earned: pin.bestScore >= 251, progress: pinText },
    { id: 'ph-351', game: 'Pin High', title: 'Scratch', how: 'Score 351 or more in a round', earned: pin.bestScore >= 351, progress: pinText },
    { id: 'ph-450', game: 'Pin High', title: 'Tour card', how: 'Score 450 or more in a round', earned: pin.bestScore >= 450, progress: pinText },
    { id: 'mp-first', game: 'Multiplayer', title: 'Good company', how: 'Finish a Nine Holes game against friends', earned: games >= 1, progress: '' },
    { id: 'mp-win', game: 'Multiplayer', title: 'First blood', how: 'Win a multiplayer game', earned: mp.win >= 1, progress: '' },
    { id: 'mp-10', game: 'Multiplayer', title: 'Hustler', how: 'Win 10 multiplayer games', earned: mp.win >= 10, progress: count(mp.win, 10, 'wins') },
  ];
}
