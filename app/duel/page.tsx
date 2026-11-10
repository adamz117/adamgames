import Link from 'next/link';
import DuelEntry from '@/components/pin-high/duel-entry';

export const metadata = { title: 'Pin High duel | Adam Games' };

export default function DuelPage() {
  return (
    <main className="club-wrap club-lobby">
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2 club-lobby-title">Pin High duel</h1>
      <p className="club-lobby-lede">
        One against one, live. You both get the same hole and one answer each. The lower score loses the
        gap in points from 300 health, and every hole after the second hits harder. Give the same answer
        and it cancels out.
      </p>
      <p className="club-lobby-lede">
        New to it? <Link href="/games/pin-high" className="club-link">Play today&rsquo;s round</Link> on your own first.
      </p>
      <DuelEntry />
    </main>
  );
}
