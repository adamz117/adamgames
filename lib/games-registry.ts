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
    title: 'Outline Guesser',
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
  {
    id: 'guess-the-word',
    title: 'Guess the Word',
    description: 'Five letters, six guesses, one word a day.',
    href: '/games/guess-the-word',
    summarize: (stats) => {
      if (!stats) return 'Not played yet';
      const day = Number(stats.dayNumber ?? 0);
      const solved = Boolean(stats.solved);
      const streak = Number(stats.streak ?? 0);
      if (!day) return 'Not played yet';
      return solved ? `Day ${day}: solved · ${streak} day streak` : `Day ${day}: missed today`;
    },
  },
  {
    id: 'common-threads',
    title: 'Common Threads',
    description: 'Sort sixteen words into four hidden categories before you run out of mistakes.',
    href: '/games/common-threads',
    summarize: (stats) => {
      if (!stats) return 'Not played yet';
      const day = Number(stats.dayNumber ?? 0);
      const solved = Boolean(stats.solved);
      const streak = Number(stats.streak ?? 0);
      if (!day) return 'Not played yet';
      return solved ? `Day ${day}: solved · ${streak} day streak` : `Day ${day}: missed today`;
    },
  },
  {
    id: 'brain-buzzer',
    title: 'Brain Buzzer',
    description: 'Five general-knowledge questions a day, one hundred days of trivia to work through.',
    href: '/games/brain-buzzer',
    summarize: (stats) => {
      if (!stats) return 'Not played yet';
      const day = Number(stats.dayNumber ?? 0);
      const score = Number(stats.score ?? 0);
      const streak = Number(stats.streak ?? 0);
      if (!day) return 'Not played yet';
      return `Day ${day}: ${score}/5 · ${streak} day streak`;
    },
  },
  {
    id: 'number-cruncher',
    title: 'Number Cruncher',
    description: 'Wordle for math — guess the hidden equation in six tries.',
    href: '/games/number-cruncher',
    summarize: (stats) => {
      if (!stats) return 'Not played yet';
      const day = Number(stats.dayNumber ?? 0);
      const solved = Boolean(stats.solved);
      const streak = Number(stats.streak ?? 0);
      if (!day) return 'Not played yet';
      return solved ? `Day ${day}: solved · ${streak} day streak` : `Day ${day}: missed today`;
    },
  },
];
