/**
 * Protected analysis dashboard.
 *
 * Server Component: the session is checked here as well as in middleware
 * (defence in depth — middleware can be bypassed by misconfiguration, this
 * cannot). `?demo=1` is only honoured when Supabase is unconfigured, so the
 * demo door cannot be used to bypass a real login.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createServerSupabase } from '@/lib/supabase-server';
import { getLatestAnalysis, getMockPosts } from '@/lib/data';
import { TierChart, HourChart, LengthChart, ScatterLength } from '@/components/Charts';

export const dynamic = 'force-dynamic';

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  // Next 15: searchParams is a Promise.
  searchParams: Promise<{ demo?: string }>;
}) {
  const configured = isSupabaseConfigured();
  const demo = (await searchParams).demo === '1';

  let email: string | null = null;

  if (configured) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect('/login?redirectedFrom=/dashboard');
    email = user.email ?? null;
  } else if (!demo) {
    // No auth backend and no explicit demo flag: refuse rather than expose.
    redirect('/login?reason=not-configured');
  }

  let analysis;
  let source: 'supabase' | 'mock';
  try {
    ({ analysis, source } = await getLatestAnalysis());
  } catch (err) {
    return (
      <main className="wrap">
        <h1>分析 dashboard</h1>
        <div className="notice error">
          <strong>無法載入分析資料。</strong>
          <div style={{ marginTop: 6 }}>
            {err instanceof Error ? err.message : String(err)}
          </div>
        </div>
        <p className="muted">
          請在專案根目錄執行 <code>npm run data:build</code> 以產生{' '}
          <code>data/analysis.json</code>，然後重新整理本頁。
        </p>
      </main>
    );
  }

  const ov = analysis.overview;
  const tiers = analysis.tier_analysis.tiers;
  const lve = analysis.length_vs_engagement;

  const posts = (await getMockPosts()).filter((p) => !p.is_synthetic);
  const scatter = posts.map((p) => ({
    char_count: p.char_count,
    total_engagement: p.total_engagement,
    post_id: p.post_id,
  }));

  return (
    <main className="wrap">
      <div className="topbar">
        <div>
          <h1 style={{ marginBottom: 2 }}>@{analysis.account} 互動分析</h1>
          <div className="muted">
            {ov.date_range.from} ~ {ov.date_range.to}（Asia/Taipei）・
            真實貼文 {analysis.counts.real} 則，合成補充 {analysis.counts.synthetic} 則
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="badge">
            資料來源：{source === 'supabase' ? 'Supabase' : '本機 mock'}
          </span>
          {email ? (
            <>
              <span className="muted">{email}</span>
              <form action="/auth/signout" method="post">
                <button className="btn secondary" type="submit">登出</button>
              </form>
            </>
          ) : (
            <span className="badge">示範模式</span>
          )}
        </div>
      </div>

      {demo && !configured && (
        <div className="notice">
          <strong>示範模式。</strong> 尚未設定 Supabase，因此顯示本機 <code>data/analysis.json</code>。
          設定金鑰後即需登入才能檢視，且資料改由 Supabase 讀取。
        </div>
      )}

      <div className="notice">
        所有指標僅採計<strong>真實貼文</strong>（{analysis.counts.real} 則）。
        合成貼文僅為滿足作業「至少 30 則」的數量要求，不納入任何洞察。
      </div>

      {/* ---------------------------------------------------- 總覽指標 */}
      <h2>總覽指標</h2>
      <div className="tiles">
        <Tile label="貼文數（真實）" value={ov.post_count} />
        <Tile label="平均 like" value={ov.avg_likes} />
        <Tile label="平均 reply" value={ov.avg_replies} />
        <Tile label="平均 repost" value={ov.avg_reposts} />
        <Tile label="平均 quote" value={ov.avg_quotes} />
        <Tile label="平均總互動" value={ov.avg_total_engagement} />
        <Tile label="互動中位數" value={ov.median_total_engagement} />
        <Tile label="平均字數" value={ov.avg_char_count} />
      </div>
      <p className="muted">
        平均 {ov.avg_total_engagement} 遠高於中位數 {ov.median_total_engagement}，
        呈典型長尾分布：少數爆款貼文主導了整體表現，評估成效時應以中位數為準。
      </p>

      {/* ---------------------------------------------------- Top posts */}
      <h2>互動最高的前 5 篇</h2>
      <div className="card table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>摘要</th>
              <th className="num">讚</th>
              <th className="num">回覆</th>
              <th className="num">轉發</th>
              <th className="num">引用</th>
              <th className="num">總互動</th>
              <th className="num">字數</th>
              <th>文型</th>
            </tr>
          </thead>
          <tbody>
            {analysis.top_posts.map((p) => (
              <tr key={p.post_id}>
                <td>{p.rank}</td>
                <td style={{ minWidth: 260 }}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      {p.excerpt}
                    </a>
                  ) : (
                    p.excerpt
                  )}
                </td>
                <td className="num">{p.likes}</td>
                <td className="num">{p.replies}</td>
                <td className="num">{p.reposts}</td>
                <td className="num">{p.quotes}</td>
                <td className="num"><strong>{p.total_engagement}</strong></td>
                <td className="num">{p.char_count}</td>
                <td>{p.format}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------- 圖表 */}
      <h2>圖表</h2>
      <div className="grid-2">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>圖 1　三組互動分層的平均互動</h3>
          <TierChart analysis={analysis} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>圖 2　發文時段 vs 平均互動</h3>
          <HourChart analysis={analysis} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>圖 3　字數區間 vs 平均互動</h3>
          <LengthChart analysis={analysis} />
        </div>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>圖 4　單篇字數 vs 總互動散佈</h3>
          <ScatterLength points={scatter} />
        </div>
      </div>

      {/* ---------------------------------------------------- 長度關係 */}
      <h2>文字長度與互動的關係</h2>
      <div className="card table-scroll">
        <p className="muted" style={{ marginTop: 0 }}>
          Pearson r = <strong>{lve.pearson_char_vs_total}</strong>（{lve.interpretation}）；
          對 like 為 {lve.pearson_char_vs_likes}、對 reply 為 {lve.pearson_char_vs_replies}。
        </p>
        <table>
          <thead>
            <tr>
              <th>字數區間</th>
              <th className="num">貼文數</th>
              <th className="num">平均互動</th>
              <th className="num">平均讚</th>
              <th className="num">平均回覆</th>
            </tr>
          </thead>
          <tbody>
            {lve.buckets.map((b) => (
              <tr key={b.bucket}>
                <td>{b.bucket}</td>
                <td className="num">{b.post_count}</td>
                <td className="num">{b.avg_engagement}</td>
                <td className="num">{b.avg_likes}</td>
                <td className="num">{b.avg_replies}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------------------------------------------------- 分層 NLP */}
      <h2>三組互動分層的 NLP 分析</h2>
      <p className="muted">方法：{analysis.tier_analysis.method}</p>

      {tiers.map((t) => (
        <div className="card" key={t.tier} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            {t.tier}
            <span className="badge" style={{ marginLeft: 8 }}>
              {t.post_count} 則・分數 {t.score_range.min}–{t.score_range.max}
            </span>
          </h3>

          <div className="tiles">
            <Tile label="平均字數" value={t.aggregate.avg_char_count} />
            <Tile label="平均讚" value={t.aggregate.avg_likes} />
            <Tile label="平均回覆" value={t.aggregate.avg_replies} />
            <Tile label="提問率" value={`${t.aggregate.question_rate_pct}%`} />
            <Tile label="第二人稱" value={t.aggregate.avg_second_person} />
            <Tile label="第一人稱" value={t.aggregate.avg_first_person} />
          </div>

          <p className="muted">
            詞彙命中（取樣 {t.sample_size} 則合計）：
            {Object.entries(t.lexicon_totals)
              .map(([k, v]) => `${k} ${v}`)
              .join('　')}
          </p>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>post_id</th>
                  <th>摘要</th>
                  <th className="num">讚</th>
                  <th className="num">回覆</th>
                  <th className="num">字數</th>
                  <th className="num">句數</th>
                  <th className="num">問號</th>
                  <th className="num">第二人稱</th>
                  <th>高頻詞</th>
                </tr>
              </thead>
              <tbody>
                {t.samples.map((s) => (
                  <tr key={s.post_id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.post_id}</td>
                    <td style={{ minWidth: 240 }}>{s.excerpt}</td>
                    <td className="num">{s.likes}</td>
                    <td className="num">{s.replies}</td>
                    <td className="num">{s.char_count}</td>
                    <td className="num">{s.sentence_count}</td>
                    <td className="num">{s.question_marks}</td>
                    <td className="num">{s.second_person_count}</td>
                    <td>{s.top_terms.slice(0, 3).join('、')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <h2>分層結論</h2>
      <div className="card">
        <ul className="findings">
          {analysis.tier_analysis.findings.map((f, i) => (
            <li key={i}>{f.replace(/\*\*/g, '')}</li>
          ))}
        </ul>
      </div>

      {/* ---------------------------------------------------- 關鍵字 */}
      <h2>常見關鍵字</h2>
      <div className="card">
        <p style={{ marginTop: 0, lineHeight: 2.1 }}>
          {analysis.keywords.top_keywords.slice(0, 18).map((k) => (
            <span className="badge" key={k.term} style={{ marginRight: 6 }}>
              {k.term} · {k.count}
            </span>
          ))}
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          hashtag 使用率：{analysis.keywords.hashtag_usage_rate}%
          {analysis.keywords.hashtag_usage_rate < 10 && '（此帳號幾乎不使用 hashtag）'}
        </p>
      </div>

      {/* ---------------------------------------------------- 匯出 */}
      <h2>匯出</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          下載清理後的貼文資料與完整分析結果。
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn secondary" href="/api/export?format=csv">下載 CSV</a>
          <a className="btn secondary" href="/api/export?format=json">下載 JSON</a>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 28 }}>
        <Link href="/">← 回首頁</Link>
      </p>
    </main>
  );
}
