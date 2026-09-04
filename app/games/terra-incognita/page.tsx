'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function TerraIncognitaPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'terra-incognita-progress') return;
      const { solved, guessesUsed, score, dayNumber } = event.data;
      if (
        typeof solved !== 'boolean' ||
        typeof guessesUsed !== 'number' ||
        typeof score !== 'number' ||
        typeof dayNumber !== 'number'
      ) {
        return;
      }

      upsertGameStatsClient('terra-incognita', {
        solved,
        guessesUsed,
        score,
        dayNumber,
        lastPlayedAt: new Date().toISOString(),
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/games/terra-incognita.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Terra Incognita"
    />
  );
}
