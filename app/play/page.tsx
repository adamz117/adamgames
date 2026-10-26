import Link from 'next/link';
import LobbyBrowser from '@/components/mp/lobby-browser';
import { getViewer } from '@/lib/mp/viewer';

export const metadata = { title: 'Play friends | Adam Games' };

export default async function PlayPage() {
  const viewer = await getViewer();
  return (
    <main className="club-wrap club-lobby">
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2 club-lobby-title">Play friends</h1>
      <p className="club-lobby-lede">
        Nine Holes for two to four players. Same course, same wind, every shot played on every screen.
        Pick stroke play, or match play one against one, and play at your own pace or take turns.
      </p>
      {viewer === 'member' && (
        <p className="club-lobby-lede">
          Invite your <Link href="/friends" className="club-link">friends</Link> straight into a lobby, and see who&rsquo;s on the site now.
        </p>
      )}
      <LobbyBrowser viewer={viewer} />
    </main>
  );
}
