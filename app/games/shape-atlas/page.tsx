'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function ShapeAtlasPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'shape-atlas-progress') return;
      const { solved, guessesUsed, score, dayNumber, collectionSize, lifetimeScore } = event.data;
      if (
        typeof solved !== 'boolean' ||
        typeof guessesUsed !== 'number' ||
        typeof score !== 'number' ||
        typeof dayNumber !== 'number' ||
        typeof collectionSize !== 'number' ||
        typeof lifetimeScore !== 'number'
      ) {
        return;
      }

      upsertGameStatsClient('shape-atlas', {
        solved,
        guessesUsed,
        score,
        dayNumber,
        collectionSize,
        lifetimeScore,
        lastPlayedAt: new Date().toISOString(),
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/games/shape-atlas.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Shape Atlas"
    />
  );
}
