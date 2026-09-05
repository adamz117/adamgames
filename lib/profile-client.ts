import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';

export async function updateUsernameClient(username: string): Promise<{ error: string | null }> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return { error: 'Not signed in.' };

  const { error } = await supabase
    .from('profiles')
    .update({ username })
    .eq('id', session.user.id);

  if (error) {
    if (error.code === '23505') return { error: 'That username is taken.' };
    return { error: error.message };
  }
  return { error: null };
}
