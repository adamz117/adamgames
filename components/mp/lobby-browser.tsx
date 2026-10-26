'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import GuestNameForm from '@/components/mp/guest-name-form';
import { createLobby, listPublicLobbies, type LobbyRow } from '@/lib/mp/lobby-client';
import { ensureSession } from '@/lib/mp/session-client';
import { parseCode } from '@/lib/mp/protocol';
import { courseText, defaultSettings, errorText, FORMAT_LABEL, PACE_LABEL, todayKey } from '@/lib/mp/lobby-ui';
import type { Viewer } from '@/lib/mp/viewer';

// Public lobbies (refreshed every 10 s while the tab shows), creating a lobby and joining by code. Browsing never
// signs anyone in; creating does (as a guest, after asking for a name).
export default function LobbyBrowser({ viewer }: { viewer: Viewer }) {
  const router = useRouter();
  const [lobbies, setLobbies] = useState<LobbyRow[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => listPublicLobbies().then((rows) => alive && setLobbies(rows));
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 10_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  async function create(name?: string) {
    setBusy(true);
    setError(null);
    const s = await ensureSession(name);
    const r = 'error' in s ? s : await createLobby(defaultSettings(todayKey()), 'private', s.name);
    if ('error' in r) {
      setBusy(false);
      setError(errorText(r.error));
      return;
    }
    router.push(`/play/${r.code}`);
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    // A pasted link works too: its last part is the code.
    const c = parseCode(code.trim().split('/').filter(Boolean).pop());
    if (!c) return setCodeError(errorText('bad_code'));
    setCodeError(null);
    router.push(`/play/${c}`);
  }

  const today = todayKey();
  return (
    <>
      <section className="club-lobby-actions">
        <div className="club-lobby-panel">
          <h2 className="club-lobby-h3">Start a game</h2>
          <p className="club-lobby-note">
            A private lobby on today’s daily nine. Change the course, players, format and pace inside, then
            send your friends the link.
          </p>
          {asking ? (
            <GuestNameForm label="Create lobby" busy={busy} onSubmit={create} onCancel={() => setAsking(false)} />
          ) : (
            <button
              type="button"
              className="club-button"
              disabled={busy}
              onClick={() => (viewer === 'member' ? create() : setAsking(true))}
            >
              {busy ? 'Creating…' : 'Create a lobby'}
            </button>
          )}
          {error && <p className="club-lobby-error" role="alert">{error}</p>}
        </div>

        <form className="club-lobby-panel" onSubmit={join}>
          <h2 className="club-lobby-h3"><label htmlFor="join-code">Join with a code</label></h2>
          <p className="club-lobby-note">Six letters and numbers, or the whole link.</p>
          <div className="club-lobby-inline">
            <input
              id="join-code"
              className="club-lobby-input club-lobby-code-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC234"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="club-button">Join</button>
          </div>
          {codeError && <p className="club-lobby-error" role="alert">{codeError}</p>}
        </form>
      </section>

      <section className="club-lobby-section">
        <h2 className="club-lobby-h3">Open lobbies</h2>
        {lobbies === null ? (
          <p className="club-lobby-note">Looking for games…</p>
        ) : lobbies.length === 0 ? (
          <p className="club-lobby-note">No public lobbies right now. Create one and make it public, or share a private link.</p>
        ) : (
          <ul className="club-lobby-list">
            {lobbies.map((l) => (
              <li key={l.id} className="club-lobby-row">
                <span className="club-lobby-row-main">
                  <strong>{l.hostName}</strong>
                  <span>{courseText(l.settings.spec, today)}</span>
                </span>
                <span className="club-lobby-row-meta">
                  {FORMAT_LABEL[l.settings.format]} · {PACE_LABEL[l.settings.pace]} · {l.players}/2
                </span>
                <button type="button" className="club-button club-lobby-small" onClick={() => router.push(`/play/${l.code}`)}>
                  Join
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
