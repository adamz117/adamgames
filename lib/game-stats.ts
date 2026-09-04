import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export async function getGameStatsServer(
  gameId: string
): Promise<Record<string, unknown> | null | undefined> {
  const { createClient: createServerSupabaseClient } = await import('@/lib/supabase/server');
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return undefined;

  const { data } = await supabase
    .from('game_stats')
    .select('stats')
    .eq('user_id', user.id)
    .eq('game_id', gameId)
    .maybeSingle();

  return (data?.stats as Record<string, unknown>) ?? null;
}

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
