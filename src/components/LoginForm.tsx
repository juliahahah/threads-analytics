'use client';

/**
 * Login form — supports BOTH required methods:
 *   - Email + Password (sign in / sign up)
 *   - Magic Link
 *
 * When Supabase is not configured the inputs are disabled (there is no auth
 * backend to talk to) and an explicit demo entry point is offered, so the
 * dashboard can still be verified locally without cloud credentials.
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
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const redirectTo = params.get('redirectedFrom') ?? '/dashboard';
  const blocked = params.get('reason') === 'not-configured';

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
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          })
        : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setError(error.message);
        return;
      }
      if (signUp) {
        setInfo('註冊成功。請直接按「登入」；若 Supabase 開啟了信箱驗證，需先到信箱完成確認。');
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
    <main className="auth-wrap">
      <div className="auth-card">
        <header className="stack" style={{ gap: 8 }}>
          <div className="auth-brand">
            <span className="mark" aria-hidden="true">T</span>
            <span className="eyebrow">Threads 貼文分析</span>
          </div>
          <h1 style={{ fontSize: '1.75rem' }}>登入</h1>
          <p className="muted" style={{ margin: 0 }}>登入後即可建立與檢視分析報告。</p>
        </header>

      {!configured && (
        <div className="note">
          <strong>尚未設定 Supabase，帳號登入暫時無法使用。</strong>
          <br />
          下方欄位因此停用。要直接看分析結果，請用本頁最下方的「以示範模式檢視 dashboard」。
        </div>
      )}

      <section className="panel stack" style={{ gap: 16 }}>
        <div className="seg" role="group" aria-label="登入方式">
          <button type="button" aria-pressed={mode === 'password'} onClick={() => setMode('password')}>
            Email / 密碼
          </button>
          <button type="button" aria-pressed={mode === 'magic'} onClick={() => setMode('magic')}>
            Magic Link
          </button>
        </div>

        <div className="field">
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
        </div>

        {mode === 'password' && (
          <div className="field">
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
          </div>
        )}

        {error && <div className="msg error">{error}</div>}
        {info && <div className="msg ok">{info}</div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
            <button className="btn" onClick={handleMagicLink} disabled={!configured || busy} type="button">
              {busy ? '寄送中…' : '寄送登入連結'}
            </button>
          )}
        </div>
      </section>

      {!configured && (
        <section className="panel stack" style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>本機示範模式</h3>
          <p className="muted" style={{ margin: 0 }}>
            以真實資料產出的完整 dashboard，用於驗證資料管線與圖表。
            設定 Supabase 金鑰後，此入口會自動關閉，未登入將無法進入。
          </p>
          <div>
            <Link href="/dashboard?demo=1" className="btn">以示範模式檢視 dashboard</Link>
          </div>
        </section>
      )}

      {blocked && configured && (
        <div className="msg error">無法進入 dashboard，請先登入。</div>
      )}

        <p className="muted" style={{ margin: 0 }}>
          <Link href="/">← 回首頁</Link>
        </p>
      </div>
    </main>
  );
}
