import { headToHead, RESULT_COLUMNS, type HeadToHead } from '@/lib/mp/records';
import { memberSession } from '@/lib/mp/supabase';

// The record against each friend and your last 5 games with each, from one read of your games
// (a friend can be in a 3–4 player game's opponents list, so this can't filter by opponent_id).
// Friends with no games get zeros. null when it can't be read (signed out, a guest, or Supabase unreachable).
export async function getHeadToHeads(friendIds: string[]): Promise<Map<string, HeadToHead> | null> {
  const m = await memberSession();
  if (!m) return null;
  if (!friendIds.length) return new Map();
  try {
    const { data, error } = await m.supabase.from('match_results').select(RESULT_COLUMNS)
      .eq('user_id', m.userId).order('played_at', { ascending: false }).limit(1000);
    if (error) return null;
    return new Map(friendIds.map((id) => [id, headToHead(data, id)]));
  } catch {
    return null;
  }
}
