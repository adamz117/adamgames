import LobbyRoom from '@/components/mp/lobby-room';
import { getViewer } from '@/lib/mp/viewer';

export const metadata = { title: 'Lobby | Adam Games' };

export default async function LobbyPage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, viewer] = await Promise.all([params, getViewer()]);
  return <LobbyRoom code={code} viewer={viewer} />;
}
