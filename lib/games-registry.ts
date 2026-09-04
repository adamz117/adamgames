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
];
