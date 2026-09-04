import GameCard from '@/components/game-card';
import { GAMES } from '@/lib/games-registry';
import { getGameStatsServer } from '@/lib/game-stats';

export default async function HomePage() {
  const gamesWithStats = await Promise.all(
    GAMES.map(async (game) => ({
      game,
      stats: await getGameStatsServer(game.id),
    }))
  );

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 44, margin: 0 }}>
        Your games. Your stats.
      </h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 8, maxWidth: 520 }}>
        A personal arcade — every game you play here tracks your progress in
        one place, once you sign in.
      </p>
      <div
        style={{
          marginTop: 32,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {gamesWithStats.map(({ game, stats }) => (
          <GameCard
            key={game.id}
            title={game.title}
            description={game.description}
            href={game.href}
            summary={stats === undefined ? undefined : game.summarize(stats)}
          />
        ))}
      </div>
    </main>
  );
}
