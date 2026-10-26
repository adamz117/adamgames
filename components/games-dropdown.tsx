'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export interface GamesDropdownEntry {
  id: string;
  title: string;
  description: string;
  href: string;
}

// With a mouse the menu opens on hover. Leaving closes it after a moment, and while the pointer is on
// the button an invisible triangle runs from it to the menu's top corners (the "safe triangle"), so
// cutting diagonally across to an item doesn't count as leaving.
const HOVER_CLOSE_MS = 150;
const MENU_GAP = 10, MENU_WIDTH = 240;
type Triangle = { x: number; y: number; top: number; width: number };
const hoverDevice = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export default function GamesDropdown({ games }: { games: GamesDropdownEntry[] }) {
  const [open, setOpen] = useState(false);
  const [triangle, setTriangle] = useState<Triangle | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current != null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const close = () => { cancelClose(); setOpen(false); setTriangle(null); };
  useEffect(() => cancelClose, []);

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
    <div
      ref={rootRef}
      style={{ position: 'relative' }}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'mouse' || !hoverDevice()) return;
        cancelClose();
        setOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'mouse' || !hoverDevice()) return;
        cancelClose();
        closeTimer.current = window.setTimeout(close, HOVER_CLOSE_MS);
      }}
    >
      <button
        type="button"
        // A mouse has already opened it by hovering, so a click keeps it open; keys and taps toggle.
        onClick={(e) => setOpen((v) => (e.detail > 0 && hoverDevice() ? true : !v))}
        onPointerMove={(e) => {
          const root = rootRef.current;
          if (e.pointerType !== 'mouse' || !root) return;
          // Where the menu is (or will be, on the first move): MENU_GAP below the button, MENU_WIDTH wide at least.
          const r = root.getBoundingClientRect();
          const top = menuRef.current?.offsetTop ?? root.offsetHeight + MENU_GAP;
          const width = menuRef.current?.offsetWidth ?? MENU_WIDTH;
          setTriangle({ x: e.clientX - r.left, y: e.clientY - r.top, top, width });
        }}
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
          position: 'relative',
          zIndex: 31, // above the safe triangle, so the pointer's own spot still clicks the button
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

      {open && triangle && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: triangle.width,
            height: triangle.top + 1,
            zIndex: 29,
            clipPath: `polygon(${triangle.x}px ${triangle.y}px, 0px ${triangle.top + 1}px, ${triangle.width}px ${triangle.top + 1}px)`,
          }}
        />
      )}

      {open && (
        <div
          ref={menuRef}
          onPointerEnter={() => setTriangle(null)} // there: nothing left to cross
          role="menu"
          style={{
            position: 'absolute',
            top: `calc(100% + ${MENU_GAP}px)`,
            left: 0,
            minWidth: MENU_WIDTH,
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
              onClick={close}
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
