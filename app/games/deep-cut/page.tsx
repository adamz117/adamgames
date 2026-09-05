'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function DeepCutPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'deep-cut-progress') return;
      const { score, promptsAnswered, totalPrompts, dayNumber, bestScore } = event.data;
      if (
        typeof score !== 'number' ||
        typeof promptsAnswered !== 'number' ||
        typeof totalPrompts !== 'number' ||
        typeof dayNumber !== 'number' ||
        typeof bestScore !== 'number'
      ) {
        return;
      }

      upsertGameStatsClient('deep-cut', {
        score,
        promptsAnswered,
        totalPrompts,
        dayNumber,
        bestScore,
        lastPlayedAt: new Date().toISOString(),
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/games/deep-cut.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Deep Cut"
    />
  );
}
