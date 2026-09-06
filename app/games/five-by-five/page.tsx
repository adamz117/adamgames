'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function FiveByFivePage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'five-by-five-progress') return;
      const { solved, dayNumber, timeSeconds, streak } = event.data;
      if (
        typeof solved !== 'boolean' ||
        typeof dayNumber !== 'number' ||
        typeof timeSeconds !== 'number' ||
        typeof streak !== 'number'
      ) {
        return;
      }

      upsertGameStatsClient('five-by-five', {
        solved,
        dayNumber,
        timeSeconds,
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
      src="/games/five-by-five.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Five by Five"
    />
  );
}
