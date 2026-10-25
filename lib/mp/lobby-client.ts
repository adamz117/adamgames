// Lobbies over Supabase: the rpc functions and tables of 0004_multiplayer.sql, plus the lobby's
// Realtime channel. Calls return an error (or null / [] for reads) instead of throwing.
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { closeChannel, freshChannel } from '@/lib/mp/channel';
import { LOBBY_EVENTS, parseSettings, parseSwing, presenceUserIds } from '@/lib/mp/protocol';
import type { LobbyEvent, LobbySettings, Swing, Visibility } from '@/lib/mp/protocol';

export type LobbyStatus = 'open' | 'playing' | 'finished' | 'closed';
export type Err = { error: string };
export type LobbyPlayer = { slot: number; name: string; guest: boolean; ready: boolean; leftAt: string | null };
// settings is null when the stored settings aren't ones this client knows.
export type Lobby = {
  id: string; code: string; host: string; settings: LobbySettings | null; visibility: Visibility;
  status: LobbyStatus; game: number; players: LobbyPlayer[];
};
export type LobbyMember = LobbyPlayer & { userId: string; lastSeen: string };
export type LobbyRow = { id: string; code: string; settings: LobbySettings; hostName: string; players: number; createdAt: string };

const client = () => createBrowserSupabaseClient();
type Row = Record<string, unknown>;
function failed(error: unknown): Err {
  if (error) console.error('mp:', error);
  return { error: 'failed' };
}

async function myId(): Promise<string | null> {
  const { data: { session } } = await client().auth.getSession();
  return session?.user.id ?? null;
}

// rpc that returns jsonb: the function's own { error } passes through.
async function rpcJson(fn: string, args: Row): Promise<Row | Err> {
  try {
    const { data, error } = await client().rpc(fn, args);
    if (error || !data || typeof data !== 'object') return failed(error);
    return data as Row;
  } catch (e) {
    return failed(e);
  }
}

// Errors: not_signed_in | bad_settings | bad_visibility | bad_name | failed
export async function createLobby(settings: LobbySettings, visibility: Visibility, name?: string): Promise<{ id: string; code: string } | Err> {
  const r = await rpcJson('create_lobby', { p_settings: settings, p_visibility: visibility, p_name: name ?? null });
  if ('error' in r) return { error: String(r.error) };
  return { id: String(r.id), code: String(r.code) };
}

// Errors: not_signed_in | not_found | not_open | full | bad_name | failed
export async function joinLobby(code: string, name?: string): Promise<{ id: string; slot: number; status: LobbyStatus } | Err> {
  const r = await rpcJson('join_lobby', { p_code: code, p_name: name ?? null });
  if ('error' in r) return { error: String(r.error) };
  return { id: String(r.id), slot: Number(r.slot), status: r.status as LobbyStatus };
}

const toPlayer = (p: Row): LobbyPlayer => ({
  slot: Number(p.slot), name: String(p.name), guest: !!p.guest, ready: !!p.ready, leftAt: (p.left_at as string) ?? null,
});

// The lobby behind a link or code, with its players; null when there is none (or on failure).
export async function getLobby(code: string): Promise<Lobby | null> {
  try {
    const { data, error } = await client().rpc('lobby_by_code', { p_code: code });
    if (error || !data) return null;
    const l = data as Row;
    return {
      id: String(l.id), code: String(l.code), host: String(l.host), settings: parseSettings(l.settings),
      visibility: l.visibility as Visibility, status: l.status as LobbyStatus, game: Number(l.game),
      players: Array.isArray(l.players) ? (l.players as Row[]).map(toPlayer) : [],
    };
  } catch {
    return null;
  }
}

export async function listPublicLobbies(): Promise<LobbyRow[]> {
  try {
    const { data, error } = await client().rpc('list_public_lobbies');
    if (error || !Array.isArray(data)) return [];
    const out: LobbyRow[] = [];
    for (const r of data as Row[]) {
      const settings = parseSettings(r.settings);
      if (!settings) continue;
      out.push({ id: String(r.id), code: String(r.code), settings, hostName: String(r.host_name ?? 'Member'), players: Number(r.players), createdAt: String(r.created_at) });
    }
    return out;
  } catch {
    return [];
  }
}

// Members only (RLS); maps presence userIds to slots.
export async function getPlayers(id: string): Promise<LobbyMember[] | null> {
  try {
    const { data, error } = await client()
      .from('lobby_players')
      .select('slot, user_id, name, guest, ready, left_at, last_seen')
      .eq('lobby_id', id)
      .order('slot');
    if (error || !data) return null;
    return (data as Row[]).map(p => ({ ...toPlayer(p), userId: String(p.user_id), lastSeen: String(p.last_seen) }));
  } catch {
    return null;
  }
}

// Plain updates: the error, or null. RLS decides who may (an update it filters out is no error).
async function update(run: () => PromiseLike<{ error: { message?: string } | null }>): Promise<{ error: string | null }> {
  try {
    const { error } = await run();
    return error ? failed(error) : { error: null };
  } catch (e) {
    return failed(e);
  }
}

// rpc that returns nothing.
function rpcVoid(fn: string, args: Row) {
  return update(() => client().rpc(fn, args));
}

// Host only, while open. The database un-readies everyone on a change.
export function updateSettings(id: string, settings: LobbySettings, visibility: Visibility) {
  return update(() => client().from('lobbies').update({ settings, visibility }).eq('id', id));
}

