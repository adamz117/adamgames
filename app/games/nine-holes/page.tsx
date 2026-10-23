'use client';

import { useEffect, useRef } from 'react';
import { getGameStatsClient, upsertGameStatsClient } from '@/lib/game-stats-client';
import { readStats, recordRound } from '@/lib/nine-holes-stats';

export default function NineHolesPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    async function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
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
