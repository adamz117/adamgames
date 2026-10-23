import type { CSSProperties } from 'react';
import Link from 'next/link';
import TodayHero from '@/components/today-hero';
import MemberCard from '@/components/member-card';
import { getProfileServer } from '@/lib/profile';
import { getGameStatsServer } from '@/lib/game-stats';
import { formatToPar, HANDICAP_MIN, readStats } from '@/lib/nine-holes-stats';
import { VENUES } from '@/lib/venues';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// The venue tiles: one tall and wide, then four halves, so five tiles fill the grid exactly.
const VENUE_SHAPE = ['wide tall', 'wide', 'wide', 'wide', 'wide'];

export default async function HomePage() {
  const [profile, raw] = await Promise.all([getProfileServer(), getGameStatsServer('nine-holes')]);
  const stats = readStats(raw);
  const recent = stats.history.slice(0, 5);

  return (
    <main>
      <div className="club-grain" aria-hidden="true" />
      <TodayHero signedIn={!!profile} latest={stats.history[0] ?? null} />

      <section className="club-wrap club-section" aria-label="Your member card">
        {profile ? (
          <MemberCard name={profile.username} stats={stats} showLink />
        ) : (
          <div className="club-card">
            <div className="club-card-core">
              <div>
                <p className="club-card-name">Keep a handicap</p>
                <p className="club-card-note">
                  Sign up and every daily round goes on your card: your streak, your best round, and a
                  handicap from your best 8 of your last 20.
                </p>
                <p style={{ margin: '20px 0 0' }}><Link href="/signup" className="club-button">Sign up</Link></p>
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

      {recent.length > 0 ? (
        <section className="club-wrap club-section">
          <h2 className="club-h2">Recent rounds</h2>
          <div className="club-board">
            {recent.map((r) => (
              <div className="club-board-row" key={r.seed}>
                <span className="club-board-date">{shortDate(r.playedAt)}</span>
                <span className="club-board-course">{r.course}</span>
                <span className="club-board-score">{formatToPar(r.toPar)} <span style={{ color: 'var(--text-dim)', fontSize: 18 }}>({r.strokes})</span></span>
              </div>
            ))}
          </div>
          <p style={{ margin: '18px 0 0' }}><Link href="/account" className="club-link">Every round on your card</Link></p>
        </section>
      ) : (
        <section className="club-wrap club-section club-split">
          <div>
            <h2 className="club-h2">How a round plays</h2>
            <p className="club-lede">Every shot is two well-timed taps. There is no putting to time: where you finish on the green decides it.</p>
          </div>
          <ol className="club-steps">
            <li><div><h3>Set the line</h3><p>The aim sweeps side to side. Tap the course to move it, then lock it in.</p></div></li>
            <li><div><h3>Time the swing</h3><p>Stop the power needle in the green band. It marks the power that reaches the pin.</p></div></li>
            <li><div><h3>Read the rings</h3><p>Inside the gold ring is one putt, the pale ring two, anywhere else on the green three.</p></div></li>
          </ol>
        </section>
      )}

      <section className="club-wrap club-section">
        <h2 className="club-h2">Five venues, one course a day</h2>
        <p className="club-lede">
          The course is built from the date, so everyone plays the same nine holes, in the same wind, with the
          same hazards in the same places.
        </p>
        <div className="club-venues">
          {VENUES.map((v, i) => (
            <article
              key={v.id}
              className={`club-venue ${VENUE_SHAPE[i]}`}
              style={{
                // darkened from the venue's tree-line green, so bone lettering reads on every one
                background: `linear-gradient(160deg, color-mix(in srgb, ${v.colors.deep} 70%, #0b1610) 0%, color-mix(in srgb, ${v.colors.deep} 45%, #0b1610) 100%)`,
                '--v-rough': v.colors.rough,
                '--v-fw': v.colors.fw,
              } as CSSProperties}
            >
              <h3>{v.name}</h3>
              <p>{v.blurb}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="club-wrap">
        <div className="club-footer">
          <span>A new course every morning, the same for everyone.</span>
          <span>Adam Games</span>
        </div>
      </footer>
    </main>
  );
}
