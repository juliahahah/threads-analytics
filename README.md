# Threads 帳號貼文爬取與數據分析

**線上版：https://threads-analytics-pi-sable.vercel.app**（需登入；未登入會被導回登入頁）


分析 Threads 帳號 **@emoless_com** 的發文表現：蒐集貼文 → 清理 → 特徵萃取 → 互動分析 → 報告。
含 Next.js + Supabase 的登入制 dashboard，可部署至 Vercel。

---

## 目錄

- [快速開始](#快速開始)
- [資料來源（合法性說明）](#資料來源合法性說明)
- [安裝](#安裝)
- [執行](#執行)
- [Supabase 設定](#supabase-設定)
- [環境變數](#環境變數)
- [部署到 Vercel](#部署到-vercel)
- [分析指標定義](#分析指標定義)
- [專案結構](#專案結構)
- [測試](#測試)
- [已知限制](#已知限制)

---

## 快速開始

不需要任何雲端金鑰，三行指令即可看到完整報告與 dashboard：

```bash
npm install
npm run data:build          # 產生 data/posts.json、data/analysis.json、reports/report.md
npm run dev                 # 開啟 http://localhost:3000
```

未設定 Supabase 時，登入頁會提供「**以示範模式檢視 dashboard**」入口
（`/dashboard?demo=1`），可直接驗證資料管線與圖表。
一旦設定了 Supabase 金鑰，示範入口即自動關閉，**必須登入才能進入 dashboard**。

靜態報告也可直接閱讀：[`reports/report.md`](reports/report.md)

---

## 資料來源（合法性說明）

### 為什麼沒有直接爬 Threads

本專案**沒有**爬取 Threads，這是刻意的決定。實際驗證結果：

```bash
curl -A "<一般瀏覽器 UA>" https://www.threads.com/@emoless_com
# HTTP 200，但回傳 275 KB 的 JS 殼：<title>Threads</title>
# 內文 like_count 出現次數：0
# 單篇貼文頁 /post/<id> 同樣只回傳空殼
```

Threads 的貼文內容與互動數字由前端在**登入後**才渲染，未登入的 HTML 完全不含
`like_count` 等欄位。要取得資料只能竊取 session cookie 或繞過登入 —— 這正是考題
「限制提醒」明文禁止的行為，因此不予採用。

### 實際採用的資料來源

| 來源 | 筆數 | 說明 |
| --- | --- | --- |
| **考題提供的 Google Sheet** | **16 則** | 真實貼文，`is_synthetic=false`。公開可讀，以 CSV export 端點取得。 |
| 程式生成的補充資料 | 20 則 | `is_synthetic=true`，僅為滿足「至少 30 則」的數量要求。 |
| 合計 | 36 則 | |

原始資料：[Google Sheet](https://docs.google.com/spreadsheets/d/1ULbpiySKU6MoblsTCjA4m0yqOcpysIo5sYxh2hTDCsk/edit?gid=0#gid=0)
（已存檔於 [`data/raw_threads_emoless_com.csv`](data/raw_threads_emoless_com.csv)）

### 合成資料的處理原則

考題要求至少 30 則，但公開合法可得的真實貼文只有 16 則。本專案的處理方式是
**補足數量、但不污染結論**：

- 每一筆合成資料都帶有 `is_synthetic=true` 欄位，可被過濾。
- 合成資料的互動數字取樣自真實分布，發文節奏比照真實的約 6 則/日。
- **所有報告指標與洞察皆只採計 16 則真實貼文**（見 `analyze.py` 的
  `real = [p for p in posts if not p["is_synthetic"]]`）。
- 報告與 dashboard 皆在頁首明示此事。

換句話說：合成資料讓資料管線達到題目要求的規模，但任何一句分析結論都可追溯到真實貼文。

---

## 安裝

需求：**Node.js ≥ 18.17**、**Python ≥ 3.10**（資料管線用，只使用標準函式庫）。

```bash
git clone <repo-url>
cd threads-analytics
npm install
```

Python 端**不需要** `pip install`：`requirements.txt` 中列出的都是標準函式庫，
刻意不依賴 pandas / jieba，讓專案可以零安裝重現。

---

## 執行

### 1. 建立資料與報告

```bash
npm run data:build
```

等同依序執行：

| 指令 | 作用 | 產出 |
| --- | --- | --- |
| `python scripts/build_dataset.py` | 讀取原始 CSV → 清理 → 特徵萃取 → 補合成資料 | `data/posts.json`、`data/posts.csv` |
| `python scripts/analyze.py` | 計算所有指標與分層 NLP | `data/analysis.json` |
| `python scripts/report.py` | 產生 Markdown 報告與 SVG 圖表 | `reports/report.md` + 4 張圖 |

### 2. 啟動 Web dashboard

```bash
npm run dev      # 開發模式
npm run build && npm start   # 正式模式
```

### 3. 執行測試

```bash
python -m unittest discover -s tests -v
```

---

## Supabase 設定

1. 到 [supabase.com](https://supabase.com) 建立一個新專案。
2. 開啟 **SQL Editor**，貼上並執行
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 的完整內容。
   這會建立 4 張資料表、索引、觸發器與 RLS policies。
3. 到 **Project Settings → API** 複製 `Project URL` 與 `anon public` key。
4. 複製 `.env.example` 為 `.env.local`，填入金鑰，並把 `DATA_SOURCE` 改為 `supabase`。
5. （Magic Link 需要）到 **Authentication → URL Configuration**，
   將 `http://localhost:3000/auth/callback` 加入 Redirect URLs。

### 資料表

| 資料表 | 用途 | 對應考題要求 |
| --- | --- | --- |
| `profiles` | 使用者資料，註冊時由 trigger 自動建立 | 使用者資料 |
| `analysis_jobs` | 分析任務（狀態、來源、筆數、錯誤訊息） | 分析任務 |
| `posts` | 貼文資料，`unique(job_id, post_id)` 去重 | 貼文資料 |
| `analysis_results` | 彙總分析結果（JSONB payload） | 彙總分析結果 |

### 權限控制（RLS）

四張表全部 `enable row level security`，且每條 policy 都以
`auth.uid() = user_id` 為條件。效果：

- 未登入者 `auth.uid()` 為 `null`，所有查詢回傳 0 筆。
- 登入者只能讀寫自己的 job / posts / results，**無法讀取其他使用者的資料**。
- 刪除 job 時，posts 與 results 以 `on delete cascade` 一併清除。

---

## 環境變數

完整範本見 [`.env.example`](.env.example)。

| 變數 | 必要 | 說明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 是（雲端模式） | Supabase 專案 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 是（雲端模式） | anon key，受 RLS 保護，可暴露於瀏覽器 |
| `SUPABASE_SERVICE_ROLE_KEY` | 否 | **僅伺服器端**，會繞過 RLS，切勿加 `NEXT_PUBLIC_` 前綴 |
| `NEXT_PUBLIC_SITE_URL` | 否 | Magic Link 導回網址，預設 `http://localhost:3000` |
| `DATA_SOURCE` | 否 | `mock`（預設）或 `supabase` |
| `DEFAULT_ACCOUNT` | 否 | 分析目標帳號，預設 `emoless_com` |

---

## 部署到 Vercel

```bash
npm i -g vercel
vercel
```

或在 Vercel 網頁匯入 Git repository。部署設定已寫在
[`vercel.json`](vercel.json)（framework: nextjs，region: hnd1 東京）。

**部署前請在 Vercel 專案的 Environment Variables 設定：**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL`（填入實際網域，例如 `https://your-app.vercel.app`）
- `DATA_SOURCE=supabase`

並記得把 `https://your-app.vercel.app/auth/callback` 加入 Supabase 的 Redirect URLs。

> `data/*.json` 會隨 repo 一起部署，因此即使尚未匯入 Supabase，
> 登入後仍可看到以真實資料產生的分析結果。

---

## 分析指標定義

| 指標 | 定義 |
| --- | --- |
| `total_engagement` | `likes + replies + reposts + quotes` |
| `weighted_engagement` | `likes + 3×replies + 2×reposts + 2×quotes`，加重「需要花力氣」的互動 |
| `char_count` | 原始貼文字數（取自 Sheet 的「字數」欄；缺值時以內文長度替代） |
| `post_type` | 依內文判定，優先序：含連結 > 含 hashtag > 含 mention > 純文字 |
| `has_question` | 內文含 `?` 或 `？` |
| 提問率 | 該組中 `has_question` 為真的貼文占比 |
| Pearson r | 字數與互動的線性相關係數；`n<3` 或變異為 0 時回傳 0 |
| 互動分層 | 依 `likes + replies` 排序後取三分位，分為高 / 中 / 低三組 |
| 分層取樣 | 各組取**最接近該組中位數**的 3–5 則，確保樣本具代表性而非極端值 |

**為何用絕對互動數而非「互動率」**：Threads 未登入無法取得粉絲數，
缺少正規化的分母，因此全文以絕對互動數比較（同一帳號、同一時期，可比性足夠）。

### 分層 NLP 方法

對每組取樣的貼文套用**完全相同**的特徵萃取（`analyze.py` 的 `nlp_profile`）：

1. 句數、平均句長（以 `。！？!?\n` 斷句）
2. 問號數、第一人稱「我」次數、第二人稱「你/妳」次數
3. 五類詞彙命中數：自我揭露、關係詞、正面情緒、負面情緒、時間標記
4. 高頻詞（中文採 bigram 切詞，過濾停用詞）

---

## 專案結構

```
threads-analytics/
├── data/
│   ├── raw_threads_emoless_com.csv   # 原始資料（Google Sheet 匯出存檔）
│   ├── posts.json / posts.csv        # 清理後資料集（36 則）
│   └── analysis.json                 # 完整分析結果
├── reports/
│   ├── report.md                     # Markdown 分析報告
│   └── chart_*.svg                   # 4 張圖表
├── scripts/
│   ├── build_dataset.py              # 清理 + 特徵萃取 + 合成補充
│   ├── analyze.py                    # 指標計算 + 分層 NLP
│   └── report.py                     # 報告與圖表產生
├── src/
│   ├── app/
│   │   ├── page.tsx                  # 首頁
│   │   ├── login/                    # 登入（Email/密碼 + Magic Link）
│   │   ├── dashboard/                # 受保護的分析 dashboard
│   │   ├── auth/                     # callback / signout
│   │   └── api/                      # analyze、export (CSV/JSON)
│   ├── components/                   # LoginForm、Charts
│   ├── lib/                          # supabase、data、types、account
│   └── middleware.ts                 # 路由保護
├── supabase/migrations/0001_init.sql # Schema + RLS
├── tests/test_pipeline.py            # 20 項單元測試
└── vercel.json
```

---

## 測試

```bash
python -m unittest discover -s tests -v
```

20 項測試，涵蓋：

- **清理**：Excel 序號轉時區、髒資料轉型、重複與缺值丟棄
- **特徵萃取**：hashtag/mention/URL 計數、`post_type` 優先序、互動加總、中英文問號
- **統計**：Pearson 完全正/負相關、退化輸入（零變異、n<2）回傳 0、停用詞過濾
- **分層**：三組切分涵蓋所有貼文、取樣上限 5 則、高組互動確實高於低組
- **資料完整性**：≥30 則、16 則真實資料、無重複 ID、互動加總一致

---

## 已知限制

1. **真實樣本僅 16 則、時間跨度約 3 天**（2026-09-28 ~ 10-01）。
   所有結論屬方向性指標，樣本數不足以做統計顯著性檢定。
2. **無法取得粉絲數**，因此以絕對互動數代替互動率（見上方說明）。
3. **全部 16 則貼文皆為純文字**（無連結／hashtag／mention），
   「貼文類型」維度在本資料集無鑑別力，分析改以「文型」與「主題」為切角。
4. **中文斷詞採 bigram 近似法**而非詞典式斷詞（如 jieba），
   關鍵字可能包含跨詞邊界的組合（例如「天我」）。這是為了零安裝重現所做的取捨。
5. **部分貼文摘要在原始 Sheet 中被截斷**，故字數採用 Sheet 既有的「字數」欄位，
   而非重新計算內文長度；兩者在未截斷的貼文上一致。
6. **合成資料不具語意價值**，僅用於湊足筆數與壓力測試管線，請勿從中解讀內容洞察。
7. **相依套件的已知弱點**：`npm audit` 目前回報 2 項（postcss 相關，high/moderate）。
   這些屬於**建置期**工具鏈，且只處理本專案自己的 CSS，不接受外部輸入，
   執行期不受影響。已將 Next.js 升至 15.5.27 以消除先前 14.x 的
   critical RCE 警告；完全清除剩餘項目需升級至 Next 16（breaking change），
   考量交付穩定性暫不執行。

---

## 加分項實作狀況

| 項目 | 狀態 |
| --- | --- |
| 輸出 CSV / JSON | ✅ `/api/export?format=csv\|json`，dashboard 有下載按鈕 |
| 快取 | ✅ `src/lib/data.ts` 內含 5 分鐘 TTL 快取 |
| 錯誤處理與 retry | ✅ `/api/analyze` 指數退避重試；失敗任務記錄 `error_message` |
| 測試資料與單元測試 | ✅ 20 項測試 |
| 多帳號比較 | ⬜ 資料表已支援（`account` 欄位 + 以 job 分組），UI 未實作 |
| Docker | ⬜ 未實作（`npm run data:build && npm run dev` 已可一鍵啟動） |
| LLM 自動產生策略建議 | ⬜ 未實作，策略觀察由規則式分析產生（見 `report.py`） |
