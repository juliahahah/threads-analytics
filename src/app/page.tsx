import Link from 'next/link';
import { isSupabaseConfigured } from '@/lib/supabase';

export default function Home() {
  const configured = isSupabaseConfigured();

  return (
    <main className="wrap">
      <h1>Threads 帳號貼文爬取與數據分析</h1>
      <p className="muted">
        輸入帳號 → 蒐集貼文 → 清理與特徵萃取 → 互動表現分析報告
      </p>

      <div className="card" style={{ marginTop: 24 }}>
        <h3 style={{ marginTop: 0 }}>這個工具做什麼</h3>
        <ul style={{ fontSize: '0.9rem', paddingLeft: 18 }}>
          <li>彙整帳號近期貼文的 like / reply / repost / quote</li>
          <li>清理重複與缺失資料，統一轉為 Asia/Taipei 時區</li>
          <li>分析發文時段、文字長度、關鍵字與貼文類型</li>
          <li>依互動表現分成三組，用相同 NLP 方法解釋成功與失敗原因</li>
        </ul>

        <p className="muted" style={{ marginBottom: 16 }}>
          分析 dashboard 需登入後才能檢視。
        </p>

        <Link href="/login" className="btn">
          登入以檢視分析
        </Link>
      </div>

      {!configured && (
        <div className="notice" style={{ marginTop: 16 }}>
          <strong>目前為本機示範模式。</strong> 尚未設定 Supabase 環境變數，
          登入頁會提供「以示範模式檢視」入口，讓你在沒有雲端金鑰的情況下驗證資料管線與報表。
          設定方式請見 <code>README.md</code> 與 <code>.env.example</code>。
        </div>
      )}
    </main>
  );
}
