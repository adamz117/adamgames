import Link from 'next/link';

export const metadata = { title: 'Real courses | Adam Games' };

// The custom real-life courses, rebuilt hole by hole for Nine Holes.
export default function CoursesPage() {
  return (
    <main className="club-wrap" style={{ paddingBottom: 96 }}>
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', paddingTop: 64 }}>Real courses</h1>
      <p className="club-lede">
        Holes from real-life courses, rebuilt hole by hole for Nine Holes. Play the front nine, the back
        nine or the full eighteen.
      </p>
      <section className="club-section" style={{ paddingTop: 40 }}>
        <Link href="/courses/victoria-country-club" className="club-real">
          <span>
            <span className="club-h2">Victoria Country Club</span>
            <span className="club-lede">Pietermaritzburg, KwaZulu-Natal. Parkland on a steep hillside, par 71.</span>
          </span>
          <span className="club-real-go">See the course</span>
        </Link>
        <Link href="/courses/gary-player-country-club" className="club-real" style={{ borderTop: 'none' }}>
          <span>
            <span className="club-h2">Gary Player Country Club</span>
            <span className="club-lede">Sun City, North West. Championship bushveld course beside the Sun City lake, par 72.</span>
          </span>
          <span className="club-real-go">See the course</span>
        </Link>
        <Link href="/courses/tpc-sawgrass" className="club-real" style={{ borderTop: 'none' }}>
          <span>
            <span className="club-h2">TPC Sawgrass Stadium Course</span>
            <span className="club-lede">Ponte Vedra Beach, Florida. Home of THE PLAYERS, with the island green on the 17th, par 72.</span>
          </span>
          <span className="club-real-go">See the course</span>
        </Link>
      </section>
    </main>
  );
}
