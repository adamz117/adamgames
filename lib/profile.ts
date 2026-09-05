import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

export interface Profile {
  id: string;
  username: string;
}

export async function getProfileServer(): Promise<Profile | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('id', user.id)
    .maybeSingle();
  if (error) console.error('getProfileServer failed:', error);

  return data ?? null;
}
