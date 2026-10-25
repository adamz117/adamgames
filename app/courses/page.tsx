import Link from 'next/link';
import CourseDifficulty from '@/components/course-difficulty';

export const metadata = { title: 'Courses | Adam Games' };

type Entry = { id: string; href: string; name: string; lede: string };

// Real-life courses, rebuilt hole by hole, and fantasy courses designed for Nine Holes.
const REAL: Entry[] = [
  { id: 'victoria', href: '/courses/victoria-country-club', name: 'Victoria Country Club', lede: 'Pietermaritzburg, KwaZulu-Natal. Parkland on a steep hillside, par 71.' },
  { id: 'gary-player', href: '/courses/gary-player-country-club', name: 'Gary Player Country Club', lede: 'Sun City, North West. Championship bushveld course beside the Sun City lake, par 72.' },
  { id: 'tpc-sawgrass', href: '/courses/tpc-sawgrass', name: 'TPC Sawgrass Stadium Course', lede: 'Ponte Vedra Beach, Florida. Home of THE PLAYERS, with the island green on the 17th, par 72.' },
  { id: 'augusta', href: '/courses/augusta-national', name: 'Augusta National Golf Club', lede: 'Augusta, Georgia. Home of the Masters, with Amen Corner and Rae’s Creek, par 72.' },
  { id: 'pebble-beach', href: '/courses/pebble-beach', name: 'Pebble Beach Golf Links', lede: 'Pebble Beach, California. Clifftop holes on the Pacific, with the little 7th on the point, par 72.' },
];
const FANTASY: Entry[] = [
  { id: 'ironmere', href: '/courses/ironmere-quarry', name: 'Ironmere Quarry', lede: 'The hardest course in Nine Holes: two loops round flooded slate pits, with two island greens, par 72.' },
];

function List({ title, lede, courses }: { title: string; lede: string; courses: Entry[] }) {
  return (
    <section className="club-section" style={{ paddingTop: 48 }} aria-label={title}>
      <h2 className="club-courses-h">{title}</h2>
      <p className="club-card-note" style={{ margin: '0 0 22px' }}>{lede}</p>
      {courses.map((c, i) => (
        <Link key={c.id} href={c.href} className="club-real" style={i ? { borderTop: 'none' } : undefined}>
          <span>
            <span className="club-h2">{c.name}</span>
            <span className="club-lede">{c.lede}</span>
            <CourseDifficulty id={c.id} />
          </span>
          <span className="club-real-go">See the course</span>
        </Link>
      ))}
    </section>
  );
}

export default function CoursesPage() {
  return (
    <main className="club-wrap" style={{ paddingBottom: 96 }}>
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', paddingTop: 64 }}>Courses</h1>
      <p className="club-lede">
        Play the front nine, the back nine or the full eighteen, on your own or against a friend. Difficulty is
        measured, not guessed: a simulated club golfer plays each course and the rating comes from its scores.
      </p>
      <List title="Real courses" lede="Real-life courses, rebuilt hole by hole from the routing and the satellite." courses={REAL} />
      <List title="Fantasy courses" lede="Original courses, designed for Nine Holes. They exist nowhere else." courses={FANTASY} />
    </main>
  );
}
