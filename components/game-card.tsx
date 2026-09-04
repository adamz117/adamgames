import Link from 'next/link';

export default function GameCard({
  title,
  description,
  href,
  summary,
}: {
  title: string;
  description: string;
  href: string;
  summary?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'block',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 20,
        textDecoration: 'none',
        color: 'var(--text)',
      }}
    >
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, letterSpacing: '0.01em' }}>
        {title}
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 6 }}>{description}</p>
      <div
        style={{
          marginTop: 14,
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          color: 'var(--accent-bright)',
        }}
      >
        {summary ?? 'Sign in to track your stats'}
      </div>
    </Link>
  );
}
