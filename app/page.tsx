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
    <main style={{ position: 'relative', overflow: 'hidden' }}>
      <div
        aria-hidden="true"
        className="hero-glow"
        style={{
          position: 'absolute',
          top: '-160px',
          left: '-120px',
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
          opacity: 0.16,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />
      <div
        aria-hidden="true"
        className="hero-glow-2"
        style={{
          position: 'absolute',
          top: '80px',
          right: '-160px',
          width: 420,
          height: 420,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent-bright) 0%, transparent 70%)',
          opacity: 0.12,
          filter: 'blur(48px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>
        <div
          className="hero-badge"
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--accent-bright)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '5px 14px',
          }}
        >
          Personal arcade
        </div>
        <h1
          className="hero-title"
          style={{ fontFamily: 'var(--font-display)', fontSize: 48, margin: '14px 0 0' }}
        >
          Your games. Your stats.
        </h1>
        <p className="hero-sub" style={{ color: 'var(--text-dim)', marginTop: 8, maxWidth: 520 }}>
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
          {gamesWithStats.map(({ game, stats }, i) => (
            <GameCard
              key={game.id}
              title={game.title}
              description={game.description}
              href={game.href}
              summary={stats === undefined ? undefined : game.summarize(stats)}
              style={{ animationDelay: `${0.15 + i * 0.06}s` }}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
