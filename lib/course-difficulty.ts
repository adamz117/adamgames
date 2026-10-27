// How hard each course plays in Nine Holes, measured rather than guessed: the fairness bot
// (games/nine-holes/courses/fairness.js) plays 16 or more rounds of 18 holes as a club golfer
// (SLOPPY=2.5: it picks sensible lines but its timing and aim are off), and this is its average
// over par. Re-run it after changing a course or adding one:
//   SLOPPY=2.5 node courses/fairness.js 16 <course ids...>
export const CLUB_AVG: Record<string, number> = {
  'gary-player': 1.6,
  'pebble-beach': 1.9,
  victoria: 3.9,
  augusta: 4.3,
  'tpc-sawgrass': 8.0,
  ironmere: 12.8,
  sunscar: 4.5,
  cloudspire: 3.7,
  'cypress-point': -1.8,
  'champagne-sports': 0.4,
  'cotswold-downs': -3.4,
};

const LABELS = ['Easy', 'Easy', 'Moderate', 'Moderate', 'Testing', 'Testing', 'Hard', 'Hard', 'Brutal', 'Brutal'];

export type Difficulty = { rating: number; label: string; overPar: number };

// 1 to 10: TPC Sawgrass, the hardest real course, comes out at 7 and Ironmere Quarry at 10.
export function difficultyOf(id: string): Difficulty | null {
  if (!Object.hasOwn(CLUB_AVG, id)) return null;
  const avg = CLUB_AVG[id], rating = Math.min(10, Math.max(1, Math.round(2 + avg * 0.62)));
  return { rating, label: LABELS[rating - 1], overPar: Math.round(avg) };
}
