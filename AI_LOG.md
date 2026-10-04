# AI_LOG — Vibe Coding 過程紀錄

本檔記錄這個專案實際與 AI coding assistant（Claude Code）協作的過程，
包含**出錯的地方**與**我如何驗證 AI 的產出**。流水帳式記錄，不美化。

---

## 1. 我如何向 AI 描述需求

### 第一輪：先讓 AI 讀題，不要急著寫

我沒有把需求用自己的話轉述，而是直接讓 AI 讀考題 `.docx`：

> 「閱讀 AI Vibe Coding 考題：Threads 帳號貼文爬取與數據分析.docx 之後幫我完成」

理由：轉述一定會失真，尤其考題最後一段的分層 NLP 要求寫在
Google Sheet 連結旁邊，很容易漏掉。讓 AI 直接解析原始檔案最保險。

AI 解壓 `.docx` 的 `word/document.xml` 取出全文，正確抓到了所有 6 大項需求
＋加分項＋評分標準＋最後那段容易被忽略的「分成三個群組做 NLP 分析」。

### 第二輪：在動手前先確認兩個關鍵決策

AI 在寫任何程式前，先去驗證了兩件事，然後**停下來問我**：

1. 考題要求「至少 30 篇」，但老師給的 Sheet 只有 16 筆 → 怎麼補？
2. Supabase 專案還沒建 → 要不要等我給金鑰？

這一步我覺得很關鍵。如果 AI 直接自己決定「全部用假資料」，
整份分析就變成自問自答；如果它直接假設我有 Supabase，程式就會卡在跑不起來。

我的選擇：
- **16 筆真實 + 20 筆標記為合成的補充資料**，所有洞察只採計真實資料。
- 先把程式碼與 migrations 寫完，讓它在沒有雲端金鑰時也能本機跑起來。

### 具體的指令風格

有效的描述方式（後來證明產出品質比較高）：

- 「**先驗證再寫**」——例如要求先實際 curl Threads 確認擋不擋登入，
  而不是憑印象寫「Threads 無法爬取」。
- 「**把限制寫進程式碼，不要只寫在 README**」——例如合成資料必須帶
  `is_synthetic` 欄位，而不是只在文件裡講一句。
- 「**相同方法套用到每一組**」——考題明文要求，我特別強調，
  因為 AI 很容易對高互動組寫得很細、對低互動組草草帶過。

---

## 2. AI 幫我產生了哪些程式碼

| 檔案 | AI 產出程度 | 我的介入 |
| --- | --- | --- |
| `scripts/build_dataset.py` | 幾乎全部 | 指定 Excel 序號轉時區的處理方式 |
| `scripts/analyze.py` | 幾乎全部 | 要求分層取樣改用「中位數鄰近」而非前 N 名 |
| `scripts/report.py` | 全部 | 要求圖表改用手刻 SVG 以避免 matplotlib 中文字型問題 |
| `src/**` (Next.js) | 幾乎全部 | 要求登入頁同時支援兩種登入方式 |
| `supabase/migrations/0001_init.sql` | 全部 | 要求每張表都要有 RLS，不能只有註解 |
| `tests/test_pipeline.py` | 全部 | 要求測試退化輸入（zero variance、n<3） |
| `README.md` / 本檔 | 全部 | 要求如實寫出限制，不要美化 |

幾個 AI 主動做得不錯、我沒有要求的設計：

- `data.ts` 的 5 分鐘 TTL 快取（加分項之一）。
- `/api/analyze` 的指數退避 retry，且失敗時把 `error_message` 寫回 job。
- middleware 用 `getUser()` 而非 `getSession()`，因為前者會向 Supabase
  重新驗證 JWT，後者只信任 cookie —— 用於存取控制時後者不安全。
  這個細節我原本不知道。

---

## 3. 我如何驗證 AI 產出的正確性

這部分是我花最多時間的地方。沒有驗證的 AI 產出等於沒有產出。

### (a) 資料來源：要求實際驗證，不接受「我認為」

AI 一開始可以直接宣稱「Threads 需要登入所以用 mock」。我要求它拿出證據：

```
curl -A "<瀏覽器 UA>" https://www.threads.com/@emoless_com
→ HTTP 200，275 KB，但 grep like_count 結果為 0，<title> 只有 "Threads"
curl .../post/Dd2BfosAcIX   （單篇貼文頁）
→ 同樣是空殼
```

