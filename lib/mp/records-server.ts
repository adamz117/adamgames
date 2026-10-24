import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { cleanRows, RESULT_COLUMNS, type RecordRow } from '@/lib/mp/records';

// Enough for any real record; the account page shows the newest 10.
const MAX_ROWS = 1000;

// The signed-in member's own results, newest first, for server-rendered pages. Guests and
// signed-out visitors get none; so does a failed read (the page just shows no 1v1 record).
export async function getMyResultsServer(): Promise<RecordRow[]> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) return [];
    const { data, error } = await supabase.from('match_results').select(RESULT_COLUMNS)
      .eq('user_id', user.id).order('played_at', { ascending: false }).limit(MAX_ROWS);
    if (error) {
      console.error('getMyResultsServer failed:', error);
      return [];
    }
    return cleanRows(data);
  } catch (e) {
    console.error('getMyResultsServer failed:', e);
    return [];
  }
}