export async function setReady(id: string, ready: boolean) {
  const me = await myId().catch(() => null);
  if (!me) return { error: 'not_signed_in' };
  return update(() => client().from('lobby_players').update({ ready }).eq('lobby_id', id).eq('user_id', me));
}

// Host only, while open. Errors: not_ready (the database checks every present player is ready),
// not_started (not the host, or no longer open) or failed.
export async function startLobby(id: string): Promise<{ error: string | null }> {
  try {
    const { data, error } = await client()
      .from('lobbies')
      .update({ status: 'playing', started_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'open')
      .select('id');
    if (error) return error.code === '42501' ? { error: 'not_ready' } : failed(error);
    return data?.length ? { error: null } : { error: 'not_started' };
  } catch (e) {
    return failed(e);
  }
}

// Sets my last_seen; the room calls it every 15 s while open.
export async function heartbeat(id: string): Promise<void> {
  await rpcVoid('touch_lobby', { p_lobby: id });
}

// Leaves for good. The host leaving before the start also closes the lobby (a no-op for anyone else
// or once the game is on: RLS and the status filter skip the row).
export async function leaveLobby(id: string): Promise<{ error: string | null }> {
  const me = await myId().catch(() => null);
  if (me) await update(() => client().from('lobbies').update({ status: 'closed' }).eq('id', id).eq('host', me).eq('status', 'open'));
  return rpcVoid('touch_lobby', { p_lobby: id, p_leave: true });
}

// "Play again". Errors: not_member | not_finished | closed | failed
export async function rematch(id: string): Promise<{ game: number } | Err> {
  const r = await rpcJson('rematch_lobby', { p_lobby: id });
  if ('error' in r) return { error: String(r.error) };
  return { game: Number(r.game) };
}

// Stores my swing for game `game`; a swing already stored (a retry) is ignored. 'stored' or a
// duplicate; 'closed' when the game is no longer on (RLS refuses it) or the swing is bad, so retrying
// is pointless; 'failed' for anything worth retrying.
export async function saveSwing(id: string, game: number, swing: Swing): Promise<'stored' | 'closed' | 'failed'> {
  const s = parseSwing(swing);
  if (!s) return 'closed';
  try {
    const { error } = await client()
      .from('swings')
      .upsert({ lobby_id: id, game, ...s }, { onConflict: 'lobby_id,game,slot,hole,shot', ignoreDuplicates: true });
    if (!error) return 'stored';
    if (error.code === '42501') return 'closed';
    failed(error);
    return 'failed';
  } catch (e) {
    failed(e);
    return 'failed';
  }
}

// The stored swing log of one game, in slot/hole/shot order; null on failure (not the same as none yet).
export async function getSwings(id: string, game: number): Promise<Swing[] | null> {
  try {
    const { data, error } = await client()
      .from('swings')
      .select('slot, hole, shot, club, aim, v, timeout')
      .eq('lobby_id', id)
      .eq('game', game)
      .order('slot')
      .order('hole')
      .order('shot');
    if (error || !data) return null;
    return (data as Row[]).map(parseSwing).filter((s): s is Swing => s !== null);
  } catch {
    return null;
  }
}

export type ChannelHandlers = {
  // The user ids present on the channel; map them to slots with presentPlayers(ids, getPlayers rows).
  onPresence?: (userIds: string[]) => void;
  // A refresh hint from another player: re-read the lobby (getLobby / getPlayers) from the database.
  // Never trust or use its payload.
  onEvent?: (event: LobbyEvent) => void;
  // Every swing stored for this lobby (mine too), as a postgres_changes INSERT.
  onSwing?: (swing: Swing, game: number) => void;
  onStatus?: (status: string, err?: Error) => void;
};
export type LobbyChannel = { send(event: LobbyEvent, payload?: object): Promise<string>; close(): void };

// The lobby's private channel 'lobby:<id>' (realtime.messages RLS: its players only): presence keyed
// by userId, broadcast refresh hints (not echoed to the sender), and the swings feed.
// Async (see freshChannel): if the caller has gone by the time this resolves, it must close() what it gets.
export async function openLobbyChannel(id: string, userId: string, handlers: ChannelHandlers): Promise<LobbyChannel> {
  const supabase = client();
  const ch = await freshChannel(supabase, `lobby:${id}`, {
    private: true, presence: { key: userId }, broadcast: { self: false, ack: false },
  });
  ch.on('presence', { event: 'sync' }, () => handlers.onPresence?.(presenceUserIds(ch.presenceState())));
  for (const event of LOBBY_EVENTS) ch.on('broadcast', { event }, () => handlers.onEvent?.(event));
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'swings', filter: `lobby_id=eq.${id}` }, msg => {
    const row = msg.new as Row;
    const swing = parseSwing(row);
    if (swing && row.lobby_id === id && Number.isInteger(row.game)) handlers.onSwing?.(swing, row.game as number);
  });
  ch.subscribe((status, err) => {
    // Track again on every (re)join: presence starts empty each time. Slots come from the rows.
    if (status === 'SUBSCRIBED') void ch.track({ online: true });
    handlers.onStatus?.(status, err);
  });
  return {
    // 'ok', or why not ('timed out', 'error', …).
    async send(event, payload) {
      const body = payload ?? {};
      if (ch.state === 'joined') return ch.send({ type: 'broadcast', event, payload: body });
      // Not joined (yet, or reconnecting): over REST instead.
      const r = await ch.httpSend(event, body).catch(() => ({ success: false as const }));
      return r.success ? 'ok' : 'error';
    },
    close() {
      void closeChannel(supabase, ch);
    },
  };
}