兩個端點都驗證過，才寫進 README。**這是結論，不是假設。**

### (b) 統計：用已知答案反推

AI 寫的 Pearson 相關係數函式，我不看程式碼對不對，直接餵已知答案的輸入：

```python
pearson([1,2,3,4], [2,4,6,8])  == 1.0    # 完全正相關
pearson([1,2,3,4], [8,6,4,2])  == -1.0   # 完全負相關
pearson([1,1,1], [1,2,3])      == 0.0    # 零變異，不能除以 0
pearson([1,2], [1,2])          == 0.0    # n<3 樣本太小
```

後兩項是我特別要求加的 —— AI 第一版沒有處理零變異，
如果資料剛好所有貼文字數相同就會 `ZeroDivisionError`。

### (c) 分析結論：自己回去看原文

AI 產出「低互動組提問率 0%」這個結論時，我沒有直接相信，
而是去翻那 6 則低互動貼文的原文，逐則確認**真的一個問號都沒有**。
結果是對的。同時對照高互動組第 2 名（92 則回覆）確實有 4 個問號、
7 次第二人稱「你」。這個對比撐得起結論，不是湊出來的。

### (d) Web app：實際跑起來打 HTTP，不只看它 build 過

```
GET /                   → 200
GET /login              → 200
GET /dashboard          → 307 轉址到 /login   ← 考題要求的「未登入不可查看」
GET /dashboard?demo=1   → 200（77 KB）
GET /api/export?...     → 200
```

### (e) 圖表：用 headless Chrome 確認真的有畫出來

Recharts 是 client component，SSR 的 HTML 裡**沒有** `<svg>`。
只看 curl 結果會誤判成「圖表壞了」。我用 headless Chrome 實際渲染：

```
chrome --headless --virtual-time-budget=9000 --dump-dom http://localhost:3123/dashboard?demo=1
→ svg: 4、recharts-surface: 4
→ recharts-bar-rectangle: 13（三張長條圖的柱子）
→ recharts-scatter-symbol: 16（散佈圖點數 = 16 則真實貼文，數字對得上）
```

散佈圖剛好 16 個點這件事讓我確認「只採計真實貼文」的過濾真的生效了。

---

## 4. 我修正了 AI 的哪些錯誤

### 錯誤 1：`npm audit` 的 critical RCE 被忽略

AI 一開始指定 `next@14.2.15`，安裝時 npm 直接警告有安全性漏洞。
查下去發現 14.x **整條線都沒有修**，包含一個
「Unauthenticated Remote Code Execution on **windows-hosted servers**」——
而我就是在 Windows 上開發。

AI 第一次嘗試升到 `14.2.35`（最新的 14.x）想避免 breaking change，
但重新 audit 後發現還是中招，修補版本是 `>=15.5.24`。
最後升到 `15.5.27` 才消掉 critical。

**教訓**：AI 傾向選「不會破壞現有程式碼」的最小升級，
但安全性問題不能用這個標準決定。剩下 2 項 postcss 的建置期弱點，
我判斷不影響執行期，寫進 README 的已知限制而不是假裝不存在。

### 錯誤 2：Next 15 的 breaking change 沒有一次處理完

升級到 Next 15 後 build 連續爆了 4 次，每次都是 AI 沒預料到的：

1. `next/headers` 不能被 client component 引入
   → 把 `supabase.ts` 拆成 `supabase.ts`（瀏覽器）與 `supabase-server.ts`（伺服器）
2. `cookies()` 在 Next 15 變成 async → 6 處呼叫點全部要 `await`
3. route.ts 不能 export 非 HTTP handler 的函式
   → `parseAccount` 搬到 `src/lib/account.ts`（順便變得可測試）
4. `useSearchParams()` 需要 Suspense boundary
   → 登入頁拆成 `page.tsx` + `components/LoginForm.tsx`

**教訓**：AI 對新版本 API 的掌握沒有想像中可靠。
每一個錯誤都是 build 跑出來才發現的 —— 如果我沒有堅持「一定要 build 過」，
這些會全部留到部署時才爆。

### 錯誤 3：AI 自己寫的工具程式弄壞了自己的測試

