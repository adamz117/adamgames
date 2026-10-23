'use client';

import { use, useEffect, useRef } from 'react';
import { getGameStatsClient, upsertGameStatsClient } from '@/lib/game-stats-client';
import { readStats, recordRound } from '@/lib/nine-holes-stats';
import { COURSE_PAR, parseRealRound, type CourseMode } from '@/lib/course-rounds';
import { saveRealRound } from '@/lib/course-rounds-client';

type Search = { [key: string]: string | string[] | undefined };

// ?course=victoria&holes=front|back|all opens a real course; anything else is today's nine.
function gameSrc(q: Search) {
  const course = typeof q.course === 'string' ? q.course : '', holes = typeof q.holes === 'string' ? q.holes : 'all';
  const pars = COURSE_PAR[course];
  if (!pars || !(holes in pars)) return '/games/nine-holes/index.html';
  return `/games/nine-holes/index.html?course=${course}&holes=${holes as CourseMode}`;
}

export default function NineHolesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const src = gameSrc(use(searchParams));

  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;

      // A real-course round goes to its own table; it never touches the daily record.
      const real = parseRealRound(event.data);
      if (real) return void (await saveRealRound(real));

      if (event.data?.type !== 'nine-holes-round') return;
      const { strokes, par, course, seed } = event.data;
      if (
        typeof strokes !== 'number' ||
        typeof par !== 'number' ||
        typeof course !== 'string' ||
        typeof seed !== 'string'
      ) {
        return;
      }

      // The round is added to what is already stored, so the record is the same on every device.
      const stored = await getGameStatsClient('nine-holes');
      if (stored === undefined) return; // signed out: nothing to save
      const today = new Date().toLocaleDateString('en-CA'); // the same date the game seeds today's course with
      const next = recordRound(readStats(stored), { seed, course, strokes, par }, today, new Date().toISOString());
      await upsertGameStatsClient('nine-holes', { ...next });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Nine Holes"
    />
  );
}
