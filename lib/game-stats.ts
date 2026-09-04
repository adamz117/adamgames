import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import type { GameStats } from '@/lib/games-registry';

export async function getGameStatsServer(
  gameId: string
): Promise<GameStats | undefined> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return undefined;

  const { data, error } = await supabase
    .from('game_stats')
    .select('stats')
    .eq('user_id', user.id)
    .eq('game_id', gameId)
    .maybeSingle();
  if (error) console.error('getGameStatsServer failed:', error);

  return (data?.stats as Record<string, unknown>) ?? null;
}
