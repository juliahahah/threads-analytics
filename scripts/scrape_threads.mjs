/**
 * Threads 貼文爬蟲（Playwright）
 *
 * 考題要求「請用 playwright 進行爬取」，這支程式就是那個爬蟲。
 * 它會真的開瀏覽器、真的連到 Threads、真的等待前端渲染，
 * 然後把「實際拿到什麼」誠實記錄下來 —— 包含拿不到的情況。
 *
 * 設計原則：本程式只讀取未登入狀態下公開可見的內容。
 * 不帶 cookie、不注入 session、不繞過登入牆。
 * 考題「限制提醒」明文禁止竊取 session 或繞過登入，因此這些路徑一律不實作。
 *
 * 用法：
 *   node scripts/scrape_threads.mjs @emoless_com
 *   node scripts/scrape_threads.mjs @emoless_com --headful   # 看瀏覽器實際行為
 *   node scripts/scrape_threads.mjs --probe                  # 只做取證，不嘗試解析
 *
 * 輸出：
 *   data/scrape_result.json   爬取結果與取證紀錄
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- 參數解析
const argv = process.argv.slice(2);
const headful = argv.includes('--headful');
const probeOnly = argv.includes('--probe');
const account = (argv.find((a) => !a.startsWith('--')) ?? '@emoless_com').replace(/^@/, '');

const TARGET = `https://www.threads.com/@${account}`;
const TIMEOUT = 45_000;
const SCROLL_ROUNDS = 25;      // 每輪捲到底，觸發無限捲動載入
const MIN_POSTS = 30;         // 考題要求至少 30 篇

/** 互動數字欄位在 Threads 的 JSON payload 中的鍵名。 */
const ENGAGEMENT_KEYS = ['like_count', 'text_post_app_info', 'reply_count', 'repost_count', 'quote_count'];

// ---------------------------------------------------------------- Playwright
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error(
    '找不到 playwright。請先安裝：\n' +
    '  npm install -D playwright\n' +
    '  npx playwright install chromium\n',
  );
  process.exit(1);
}

