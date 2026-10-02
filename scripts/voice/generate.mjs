/**
 * 產生遊戲用的預錄語音（A 期）：讀 data-src/voice/inventory.json（collect.test.ts 產生），
 * 輸出 public/audio/voice/<雜湊>.mp3 與 public/audio/voice/manifest.json（執行端 src/audio/clipPlayer.ts 讀取）。
 *
 * 聲音（2026-10-02 使用者試聽後決定，見 docs/plans/voice-clips.md 第 8 節）：
 * - 中文：Fish Audio 詩涵 Shihan（Fish Official 公開聲音），模型 s2.1-pro-free，語速 0.9
 * - 英文：同一個聲音，語速 0.85
 * - 37 個注音符號：Azure 曉臻 zh-TW-HsiaoChenNeural，直接給符號，語速 0.7，結尾補 0.25 秒停頓再接指示句
 *
 * 規則：
 * - 檔名是「引擎｜模型｜聲音｜語速｜語言｜合成文字」的雜湊；內容沒變就不重做，改稿或換聲音才產生新檔。
 * - 原始回傳音檔留在 data-src/raw/voice-gen/（不進版控），調整後製時不必重新呼叫 API。
 * - 對照表的語言沿用執行端的鍵（例如英語題的中文題目鍵是 en-US），但合成時依內容判斷：含中文就用中文語速。
 * - 中文句子裡的緊急與服務電話（110、119、1999…）以及只有數字的短句改成逐字國字（一一零）再合成，避免唸成「一百一十」。
 * - Fish 同時 3 個請求（免費帳戶上限 5）；Azure F0 每 60 秒最多 20 次請求，所以注音一個一個做、間隔 3.2 秒。
 * - 完整執行（沒有 --limit）時刪除對照表沒用到的舊音檔。
 *
 * 用法（PowerShell 7，專案根目錄；金鑰在 .env）：
 *   node --env-file-if-exists=.env scripts/voice/generate.mjs --limit 20   # 先做少量，驗證整條流程
 *   node --env-file-if-exists=.env scripts/voice/generate.mjs --match "太厲害|再想想"   # 只做鍵符合的句子
 *   node --env-file-if-exists=.env scripts/voice/generate.mjs 2>&1 | Tee-Object -FilePath logs\voice-generate.log
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { azureTts, esc, finish, fishTts, hash, pool, seconds, sleep } from './lib.mjs';

const INVENTORY = path.resolve('data-src/voice/inventory.json');
const OUT = path.resolve('public/audio/voice');
const RAW = path.resolve('data-src/raw/voice-gen');
mkdirSync(OUT, { recursive: true });
mkdirSync(RAW, { recursive: true });

const SHIHAN = '91ec588cf8ef443a9c0d5b21d0c1fa36';
/** 各類句子用的聲音（索引寫進對照表的 v 欄位） */
const VOICES = [
  { id: 'fish-shihan-zh', engine: 'fish', model: 's2.1-pro-free', voice: SHIHAN, speed: 0.9 },
  { id: 'fish-shihan-en', engine: 'fish', model: 's2.1-pro-free', voice: SHIHAN, speed: 0.85 },
  { id: 'azure-hsiaochen-zhuyin', engine: 'azure', model: 'neural', voice: 'zh-TW-HsiaoChenNeural', speed: 0.7, tailPad: 0.25 },
];

const args = process.argv.slice(2);
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : 0;
/** --match <正規式>：只產生鍵符合的句子（驗證特定句子用，不刪舊檔） */
const match = args.includes('--match') ? new RegExp(args[args.indexOf('--match') + 1]) : null;
const env = { fish: process.env.FISH_API_KEY ?? '', azureKey: process.env.AZURE_SPEECH_KEY ?? '', azureRegion: process.env.AZURE_SPEECH_REGION ?? '' };

const CJK = /[一-鿿]/;
const DIGIT_ZH = '零一二三四五六七八九';

/** 這一句用哪個聲音：注音符號用 Azure；含中文一律用中文語速（即使鍵是 en-US） */
function voiceIndex(item) {
  if (item.voice === 'zhuyin') return 2;
  if (CJK.test(item.text)) return 0;
  return item.voice === 'en' ? 1 : 0;
}

/** 緊急與服務電話：在台灣習慣逐字唸（一一九），不唸成一百一十九 */
const PHONE = /(?<!\d)(110|119|113|165|1999|1925|1957|1966|1995)(?!\d)/g;
/** 數字逐字轉國字（110 → 一一零） */
const digitsZh = (s) => [...s].map((d) => DIGIT_ZH[Number(d)]).join('');

