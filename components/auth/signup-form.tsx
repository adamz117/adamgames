'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SignupForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <p style={{ color: 'var(--text)' }}>
        Check your email for a confirmation link, then{' '}
        <a href="/login" style={{ color: 'var(--accent-bright)' }}>
          sign in
        </a>
        .
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '10px 12px',
          color: 'var(--text)',
        }}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '10px 12px',
          color: 'var(--text)',
        }}
      />
      {error && <p style={{ color: 'var(--accent-bright)', fontSize: 13 }}>{error}</p>}
      <button
        type="submit"
        style={{
          background: 'var(--accent)',
          color: 'var(--bg)',
          border: 'none',
          borderRadius: 6,
          padding: '10px 12px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Create account
      </button>
    </form>
  );
}
