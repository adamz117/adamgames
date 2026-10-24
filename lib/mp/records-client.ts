import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { cleanRows, headToHead, RESULT_COLUMNS, type HeadToHead, type RecordRow } from '@/lib/mp/records';

const none = (): HeadToHead => ({ win: 0, loss: 0, draw: 0, games: [] });

// Every call fails quietly: signed out, a guest, or Supabase unreachable means no records.
async function member() {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    return user && !user.is_anonymous ? { supabase, userId: user.id } : null;
  } catch {
    return null;
  }
}

// The signed-in player's own results, newest first (RLS only returns their own rows anyway).
export async function getMyResults(limit?: number): Promise<RecordRow[]> {
  const m = await member();
  if (!m) return [];
  try {
    let q = m.supabase.from('match_results').select(RESULT_COLUMNS).eq('user_id', m.userId).order('played_at', { ascending: false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    return error ? [] : cleanRows(data);
  } catch {
    return [];
  }
}

// The record against one friend and the last 5 games together.
export async function getHeadToHead(friendId: string): Promise<HeadToHead> {
  const m = await member();
  if (!m) return none();
  try {
    const { data, error } = await m.supabase.from('match_results').select(RESULT_COLUMNS)
      .eq('user_id', m.userId).eq('opponent_id', friendId).order('played_at', { ascending: false });
    return error ? none() : headToHead(data, friendId);
  } catch {
    return none();
  }
}
