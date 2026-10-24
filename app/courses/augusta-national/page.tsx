import Link from 'next/link';
import CoursePlan, { type CourseData } from '@/components/course-plan';
import CourseRecords from '@/components/course-records';
import { MODE_LABEL, type CourseMode } from '@/lib/course-rounds';
import data from '@/public/games/nine-holes/courses/augusta/augusta.json';

export const metadata = { title: 'Augusta National Golf Club | Adam Games' };

const course = data as unknown as CourseData;
const FRONT = [1, 2, 3, 4, 5, 6, 7, 8, 9], BACK = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const ready = (holes: number[]) => holes.every((n) => course.approved.includes(n));

export default function AugustaPage() {
  // A way to play opens only once its holes have been checked against the real course.
  const open: CourseMode[] = [
    ...(ready(FRONT) ? (['front'] as const) : []),
    ...(ready(BACK) ? (['back'] as const) : []),
    ...(ready(FRONT) && ready(BACK) ? (['all'] as const) : []),
  ];
  const yards = (holes: number[]) => course.holes.filter((h) => holes.includes(h.n)).reduce((a, h) => a + h.cardYds, 0);
  const blurb: Record<CourseMode, string> = {
    front: `Holes 1 to 9 · par 36 · ${yards(FRONT).toLocaleString('en')} yards`,
    back: `Holes 10 to 18 · par 36 · ${yards(BACK).toLocaleString('en')} yards`,
    all: `The full round · par 72 · ${yards([...FRONT, ...BACK]).toLocaleString('en')} yards`,
  };

  return (
    <main className="club-wrap" style={{ paddingBottom: 96 }}>
      <div className="club-grain" aria-hidden="true" />
      <p className="club-card-note" style={{ paddingTop: 48 }}><Link href="/courses" className="club-link">Real courses</Link></p>
      <h1 className="club-h2" style={{ fontSize: 'clamp(44px, 7vw, 84px)', marginTop: 10 }}>Augusta National Golf Club</h1>
      <p className="club-lede">
        Augusta, Georgia. Home of the Masters, traced hole by hole: Amen Corner with Rae&rsquo;s Creek in front
        of the 12th, the ponds on the 11th, 15th and 16th, the plunge down the 10th and the climb up the 18th,
        and every white-sand bunker where it really is. Par 72 from the Masters tees.
      </p>

      <section className="club-section" style={{ paddingTop: 40 }} aria-label="Ways to play">
        {open.length ? (
          <div className="club-modes">
            {open.map((m) => (
              <Link key={m} href={`/games/nine-holes?course=augusta&holes=${m}`} className="club-mode">
                <strong>{MODE_LABEL[m]}</strong>
                <span>{blurb[m]}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="club-card"><div className="club-card-core club-card-core-single"><div>
            <p className="club-card-name">Being traced</p>
            <p className="club-card-note">The holes are traced and are being checked against the real course. Play opens here as soon as they are.</p>
          </div></div></div>
        )}
        {open.length > 0 && open.length < 3 && <p className="club-card-note" style={{ marginTop: 14 }}>The other nine is still being checked against the real course.</p>}
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

      {open.length > 0 && (
        <section className="club-section" style={{ paddingTop: 56 }} aria-label="Records">
          <h2 className="club-h2" style={{ fontSize: 'clamp(28px, 3.4vw, 40px)' }}>Records</h2>
          <div style={{ marginTop: 18 }}><CourseRecords course="augusta" modes={open} /></div>
        </section>
      )}
    </main>
  );
}
