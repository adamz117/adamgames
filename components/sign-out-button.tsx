'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }

  return (
    <button
      onClick={handleSignOut}
      style={{
        background: 'transparent',
        color: 'var(--text-dim)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '8px 14px',
        fontSize: 14,
        cursor: 'pointer',
      }}
    >
      Sign out
    </button>
  );
}
