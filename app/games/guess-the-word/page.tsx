'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function GuessTheWordPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'guess-the-word-progress') return;
      const { solved, guessesUsed, dayNumber, streak } = event.data;
      if (
        typeof solved !== 'boolean' ||
        typeof guessesUsed !== 'number' ||
        typeof dayNumber !== 'number' ||
        typeof streak !== 'number'
      ) {
        return;
      }

      upsertGameStatsClient('guess-the-word', {
        solved,
        guessesUsed,
        dayNumber,
        streak,
        lastPlayedAt: new Date().toISOString(),
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/games/guess-the-word.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Guess the Word"
    />
  );
}
