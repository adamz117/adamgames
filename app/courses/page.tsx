import CourseFinder from '@/components/course-finder';
import type { CourseEntry } from '@/lib/course-search';

export const metadata = { title: 'Courses | Adam Games' };

// Real-life courses, rebuilt hole by hole, and fantasy courses designed for Nine Holes.
const COURSES: (CourseEntry & { href: string })[] = [
  { id: 'victoria', kind: 'real', href: '/courses/victoria-country-club', name: 'Victoria Country Club', lede: 'Pietermaritzburg, KwaZulu-Natal. Parkland on a steep hillside, par 71.' },
  { id: 'gary-player', kind: 'real', href: '/courses/gary-player-country-club', name: 'Gary Player Country Club', lede: 'Sun City, North West. Championship bushveld course beside the Sun City lake, par 72.' },
  { id: 'tpc-sawgrass', kind: 'real', href: '/courses/tpc-sawgrass', name: 'TPC Sawgrass Stadium Course', lede: 'Ponte Vedra Beach, Florida. Home of THE PLAYERS, with the island green on the 17th, par 72.' },
  { id: 'augusta', kind: 'real', href: '/courses/augusta-national', name: 'Augusta National Golf Club', lede: 'Augusta, Georgia. Home of the Masters, with Amen Corner and Rae’s Creek, par 72.' },
  { id: 'pebble-beach', kind: 'real', href: '/courses/pebble-beach', name: 'Pebble Beach Golf Links', lede: 'Pebble Beach, California. Clifftop holes on the Pacific, with the little 7th on the point, par 72.' },
  { id: 'cypress-point', kind: 'real', href: '/courses/cypress-point', name: 'Cypress Point Club', lede: 'Pebble Beach, California. MacKenzie’s dunes, cypress and clifftops, with the 16th over the Pacific, par 72.' },
  { id: 'champagne-sports', kind: 'real', href: '/courses/champagne-sports', name: 'Champagne Sports Resort', lede: 'Drakensberg, KwaZulu-Natal. Kikuyu fairways along the Sterkspruit River gorge under Champagne Castle, par 72.' },
  { id: 'cotswold-downs', kind: 'real', href: '/courses/cotswold-downs', name: 'Cotswold Downs', lede: 'Hillcrest, KwaZulu-Natal. Matkovich’s estate course over steep valleys, dams and wetlands, with a cliff-top par 3 5th, par 72.' },
  { id: 'ironmere', kind: 'fantasy', href: '/courses/ironmere-quarry', name: 'Ironmere Quarry', lede: 'The hardest course in Nine Holes: two loops round flooded slate pits, with two island greens, par 72.' },
  { id: 'cloudspire', kind: 'fantasy', href: '/courses/cloudspire-highlands', name: 'Cloudspire Highlands', lede: 'Up one face of a mountain and down the other: ridge-top fairways, greens on pinnacles and crags, streams that plunge into waterfalls. Every hole a gamble, made for match play, par 72.' },
  { id: 'sunscar', kind: 'fantasy', href: '/courses/sunscar-canyon', name: 'Sunscar Canyon', lede: 'A red-rock desert canyon where every hole crosses the river, and the 8th green sits on a butte in the middle of it, par 72.' },
];

export default function CoursesPage() {
  return (
    <main className="club-wrap" style={{ paddingBottom: 96 }}>
      <div className="club-grain" aria-hidden="true" />
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', paddingTop: 64 }}>Courses</h1>
      <p className="club-lede">
        Play the front nine, the back nine or the full eighteen, on your own or against a friend. Difficulty is
        measured, not guessed: a simulated club golfer plays each course and the rating comes from its scores.
      </p>
      <CourseFinder courses={COURSES} />
    </main>
  );
}
