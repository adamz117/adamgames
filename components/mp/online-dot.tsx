// A friend's "online now" mark, with its meaning for screen readers.
export default function OnlineDot({ on }: { on: boolean }) {
  const label = on ? 'Online now' : 'Offline';
  return <span className={`club-dot${on ? ' on' : ''}`} role="img" aria-label={label} title={label} />;
}
