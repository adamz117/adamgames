import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export async function upsertGameStatsClient(
  gameId: string,
  stats: Record<string, unknown>
): Promise<void> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from('game_stats').upsert(
    {
      user_id: user.id,
      game_id: gameId,
      stats,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,game_id' }
  );
}
