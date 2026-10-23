// The routing of a real course, drawn from its traced shapes (course yards: x east, y north).
type Pt = [number, number];
type Shape = { pts: Pt[] };
export type CourseData = {
  name: string; par: number; boundary: Pt[];
  holes: { n: number; par: number; si: number; cardYds: number; path: Pt[]; note: string }[];
  greens: Shape[]; fairways: Shape[]; water: Shape[]; bunkers: Shape[]; trees: Shape[]; approved: number[];
};

export default function CoursePlan({ course }: { course: CourseData }) {
  const xs = course.boundary.map((p) => p[0]), ys = course.boundary.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pad = 30;
  const P = ([x, y]: Pt) => `${(x - x0 + pad).toFixed(1)},${(y1 - y + pad).toFixed(1)}`; // north up
  const poly = (s: Shape) => s.pts.map(P).join(' ');
  return (
    <svg className="club-plan" viewBox={`0 0 ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`} role="img"
      aria-label={`The routing of ${course.name}: holes 1 to 9 go out from the clubhouse, holes 10 to 18 come home.`}>
      <polygon points={course.boundary.map(P).join(' ')} fill="#1b3528" stroke="rgba(236,234,220,0.25)" strokeDasharray="6 5" />
      {course.trees.map((s, i) => <polygon key={`t${i}`} points={poly(s)} fill="#13261c" />)}
      {course.fairways.map((s, i) => <polygon key={`f${i}`} points={poly(s)} fill="#2f5a3d" />)}
      {course.greens.map((s, i) => <polygon key={`g${i}`} points={poly(s)} fill="#5f9a62" />)}
      {course.bunkers.map((s, i) => <polygon key={`b${i}`} points={poly(s)} fill="#d8c79a" />)}
      {course.water.map((s, i) => <polygon key={`w${i}`} points={poly(s)} fill="#4f86a6" />)}
      {course.holes.map((h) => (
        <polyline key={`r${h.n}`} points={h.path.map(P).join(' ')} fill="none" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"
          stroke={h.n < 10 ? 'rgba(226,170,78,0.85)' : 'rgba(236,234,220,0.75)'} strokeDasharray="10 7" />
      ))}
      {course.holes.map((h) => {
        const [cx, cy] = P(h.path[0]).split(',').map(Number);
        return (
          <g key={`n${h.n}`}>
            <circle cx={cx} cy={cy} r={17} fill={h.n < 10 ? '#e2aa4e' : '#eceadc'} stroke="#0f2219" strokeWidth={3} />
            <text x={cx} y={cy + 6} textAnchor="middle" fontSize={17} fontWeight={700} fill="#0f2219" fontFamily="var(--font-body)">{h.n}</text>
          </g>
        );
      })}
    </svg>
  );
}
