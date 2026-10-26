import Link from 'next/link';
import LobbyBrowser from '@/components/mp/lobby-browser';
import { getViewer } from '@/lib/mp/viewer';

export const metadata = { title: 'Play a friend | Adam Games' };

export default async function PlayPage() {
  const viewer = await getViewer();
  return (
    <main className="club-wrap club-lobby">
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2 club-lobby-title">Play a friend</h1>
      <p className="club-lobby-lede">
        Nine Holes for 2 to 4 players. Same course, same wind, every shot played on every screen.
        Stroke play for any group, match play for two, at your own pace or taking turns.
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
