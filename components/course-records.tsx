'use client';

import { useEffect, useState } from 'react';
import { MODES, MODE_LABEL, type CourseMode } from '@/lib/course-rounds';
import { formatToPar } from '@/lib/nine-holes-stats';
import { getLeaderboard, getMyBests, type Best, type LeaderRow } from '@/lib/course-rounds-client';

// Your best on each way to play, and the course's best rounds. Nothing shows until there is something to show.
export default function CourseRecords({ course, modes }: { course: string; modes: CourseMode[] }) {
  const [mine, setMine] = useState<Record<CourseMode, Best> | null>(null);
  const [boards, setBoards] = useState<Partial<Record<CourseMode, LeaderRow[]>>>({});

  useEffect(() => {
    let live = true;
    getMyBests(course).then((b) => live && setMine(b));
    Promise.all(modes.map(async (m) => [m, await getLeaderboard(course, m)] as const)).then((rows) => live && setBoards(Object.fromEntries(rows)));
    return () => { live = false; };
  }, [course, modes]);

  const shown = MODES.filter((m) => modes.includes(m) && (mine?.[m] || boards[m]?.length));
  if (!shown.length) return <p className="club-card-note">Records appear here once rounds are played.</p>;

  return (
    <div className="club-boards">
      {shown.map((m) => (
        <section key={m} className="club-board" aria-label={`${MODE_LABEL[m]} records`}>
          <h3>{MODE_LABEL[m]}</h3>
          {mine?.[m] && <p className="club-card-note">Your best: <b className="club-figure">{mine[m]!.strokes}</b> ({formatToPar(mine[m]!.strokes - mine[m]!.par)})</p>}
          {!!boards[m]?.length && (
            <ol>
              {boards[m]!.map((r, i) => (
                <li key={i}><span>{r.username}</span><b className="club-figure">{formatToPar(r.strokes - r.par)}</b></li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
