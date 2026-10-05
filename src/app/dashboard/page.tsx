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
import {
  TierChart, HourChart, LengthChart, ScatterLength,
  EngagementMix, PostRankChart, QuestionRateBars,
} from '@/components/Charts';

export const dynamic = 'force-dynamic';

/** Tier name → semantic colour key used by the CSS. */
function tierKey(name: string): 'high' | 'mid' | 'low' {
  if (name.startsWith('高')) return 'high';
  if (name.startsWith('中')) return 'mid';
  return 'low';
}

function Stat({ k, v, accent }: { k: string; v: string | number; accent?: boolean }) {
  return (
    <div className="stat">
      <span className="k">{k}</span>
      <span className={accent ? 'v accent' : 'v'}>{v}</span>
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
        <div className="msg error">
          <strong>無法載入分析資料。</strong>
          <div style={{ marginTop: 6 }}>{err instanceof Error ? err.message : String(err)}</div>
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
  const best = analysis.timing.best_hour_by_engagement;

  const posts = (await getMockPosts()).filter((p) => !p.is_synthetic);
  const scatter = posts.map((p) => ({
    char_count: p.char_count,
    total_engagement: p.total_engagement,
    post_id: p.post_id,
  }));

  const hi = tiers[0];
  const lo = tiers[tiers.length - 1];

  // Interaction composition — the four types genuinely sum to the total,
  // so a stacked bar is an honest representation here.
  const sum = (k: 'likes' | 'replies' | 'reposts' | 'quotes') =>
    posts.reduce((n, p) => n + p[k], 0);
  const mixTotal = sum('likes') + sum('replies') + sum('reposts') + sum('quotes');
  const mix = ([
    ['讚', sum('likes')],
    ['回覆', sum('replies')],
    ['引用', sum('quotes')],
    ['轉發', sum('reposts')],
  ] as [string, number][]).map(([label, value]) => ({
    label,
    value,
    pct: mixTotal ? Math.round((value / mixTotal) * 1000) / 10 : 0,
  }));

  const ranked = posts
    .map((p) => p.total_engagement)
    .sort((a, b) => b - a);

  const questionRows = tiers.map((t) => ({
    tier: t.tier,
    pct: t.aggregate.question_rate_pct,
    replies: t.aggregate.avg_replies,
  }));

  return (
    <main className="wrap">
      {/* ------------------------------------------------------------ head */}
      <header className="topbar">
        <div className="stack" style={{ gap: 5 }}>
          <span className="eyebrow">互動表現分析</span>
          <h1>@{analysis.account}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {ov.date_range.from} – {ov.date_range.to}（Asia/Taipei）・真實貼文{' '}
            {analysis.counts.real} 則，合成補充 {analysis.counts.synthetic} 則
          </p>
        </div>
        <div className="topbar-meta">
          <span className="badge">{source === 'supabase' ? 'Supabase' : '本機資料'}</span>
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
      </header>

      <div className="note">
        所有指標僅採計<strong>真實貼文（{analysis.counts.real} 則）</strong>。
        合成貼文僅為滿足作業「至少 30 則」的數量要求，不納入任何洞察。
        {demo && !configured && ' 目前為示範模式：尚未設定 Supabase，資料讀自本機 data/analysis.json。'}
      </div>

      {/* -------------------------------------------------------- 總覽指標 */}
      <section className="stack">
        <div className="section-head">
          <h2>總覽</h2>
          <span className="muted count">{ov.post_count} 則貼文</span>
        </div>

        <div className="lead-band">
          <div className="lead-cell is-primary">
            <span className="k">平均總互動</span>
            <span className="v">{ov.avg_total_engagement}</span>
          </div>
          <div className="lead-cell">
            <span className="k">互動中位數</span>
            <span className="v">{ov.median_total_engagement}</span>
          </div>
          <div className="lead-cell">
            <span className="k">平均 like</span>
            <span className="v">{ov.avg_likes}</span>
          </div>
          <div className="lead-cell">
            <span className="k">平均 reply</span>
            <span className="v">{ov.avg_replies}</span>
          </div>
          <div className="lead-cell">
            <span className="k">平均 repost</span>
            <span className="v">{ov.avg_reposts}</span>
          </div>
          <div className="lead-cell">
            <span className="k">平均 quote</span>
            <span className="v">{ov.avg_quotes}</span>
          </div>
          <div className="lead-cell">
            <span className="k">平均字數</span>
            <span className="v">{ov.avg_char_count}</span>
          </div>
        </div>

        <p className="lede">
          平均 {ov.avg_total_engagement} 遠高於中位數 {ov.median_total_engagement}，
          呈典型長尾分布：少數爆款貼文主導整體表現，評估成效時應以中位數為準。
        </p>
      </section>

      {/* ---------------------------------------------------------- Top 5 */}
      <section className="stack">
        <div className="section-head">
          <h2>互動最高的貼文</h2>
          <span className="muted count">前 5 名</span>
        </div>
        <div className="panel flush table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: 44 }}>#</th>
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
                  <td><span className="rank">{p.rank}</span></td>
                  <td className="excerpt">
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer">{p.excerpt}</a>
                    ) : p.excerpt}
                  </td>
                  <td className="num">{p.likes}</td>
                  <td className="num">{p.replies}</td>
                  <td className="num">{p.reposts}</td>
                  <td className="num">{p.quotes}</td>
                  <td className="num lead-num">{p.total_engagement}</td>
                  <td className="num">{p.char_count}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{p.format}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------------------------------------- 圖表 */}
      <section className="stack">
        <div className="section-head"><h2>圖表</h2></div>
        <div className="chart-grid">
          <div className="panel">
            <h3>互動組成</h3>
            <p className="muted" style={{ margin: '0 0 14px' }}>
              全部 {mixTotal.toLocaleString()} 次互動的類型占比
            </p>
            <EngagementMix mix={mix} />
            <p className="muted" style={{ margin: '14px 0 0' }}>
              {mix[0].pct}% 是讚、僅 {mix[1].pct}% 是回覆 ——
              多數互動停在「已讀點讚」，沒有進入對話。
            </p>
          </div>
          <div className="panel">
            <h3>提問率 vs 回覆數</h3>
            <p className="muted" style={{ margin: '0 0 16px' }}>
              全分析中最強的單一訊號
            </p>
            <QuestionRateBars rows={questionRows} />
          </div>
          <div className="panel" style={{ gridColumn: '1 / -1' }}>
            <h3>每篇貼文的總互動（由高至低）</h3>
            <p className="muted" style={{ margin: 0 }}>
              最高 {ranked[0]} vs 最低 {ranked[ranked.length - 1]}，相差 {Math.round(ranked[0] / Math.max(1, ranked[ranked.length - 1]))} 倍；
              深色為高於中位數（{ov.median_total_engagement}）的貼文
            </p>
            <PostRankChart values={ranked} median={ov.median_total_engagement} />
          </div>
          <div className="panel">
            <h3>三組互動分層的平均互動</h3>
            <p className="muted" style={{ margin: 0 }}>依 likes + replies 三分位分組</p>
            <TierChart analysis={analysis} />
          </div>
          <div className="panel">
            <h3>發文時段 vs 平均互動</h3>
            <p className="muted" style={{ margin: 0 }}>
              互動最佳：{best ? `${String(best.hour).padStart(2, '0')}:00` : '—'}
            </p>
            <HourChart analysis={analysis} />
          </div>
          <div className="panel">
            <h3>字數區間 vs 平均互動</h3>
            <p className="muted" style={{ margin: 0 }}>200 字以上明顯跳升</p>
            <LengthChart analysis={analysis} />
          </div>
          <div className="panel">
            <h3>單篇字數 vs 總互動</h3>
            <p className="muted" style={{ margin: 0 }}>每點為一則真實貼文（{posts.length} 則）</p>
            <ScatterLength points={scatter} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ 長度關係 */}
      <section className="stack">
        <div className="section-head">
          <h2>文字長度與互動的關係</h2>
          <span className="muted count">Pearson r = {lve.pearson_char_vs_total}</span>
        </div>
        <div className="panel flush">
          <div className="table-scroll">
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
                    <td className="num lead-num">{b.avg_engagement}</td>
                    <td className="num">{b.avg_likes}</td>
                    <td className="num">{b.avg_replies}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {lve.interpretation}；對 like 為 {lve.pearson_char_vs_likes}、對 reply 為{' '}
          {lve.pearson_char_vs_replies}。
        </p>
      </section>

      {/* --------------------------------------------------- 分層 NLP */}
      <section className="stack">
        <div className="section-head">
          <h2>三組互動分層的 NLP 分析</h2>
          <span className="muted count">各組取樣 3–5 則</span>
        </div>
        <p className="lede">
          方法：{analysis.tier_analysis.method}。對每組取樣貼文套用<strong>完全相同</strong>
          的特徵萃取 —— 句數、問號、第一/第二人稱、五類詞彙命中。
        </p>

        {tiers.map((t) => (
          <article className="tier-card" data-tier={tierKey(t.tier)} key={t.tier}>
            <div className="tier-head">
              <span className="tier-name">{t.tier}</span>
              <span className="chip">{t.post_count} 則</span>
              <span className="chip">互動分數 {t.score_range.min}–{t.score_range.max}</span>
            </div>

            <div className="stat-row">
              <Stat k="平均總互動" v={t.aggregate.avg_total_engagement} accent />
              <Stat k="提問率" v={`${t.aggregate.question_rate_pct}%`} accent />
              <Stat k="平均字數" v={t.aggregate.avg_char_count} />
              <Stat k="平均讚" v={t.aggregate.avg_likes} />
              <Stat k="平均回覆" v={t.aggregate.avg_replies} />
              <Stat k="第二人稱" v={t.aggregate.avg_second_person} />
              <Stat k="第一人稱" v={t.aggregate.avg_first_person} />
            </div>

            <div className="lex">
              {Object.entries(t.lexicon_totals).map(([k, v]) => (
                <span key={k}>{k} <b>{v}</b></span>
              ))}
            </div>

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
                      <td style={{ whiteSpace: 'nowrap', fontSize: '.8rem', color: 'var(--ink-mute)' }}>
                        {s.post_id}
                      </td>
                      <td className="excerpt">{s.excerpt}</td>
                      <td className="num">{s.likes}</td>
                      <td className="num">{s.replies}</td>
                      <td className="num">{s.char_count}</td>
                      <td className="num">{s.sentence_count}</td>
                      <td className="num lead-num">{s.question_marks}</td>
                      <td className="num">{s.second_person_count}</td>
                      <td style={{ fontSize: '.82rem', color: 'var(--ink-mute)' }}>
                        {s.top_terms.slice(0, 3).join('、')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
      </section>

      {/* ------------------------------------------------------ 分層結論 */}
      <section className="stack">
        <div className="section-head"><h2>分層結論</h2></div>
        <div className="panel">
          <ul className="findings">
            {analysis.tier_analysis.findings.map((f, i) => (
              <li key={i}>{f.replace(/\*\*/g, '')}</li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h3 style={{ marginBottom: 14 }}>跨組對照最關鍵的差異</h3>
          <ol className="insight-list">
            <li>
              <span className="insight-n">1</span>
              <span>
                <strong>提問是最強的分水嶺。</strong>高互動組提問率{' '}
                {hi.aggregate.question_rate_pct}%，低互動組為{' '}
                <strong>{lo.aggregate.question_rate_pct}%</strong> —— 低互動組完全沒有向讀者提問，
                貼文寫完即結束。這同時解釋了回覆數的斷崖：{hi.aggregate.avg_replies} vs{' '}
                {lo.aggregate.avg_replies}。
              </span>
            </li>
            <li>
              <span className="insight-n">2</span>
              <span>
                <strong>第二人稱密度決定「對話感」。</strong>高互動組平均出現{' '}
                {hi.aggregate.avg_second_person} 次「你/妳」，低互動組僅{' '}
                {lo.aggregate.avg_second_person} 次。高互動貼文把讀者寫進文本，
                低互動貼文只是自言自語。
              </span>
            </li>
            <li>
              <span className="insight-n">3</span>
              <span>
                <strong>字數不是失敗主因，但有門檻。</strong>三組平均字數差距不大
                （{hi.aggregate.avg_char_count} / {tiers[1].aggregate.avg_char_count} /{' '}
                {lo.aggregate.avg_char_count}），但 200 字以上的貼文平均互動明顯跳升 ——
                「夠長到能說完一個故事」是必要條件，而非充分條件。
              </span>
            </li>
          </ol>
        </div>
      </section>

      {/* -------------------------------------------------------- 關鍵字 */}
      <section className="stack">
        <div className="section-head">
          <h2>常見關鍵字</h2>
          <span className="muted count">hashtag 使用率 {analysis.keywords.hashtag_usage_rate}%</span>
        </div>
        <div className="panel">
          <div className="keyword-cloud">
            {analysis.keywords.top_keywords.slice(0, 18).map((k) => (
              <span className="kw" key={k.term}>
                {k.term} <span className="n">{k.count}</span>
              </span>
            ))}
          </div>
          {analysis.keywords.hashtag_usage_rate < 10 && (
            <p className="muted" style={{ marginBottom: 0, marginTop: 14 }}>
              此帳號幾乎不使用 hashtag，流量主要來自內容本身而非標籤曝光。
            </p>
          )}
        </div>
      </section>

      {/* --------------------------------------------------------- 匯出 */}
      <section className="stack">
        <div className="section-head"><h2>匯出</h2></div>
        <div className="panel">
          <p className="muted" style={{ marginTop: 0 }}>下載清理後的貼文資料與完整分析結果。</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a className="btn secondary" href="/api/export?format=csv">下載 CSV</a>
            <a className="btn secondary" href="/api/export?format=json">下載 JSON</a>
          </div>
        </div>
      </section>

      <p className="muted" style={{ margin: 0 }}>
        <Link href="/">← 回首頁</Link>
      </p>
    </main>
  );
}
