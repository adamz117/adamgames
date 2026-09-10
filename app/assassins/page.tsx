import AssassinsBlock from '@/components/assassins-block';
import { getAssassinsStateServer } from '@/lib/assassins';

export default async function AssassinsPage() {
  const state = await getAssassinsStateServer();

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px' }}>
      <AssassinsBlock state={state} />
    </main>
  );
}
