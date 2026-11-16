import type { Achievement } from '@/lib/achievements';

// One medal per game: a flag for golf, a question mark's dot-and-hook for the quiz, crossed clubs
// for multiplayer. Drawn in currentColor so a locked one simply dims.
function Medal({ game }: { game: Achievement['game'] }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
      <circle cx="24" cy="24" r="17" fill="currentColor" opacity="0.14" />
      {game === 'Nine Holes' && <path d="M21 34V13l11 4.5L21 22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
      {game === 'Pin High' && <><path d="M19 19a5 5 0 1 1 7.5 4.3c-1.6 1-2.5 2-2.5 4.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /><circle cx="24" cy="33" r="1.6" fill="currentColor" /></>}
      {game === 'Multiplayer' && <path d="M15 15l17 18M33 15L16 33M31 31l3 3M14 31l3 3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />}
    </svg>
  );
}

// The trophy cabinet: every achievement, the earned ones lit.
export default function TrophyCabinet({ list }: { list: Achievement[] }) {
  const won = list.filter((a) => a.earned).length;
  return (
    <section className="club-section" style={{ paddingTop: 72 }} aria-label="Trophy cabinet">
      <h2 className="club-h2">Trophy cabinet</h2>
      <p className="club-lede">
        {won === 0 ? 'Nothing on the shelves yet. Your first round puts something there.' : `${won} of ${list.length} earned. The rest show how far you have to go.`}
      </p>
      <div className="club-meter" role="img" aria-label={`${won} of ${list.length} achievements earned`}>
        <i style={{ width: `${(won / list.length) * 100}%` }} />
      </div>
      <ul className="club-trophies">
        {list.map((a) => (
          <li key={a.id} className={`club-trophy${a.earned ? ' earned' : ''}`}>
            <span className="club-trophy-medal"><Medal game={a.game} /></span>
            <span className="club-trophy-text">
              <small>{a.game}</small>
              <strong>{a.title}</strong>
              <span>{a.how}</span>
              <em>{a.earned ? 'Earned' : a.progress || 'Not yet'}</em>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
