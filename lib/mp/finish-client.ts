// The browser side of POST /api/mp/finish.
import type { SlotResult } from './finish-core';

export type FinishReply = { status: 'playing' | 'finished'; results: SlotResult[] };

const OUTCOMES = ['win', 'loss', 'draw'];
function parseReply(x: unknown): FinishReply | null {
  const m = x as { status?: unknown; results?: unknown } | null;
  if (!m || (m.status !== 'playing' && m.status !== 'finished') || !Array.isArray(m.results)) return null;
  const results = m.results.flatMap((r: { slot?: unknown; result?: unknown; detail?: unknown } | null) =>
    r && Number.isInteger(r.slot) && OUTCOMES.includes(r.result as string)
      ? [{ slot: r.slot as number, result: r.result as SlotResult['result'], detail: typeof r.detail === 'string' ? r.detail : '' }]
      : []);
  return { status: m.status, results };
}

// The route's answer for game `game`; 'stop' when asking again won't help (4xx: not a member, no
// such game, not in play); null for anything worth retrying (network, 5xx).
export async function postFinish(lobbyId: string, game: number): Promise<FinishReply | 'stop' | null> {
  try {
    const res = await fetch('/api/mp/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lobbyId, game }),
    });
    if (res.status >= 400 && res.status < 500) return 'stop';
    if (!res.ok) return null;
    return parseReply(await res.json());
  } catch {
    return null;
  }
}
