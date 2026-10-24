// Friends, invites and who is online, over Supabase (0004_multiplayer.sql). Members only: guests and
// signed-out visitors have no friends or invites, and never open the 'online' channel.
// Calls return an error (or null / [] for reads) instead of throwing.
import { useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { closeChannel, freshChannel } from '@/lib/mp/channel';
import { parseCode, presenceUserIds } from '@/lib/mp/protocol';

export type FriendStatus = 'accepted' | 'incoming' | 'outgoing';
export type Friend = { id: string; name: string; status: FriendStatus };
export type Invite = { id: number; fromId: string; fromName: string; lobbyId: string; code: string; createdAt: string };
type Err = { error: string };
type Live = { uid: string; ch: RealtimeChannel | null; gone: boolean };
type Row = Record<string, unknown>;

const client = () => createBrowserSupabaseClient();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function failed(error: unknown): Err {
  if (error) console.error('mp:', error);
  return { error: 'failed' };
}

// The signed-in member's id, or null for a guest or nobody.
async function memberId(): Promise<string | null> {
  try {
    const { data: { session } } = await client().auth.getSession();
    const u = session?.user;
    return u && !u.is_anonymous ? u.id : null;
  } catch {
    return null;
  }
}

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

// Our friendship row. RLS shows only rows I'm in, so the one with them in it is ours.
const pairWith = (userId: string) => `user_low.eq.${userId},user_high.eq.${userId}`;

// Accept or decline a request they sent. Errors: not_found (no request from them) | failed
export async function respond(userId: string, accept: boolean): Promise<{ error: string | null }> {
  if (!accept) return removeFriend(userId);
  if (!UUID.test(userId)) return { error: 'not_found' };
  try {
    const { data, error } = await client().from('friendships').update({ status: 'accepted' })
      .or(pairWith(userId)).eq('status', 'pending').select('status');
    if (error) return failed(error);
    return data?.length ? { error: null } : { error: 'not_found' };
  } catch (e) {
    return failed(e);
  }
}

// Removes a friend, declines their request or cancels mine.
export async function removeFriend(userId: string): Promise<{ error: string | null }> {
  if (!UUID.test(userId)) return { error: 'not_found' };
  try {
    const { error } = await client().from('friendships').delete().or(pairWith(userId));
    return error ? failed(error) : { error: null };
  } catch (e) {
    return failed(e);
  }
}

// Friends and requests both ways; null for a guest or nobody, or on failure.
export async function listFriends(): Promise<Friend[] | null> {
  if (!(await memberId())) return null;
  try {
    const { data, error } = await client().rpc('my_friends');
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
  const me = await memberId();
  if (!me) return { error: 'not_signed_in' };
  try {
    const { error } = await client().from('invites').insert({ from_id: me, to_id: toId, lobby_id: lobbyId });
    if (!error) return { error: null };
    return error.code === '42501' ? { error: 'not_allowed' } : failed(error);
  } catch (e) {
    return failed(e);
  }
}

// Unseen invites to me from the last hour, to lobbies still open, newest first.
export async function getInvites(): Promise<Invite[]> {
  if (!(await memberId())) return [];
  try {
    const { data, error } = await client().rpc('my_invites');
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

export async function markInviteSeen(id: number): Promise<void> {
  try {
    const { error } = await client().from('invites').update({ seen: true }).eq('id', id);
    if (error) failed(error);
  } catch (e) {
    failed(e);
  }
}

// ── The member's live channel ──
// One private channel 'online' per page while anything uses it: presence keyed by user id (the
// policies let only members join), plus my new invites as postgres_changes. It follows sign-in and
// sign-out, and closes a moment after the last user goes (so navigating doesn't reconnect).

const EMPTY: ReadonlySet<string> = new Set();
let online: ReadonlySet<string> = EMPTY;
let invites: Invite[] = [];
const onlineListeners = new Set<() => void>();
const inviteListeners = new Set<(invites: Invite[]) => void>();
let users = 0;
let idle: ReturnType<typeof setTimeout> | undefined;
let stopWatching: (() => void) | null = null;
let current: Live | null = null;

function setOnline(next: ReadonlySet<string>) {
  online = next;
  onlineListeners.forEach((l) => l());
}
function setInvites(next: Invite[]) {
  invites = next;
  inviteListeners.forEach((l) => l(next));
}

let fetching = false, again = false;
async function refreshInvites() {
  if (fetching) return void (again = true);
  fetching = true;
  try {
    do {
      again = false;
      const uid = current?.uid;
      const list = await getInvites();
      if (uid && current?.uid === uid) setInvites(list);
    } while (again);
  } finally {
    fetching = false;
  }
}

// Opens the channel for member `uid`, or closes it (null).
function follow(uid: string | null) {
  if (!stopWatching) uid = null;
  if ((current?.uid ?? null) === uid) return;
  const supabase = client();
  if (current) {
    current.gone = true;
    if (current.ch) void closeChannel(supabase, current.ch);
    current = null;
    setOnline(EMPTY);
    setInvites([]);
  }
  if (!uid) return;
  const me: Live = { uid, ch: null, gone: false };
  current = me;
  void refreshInvites();
  // One open at a time: channel() would hand an earlier, still-opening one the same channel object.
  opening = opening.then(() => open(me)).catch((e) => console.error('mp:', e));
}

let opening: Promise<void> = Promise.resolve();
async function open(me: Live) {
  if (me.gone) return;
  const supabase = client();
  const ch = await freshChannel(supabase, 'online', { private: true, presence: { key: me.uid } });
  if (me.gone) return void (await closeChannel(supabase, ch));
  me.ch = ch;
  ch.on('presence', { event: 'sync' }, () => {
    if (!me.gone) setOnline(new Set(presenceUserIds(ch.presenceState())));
  });
  // The row alone lacks the sender's name and the lobby code: re-read the list.
  ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'invites', filter: `to_id=eq.${me.uid}` }, () => {
    if (!me.gone) void refreshInvites();
  });
  ch.subscribe((status) => {
    // Presence starts empty on every (re)join, and invites may have come while away.
    if (status === 'SUBSCRIBED' && !me.gone) {
      void ch.track({});
      void refreshInvites();
    }
  });
}

function onVisible() {
  if (document.visibilityState === 'visible' && current) void refreshInvites();
}

function start() {
  let sub: { unsubscribe(): void };
  try {
    sub = client().auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      const uid = u && !u.is_anonymous ? u.id : null;
      setTimeout(() => follow(uid), 0); // no Supabase calls inside the auth callback
    }).data.subscription;
  } catch (e) {
    return void console.error('mp:', e); // no Supabase config: nobody is online
  }
  document.addEventListener('visibilitychange', onVisible);
  stopWatching = () => {
    sub.unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
  };
}

function stop() {
  stopWatching?.();
  stopWatching = null;
  follow(null);
}

function acquire(): () => void {
  clearTimeout(idle);
  if (users++ === 0 && !stopWatching) start();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--users === 0) idle = setTimeout(stop, 3000);
  };
}

// Calls onInvite with my current invites now and whenever they change. Keeps the member online.
export function subscribeInvites(onInvite: (invites: Invite[]) => void): () => void {
  inviteListeners.add(onInvite);
  const release = acquire();
  if (current) onInvite(invites);
  return () => {
    inviteListeners.delete(onInvite);
    release();
  };
}

function subscribeOnline(onChange: () => void) {
  onlineListeners.add(onChange);
  const release = acquire();
  return () => {
    onlineListeners.delete(onChange);
    release();
  };
}

// The user ids of members online now (mine included). Empty for guests and signed-out visitors.
export function useOnline(): ReadonlySet<string> {
  return useSyncExternalStore(subscribeOnline, () => online, () => EMPTY);
}
