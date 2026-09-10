import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';

const ADMIN_EMAIL = 'adamzammit117@gmail.com';

export interface AssassinsPair {
  id: string;
  assassinName: string;
  targetName: string;
}

export interface PendingAssassinsRequest {
  userId: string;
  username: string;
  requestedAt: string;
}

export type AssassinsAccessStatus = 'signed-out' | 'none' | 'pending' | 'approved';

export interface AssassinsState {
  isAdmin: boolean;
  accessStatus: AssassinsAccessStatus;
  pairs: AssassinsPair[];
  pendingRequests: PendingAssassinsRequest[];
}

export async function getAssassinsStateServer(): Promise<AssassinsState> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { isAdmin: false, accessStatus: 'signed-out', pairs: [], pendingRequests: [] };
  }

  const isAdmin = user.email === ADMIN_EMAIL;

  let accessStatus: AssassinsAccessStatus = 'none';
  if (isAdmin) {
    accessStatus = 'approved';
  } else {
    const { data: accessRow } = await supabase
      .from('assassins_access')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (accessRow) accessStatus = accessRow.status as AssassinsAccessStatus;
  }

  let pairs: AssassinsPair[] = [];
  if (accessStatus === 'approved') {
    const { data, error } = await supabase
      .from('assassins_pairs')
      .select('id, assassin_name, target_name')
      .order('created_at', { ascending: true });
    if (error) console.error('getAssassinsStateServer pairs failed:', error);
    pairs = (data ?? []).map((row) => ({
      id: row.id,
      assassinName: row.assassin_name,
      targetName: row.target_name,
    }));
  }

  let pendingRequests: PendingAssassinsRequest[] = [];
  if (isAdmin) {
    const { data, error } = await supabase
      .from('assassins_access')
      .select('user_id, requested_at, profiles(username)')
      .eq('status', 'pending')
      .order('requested_at', { ascending: true });
    if (error) console.error('getAssassinsStateServer pending failed:', error);
    pendingRequests = (data ?? []).map((row) => {
      const profile = row.profiles as unknown as { username: string } | null;
      return {
        userId: row.user_id,
        username: profile?.username ?? 'unknown',
        requestedAt: row.requested_at,
      };
    });
  }

  return { isAdmin, accessStatus, pairs, pendingRequests };
}
