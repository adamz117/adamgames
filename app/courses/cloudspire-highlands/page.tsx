import Link from 'next/link';
import CoursePlan, { type CourseData } from '@/components/course-plan';
import CourseRecords from '@/components/course-records';
import CourseDifficulty from '@/components/course-difficulty';
import { MODE_LABEL, type CourseMode } from '@/lib/course-rounds';
import data from '@/public/games/nine-holes/courses/cloudspire/cloudspire.json';

export const metadata = { title: 'Cloudspire Highlands | Adam Games' };

const course = data as unknown as CourseData;
const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9], BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const MODES: CourseMode[] = ['front', 'back', 'all'];

export default function CloudspirePage() {
  const yards = (holes: number[]) => course.holes.filter((h) => holes.includes(h.n)).reduce((a, h) => a + h.cardYds, 0);
  const blurb: Record<CourseMode, string> = {
    front: `Holes 1 to 9 · par 36 · ${yards(FRONT).toLocaleString('en')} yards`,
    back: `Holes 10 to 18 · par 36 · ${yards(BACK).toLocaleString('en')} yards`,
    all: `The full round · par 72 · ${yards([...FRONT, ...BACK]).toLocaleString('en')} yards`,
  };

  return (
    <main className="club-wrap" style={{ paddingBottom: 96 }}>
      <div className="club-grain" aria-hidden="true" />
      <p className="club-card-note" style={{ paddingTop: 48 }}><Link href="/courses" className="club-link">Fantasy courses</Link></p>
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', marginTop: 10 }}>Cloudspire Highlands</h1>
      <p className="club-lede">
        An original mountain course, designed for Nine Holes and built for match play: every hole offers a short,
        dangerous line and a long, safe one. The front nine climbs the west face of Cloudspire from the clubhouse to
        the summit lodge, and the back nine comes down the east. Fairways run along ridge crests with scree falling
        away, the 3rd green sits on a pinnacle and the 6th on a crag ringed by a ravine, three par 4s can be driven,
        every par 5 can be reached in two, and six mountain streams cut across the holes and plunge off the course
        into named waterfalls. Holes are won and lost here.
      </p>
      <CourseDifficulty id="cloudspire" detail />

      <section className="club-section" style={{ paddingTop: 40 }} aria-label="Ways to play">
        <div className="club-modes">
          {MODES.map((m) => (
            <Link key={m} href={`/games/nine-holes?course=cloudspire&holes=${m}`} className="club-mode">
              <strong>{MODE_LABEL[m]}</strong>
              <span>{blurb[m]}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="club-section" style={{ paddingTop: 56 }} aria-label="The course">
        <div className="club-plan-wrap">
          <CoursePlan course={course} />
          <table className="club-scorecard">
            <thead><tr><th>Hole</th><th>Par</th><th>Yards</th><th>Index</th></tr></thead>
            <tbody>
              {course.holes.map((h) => (
                <tr key={h.n} className={h.n === 10 ? 'turn' : undefined}><td>{h.n}</td><td>{h.par}</td><td>{h.cardYds}</td><td>{h.si}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="club-section" style={{ paddingTop: 56 }} aria-label="Records">
        <h2 className="club-h2" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)' }}>Records</h2>
        <div style={{ marginTop: 18 }}><CourseRecords course="cloudspire" modes={MODES} /></div>
      </section>
    </main>
  );
}
