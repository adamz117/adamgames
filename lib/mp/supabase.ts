// The browser Supabase client and the small helpers the multiplayer clients share.
import { createClient } from '@/lib/supabase/client';

export const client = () => createClient();
export type Err = { error: string };

// Logs a failure and gives the generic error.
export function failed(error: unknown): Err {
  if (error) console.error('mp:', error);
  return { error: 'failed' };
}

// The signed-in member (not a guest, not nobody) with the client, or null.
export async function memberSession() {
  try {
    const supabase = client();
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    return user && !user.is_anonymous ? { supabase, userId: user.id } : null;
  } catch {
    return null;
  }
}
