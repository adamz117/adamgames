'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateUsernameClient } from '@/lib/profile-client';

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,20}$/;

export default function UsernameEditor({ initialUsername }: { initialUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialUsername);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setDraft(username);
    setError(null);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.select());
  }

  function cancelEditing() {
    setEditing(false);
    setError(null);
  }

  async function save() {
    const trimmed = draft.trim();
    if (trimmed === username) {
      setEditing(false);
      return;
    }
    if (!USERNAME_PATTERN.test(trimmed)) {
      setError('3-20 letters, numbers, - or _');
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await updateUsernameClient(trimmed);
    setSaving(false);
    if (error) {
      setError(error);
      return;
    }
    setUsername(trimmed);
    setEditing(false);
    router.refresh();
  }

  if (editing) {
    return (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, verticalAlign: 'bottom', maxWidth: '100%' }}>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
              if (e.key === 'Escape') cancelEditing();
            }}
            disabled={saving}
            autoFocus
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(32px, 6vw, 56px)',
              letterSpacing: '0.01em',
              color: 'var(--text)',
              background: 'var(--surface)',
              border: '1px solid var(--accent-bright)',
              borderRadius: 6,
              padding: '2px 10px',
              width: 'min(60vw, 360px)',
              maxWidth: '100%',
              minWidth: 0,
            }}
          />
          <button
            onClick={save}
            disabled={saving}
            style={{
              background: 'var(--accent)',
              color: 'var(--bg)',
              border: 'none',
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 14,
              fontWeight: 600,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            onClick={cancelEditing}
            disabled={saving}
            style={{
              background: 'transparent',
              color: 'var(--text-dim)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 14px',
              fontSize: 14,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
        </span>
        {error && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-bright)' }}>
            {error}
          </span>
        )}
      </span>
    );
  }

  return (
    <span
      onClick={startEditing}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') startEditing();
      }}
      title="Edit username"
      style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'baseline', gap: 10 }}
    >
      {username}
      <svg
        aria-hidden="true"
        width="0.42em"
        height="0.42em"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ color: 'var(--text-dim)', flex: 'none' }}
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    </span>
  );
}
