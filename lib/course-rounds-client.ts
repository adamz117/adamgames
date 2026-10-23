import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { MODES, type CourseMode, type RealRound } from '@/lib/course-rounds';

export type LeaderRow = { username: string; strokes: number; par: number; day: string };
export type Best = { strokes: number; par: number } | null;

// Every call fails quietly: with Supabase unreachable the page just shows no records.
async function signedIn() {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ? { supabase, user: session.user } : null;
  } catch {
    return null;
  }
}

// Saves a finished round for the signed-in player; signed out, nothing is saved.
export async function saveRealRound(r: RealRound): Promise<void> {
  const s = await signedIn();
  if (!s) return;
  try {
    const { error } = await s.supabase.from('course_rounds').insert({ user_id: s.user.id, ...r });
    if (error) console.error('saveRealRound failed:', error);
  } catch (e) {
    console.error('saveRealRound failed:', e);
  }
}

// The best round of each player for one course and way to play, top 20.
export async function getLeaderboard(course: string, mode: CourseMode): Promise<LeaderRow[]> {
  try {
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.rpc('course_leaderboard', { p_course: course, p_mode: mode });
    if (error) return [];
    return (data as LeaderRow[]) ?? [];
  } catch {
    return [];
  }
}

// The signed-in player's own best for each way to play; null when signed out or unreachable.
export async function getMyBests(course: string): Promise<Record<CourseMode, Best> | null> {
  const s = await signedIn();
  if (!s) return null;
  try {
    const { data, error } = await s.supabase.from('course_rounds').select('mode, strokes, par').eq('user_id', s.user.id).eq('course', course);
    if (error) return null;
    const best = { front: null, back: null, all: null } as Record<CourseMode, Best>;
    for (const row of (data as { mode: CourseMode; strokes: number; par: number }[]) ?? []) {
      if (!MODES.includes(row.mode)) continue;
      const b = best[row.mode];
      if (!b || row.strokes < b.strokes) best[row.mode] = { strokes: row.strokes, par: row.par };
    }
    return best;
  } catch {
    return null;
  }
}
