'use client';

import { useEffect, useRef } from 'react';
import { upsertGameStatsClient } from '@/lib/game-stats-client';

export default function FlagAtlasPage() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const latestStatsRef = useRef<{ correct: number; totalResolved: number; totalCountries: number } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function flush() {
      if (!latestStatsRef.current) return;
      upsertGameStatsClient('flag-atlas', {
        ...latestStatsRef.current,
        lastPlayedAt: new Date().toISOString(),
      });
    }

    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.type !== 'flag-atlas-progress') return;
      const { correct, totalResolved, totalCountries } = event.data;
      if (typeof correct !== 'number' || typeof totalResolved !== 'number' || typeof totalCountries !== 'number') return;

      latestStatsRef.current = { correct, totalResolved, totalCountries };
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flush, 800);
    }

    function handleVisibilityOrHide() {
      if (document.visibilityState === 'hidden') {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        flush();
      }
    }

    window.addEventListener('message', handleMessage);
    document.addEventListener('visibilitychange', handleVisibilityOrHide);
    window.addEventListener('pagehide', flush);

    return () => {
      window.removeEventListener('message', handleMessage);
      document.removeEventListener('visibilitychange', handleVisibilityOrHide);
      window.removeEventListener('pagehide', flush);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src="/games/flag-atlas.html"
      style={{
        display: 'block',
        width: '100%',
        height: 'calc(100dvh - 65px)',
        border: 'none',
      }}
      title="Flag Atlas"
    />
  );
}
