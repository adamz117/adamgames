// Placeholder shapes while something loads, so the page doesn't jump when it arrives. Screen readers
// hear the label once instead of the shapes.

export function Skel({ w, h }: { w: string; h?: number }) {
  return <span className="club-skel" style={{ width: w, height: h }} aria-hidden="true" />;
}

// List rows the shape of the lobby and friend lists: a name, a line under it, a button.
export function SkeletonRows({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="club-lobby-list" role="status">
      <span className="club-sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="club-skel-row" aria-hidden="true">
          <span className="club-skel-lines">
            <Skel w={['42%', '30%', '36%'][i % 3]} h={22} />
            <Skel w={['64%', '52%', '58%'][i % 3]} h={13} />
          </span>
          <Skel w="84px" h={40} />
        </div>
      ))}
    </div>
  );
}
