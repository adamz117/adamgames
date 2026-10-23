import Link from 'next/link';
import { redirect } from 'next/navigation';
import MemberCard from '@/components/member-card';
import UsernameEditor from '@/components/username-editor';
import { getProfileServer } from '@/lib/profile';
import { getGameStatsServer } from '@/lib/game-stats';
import { countingRounds, formatToPar, HANDICAP_BEST, HANDICAP_WINDOW, readStats } from '@/lib/nine-holes-stats';

export const metadata = { title: 'Your card | Adam Games' };

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default async function AccountPage() {
  const profile = await getProfileServer();
  if (!profile) redirect('/login');
  const stats = readStats(await getGameStatsServer('nine-holes'));
  const counting = countingRounds(stats.history);

  return (
    <main className="club-wrap" style={{ paddingBottom: 96 }}>
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', paddingTop: 64 }}>
        <UsernameEditor initialUsername={profile.username} />
      </h1>
      <p className="club-lede">Your card, from every daily course you&rsquo;ve finished. Tap your name to change it.</p>

      <div style={{ marginTop: 34 }}>
        <MemberCard name="Your card" stats={stats} />
      </div>

      <section className="club-section" style={{ paddingTop: 72 }}>
        <h2 className="club-h2">Your last {HANDICAP_WINDOW} daily rounds</h2>
        {stats.history.length === 0 ? (
          <>
            <p className="club-lede">No daily rounds yet. Today&rsquo;s course is ready whenever you are.</p>
            <p style={{ margin: '22px 0 0' }}><Link href="/games/nine-holes" className="club-button">Play today&rsquo;s nine</Link></p>
          </>
        ) : (
          <>
            <p className="club-lede">
              {counting.size > 0
                ? `The rounds outlined in amber make up your handicap: your best ${Math.min(HANDICAP_BEST, stats.history.length)}.`
                : 'Your handicap starts once you have four daily rounds.'}{' '}
              Only your first finish of each day&rsquo;s course counts. In all you&rsquo;ve finished {stats.rounds} round{stats.rounds === 1 ? '' : 's'}, practice included.
            </p>
            <div className="club-rounds-grid">
              {stats.history.map((r) => (
                <div key={r.seed} className={`club-round-tile${counting.has(r) ? ' counts' : ''}`}>
                  <div className="score">{formatToPar(r.toPar)} <span style={{ fontSize: 18, color: 'var(--text-dim)' }}>({r.strokes})</span></div>
                  <div className="course">{r.course}</div>
                  <div className="date">{longDate(r.playedAt)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
