'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import {
  currentStreak, formatHandicap, formatToPar, HANDICAP_BEST, HANDICAP_MIN, type NineHolesStats,
} from '@/lib/nine-holes-stats';
import { formatRecord, gamesPlayed, type MpRecord } from '@/lib/mp/records';

// The visitor's date, read on the client only: the server cannot know their time zone.
const today = () => new Date().toLocaleDateString('en-CA');
const noSubscribe = () => () => {};

export default function MemberCard({ name, stats, showLink, record }: {
  name: string; stats: NineHolesStats; showLink?: boolean; record?: MpRecord | null;
}) {
  const day = useSyncExternalStore(noSubscribe, today, () => null);
  const streak = day ? currentStreak(stats, day) : stats.streak;
  const daily = stats.history.length;
  const note = stats.handicap === null
    ? daily === 0
      ? 'Finish today’s course and your card starts filling in.'
      : `${HANDICAP_MIN - daily} more daily round${HANDICAP_MIN - daily === 1 ? '' : 's'} for a handicap.`
    : daily < HANDICAP_BEST
      ? `Handicap from all ${daily} of your daily rounds so far.`
      : `Handicap from your best ${HANDICAP_BEST} of your last ${Math.min(daily, 20)} daily rounds.`;

  return (
    <div className="club-card">
      <div className="club-card-core">
        <div>
          <p className="club-card-name">{name}</p>
          <p className="club-card-note">{note}</p>
          {/* Only once there is a multiplayer game to show. */}
          {record && gamesPlayed(record) > 0 && (
            <p className="club-card-note club-figure">Multiplayer&ensp;<span style={{ color: 'var(--text)' }}>{formatRecord(record)}</span></p>
          )}
          {showLink && <p style={{ margin: '16px 0 0' }}><Link href="/account" className="club-link">Your card</Link></p>}
        </div>
        <div className="club-stats">
          <div className="club-stat">
            <b>{streak}</b>
            <span>Day streak</span>
          </div>
          <div className="club-stat">
            <b className={stats.best ? undefined : 'word'}>{stats.best ? formatToPar(stats.best.toPar) : 'None'}</b>
            <span>Best round</span>
            {stats.best && <small>{stats.best.strokes} at {stats.best.course}</small>}
          </div>
          <div className="club-stat">
            <b className={stats.handicap === null ? 'word' : undefined}>{stats.handicap === null ? 'None' : formatHandicap(stats.handicap)}</b>
            <span>Handicap</span>
            {stats.handicap === null && <small>After {HANDICAP_MIN} daily rounds</small>}
          </div>
        </div>
      </div>
    </div>
  );
}
