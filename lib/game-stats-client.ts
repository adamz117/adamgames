import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

// The signed-in player's stored stats for a game: undefined when signed out, null when none yet.
export async function getGameStatsClient(gameId: string): Promise<Record<string, unknown> | null | undefined> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return undefined;

  const { data, error } = await supabase
    .from('game_stats')
    .select('stats')
    .eq('user_id', session.user.id)
    .eq('game_id', gameId)
    .maybeSingle();
  if (error) console.error('getGameStatsClient failed:', error);
  return (data?.stats as Record<string, unknown>) ?? null;
}

export async function upsertGameStatsClient(
  gameId: string,
  stats: Record<string, unknown>
): Promise<void> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return;

  const { error } = await supabase.from('game_stats').upsert(
    {
      user_id: session.user.id,
      game_id: gameId,
      stats,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,game_id' }
  );
  if (error) console.error('upsertGameStatsClient failed:', error);
}
