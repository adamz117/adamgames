import Link from 'next/link';
import { redirect } from 'next/navigation';
import MemberCard from '@/components/member-card';
import UsernameEditor from '@/components/username-editor';
import { getProfileServer } from '@/lib/profile';
import { getGameStatsServer } from '@/lib/game-stats';
import { countingRounds, formatToPar, HANDICAP_BEST, HANDICAP_WINDOW, readStats } from '@/lib/nine-holes-stats';
import { getMyResultsServer } from '@/lib/mp/records-server';
import { formatRecord, readRecord, type RecordRow } from '@/lib/mp/records';

export const metadata = { title: 'Your card | Adam Games' };

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

const RECENT_GAMES = 10;
const FORMAT_LABEL = { stroke: 'Stroke play', match: 'Match play' } as const;
const resultWord = (g: RecordRow) => (g.result === 'win' ? 'Won' : g.result === 'loss' ? 'Lost' : g.format === 'match' ? 'Halved' : 'Tied');

export default async function AccountPage() {
  const profile = await getProfileServer();
  if (!profile) redirect('/login');
  const stats = readStats(await getGameStatsServer('nine-holes'));
  const counting = countingRounds(stats.history);
  const results = await getMyResultsServer();
  const record = readRecord(results);
  const recent = results.slice(0, RECENT_GAMES);

  return (
    <main className="club-wrap" style={{ paddingBottom: 96 }}>
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', paddingTop: 64 }}>
        <UsernameEditor initialUsername={profile.username} />
      </h1>
      <p className="club-lede">Your card, from every daily course you&rsquo;ve finished. Tap your name to change it.</p>

      <div style={{ marginTop: 34 }}>
        <MemberCard name="Your card" stats={stats} record={record} />
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

      <section className="club-section" style={{ paddingTop: 72 }}>
        <h2 className="club-h2">Your 1v1 record</h2>
        {results.length === 0 ? (
          <>
            <p className="club-lede">No 1v1 games yet. Open a lobby, send the link to a friend, and your record starts here.</p>
            <p style={{ margin: '22px 0 0' }}><Link href="/play" className="club-button">Play a 1v1</Link></p>
          </>
        ) : (
          <>
            <p className="club-lede">Every finished 1v1 game counts, against members and guests alike.</p>
            <div className="club-boards" style={{ marginTop: 28 }}>
              {([['All games', record], [FORMAT_LABEL.stroke, record.stroke], [FORMAT_LABEL.match, record.match]] as const).map(([label, t]) => (
                <section key={label} className="club-board" aria-label={`${label} record`}>
                  <h3>{label}</h3>
                  <p className="club-card-note club-figure" style={{ color: 'var(--text)' }}>{formatRecord(t)}</p>
                </section>
              ))}
            </div>
            <h3 className="club-h2" style={{ fontSize: 'clamp(26px, 3vw, 34px)', marginTop: 44 }}>Your last {recent.length === 1 ? 'game' : `${recent.length} games`}</h3>
            <div className="club-rounds-grid">
              {recent.map((g) => (
                <div key={`${g.lobby_id}-${g.game}`} className="club-round-tile">
                  <div className="score">{resultWord(g)}</div>
                  <div className="course">vs {g.opponent_name}{g.course_label && ` · ${g.course_label}`}</div>
                  <div className="date">{[longDate(g.played_at), FORMAT_LABEL[g.format], g.detail].filter(Boolean).join(' · ')}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
