import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { cleanName, memberName } from '@/lib/mp/protocol';

export type MpSession = { userId: string; guest: boolean; name: string };

const NAME_KEY = 'nh-guest-name';

// The name this browser last played under as a guest, if any.
export function getStoredGuestName(): string | null {
  try {
    return cleanName(localStorage.getItem(NAME_KEY));
  } catch {
    return null;
  }
}

function storeGuestName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // private window or blocked storage: the name is just asked for again
  }
}

// The player for a lobby: the signed-in member, the current guest, or a new anonymous guest.
// A guest needs a name (the one given, else the stored one): without one, { error: 'bad_name' }.
export async function ensureSession(guestName?: string): Promise<MpSession | { error: string }> {
  try {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    if (user && !user.is_anonymous) {
      const { data } = await supabase.from('profiles').select('username').eq('id', user.id).maybeSingle();
      return { userId: user.id, guest: false, name: memberName(data?.username, user.email) };
    }

    const name = cleanName(guestName) ?? getStoredGuestName() ?? (user ? cleanName(user.user_metadata?.guest_name) : null);
    if (!name) return { error: 'bad_name' };
    storeGuestName(name);
    if (user) return { userId: user.id, guest: true, name };

    const { data, error } = await supabase.auth.signInAnonymously({ options: { data: { guest_name: name } } });
    if (error || !data.user) return { error: 'sign_in_failed' };
    return { userId: data.user.id, guest: true, name };
  } catch {
    return { error: 'sign_in_failed' };
  }
}
