import GameCard from '@/components/game-card';
import UsernameEditor from '@/components/username-editor';
import { GAMES } from '@/lib/games-registry';
import { getGameStatsServer } from '@/lib/game-stats';
import { getProfileServer } from '@/lib/profile';

const DEEP_CUT_TIER_LABEL: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  ultra: 'Ultra-rare',
};

function StatCard({ game, value, metric }: { game: string; value: string; metric: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '14px 18px',
        minWidth: 150,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-dim)',
        }}
      >
        {game}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
          letterSpacing: '0.01em',
          color: 'var(--accent-bright)',
          marginTop: 4,
        }}
      >
        {value}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)', marginTop: 2 }}>
        {metric}
      </div>
    </div>
  );
}

export default async function HomePage() {
  const [profile, gamesWithStats] = await Promise.all([
    getProfileServer(),
    Promise.all(
      GAMES.map(async (game) => ({
        game,
        stats: await getGameStatsServer(game.id),
      }))
    ),
  ]);

  const statsById = Object.fromEntries(gamesWithStats.map(({ game, stats }) => [game.id, stats]));
  const flagStats = statsById['flag-atlas'];
  const deepCutStats = statsById['deep-cut'];
  const shapeStats = statsById['shape-atlas'];

  const flagCorrectValue = flagStats
    ? `${Number(flagStats.correct ?? 0)} / ${Number(flagStats.totalCountries ?? 188)}`
    : 'Not played yet';
  const deepCutBestTier = deepCutStats ? String(deepCutStats.bestTier ?? 'none') : 'none';
  const deepCutValue = DEEP_CUT_TIER_LABEL[deepCutBestTier] ?? 'Not played yet';
  const shapeAtlasValue = shapeStats ? `${Number(shapeStats.lifetimeScore ?? 0)} pts` : 'Not played yet';

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
      <div aria-hidden="true" className="arcade-grid" />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '56px 24px 0' }}>
        {profile ? (
          <>
            <div
              className="hero-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--accent-bright)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '6px 16px',
              }}
            >
              <span className="live-dot" aria-hidden="true" />
              Player profile
            </div>
            <h1
              className="hero-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(40px, 8vw, 76px)',
                lineHeight: 1.05,
                letterSpacing: '0.01em',
                margin: '18px 0 0',
                color: 'var(--text)',
              }}
            >
              Welcome back,
              <br />
              <UsernameEditor initialUsername={profile.username} />
            </h1>
            <p className="hero-sub" style={{ color: 'var(--text-dim)', marginTop: 14, maxWidth: 520, fontSize: 17 }}>
              Your best stats across every game, in one place.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 28 }}>
              <StatCard game="Flag Atlas" value={flagCorrectValue} metric="Countries correct" />
              <StatCard game="Deep Cut" value={deepCutValue} metric="Deepest dig" />
              <StatCard game="Shape Atlas" value={shapeAtlasValue} metric="Outline Guesser points" />
            </div>
          </>
        ) : (
          <>
            <div
              className="hero-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--accent-bright)',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 999,
                padding: '6px 16px',
              }}
            >
              <span className="live-dot" aria-hidden="true" />
              Insert coin to continue
            </div>
            <h1
              className="hero-title"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(48px, 9vw, 88px)',
                lineHeight: 1.02,
                letterSpacing: '0.01em',
                margin: '18px 0 0',
                color: 'var(--text)',
              }}
            >
              Your games.
              <br />
              Your stats.
            </h1>
            <p className="hero-sub" style={{ color: 'var(--text-dim)', marginTop: 14, maxWidth: 520, fontSize: 17 }}>
              A personal arcade — every game you play here tracks your progress in
              one place, once you sign in.
            </p>
          </>
        )}
      </div>

      <div
        className="marquee"
        aria-hidden="true"
        style={{ position: 'relative', zIndex: 1, marginTop: 40 }}
      >
        <div className="marquee-track">
          {Array.from({ length: 2 }).map((_, i) => (
            <span key={i} style={{ display: 'inline-flex', gap: 24 }}>
              <span>New high score unlocked</span>
              <span>•</span>
              <span>Flag Atlas — 188 countries charted</span>
              <span>•</span>
              <span>{profile ? 'Progress synced' : 'Sign in to save your progress'}</span>
              <span>•</span>
              <span>More games loading soon</span>
              <span>•</span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '40px 24px 56px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 20,
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
