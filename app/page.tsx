import Link from 'next/link';
import TodayHero from '@/components/today-hero';
import MemberCard from '@/components/member-card';
import { getProfileServer } from '@/lib/profile';
import { getGameStatsServer } from '@/lib/game-stats';
import { HANDICAP_MIN, readStats } from '@/lib/nine-holes-stats';
import { getMyResultsServer } from '@/lib/mp/records-server';
import { readRecord } from '@/lib/mp/records';

// Three things only: today's nine, your card (or signing up for one), and the real courses.
export default async function HomePage() {
  const [profile, raw, results] = await Promise.all([getProfileServer(), getGameStatsServer('nine-holes'), getMyResultsServer()]);
  const stats = readStats(raw);

  return (
    <main>
      <div className="club-grain" aria-hidden="true" />
      <TodayHero signedIn={!!profile} latest={stats.history[0] ?? null} />

      <section className="club-wrap club-section" aria-label="Your member card">
        {profile ? (
          <MemberCard name={profile.username} stats={stats} record={readRecord(results)} showLink />
        ) : (
          <div className="club-card">
            <div className="club-card-core">
              <div>
                <p className="club-card-name">Keep a handicap</p>
                <p className="club-card-note">
                  Sign up and every daily round goes on your card: your streak, your best round, and a
                  handicap from your best 8 of your last 20.
                </p>
                <p className="club-card-actions">
                  <Link href="/signup" className="club-button">Sign up</Link>
                  <Link href="/login" className="club-link">Log in</Link>
                </p>
              </div>
              {/* What each number on a member's card will mean, rather than empty zeros. */}
              <div className="club-stats">
                <div className="club-stat"><b className="word">Streak</b><span>Daily courses finished in a row</span></div>
                <div className="club-stat"><b className="word">Best</b><span>Your lowest score to par</span></div>
                <div className="club-stat"><b className="word">Handicap</b><span>Your best 8 of your last 20, from {HANDICAP_MIN} rounds</span></div>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="club-wrap club-section">
        <Link href="/courses" className="club-real">
          <span>
            <span className="club-h2">Real courses</span>
            <span className="club-lede">Holes from real-life courses, rebuilt for Nine Holes. The first ones are on the way.</span>
          </span>
          <span className="club-real-go">See the courses</span>
        </Link>
      </section>

      <footer className="club-wrap">
        <div className="club-footer">
          <span>A new course every morning, the same for everyone.</span>
          <span translate="no">Adam Games</span>
        </div>
      </footer>
    </main>
  );
}
