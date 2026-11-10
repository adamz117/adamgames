'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function PinHighPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'pin-high-round') return;
      const { score, dayNumber, bestScore, played, streak } = event.data;
      if ([score, dayNumber, bestScore, played, streak].some((v) => typeof v !== 'number')) return;

      upsertGameStatsClient('pin-high', {
        score,
        dayNumber,
        bestScore,
        played,
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
      src="/games/pin-high/index.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Pin High"
    />
  );
}
