# 知識島大冒險 🏝️

給國小二年級孩子的 3D 遊戲化學習網站。孩子操控小動物在低多邊形的小島上走動，走進不同建築就能玩各科的小遊戲：

| 建築 | 科目 | 內容 |
| --- | --- | --- |
| 🏰 數學城堡 | 數學 | 21 個技能 × 3 個難度（一千以內的數、直式加減、估算、乘法與十十乘法、分裝平分、單位分數、長度、容量重量面積、時鐘、月曆、錢幣、形狀與周長、統計圖），題目由程式產生；「跟著課本」依康軒／南一／翰林二上、二下單元練習 |
| 🌳 文字森林 | 國語 | 生字描寫（852 字，台灣教育部筆順）、注音符號描寫、認字讀音、部首、筆畫、造詞、注音拼讀、聲調、量詞、相反詞、同音字形近字、選詞填空、句子排序、標點符號、閱讀短文；「跟著課本」依三家版本每一課的生字練習 |
| 🏖️ ABC 海灘 | 英語 | 52 個字母描寫（四線格）、大小寫配對、聽字母、字母開頭音、單字圖卡（7 個主題）、生活與教室用語、句型 |
| 🏡 生活村 | 生活與健康 | 四季、動植物、家庭學校社區、交通安全、愛護環境、健康習慣、安全、情緒與相處，以及 3D「垃圾分類大作戰」 |
| 🏆 挑戰塔 | 綜合 | 各科段考模擬（100 分制）、依課本版本的期中／期末模擬考、家長匯入的自訂題庫 |
| 🎁 百寶屋 | 獎勵 | 用答題賺的金幣買帽子、換外觀 |

大部分選擇題與數字題也能用「🎯 氣球射擊」玩：答案寫在 3D 舞台上飄的氣球上，點氣球射中正確答案。題目會記住最近做過的，優先出新題。

所有題目依 108 課綱學習內容自行編寫，每題標註課綱代碼；家長專區可以看各指標的一次答對率、錯題本與遊玩時間。

## 適合的裝置

平板、筆電、桌機的現代瀏覽器（Chrome、Edge、Safari）。不需要安裝，也不需要帳號；進度存在該裝置的瀏覽器。

## 開發

需要 Node.js 24 以上。以下指令用 PowerShell 7：

```powershell
npm install
npm run dev            # 開發伺服器 http://localhost:5173
npm test               # 單元測試（Vitest）
npm run build          # 型別檢查＋建置到 dist\
npx playwright test    # e2e 測試（會自動在 4183 埠啟動 vite preview；需先 build）
```

長時間的指令建議把輸出留存：

```powershell
npm run build 2>&1 | Tee-Object -FilePath logs\build.log
npx playwright test 2>&1 | Tee-Object -FilePath logs\e2e.log
```

### 資料管線

```powershell
python scripts/build-hanzi-data.py   # 國字筆順資料（台灣筆順驗證），輸出到 public/data/strokes/hanzi/
# 國語三版本生字重抓：見 scripts/editions-zh/README.md
# 預錄語音（AI 合成）：盤點 → 產生 → 抽查，見 docs/plans/voice-clips.md 與 CLAUDE.md 的指令
```

### 注音字型

畫面文字旁的注音來自「LG Bopomofo Round」字型（ButTaiwan 注音粉圓的子集，OFL 1.1）。新增內容出現新字後，重產字型子集：

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install fonttools brotli
.\.venv\Scripts\python scripts\build-font.py
```

## 部署

`npm run build` 產出的 `dist\` 是純靜態網站，可以放到任何靜態主機（Zeabur、GitHub Pages、Netlify 或學校的網頁伺服器）。建置使用相對路徑，放在子路徑底下也能運作。

目前發布在 GitHub Pages：<https://kevintsai1202.github.io/learning-game/>。推到 `main` 後，`.github/workflows/deploy.yml` 會在 GitHub Actions 上建置並自動部署，約幾分鐘後生效。對線上網址跑 e2e：

```powershell
$env:BASE_URL = 'https://kevintsai1202.github.io/learning-game/'   # 結尾的斜線不能省
npx playwright test e2e/smoke.spec.ts e2e/hanzi.spec.ts 2>&1 | Tee-Object -FilePath logs\e2e-pages.log
Remove-Item Env:BASE_URL
```

## 資料來源與授權

詳見遊戲內「家長專區 → 資料來源」與 `src/content/sources.ts`，授權全文在 `public/licenses\`。主要來源：

- 108 課綱（國教署）：題目依學習內容自編
- 國字筆順：animCJK（Arphic Public License），依台灣教育部筆順
- 注音、部首、筆畫：全字庫 CNS11643 開放資料（政府資料開放授權條款）
- 注音字型：ButTaiwan 注音粉圓（SIL OFL 1.1）
- 背景音樂：CC0 素材（見 `public\audio\music\CREDITS.md`）

更多設計決策見 `docs\decisions.md`；自訂題庫格式見 `docs\content-pack.md`。
