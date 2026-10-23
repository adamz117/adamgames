import Link from 'next/link';

export const metadata = { title: 'Real courses | Adam Games' };

// Where the custom real-life courses will live. None are built yet, so this is the empty state.
export default function CoursesPage() {
  return (
    <main className="club-wrap" style={{ paddingBottom: 96 }}>
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', paddingTop: 64 }}>Real courses</h1>
      <p className="club-lede">
        Holes from real-life courses, rebuilt hole by hole for Nine Holes. The first ones are being
        built now and will appear here when they&rsquo;re ready.
      </p>
      <div className="club-card" style={{ marginTop: 40 }}>
        <div className="club-card-core club-card-core-single">
          <div>
            <p className="club-card-name">No real courses yet</p>
            <p className="club-card-note">Until the first one opens, today&rsquo;s nine is ready to play.</p>
            <p className="club-card-actions"><Link href="/games/nine-holes" className="club-button">Play today&rsquo;s nine</Link></p>
          </div>
        </div>
      </div>
    </main>
  );
}
