import SignupForm from '@/components/auth/signup-form';

export default function SignupPage() {
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 36, margin: '0 0 20px' }}>
        Create an account
      </h1>
      <SignupForm />
    </main>
  );
}