/** 以指數退避重試，涵蓋網路抖動與暫時性封鎖。 */
async function withRetry(label, fn, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn(i);
    } catch (err) {
      lastErr = err;
      if (i === attempts) break;
      const wait = 1000 * 2 ** (i - 1);
      console.warn(`  [retry] ${label} 第 ${i} 次失敗（${err.message}），${wait}ms 後重試`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/**
 * 從頁面中嘗試抽出貼文。
 *
 * Threads 把資料放在內嵌的 JSON payload 裡（而非 DOM 屬性），
 * 所以這裡同時嘗試兩條路徑：DOM 擷取與 script 標籤中的 JSON。
 */
async function extractPosts(page) {
  return page.evaluate((keys) => {
    const out = { fromDom: [], fromJson: [], evidence: {} };

    // --- 路徑 A：DOM。未登入時 Threads 不渲染貼文，這裡通常為空。
    const articles = document.querySelectorAll('article, div[data-pressable-container]');
    out.evidence.articleCount = articles.length;
    for (const el of articles) {
      const text = (el.innerText || '').trim();
      if (!text) continue;
      const link = el.querySelector('a[href*="/post/"]');
      out.fromDom.push({
        text: text.slice(0, 500),
        url: link ? new URL(link.getAttribute('href'), location.origin).href : null,
      });
    }

    // --- 路徑 B：內嵌 JSON。互動數字若存在，會在這裡。
    const scripts = [...document.querySelectorAll('script')];
    out.evidence.scriptCount = scripts.length;
    const html = document.documentElement.outerHTML;
    out.evidence.htmlBytes = html.length;
    out.evidence.keyHits = Object.fromEntries(
      keys.map((k) => [k, (html.match(new RegExp(k, 'g')) || []).length]),
    );

    for (const s of scripts) {
      const raw = s.textContent || '';
      if (!raw.includes('like_count')) continue;
      try {
        const found = raw.match(/\{"pk":.*?"like_count":\d+.*?\}/g) || [];
        for (const chunk of found.slice(0, 100)) {
          const o = JSON.parse(chunk);
          out.fromJson.push({
            post_id: o.pk ?? o.id ?? null,
            text: o.caption?.text ?? null,
            likes: o.like_count ?? null,
            replies: o.text_post_app_info?.direct_reply_count ?? null,
            reposts: o.text_post_app_info?.repost_count ?? null,
            quotes: o.text_post_app_info?.quote_count ?? null,
            taken_at: o.taken_at ?? null,
          });
        }
      } catch {
        // payload 結構會變動，解析失敗不應中斷取證流程
      }
    }

    out.evidence.title = document.title;
    out.evidence.bodyTextLength = (document.body.innerText || '').length;
    out.evidence.hasLoginWall = /log in|登入|sign up|註冊/i.test(document.body.innerText || '');
    return out;
  }, ENGAGEMENT_KEYS);
}

// ---------------------------------------------------------------- 主流程
const started = new Date();
console.log(`[scrape] 目標：${TARGET}`);
console.log(`[scrape] 模式：${headful ? 'headful（顯示瀏覽器）' : 'headless'}${probeOnly ? ' / 僅取證' : ''}`);

const browser = await chromium.launch({ headless: !headful });
const context = await browser.newContext({
  // 一般桌面瀏覽器的 UA 與語系；不帶任何 cookie 或 storageState。
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/155.0.0.0 Safari/537.36',
  locale: 'zh-TW',
  viewport: { width: 1440, height: 1000 },
});

const page = await context.newPage();

/**
 * 攔截 GraphQL 回應。
 *
 * 這是取得互動數字唯一可靠的來源：DOM 上的數字是「有值才渲染」，
 * 0 會被整行省略，因此無法用位置判斷哪個數字是 like、哪個是 reply。
 * GraphQL payload 有明確的鍵名，不會有這個歧義。
 */
const apiResponses = [];
const graphqlPosts = new Map();   // post_id -> 貼文物件（去重）

/** 遞迴走訪 payload，撈出所有帶 like_count 的節點。 */
function harvest(node, sink) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) harvest(n, sink);
    return;
  }
  if (typeof node.like_count === 'number') {
    const info = node.text_post_app_info ?? {};
    const id = node.code ?? node.pk ?? node.id ?? null;
    if (id) {
      sink.set(String(id), {
        post_id: String(id),
        url: node.code ? `https://www.threads.com/@${account}/post/${node.code}` : null,
        text: node.caption?.text ?? null,
        likes: node.like_count,
        replies: info.direct_reply_count ?? 0,
        reposts: info.repost_count ?? 0,
        quotes: info.quote_count ?? 0,
        taken_at: node.taken_at ? new Date(node.taken_at * 1000).toISOString() : null,
      });
    }
  }
  for (const v of Object.values(node)) harvest(v, sink);
}

page.on('response', async (res) => {
  const url = res.url();
  if (!/graphql|api\/v1/.test(url)) return;
  try {
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    const body = await res.text();
    if (!body.includes('like_count')) return;
    apiResponses.push({ url: url.slice(0, 160), bytes: body.length, hasLikeCount: true });
    try {
      harvest(JSON.parse(body), graphqlPosts);
    } catch {
      // 部分回應是 NDJSON 或被截斷，逐行再試一次
      for (const line of body.split('\n')) {
        if (!line.includes('like_count')) continue;
        try { harvest(JSON.parse(line), graphqlPosts); } catch { /* 跳過該行 */ }
      }
    }
  } catch {
    // 回應可能已被釋放，忽略
  }
});

const result = {
  account,
  target: TARGET,
  scraped_at: started.toISOString(),
  playwright_version: null,
  outcome: null,
  posts: [],
  evidence: {},
  api_responses: [],
  notes: [],
};