這個最有趣。AI 在三支 Python script 開頭都寫了：

```python
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
```

目的是處理 Windows console 的中文編碼。單獨執行沒問題，
但 `unittest` 匯入這些模組時會 `ValueError: I/O operation on closed file`，
因為這行把 unittest 攔截用的 stdout 給 detach 掉了。

20 項測試中有 2 項因此掛掉。修正方式是改用 `reconfigure()`，
它會就地修改串流而不是換掉：

```python
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
```

**教訓**：這類錯誤只有真的把測試跑起來才會發現。
如果我只是請 AI「寫一些測試」然後看一眼覺得合理就收工，就會漏掉。

### 錯誤 4：型別轉換用 `as` 繞過而不是修對

`export/route.ts` 原本寫 `(p as Record<string, unknown>)[c]`，
TypeScript 直接拒絕。AI 的直覺是再加一層 `as unknown as ...` 繞過。

我要求改成真正型別安全的寫法：因為 `CSV_COLUMNS` 已經是 `as const`，
而且每個欄位都真的是 `Post` 的 key，所以 `p[c]` 可以直接通過檢查，
一個 cast 都不需要。**用 `as` 把錯誤壓下去不算修好。**

### 錯誤 5（我的誤判，不是 AI 的）

我用 `grep recharts-rectangle` 檢查柱狀圖，得到 0，一度以為圖表沒畫出來。
實際 class 名稱是 `recharts-bar-rectangle`。是我 grep 錯字串，
重新確認後 13 根柱子都在。

記下來是因為：**驗證工具本身也會出錯**，
看到異常結果時要先懷疑自己的檢查方式，而不是急著改程式。

---

## 5. 哪些部分 AI 幫助最大

### 最大：把「已知的事」快速變成「可執行的程式碼」

RLS policies 是最明顯的例子。我知道要「不同使用者不能互相讀取」，
但要寫出 4 張表 × 每張 3–4 條 policy、加上 `on delete cascade`、
加上新使用者註冊的 trigger，自己寫至少要查半天文件。
AI 幾分鐘就產出完整的 SQL，而且 `security definer` + `set search_path`
這種容易踩雷的細節也處理了。

### 次大：一致性

同一份 `analysis.json` 同時餵給 Markdown 報告和 Next.js dashboard，
所以 CLI、報告、網頁三者的數字**不可能對不上**。
這個設計是 AI 提的，我原本打算報告和網頁各算各的 —— 那樣一定會出現
「報告寫 168.69、網頁顯示 168.7」這種對不起來的狀況。

### 第三：處理我不熟的生態系細節

- `getUser()` vs `getSession()` 的安全性差異
- Next 15 把 `cookies()` / `searchParams` 改成 async
- Recharts 必須是 client component

這些都不是「想一想就會」的知識，是要踩過或讀過文件才知道的。

### AI 幫助最小的地方

**判斷什麼結論站得住腳。**

AI 可以算出「低互動組提問率 0%」，但「這個數字能不能當成策略建議」
是我自己回去讀 16 則貼文原文後才敢下的判斷。
同樣地，`by_post_type` 這個維度在本資料集完全沒有鑑別力
（16 則全是純文字），AI 一開始照樣把它當成一個分析維度列出來；
是我決定把它改寫成「已知限制」，並改用「文型」作為替代切角。

**資料誠實度的界線也是我定的。**
要不要用合成資料、合成資料能不能進入結論、
報告要不要在頁首就講清楚 —— 這些 AI 都會照做，但不會主動堅持。

---

## 6. 小結

這次協作的模式大致是：

```
我定方向與誠實度標準
  → AI 快速產出
    → 我用「可執行的證據」驗證（build / 測試 / HTTP / headless browser / 回讀原文）
      → 發現錯誤 → AI 修 → 再驗證
```

最後的狀態：`npm run build` 通過、20 項單元測試全綠、
5 條路由實際打過、4 張圖表在真實瀏覽器確認渲染。

過程中 AI 出了 4 個需要修的錯（1 個安全性判斷、1 組版本遷移、
1 個自己弄壞測試、1 個型別繞過），我自己誤判 1 次。
這些都記在上面，因為這才是 vibe coding 真實的樣子 ——
不是「AI 一次寫對」，而是「AI 寫得快，人負責確認它是對的」。
