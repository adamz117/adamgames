import LoginForm from '@/components/auth/login-form';

export default function LoginPage() {
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, margin: '0 0 20px' }}>
        Sign in
      </h1>
      <LoginForm />
    </main>
  );
}
