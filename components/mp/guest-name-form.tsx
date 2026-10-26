'use client';

import { useState } from 'react';
import { cleanName } from '@/lib/mp/protocol';
import { getStoredGuestName } from '@/lib/mp/session-client';

// Asks a guest what to be called (kept on this device for next time).
export default function GuestNameForm({ label, busy, onSubmit, onCancel }: {
  label: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(() => getStoredGuestName() ?? '');
  const [bad, setBad] = useState(false);

  return (
    <form
      className="club-lobby-name"
      onSubmit={(e) => {
        e.preventDefault();
        const n = cleanName(name);
        setBad(!n);
        if (n) onSubmit(n);
      }}
    >
      <label className="club-lobby-label" htmlFor="guest-name">Your name</label>
      <p className="club-lobby-note">You’re playing as a guest. Pick a name the other players will see.</p>
      <div className="club-lobby-inline">
        <input
          id="guest-name"
          className="club-lobby-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          autoComplete="nickname"
          autoFocus
          disabled={busy}
        />
        <button type="submit" className="club-button" disabled={busy}>{label}</button>
        {onCancel && (
          <button type="button" className="club-lobby-quiet" onClick={onCancel} disabled={busy}>Cancel</button>
        )}
      </div>
      {bad && <p className="club-lobby-error" role="alert">Pick a name of 2 to 20 letters.</p>}
    </form>
  );
}
