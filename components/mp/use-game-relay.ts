'use client';

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { createGameRelay, type GameRelay } from '@/lib/mp/game-relay';
import { getLobby, getPlayers, getSwings, saveSwing, type LobbyMember } from '@/lib/mp/lobby-client';
import { postFinish } from '@/lib/mp/finish-client';
import type { Swing } from '@/lib/mp/protocol';

const TICK_MS = 5_000;

type Options = {
  active: boolean; // the game iframe is showing
  lobbyId: string | null;
  code: string | null;
  game: number;
  me: number | null;
  players: LobbyMember[];
  present: number[]; // slots on the channel now
  status?: string;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onRematch(): void;
  onLeave(): void;
  onFinished(): void;
  onError(text: string): void;
};

// The React side of lib/mp/game-relay: one relay per game while the iframe shows, fed by the
// iframe's messages, the lobby's refreshes and a timer. Returns the feed for the lobby channel.
export function useGameRelay(o: Options) {
  const relayRef = useRef<GameRelay | null>(null);
  const readyRef = useRef(0); // the game whose iframe has said mp-ready (it says so once per load)
  const latest = useRef(o);
  useEffect(() => { latest.current = o; });

  const { active, lobbyId, code, game, me, iframeRef } = o;
  useEffect(() => {
    if (!active || !lobbyId || !code || me === null) return;
    const relay = createGameRelay({
      lobbyId, code, game, me,
      post: (m) => iframeRef.current?.contentWindow?.postMessage(m, location.origin),
      getLobby, getPlayers, getSwings, saveSwing, postFinish,
      onRematch: () => latest.current.onRematch(),
      onLeave: () => latest.current.onLeave(),
      onFinished: () => latest.current.onFinished(),
      onError: (t) => latest.current.onError(t),
    });
    relayRef.current = relay;
    const { players, present, status } = latest.current;
    relay.lobby({ players, present, status });
    // Back after a re-run (a hot reload, new callbacks) with the iframe still loaded: it won't say mp-ready again.
    if (readyRef.current === game) relay.message({ type: 'mp-ready' });

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== iframeRef.current?.contentWindow) return;
      if ((e.data as { type?: unknown } | null)?.type === 'mp-ready') readyRef.current = game;
      relay.message(e.data);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') relay.resync(); };
    const timer = setInterval(() => relay.tick(), TICK_MS);
    window.addEventListener('message', onMessage);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      relay.dispose();
      relayRef.current = null;
      clearInterval(timer);
      window.removeEventListener('message', onMessage);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, lobbyId, code, game, me, iframeRef]);

  // Each refresh or presence change: who has left, who is here, whether it's recorded.
  const { players, present, status } = o;
  useEffect(() => {
    relayRef.current?.lobby({ players, present, status });
  }, [players, present, status]);

  // For the lobby channel's handlers.
  return useMemo(() => ({
    swing: (s: Swing, g: number) => relayRef.current?.swing(s, g),
    resync: () => relayRef.current?.resync(),
  }), []);
}
