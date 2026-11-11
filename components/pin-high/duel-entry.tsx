'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import GuestNameForm from '@/components/mp/guest-name-form';
import { ensureSession } from '@/lib/mp/session-client';
import { parseCode } from '@/lib/mp/protocol';
import { createDuel } from '@/lib/pin-high/duel-client';

// Start a duel (a guest is asked for a name first) or join one by its code.
export default function DuelEntry() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  async function create(name?: string) {
    setBusy(true); setError(null);
    const s = await ensureSession(name);
    if ('error' in s) {
      setBusy(false);
      if (s.error === 'bad_name') setAsking(true);
      else setError('Could not sign you in as a guest. Try again.');
      return;
    }
    const r = await createDuel(s.name);
    if ('error' in r) {
      setBusy(false);
      setError('Could not start a duel. Try again.');
      return;
    }
    router.push(`/duel/${r.code}`);
  }

  return (
    <div className="club-lobby-actions">
      <div className="club-lobby-panel">
        <h2 className="club-lobby-h3">Start a duel</h2>
        <p className="club-lobby-note">You get a code and a link to send to up to three friends. Start it once everyone is in.</p>
        {asking ? (
          <GuestNameForm label="Start the duel" busy={busy} onSubmit={(n) => void create(n)} onCancel={() => setAsking(false)} />
        ) : (
          <button type="button" className="club-button" disabled={busy} onClick={() => void create()}>
            {busy ? 'Starting…' : 'Start a duel'}
          </button>
        )}
        {error && <p className="club-lobby-error" role="alert">{error}</p>}
      </div>
      <form
        className="club-lobby-panel"
        onSubmit={(e) => {
          e.preventDefault();
          const c = parseCode(code);
          if (c) router.push(`/duel/${c}`);
          else setError('A code is six letters and numbers.');
        }}
      >
        <h2 className="club-lobby-h3">Join with a code</h2>
        <p className="club-lobby-note">Got a code from a friend? Type it here, or just open their link.</p>
        <div className="club-lobby-inline">
          <input
            className="club-lobby-input club-lobby-code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={6}
            placeholder="ABC234"
            aria-label="Duel code"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="club-button">Join</button>
        </div>
      </form>
    </div>
  );
}
