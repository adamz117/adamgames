'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function NineHolesPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'nine-holes-progress') return;
      const { bestToPar, bestStrokes, bestCourse, rounds, lastToPar, lastStrokes, lastCourse, seed } = event.data;
      if (
        typeof bestToPar !== 'number' ||
        typeof bestStrokes !== 'number' ||
        typeof rounds !== 'number' ||
        typeof lastToPar !== 'number' ||
        typeof lastStrokes !== 'number' ||
        typeof bestCourse !== 'string' ||
        typeof lastCourse !== 'string' ||
        typeof seed !== 'string'
      ) {
        return;
      }

      upsertGameStatsClient('nine-holes', {
        bestToPar,
        bestStrokes,
        bestCourse,
        rounds,
        lastToPar,
        lastStrokes,
        lastCourse,
        seed,
        lastPlayedAt: new Date().toISOString(),
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/games/nine-holes/index.html"
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
