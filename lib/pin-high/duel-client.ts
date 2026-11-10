// Pin High duels ride on the lobbies Nine Holes already has (0004_multiplayer.sql): a private
// lobby of two, found by its code, with the lobby's private Realtime channel carrying the duel.
// The lobby stays 'open' for as long as the two play, so either can come back to it by the link.
import { createClient } from '@/lib/supabase/client';
import { closeChannel, freshChannel } from '@/lib/mp/channel';
import { presenceUserIds } from '@/lib/mp/protocol';

export const DUEL_SETTINGS = { game: 'pin-high', maxPlayers: 2 } as const;
export type DuelLobby = { id: string; code: string; status: string; isDuel: boolean };
type Row = Record<string, unknown>;

// Errors: not_signed_in | bad_name | failed
export async function createDuel(name?: string): Promise<{ code: string } | { error: string }> {
  try {
    const { data, error } = await createClient().rpc('create_lobby', { p_settings: DUEL_SETTINGS, p_visibility: 'private', p_name: name ?? null });
    const r = data as Row | null;
    if (error || !r || typeof r !== 'object') return { error: 'failed' };
    return r.error ? { error: String(r.error) } : { code: String(r.code) };
  } catch {
    return { error: 'failed' };
  }
}

// The lobby behind a code, and whether it is a Pin High duel (a Nine Holes lobby is not).
export async function getDuelLobby(code: string): Promise<DuelLobby | null> {
  try {
    const { data, error } = await createClient().rpc('lobby_by_code', { p_code: code });
    const l = data as Row | null;
    if (error || !l) return null;
    const settings = l.settings as Row | null;
    return { id: String(l.id), code: String(l.code), status: String(l.status), isDuel: settings?.game === 'pin-high' };
  } catch {
    return null;
  }
}

export type DuelChannel = { send(data: unknown): void; close(): void };

// The lobby's private channel: who is on it now (user ids), and the duel's messages. Messages are
// not echoed to their sender, and only the lobby's two players can read or write the channel.
export async function openDuelChannel(lobbyId: string, userId: string, on: {
  presence(userIds: string[]): void;
  message(data: unknown): void;
}): Promise<DuelChannel> {
  const supabase = createClient();
  const ch = await freshChannel(supabase, `lobby:${lobbyId}`, {
    private: true, presence: { key: userId }, broadcast: { self: false, ack: false },
  });
  ch.on('presence', { event: 'sync' }, () => on.presence(presenceUserIds(ch.presenceState())));
  ch.on('broadcast', { event: 'duel' }, (msg) => on.message(msg.payload));
  ch.subscribe((status) => {
    if (status === 'SUBSCRIBED') void ch.track({ online: true }); // presence starts empty on every (re)join
  });
  return {
    send(data) {
      const payload = (data && typeof data === 'object' ? data : {}) as Row;
      if (ch.state === 'joined') void ch.send({ type: 'broadcast', event: 'duel', payload });
      else void ch.httpSend('duel', payload).catch(() => {}); // reconnecting: over REST instead
    },
    close() {
      void closeChannel(supabase, ch);
    },
  };
}
