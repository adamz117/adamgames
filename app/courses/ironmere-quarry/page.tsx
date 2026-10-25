import Link from 'next/link';
import CoursePlan, { type CourseData } from '@/components/course-plan';
import CourseRecords from '@/components/course-records';
import CourseDifficulty from '@/components/course-difficulty';
import { MODE_LABEL, type CourseMode } from '@/lib/course-rounds';
import data from '@/public/games/nine-holes/courses/ironmere/ironmere.json';

export const metadata = { title: 'Ironmere Quarry | Adam Games' };

const course = data as unknown as CourseData;
const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9], BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const MODES: CourseMode[] = ['front', 'back', 'all'];

export default function IronmerePage() {
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
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', marginTop: 10 }}>Ironmere Quarry</h1>
      <p className="club-lede">
        An original course, designed for Nine Holes and built to be the hardest test in the game. Two loops of nine
        wind round flooded slate pits, through dark pines: island greens on the 3rd and 17th, a creek that crosses the
        7th twice, a crown of pot bunkers on the 5th and water all down the 18th. Every hazard has a way round it, so
        the player who thinks wins. Made for the 1v1.
      </p>
      <CourseDifficulty id="ironmere" detail />

      <section className="club-section" style={{ paddingTop: 40 }} aria-label="Ways to play">
        <div className="club-modes">
          {MODES.map((m) => (
            <Link key={m} href={`/games/nine-holes?course=ironmere&holes=${m}`} className="club-mode">
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
        <div style={{ marginTop: 18 }}><CourseRecords course="ironmere" modes={MODES} /></div>
      </section>
    </main>
  );
}
