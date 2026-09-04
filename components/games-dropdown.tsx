'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export interface GamesDropdownEntry {
  id: string;
  title: string;
  description: string;
  href: string;
}

export default function GamesDropdown({ games }: { games: GamesDropdownEntry[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          color: 'var(--text-dim)',
          fontSize: 14,
          fontFamily: 'inherit',
          cursor: 'pointer',
          padding: '6px 2px',
        }}
      >
        Games
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          style={{
            transition: 'transform 0.15s ease',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <path d="M1 3 L5 7 L9 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: 0,
            minWidth: 240,
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: 6,
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            zIndex: 30,
            animation: 'dropdownIn 0.15s ease-out both',
          }}
        >
          {games.map((game) => (
            <Link
              key={game.id}
              href={game.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                padding: '10px 12px',
                borderRadius: 6,
                textDecoration: 'none',
                color: 'var(--text)',
              }}
              className="games-dropdown-item"
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, letterSpacing: '0.01em' }}>
                {game.title}
              </div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 2 }}>
                {game.description}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
