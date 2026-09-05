'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function CommonThreadsPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'common-threads-progress') return;
      const { solved, mistakesUsed, dayNumber, streak } = event.data;
      if (
        typeof solved !== 'boolean' ||
        typeof mistakesUsed !== 'number' ||
        typeof dayNumber !== 'number' ||
        typeof streak !== 'number'
      ) {
        return;
      }

      upsertGameStatsClient('common-threads', {
        solved,
        mistakesUsed,
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
      src="/games/common-threads.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Common Threads"
    />
  );
}
