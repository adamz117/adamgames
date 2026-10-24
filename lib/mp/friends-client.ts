// Friends, invites and who is online, over Supabase (0004_multiplayer.sql). Members only: guests and
// signed-out visitors have no friends or invites, and never open the 'online' channel.
// Calls return an error (or null / [] for reads) instead of throwing.
import { useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { closeChannel, freshChannel } from '@/lib/mp/channel';
import { parseCode, presenceUserIds } from '@/lib/mp/protocol';
import { client, failed, memberSession, type Err } from '@/lib/mp/supabase';

export type FriendStatus = 'accepted' | 'incoming' | 'outgoing';
export type Friend = { id: string; name: string; status: FriendStatus };
export type Invite = { id: number; fromId: string; fromName: string; lobbyId: string; code: string; createdAt: string };
type Row = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Errors: not_signed_in | not_found | self | failed. 'accepted' when they had already asked you.
export async function requestFriend(username: string): Promise<{ id: string; status: 'pending' | 'accepted' } | Err> {
  const name = username.trim();
  if (!name || name.length > 40) return { error: 'not_found' };
  try {
    const { data, error } = await client().rpc('request_friend', { p_username: name });
    if (error || !data || typeof data !== 'object') return failed(error);
    const r = data as Row;
    if (r.error) return { error: String(r.error) };
    return { id: String(r.id), status: r.status === 'accepted' ? 'accepted' : 'pending' };
  } catch (e) {
    return failed(e);
  }
}

// Our friendship row's key: uuids are compared byte-wise, as lower-case hex strings are.
async function pairWith(userId: string): Promise<{ user_low: string; user_high: string } | Err> {
  const m = await memberSession();
  if (!m) return { error: 'not_signed_in' };
  const them = userId.toLowerCase(), me = m.userId.toLowerCase();
  if (!UUID.test(them) || them === me) return { error: 'not_found' };
  return them < me ? { user_low: them, user_high: me } : { user_low: me, user_high: them };
}

// Accept or decline a request they sent. Errors: not_signed_in | not_found (no request from them) | failed
export async function respond(userId: string, accept: boolean): Promise<{ error: string | null }> {
  if (!accept) return removeFriend(userId);
  const pair = await pairWith(userId);
  if ('error' in pair) return pair;
  try {
    const { data, error } = await client().from('friendships').update({ status: 'accepted' })
      .match(pair).eq('status', 'pending').select('status');
    if (error) return failed(error);
    return data?.length ? { error: null } : { error: 'not_found' };
  } catch (e) {
    return failed(e);
  }
}

// Removes a friend, declines their request or cancels mine.
export async function removeFriend(userId: string): Promise<{ error: string | null }> {
  const pair = await pairWith(userId);
  if ('error' in pair) return pair;
  try {
    const { error } = await client().from('friendships').delete().match(pair);
    return error ? failed(error) : { error: null };
  } catch (e) {
    return failed(e);
  }
}

// Friends and requests both ways; null for a guest or nobody, or on failure.
export async function listFriends(): Promise<Friend[] | null> {
  const m = await memberSession();
  if (!m) return null;
  try {
    const { data, error } = await m.supabase.rpc('my_friends');
    if (error || !Array.isArray(data)) {
      failed(error);
      return null;
    }
    return (data as Row[]).map((r) => {
      const id = String(r.id);
      const status: FriendStatus = r.status === 'accepted' ? 'accepted' : r.requested_by === id ? 'incoming' : 'outgoing';
      return { id, name: typeof r.name === 'string' && r.name ? r.name : 'Member', status };
    });
  } catch (e) {
    failed(e);
    return null;
  }
}

// Errors: not_signed_in | not_allowed (not friends, not in the lobby, or it has started) | failed
export async function sendInvite(toId: string, lobbyId: string): Promise<{ error: string | null }> {
  const m = await memberSession();
  if (!m) return { error: 'not_signed_in' };
  try {
    const { error } = await m.supabase.from('invites').insert({ from_id: m.userId, to_id: toId, lobby_id: lobbyId });
    if (!error) return { error: null };
    return error.code === '42501' ? { error: 'not_allowed' } : failed(error);
  } catch (e) {
    return failed(e);
  }
}

const HOUR = 3_600_000;

// Unseen invites to me from the last hour, to lobbies still open, newest first.
export async function getInvites(): Promise<Invite[]> {
  const m = await memberSession();
  if (!m) return [];
  try {
    const { data, error } = await m.supabase.rpc('my_invites');
    if (error || !Array.isArray(data)) {
      failed(error);
      return [];
    }
    const out: Invite[] = [];
    for (const r of data as Row[]) {
      const code = parseCode(r.code);
      if (!code || typeof r.id !== 'number') continue;
      out.push({
        id: r.id, fromId: String(r.from_id), fromName: typeof r.from_name === 'string' && r.from_name ? r.from_name : 'Member',
        lobbyId: String(r.lobby_id), code, createdAt: String(r.created_at),
      });
    }
    return out;
  } catch (e) {
    failed(e);
    return [];
  }
}

// An invite older than an hour is stale, whatever the last read said.
export const inviteFresh = (i: Invite, now: number) => now - Date.parse(i.createdAt) < HOUR;

// Once per invite (a failed try may be repeated); the list is re-read afterwards.
const marked = new Set<number>();
export async function markInviteSeen(id: number): Promise<void> {
  if (marked.has(id)) return;
  marked.add(id);
  try {
    const { error } = await client().from('invites').update({ seen: true }).eq('id', id);
    if (error) {
      marked.delete(id);
      failed(error);
    }
  } catch (e) {
    marked.delete(id);
    failed(e);
  }
  if (live) void refreshInvites();
}

// ── The member's live channel ──
// A private channel 'online' (the policies let only members join): presence keyed by user id, and
// my new invites as postgres_changes. Opened by the invite toaster, which the nav mounts for
// members only; the friends list and the lobby's invite list read who is online from it.

const EMPTY: ReadonlySet<string> = new Set();
let online: ReadonlySet<string> = EMPTY;
let invites: Invite[] = [];
const onlineListeners = new Set<() => void>();
const inviteListeners = new Set<(invites: Invite[]) => void>();
let live: { uid: string } | null = null;

function setOnline(next: ReadonlySet<string>) {
  online = next;
  onlineListeners.forEach((l) => l());
}
function setInvites(next: Invite[]) {
  invites = next;
  inviteListeners.forEach((l) => l(next));
}

// Only the latest read lands.
let readSeq = 0;
async function refreshInvites() {
  const n = ++readSeq;
  const list = await getInvites();
  if (n === readSeq && live) setInvites(list);
}

// After a failed join, wait before trying again (realtime-js alone would retry every few seconds).
const RETRY_MS = [30_000, 120_000];

// Opens the channel for member `uid`; returns close. Safe to close and reopen at once (StrictMode).
export function openOnline(uid: string): () => void {
  const me = { uid };
  live = me;
  let gone = false, ch: RealtimeChannel | null = null, fails = 0, retry: ReturnType<typeof setTimeout> | undefined;
  const supabase = client();

  const connect = async () => {
    const c = await freshChannel(supabase, 'online', { private: true, presence: { key: uid } });
    if (gone) return void closeChannel(supabase, c);
    ch = c;
    c.on('presence', { event: 'sync' }, () => {
      if (ch === c) setOnline(new Set(presenceUserIds(c.presenceState())));
    });
    // The row alone lacks the sender's name and the lobby code: re-read the list.
    c.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invites', filter: `to_id=eq.${uid}` }, () => {
      if (ch === c) void refreshInvites();
    });
    c.subscribe((status) => {
      if (ch !== c) return;
      if (status === 'SUBSCRIBED') {
        // Presence starts empty on every (re)join, and invites may have come while away.
        fails = 0;
        void c.track({});
        void refreshInvites();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        ch = null;
        void closeChannel(supabase, c);
        setOnline(EMPTY);
        retry = setTimeout(() => void connect().catch(failed), RETRY_MS[Math.min(fails++, RETRY_MS.length - 1)]);
      }
    });
  };

  const onVisible = () => document.visibilityState === 'visible' && void refreshInvites();
  document.addEventListener('visibilitychange', onVisible);
  void refreshInvites();
  connect().catch(failed);

  return () => {
    gone = true;
    clearTimeout(retry);
    document.removeEventListener('visibilitychange', onVisible);
    if (ch) void closeChannel(supabase, ch);
    ch = null;
    if (live === me) {
      live = null;
      readSeq++;
      setOnline(EMPTY);
      setInvites([]);
    }
  };
}

// Calls onInvite with my current invites now and whenever they change.
export function subscribeInvites(onInvite: (invites: Invite[]) => void): () => void {
  inviteListeners.add(onInvite);
  onInvite(invites);
  return () => void inviteListeners.delete(onInvite);
}

function subscribeOnline(onChange: () => void) {
  onlineListeners.add(onChange);
  return () => void onlineListeners.delete(onChange);
}

// The user ids of members online now (mine included). Empty for guests and signed-out visitors.
export function useOnline(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeOnline, () => online, () => EMPTY);
}
