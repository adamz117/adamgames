// The courses page search: every typed word must appear in the course's name or description
// (any case), and the real / fantasy filter applies on top.
export type CourseKind = 'real' | 'fantasy';
export type CourseEntry = { id: string; kind: CourseKind; href?: string; name: string; lede: string };

export function filterCourses<T extends CourseEntry>(list: T[], query: string, kind: CourseKind | 'all'): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((c) => {
    if (kind !== 'all' && c.kind !== kind) return false;
    const text = `${c.name} ${c.lede}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
