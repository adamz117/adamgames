import { difficultyOf } from '@/lib/course-difficulty';

// A course's difficulty: ten pips, the rating and its word; on the course's own page also what it means.
export default function CourseDifficulty({ id, detail = false }: { id: string; detail?: boolean }) {
  const d = difficultyOf(id);
  if (!d) return null;
  return (
    <span className="club-diff">
      <span className="club-diff-pips" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < d.rating ? 'on' : undefined} />)}
      </span>
      <span>
        Difficulty <b className="club-figure">{d.rating}</b>/10 · {d.label}
        {detail && <> · a club golfer averages {d.overPar > 0 ? `${d.overPar} over par` : d.overPar < 0 ? `${-d.overPar} under par` : 'level par'} here</>}
      </span>
    </span>
  );
}