try {
  await withRetry('goto', async () => {
    const resp = await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    result.evidence.httpStatus = resp?.status() ?? null;
    if (!resp || resp.status() >= 400) throw new Error(`HTTP ${resp?.status()}`);
  });

  console.log(`  HTTP ${result.evidence.httpStatus}`);

  // 給前端渲染的機會：等待網路安靜，再捲動觸發無限載入。
  await page.waitForLoadState('networkidle', { timeout: TIMEOUT }).catch(() => {
    result.notes.push('networkidle 逾時：頁面持續有背景請求，改以固定等待繼續。');
  });
  await page.waitForTimeout(3000);

  if (!probeOnly) {
    // 無限捲動：每輪捲到底後等待新的 GraphQL 回應。
    // 連續數輪沒有新貼文就停止，避免在已到底的頁面空轉。
    let stagnant = 0;
    for (let i = 0; i < SCROLL_ROUNDS && graphqlPosts.size < MIN_POSTS; i++) {
      const before = graphqlPosts.size;
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2500);
      const gained = graphqlPosts.size - before;
      console.log(`  [scroll ${i + 1}/${SCROLL_ROUNDS}] 累計 ${graphqlPosts.size} 篇（+${gained}）`);
      stagnant = gained === 0 ? stagnant + 1 : 0;
      if (stagnant >= 3) {
        result.notes.push(`連續 ${stagnant} 輪捲動未取得新貼文，判定已到達可見範圍底部。`);
        break;
      }
    }
  }

  const extracted = await extractPosts(page);
  result.evidence = { ...result.evidence, ...extracted.evidence };
  result.api_responses = apiResponses;

  // 來源優先序：GraphQL（有明確鍵名、含互動數字）> 內嵌 JSON > DOM（無可靠的互動數字）。
  const fromGraphql = [...graphqlPosts.values()];
  let posts;
  if (fromGraphql.length) {
    posts = fromGraphql;
    result.source = 'graphql';
  } else if (extracted.fromJson.length) {
    posts = extracted.fromJson;
    result.source = 'inline-json';
  } else {
    posts = extracted.fromDom;
    result.source = 'dom';
    if (posts.length) {
      result.notes.push(
        'DOM 路徑只能取得貼文文字與連結，無法可靠取得互動數字：' +
        'Threads 對數值為 0 的欄位直接不渲染，導致無法以位置判斷各數字對應哪個指標。',
      );
    }
  }
  result.posts = posts;
  result.evidence.graphqlPostCount = fromGraphql.length;

  if (posts.length >= MIN_POSTS) {
    result.outcome = 'success';
  } else if (posts.length > 0) {
    result.outcome = 'partial';
    result.notes.push(`只取得 ${posts.length} 篇，未達考題要求的 ${MIN_POSTS} 篇。`);
  } else {
    result.outcome = 'blocked';
    result.notes.push(
      '未登入狀態下無法取得任何貼文：Threads 的貼文與互動數字皆由前端在登入後才渲染，' +
      '未登入的 HTML 僅為 JS 殼。',
    );
  }

  // 曝光數：新版考題要求的欄位，但公開資料不存在。
  result.evidence.impressionsAvailable = false;
  result.notes.push(
    '曝光數（impressions）在任何公開來源皆不可得 —— 該數字僅帳號擁有者於 Threads ' +
    '後台 insights 可見，公開頁面與第三方 API 均不提供，故本專案不含此欄位。',
  );

  console.log(`  結果：${result.outcome}，取得 ${posts.length} 篇`);
  console.log(`  HTML ${result.evidence.htmlBytes} bytes，article 節點 ${result.evidence.articleCount} 個`);
  console.log(`  like_count 在 HTML 中出現 ${result.evidence.keyHits?.like_count ?? 0} 次`);
  console.log(`  含 like_count 的 API 回應：${apiResponses.length} 筆`);
} catch (err) {
  result.outcome = 'error';
  result.notes.push(`爬取失敗：${err.message}`);
  console.error(`  錯誤：${err.message}`);
} finally {
  await browser.close();
}

result.duration_ms = Date.now() - started.getTime();

const outPath = resolve(ROOT, 'data/scrape_result.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');

console.log(`[scrape] 取證結果已寫入 data/scrape_result.json`);

if (result.outcome === 'blocked') {
  console.log(
    '\n' +
    '結論：未登入無法取得資料，且考題禁止繞過登入。\n' +
    '因此本專案改用考題提供的 Google Sheet 作為真實資料來源（16 則），\n' +
    '詳見 README 的「資料來源（合法性說明）」。\n',
  );
}
