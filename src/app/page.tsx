import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase';

const STEPS = [
  { n: 1, t: '蒐集', d: '彙整帳號近期貼文的 like / reply / repost / quote' },
  { n: 2, t: '清理', d: '去除重複與缺失資料，統一轉為 Asia/Taipei 時區' },
  { n: 3, t: '分析', d: '發文時段、文字長度、關鍵字、貼文類型與相關性' },
  { n: 4, t: '分層', d: '依互動表現分三組，用相同 NLP 方法解釋成功與失敗原因' },
];

export default function Home() {
  const configured = isSupabaseConfigured();

  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <header className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">Threads 資料管線</span>
        <h1>帳號貼文爬取與數據分析</h1>
        <p className="lede">
          輸入一個 Threads 帳號，產出互動表現分析報告 ——
          從原始貼文到可執行的內容策略建議。
        </p>
      </header>

      <section className="panel">
        <h3 style={{ marginBottom: 16 }}>處理流程</h3>
        {/* Numbered because this genuinely is a sequence: each stage consumes
            the previous stage's output. */}
        <ol className="insight-list">
          {STEPS.map((s) => (
            <li key={s.n}>
              <span className="insight-n">{s.n}</span>
              <span>
                <strong>{s.t}</strong>
                <br />
                <span className="muted">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>

        <div style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <Link href="/login" className="btn">登入以檢視分析</Link>
          <span className="muted">分析 dashboard 需登入後才能檢視</span>
        </div>
      </section>

      {!configured && (
        <div className="note">
          <strong>目前為本機示範模式。</strong>尚未設定 Supabase 環境變數，
          登入頁會提供「以示範模式檢視」入口，可在沒有雲端金鑰的情況下驗證資料管線與報表。
          設定方式請見 <code>README.md</code> 與 <code>.env.example</code>。
        </div>
      )}
    </main>
  );
}
