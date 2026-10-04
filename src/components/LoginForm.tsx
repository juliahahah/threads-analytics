'use client';

/**
 * Login page — supports BOTH required methods:
 *   - Email + Password (sign in / sign up)
 *   - Magic Link
 *
 * When Supabase is not configured the form is disabled and an explicit
 * demo entry point is offered, so the dashboard can still be verified
 * locally without cloud credentials.
 */
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient, isSupabaseConfigured } from '@/lib/supabase';

type Mode = 'password' | 'magic';

export default function LoginForm() {
  const configured = isSupabaseConfigured();
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('reason') === 'not-configured'
      ? '尚未設定 Supabase 環境變數，無法使用帳號登入。可改用下方的示範模式。'
      : null,
  );
  const [info, setInfo] = useState<string | null>(null);

  const redirectTo = params.get('redirectedFrom') ?? '/dashboard';

  async function handlePassword(signUp: boolean) {
    setError(null);
    setInfo(null);
    if (!email || !password) {
      setError('請輸入 Email 與密碼。');
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = signUp
        ? await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
            },
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(error.message);
        return;
      }
      if (signUp) {
        setInfo('註冊成功。若專案開啟了信箱驗證，請先到信箱完成確認再登入。');
        return;
      }
      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '登入時發生未預期的錯誤。');
    } finally {
      setBusy(false);
    }
  }

  async function handleMagicLink() {
    setError(null);
    setInfo(null);
    if (!email) {
      setError('請輸入 Email。');
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (error) {
        setError(error.message);
        return;
      }
      setInfo(`已寄出登入連結到 ${email}，請至信箱點擊連結完成登入。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '寄送登入連結時發生錯誤。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 440 }}>
      <h1>登入</h1>
      <p className="muted">登入後即可建立與檢視分析報告。</p>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <button
            className={`btn ${mode === 'password' ? '' : 'secondary'}`}
            onClick={() => setMode('password')}
            type="button"
          >
            Email / 密碼
          </button>
          <button
            className={`btn ${mode === 'magic' ? '' : 'secondary'}`}
            onClick={() => setMode('magic')}
            type="button"
          >
            Magic Link
          </button>
        </div>

        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          placeholder="you@example.com"
          onChange={(e) => setEmail(e.target.value)}
          disabled={!configured || busy}
        />

        {mode === 'password' && (
          <>
            <label htmlFor="password">密碼</label>
            <input
              id="password"
              type="password"
              value={password}
              autoComplete="current-password"
              placeholder="至少 6 碼"
              onChange={(e) => setPassword(e.target.value)}
              disabled={!configured || busy}
            />
          </>
        )}

        {error && <div className="notice error">{error}</div>}
        {info && <div className="notice ok">{info}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
          {mode === 'password' ? (
            <>
              <button
                className="btn"
                onClick={() => handlePassword(false)}
                disabled={!configured || busy}
                type="button"
              >
                {busy ? '處理中…' : '登入'}
              </button>
              <button
                className="btn secondary"
                onClick={() => handlePassword(true)}
                disabled={!configured || busy}
                type="button"
              >
                註冊新帳號
              </button>
            </>
          ) : (
            <button
              className="btn"
              onClick={handleMagicLink}
              disabled={!configured || busy}
              type="button"
            >
              {busy ? '寄送中…' : '寄送登入連結'}
            </button>
          )}
        </div>
      </div>

      {!configured && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>本機示範模式</h3>
          <p className="muted">
            尚未設定 <code>NEXT_PUBLIC_SUPABASE_URL</code> 與{' '}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>。
            你仍可用示範模式檢視以真實資料產出的完整 dashboard，用於驗證資料管線與圖表。
          </p>
          <Link href="/dashboard?demo=1" className="btn secondary">
            以示範模式檢視 dashboard
          </Link>
        </div>
      )}

      <p className="muted" style={{ marginTop: 20 }}>
        <Link href="/">← 回首頁</Link>
      </p>
    </main>
  );
}
