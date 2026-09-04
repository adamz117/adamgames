'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function FlagAtlasPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type !== 'flag-atlas-progress') return;
      const { correct, totalResolved, totalCountries } = event.data;
      upsertGameStatsClient('flag-atlas', {
        correct,
        totalResolved,
        totalCountries,
        lastPlayedAt: new Date().toISOString(),
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/games/flag-atlas.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100vh - 65px)',
        border: 'none',
      }}
      title="Flag Atlas"
    />
  );
}
