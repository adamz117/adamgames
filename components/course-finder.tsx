'use client';

import Link from 'next/link';
import { useState } from 'react';
import CourseDifficulty from '@/components/course-difficulty';
import { filterCourses, type CourseEntry, type CourseKind } from '@/lib/course-search';

type Course = CourseEntry & { href: string };
const KINDS = [['all', 'All'], ['real', 'Real'], ['fantasy', 'Fantasy']] as const;
const SECTIONS: { kind: CourseKind; title: string; lede: string }[] = [
  { kind: 'real', title: 'Real courses', lede: 'Real-life courses, rebuilt hole by hole from the routing and the satellite.' },
  { kind: 'fantasy', title: 'Fantasy courses', lede: 'Original courses, designed for Nine Holes. They exist nowhere else.' },
];

// The course list with a search box and a real / fantasy switch.
export default function CourseFinder({ courses }: { courses: Course[] }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<CourseKind | 'all'>('all');
  const found = filterCourses(courses, query, kind);

  return (
    <>
      <div className="club-finder" role="search">
        <input
          type="search"
          className="club-lobby-input"
          placeholder="Search courses"
          aria-label="Search courses"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="club-lobby-seg" role="group" aria-label="Show">
          {KINDS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="club-card-note" aria-live="polite" style={{ minHeight: '1.55em' }}>
        {found.length ? (found.length < courses.length ? `${found.length} of ${courses.length} courses` : '') : `No courses match “${query.trim()}”.`}
      </p>

      {SECTIONS.map((s) => {
        const list = found.filter((c) => c.kind === s.kind);
        if (!list.length) return null;
        return (
          <section key={s.kind} className="club-section" style={{ paddingTop: 32 }} aria-label={s.title}>
            <h2 className="club-courses-h">{s.title}</h2>
            <p className="club-card-note" style={{ margin: '0 0 22px' }}>{s.lede}</p>
            {list.map((c, i) => (
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
      })}
    </>
  );
}