/** 1～99 轉國字（序數用：2 → 二，不是兩） */
function numberZh(n) {
  if (n <= 10) return n === 10 ? '十' : DIGIT_ZH[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${tens === 1 ? '' : DIGIT_ZH[tens]}十${ones ? DIGIT_ZH[ones] : ''}`;
}

/**
 * 實際送去合成的文字（中文句子）：
 * - 序數「第 N」改成國字：Whisper 抽查發現「第 2 課」會被唸成「第兩課」
 * - 緊急與服務電話、只有數字的短句（電話選項 123、000）改成逐字國字
 */
function synthText(item) {
  if (item.lang !== 'zh-TW') return item.text;
  if (/^\d{2,4}$/.test(item.text)) return digitsZh(item.text);
  return item.text.replace(/第\s*(\d{1,2})(?!\d)\s*/g, (_, n) => `第${numberZh(Number(n))}`).replace(PHONE, (m) => digitsZh(m));
}

/** --limit 時挑一小批涵蓋各類的句子：先挑介面句子，再輪流挑中文、英文、注音 */
function pickSample(items, n) {
  const ui = items.filter((it) => it.sources.some((s) => s.startsWith('ui:')));
  const by = (k) => items.filter((it) => voiceIndex(it) === k && !ui.includes(it));
  const groups = [ui.slice(0, Math.ceil(n / 2)), by(0), by(1), by(2)];
  const out = [];
  for (let i = 0; out.length < n && i < n; i++) for (const g of groups) if (g[i] && out.length < n && !out.includes(g[i])) out.push(g[i]);
  return out;
}

const inventory = JSON.parse(readFileSync(INVENTORY, 'utf8'));
const items = match ? inventory.items.filter((it) => match.test(it.key)) : limit ? pickSample(inventory.items, limit) : inventory.items;
const partial = Boolean(limit || match);
const oldManifest = existsSync(path.join(OUT, 'manifest.json')) ? JSON.parse(readFileSync(path.join(OUT, 'manifest.json'), 'utf8')) : { clips: {} };

/** 產生（或沿用）一句的音檔；回傳檔名，失敗時丟出錯誤 */
async function makeClip(item) {
  const vi = voiceIndex(item);
  const v = VOICES[vi];
  const text = synthText(item);
  const name = `${hash(`${v.engine}|${v.model}|${v.voice}|${v.speed}|${item.lang}|${text}`, 16)}.mp3`;
  const out = path.join(OUT, name);
  if (!existsSync(out)) {
    const raw = path.join(RAW, name);
    if (!existsSync(raw)) {
      if (v.engine === 'fish') {
        if (!env.fish) throw new Error('缺 FISH_API_KEY');
        writeFileSync(raw, await fishTts(env.fish, v.model, v.voice, text, v.speed));
      } else {
        if (!env.azureKey || !env.azureRegion) throw new Error('缺 AZURE_SPEECH_KEY／AZURE_SPEECH_REGION');
        writeFileSync(raw, await azureTts({ key: env.azureKey, region: env.azureRegion }, v.voice, 'zh-TW', esc(text), v.speed));
        await sleep(3200);
      }
    }
    finish(raw, out, { tailPad: v.tailPad ?? 0 });
  }
  return { f: name, v: vi };
}

const clips = partial ? { ...oldManifest.clips } : {};
const failures = [];
let done = 0;
const t0 = Date.now();
/** 進度：每 50 句印一次，含預估剩餘時間 */
const progress = () => {
  done++;
  if (done % 50 === 0 || done === items.length) {
    const sec = (Date.now() - t0) / 1000;
    const eta = Math.round((sec / done) * (items.length - done));
    console.log(`進度 ${done}／${items.length}（失敗 ${failures.length}），已用 ${Math.round(sec)} 秒，預估還要 ${eta} 秒`);
  }
};
const work = async (item) => {
  try {
    clips[item.key] = await makeClip(item);
  } catch (e) {
    failures.push({ key: item.key, error: e.message });
    console.log(`失敗：${item.key}：${e.message}`);
  }
  progress();
};
// Fish 並行 3 個；Azure（注音）另外依序處理，避免超過每分鐘請求上限
await Promise.all([pool(items.filter((it) => voiceIndex(it) !== 2), 3, work), pool(items.filter((it) => voiceIndex(it) === 2), 1, work)]);

const manifest = { version: 1, generated: new Date().toISOString(), voices: VOICES.map(({ tailPad, ...v }) => v), clips };
writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest) + '\n');

// 完整執行時刪掉對照表沒用到的舊音檔
let removed = 0;
if (!partial) {
  const used = new Set(Object.values(clips).map((c) => c.f));
  for (const f of readdirSync(OUT)) {
    if (f.endsWith('.mp3') && !used.has(f)) {
      unlinkSync(path.join(OUT, f));
      removed++;
    }
  }
}
const files = readdirSync(OUT).filter((f) => f.endsWith('.mp3'));
const total = files.reduce((n, f) => n + seconds(path.join(OUT, f)), 0);
console.log(`完成：對照表 ${Object.keys(clips).length} 句、音檔 ${files.length} 個（總長 ${Math.round(total)} 秒），刪除舊檔 ${removed} 個，失敗 ${failures.length} 句`);
if (failures.length) {
  writeFileSync(path.join(RAW, 'failures.json'), JSON.stringify(failures, null, 1));
  process.exitCode = 1;
}
