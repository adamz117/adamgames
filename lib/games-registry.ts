export type GameStats = Record<string, unknown> | null;

export interface GameRegistryEntry {
  id: string;
  title: string;
  description: string;
  href: string;
  summarize: (stats: GameStats) => string;
}

export const GAMES: GameRegistryEntry[] = [
  {
    id: 'flag-atlas',
    title: 'Flag Atlas',
    description: 'Guess 188 countries by their flag before the world map fills in.',
    href: '/games/flag-atlas',
    summarize: (stats) => {
      if (!stats) return 'Not played yet';
      const correct = Number(stats.correct ?? 0);
      const total = Number(stats.totalCountries ?? 188);
      return `${correct} / ${total} flags identified`;
    },
  },
  {
    id: 'deep-cut',
    title: 'Deep Cut',
    description: 'Dig for daily trivia — rarer, less obvious answers score more.',
    href: '/games/deep-cut',
    summarize: (stats) => {
      if (!stats) return 'Not played yet';
      const score = Number(stats.score ?? 0);
      const day = Number(stats.dayNumber ?? 0);
      return day ? `Day ${day}: ${score} pts` : `Last dig: ${score} pts`;
    },
  },
  {
    id: 'shape-atlas',
    title: 'Shape Atlas',
    description: 'Name the country by its outline, then watch it drop into place on the map.',
    href: '/games/shape-atlas',
    summarize: (stats) => {
      if (!stats) return 'Not played yet';
      const collected = Number(stats.collectionSize ?? 0);
      const solved = Boolean(stats.solved);
      const day = Number(stats.dayNumber ?? 0);
      if (!solved) return `${collected} collected · Day ${day || '?'}: unsolved`;
      const guesses = Number(stats.guessesUsed ?? 0);
      return `${collected} collected · solved in ${guesses}/6`;
    },
  },
];
