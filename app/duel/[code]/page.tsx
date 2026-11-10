import DuelRoom from '@/components/pin-high/duel-room';
import { getViewer } from '@/lib/mp/viewer';

export const metadata = { title: 'Pin High duel | Adam Games' };

export default async function DuelRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const [{ code }, viewer] = await Promise.all([params, getViewer()]);
  return <DuelRoom code={code} viewer={viewer} />;
}
