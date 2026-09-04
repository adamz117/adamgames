import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

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
