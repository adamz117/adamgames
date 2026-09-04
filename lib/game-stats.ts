import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

export async function getGameStatsServer(
  gameId: string
): Promise<Record<string, unknown> | null | undefined> {
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
