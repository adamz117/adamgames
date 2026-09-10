'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { AssassinsState } from '@/lib/assassins';
import {
  addAssassinsPairClient,
  approveAssassinsAccessClient,
  removeAssassinsPairClient,
  requestAssassinsAccessClient,
} from '@/lib/assassins-client';

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--accent-bright)',
  background: 'var(--surface)',
  border: '1px solid var(--accent)',
  borderRadius: 999,
  padding: '6px 16px',
};

const buttonStyle: React.CSSProperties = {
  background: 'var(--accent)',
  color: 'var(--bg)',
  border: 'none',
  borderRadius: 6,
  padding: '10px 20px',
  fontSize: 14,
  fontWeight: 600,
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'var(--font-mono)',
};

function PairRow({ pair, editable, onRemove }: { pair: { id: string; assassinName: string; targetName: string }; editable: boolean; onRemove: (id: string) => void }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        background: 'var(--bg)',
        border: '1px solid var(--border)',
        borderRadius: 8,
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text)' }}>
        {pair.assassinName} <span style={{ color: 'var(--accent-bright)' }}>&rarr;</span> {pair.targetName}
      </span>
      {editable && (
        <button
          onClick={() => onRemove(pair.id)}
          title="Remove"
          style={{
            background: 'transparent',
            color: 'var(--text-dim)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Remove
        </button>
      )}
    </div>
  );
}

export default function AssassinsBlock({ state, featured = false }: { state: AssassinsState; featured?: boolean }) {
  const router = useRouter();
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assassinDraft, setAssassinDraft] = useState('');
  const [targetDraft, setTargetDraft] = useState('');
  const [addingPair, setAddingPair] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleRequestAccess() {
    setRequesting(true);
    setError(null);
    const { error } = await requestAssassinsAccessClient();
    setRequesting(false);
    if (error) {
      setError(error);
      return;
    }
    router.refresh();
  }

  async function handleAddPair() {
    if (!assassinDraft.trim() || !targetDraft.trim()) return;
    setAddingPair(true);
    setError(null);
    const { error } = await addAssassinsPairClient(assassinDraft, targetDraft);
    setAddingPair(false);
    if (error) {
      setError(error);
      return;
    }
    setAssassinDraft('');
    setTargetDraft('');
    router.refresh();
  }

  async function handleRemovePair(id: string) {
    setBusyId(id);
    setError(null);
    const { error } = await removeAssassinsPairClient(id);
    setBusyId(null);
    if (error) {
      setError(error);
      return;
    }
    router.refresh();
  }

  async function handleApprove(userId: string) {
    setBusyId(userId);
    setError(null);
    const { error } = await approveAssassinsAccessClient(userId);
    setBusyId(null);
    if (error) {
      setError(error);
      return;
    }
    router.refresh();
  }

  return (
    <div
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, var(--surface-2), var(--surface))',
        border: '1px solid var(--accent)',
        borderRadius: featured ? 16 : 12,
        padding: featured ? '40px' : '28px',
        boxShadow: '0 24px 64px -24px rgba(239, 69, 119, 0.45)',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-40%',
          right: '-15%',
          width: 320,
          height: 320,
          borderRadius: '50%',
          background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)',
          opacity: 0.2,
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <span style={badgeStyle}>
          <span className="live-dot" aria-hidden="true" />
          Live event
        </span>

        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: featured ? 'clamp(36px, 6vw, 64px)' : 32,
            letterSpacing: '0.02em',
            margin: '16px 0 8px',
            color: 'var(--text)',
          }}
        >
          Assassins
        </h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 16, maxWidth: 560, marginBottom: 24 }}>
          A live game of Assassins is underway. Every player has a target — take them out and
          inherit their target next. This list tracks who&rsquo;s still got who, updated as it happens.
        </p>

        {error && (
          <div style={{ color: 'var(--accent-bright)', fontFamily: 'var(--font-mono)', fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {state.accessStatus === 'signed-out' && (
          <Link href="/login" style={{ ...buttonStyle, display: 'inline-block', textDecoration: 'none' }}>
            Log in to request access
          </Link>
        )}

        {state.accessStatus === 'none' && (
          <button onClick={handleRequestAccess} disabled={requesting} style={buttonStyle}>
            {requesting ? 'Requesting…' : 'Request Access'}
          </button>
        )}

        {state.accessStatus === 'pending' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--accent-bright)' }}>
            Access requested — waiting for approval.
          </div>
        )}

        {state.accessStatus === 'approved' && (
          <>
            {state.isAdmin && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 20 }}>
                <input
                  placeholder="Assassin"
                  value={assassinDraft}
                  onChange={(e) => setAssassinDraft(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Target"
                  value={targetDraft}
                  onChange={(e) => setTargetDraft(e.target.value)}
                  style={inputStyle}
                />
                <button onClick={handleAddPair} disabled={addingPair} style={buttonStyle}>
                  {addingPair ? 'Adding…' : 'Add pair'}
                </button>
              </div>
            )}

            {state.pairs.length === 0 ? (
              <div style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', fontSize: 14 }}>
                No pairings yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {state.pairs.map((pair) => (
                  <PairRow
                    key={pair.id}
                    pair={pair}
                    editable={state.isAdmin && busyId !== pair.id}
                    onRemove={handleRemovePair}
                  />
                ))}
              </div>
            )}

            {state.isAdmin && state.pendingRequests.length > 0 && (
              <div style={{ marginTop: 28 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--text-dim)',
                    marginBottom: 10,
                  }}
                >
                  Pending access requests
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {state.pendingRequests.map((req) => (
                    <div
                      key={req.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        padding: '10px 14px',
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{req.username}</span>
                      <button
                        onClick={() => handleApprove(req.userId)}
                        disabled={busyId === req.userId}
                        style={{ ...buttonStyle, padding: '6px 14px', fontSize: 13 }}
                      >
                        Approve
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
