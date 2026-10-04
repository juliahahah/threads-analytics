/**
 * Login route. The form itself uses useSearchParams(), which requires a
 * Suspense boundary during prerender, so it lives in its own component.
 */
import { Suspense } from 'react';
import LoginForm from '@/components/LoginForm';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="wrap" style={{ maxWidth: 440 }}>
          <h1>登入</h1>
          <p className="muted">載入中…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
