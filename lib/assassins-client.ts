import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export async function requestAssassinsAccessClient(): Promise<{ error: string | null }> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Not signed in.' };

  const { error } = await supabase.from('assassins_access').insert({ user_id: session.user.id });
  if (error) return { error: error.message };
  return { error: null };
}

export async function approveAssassinsAccessClient(userId: string): Promise<{ error: string | null }> {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase
    .from('assassins_access')
    .update({ status: 'approved' })
    .eq('user_id', userId);
  if (error) return { error: error.message };
  return { error: null };
}

export async function addAssassinsPairClient(
  assassinName: string,
  targetName: string
): Promise<{ error: string | null }> {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase
    .from('assassins_pairs')
    .insert({ assassin_name: assassinName.trim(), target_name: targetName.trim() });
  if (error) return { error: error.message };
  return { error: null };
}

export async function removeAssassinsPairClient(id: string): Promise<{ error: string | null }> {
  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.from('assassins_pairs').delete().eq('id', id);
  if (error) return { error: error.message };
  return { error: null };
}
