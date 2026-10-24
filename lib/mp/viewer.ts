// Who is looking at a lobby page, from the server's session: a member, a guest (an anonymous
// session) or nobody yet. Lobby pages ask guests and nobodies for a name before they play.
import { createClient } from '@/lib/supabase/server';

export type Viewer = 'member' | 'guest' | 'none';

export async function getViewer(): Promise<Viewer> {
  try {
    const { data: { user } } = await (await createClient()).auth.getUser();
    return !user ? 'none' : user.is_anonymous ? 'guest' : 'member';
  } catch {
    return 'none';
  }
}
