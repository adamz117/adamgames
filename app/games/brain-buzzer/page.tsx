'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function BrainBuzzerPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'brain-buzzer-progress') return;
      const { score, dayNumber, streak } = event.data;
      if (
        typeof score !== 'number' ||
        typeof dayNumber !== 'number' ||
        typeof streak !== 'number'
      ) {
        return;
      }

      upsertGameStatsClient('brain-buzzer', {
        score,
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
      src="/games/brain-buzzer.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Brain Buzzer"
    />
  );
}
