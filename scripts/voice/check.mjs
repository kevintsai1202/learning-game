/**
 * 預錄語音聽寫抽查：把音檔送 Groq Whisper 聽寫，和原句比對相似度，列出可能唸錯或漏字的句子。
 *
 * - 範圍：介面固定句子全部、題目句子依雜湊抽 15%（固定抽樣，重跑結果相同）；注音符號不查（Whisper 無法判斷單一注音）。
 * - 相似度：只比漢字與英數字（英文轉小寫），用最長共同子序列算 0～1；低於 0.85 列入清單。
 *   多半是同音字（Whisper 聽寫的字不同但讀音相同），要人工試聽才算數。
 * - 中文送 language=zh，並用「繁體中文」當提示詞（不放原句，免得 Whisper 照抄）；英文送 language=en。
 * - Groq 免費額度每分鐘約 20 次：429 依 Retry-After 等待；Groq 前面有 Cloudflare，一定要自訂 User-Agent，否則回 403。
 * - 已聽寫過的音檔記在 data-src/raw/voice-check/heard.json（以音檔檔名為鍵：句子沒變但重新產生過，也會重新聽寫），重跑時不再送出。
 *
 * 輸出：data-src/raw/voice-check/report.json 與試聽頁 index.html（不進版控）。
 * 用法（PowerShell 7，專案根目錄；金鑰在 .env 的 GROQ_API_KEY）：
 *   node --env-file-if-exists=.env scripts/voice/check.mjs 2>&1 | Tee-Object -FilePath logs\voice-check.log
 *   Start-Process data-src\raw\voice-check\index.html
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { esc, hash, sleep } from './lib.mjs';

const OUT = path.resolve('data-src/raw/voice-check');
mkdirSync(OUT, { recursive: true });
const HEARD = path.join(OUT, 'heard.json');
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error('找不到 GROQ_API_KEY（專案根目錄 .env）');
  process.exit(1);
}
const model = process.env.GROQ_ASR_MODEL || 'whisper-large-v3-turbo';

const inventory = JSON.parse(readFileSync('data-src/voice/inventory.json', 'utf8'));
const manifest = JSON.parse(readFileSync('public/audio/voice/manifest.json', 'utf8'));
const heard = existsSync(HEARD) ? JSON.parse(readFileSync(HEARD, 'utf8')) : {};

const CJK = /[一-鿿]/;
const DIGIT_ZH = '零一二三四五六七八九';
/** 比對用：數字換成國字、只留漢字與英數（小寫） */
const norm = (s) => s.toLowerCase().replace(/\d/g, (d) => DIGIT_ZH[Number(d)]).replace(/[^一-鿿a-z]/g, '');

/** 相似度：2 × 最長共同子序列 ÷ 兩邊長度和 */
function similarity(a, b) {
  if (!a && !b) return 1;
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[a.length][b.length]) / (a.length + b.length);
}

/** 送 Groq Whisper 聽寫一個 mp3 */
async function transcribe(file, zh) {
  const form = new FormData();
  form.append('file', new Blob([readFileSync(file)], { type: 'audio/mpeg' }), path.basename(file));
  form.append('model', model);
  form.append('language', zh ? 'zh' : 'en');
  form.append('response_format', 'json');
  if (zh) form.append('prompt', '以下是繁體中文的句子。');
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'learning-island-voice-check/1.0' },
      body: form,
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after')) || 10;
      await sleep(Math.min(60, wait + 0.5) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Groq HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).text ?? '';
  }
  throw new Error('Groq 一直回 429');
}

// 抽查清單：介面句子全部、題目句子固定抽 15%，注音不查
const targets = inventory.items.filter((it) => {
  if (it.voice === 'zhuyin' || !manifest.clips[it.key]) return false;
  if (it.sources.some((s) => s.startsWith('ui:'))) return true;
  return parseInt(hash(it.key, 8), 16) % 100 < 15;
});
console.log(`抽查 ${targets.length} 句（已聽寫過 ${targets.filter((t) => heard[manifest.clips[t.key].f] !== undefined).length} 句）`);

const results = [];
let n = 0;
for (const it of targets) {
  const clip = manifest.clips[it.key];
  const file = path.resolve('public/audio/voice', clip.f);
  const zh = CJK.test(it.text) || it.lang === 'zh-TW';
  if (heard[clip.f] === undefined) {
    try {
      heard[clip.f] = await transcribe(file, zh);
    } catch (e) {
      console.log(`失敗：${it.key}：${e.message}`);
      continue;
    }
    if (++n % 20 === 0) {
      writeFileSync(HEARD, JSON.stringify(heard, null, 1));
      console.log(`已聽寫 ${n} 句`);
    }
  }
  const ratio = similarity(norm(it.text), norm(heard[clip.f]));
  results.push({ key: it.key, text: it.text, heard: heard[clip.f], ratio: Math.round(ratio * 1000) / 1000, file: clip.f, sources: it.sources });
}
writeFileSync(HEARD, JSON.stringify(heard, null, 1));

const low = results.filter((r) => r.ratio < 0.85).sort((a, b) => a.ratio - b.ratio);
writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ checked: results.length, low: low.length, results }, null, 1));
const rows = low
  .map((r) => `<tr><td>${r.ratio.toFixed(2)}</td><td>${esc(r.text)}</td><td>${esc(r.heard)}</td><td><audio controls preload="none" src="../../../public/audio/voice/${r.file}"></audio></td><td><small>${esc(r.sources.join('、'))}</small></td></tr>`)
  .join('\n');
writeFileSync(
  path.join(OUT, 'index.html'),
  `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>預錄語音抽查</title>
<style>body{font-family:system-ui,"Microsoft JhengHei",sans-serif;margin:24px;background:#fffaf0;color:#2b2a4c}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d9d2c3;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f1e9d8}audio{width:220px;height:34px}small{color:#6b6780}</style>
</head><body><h1>預錄語音抽查（相似度低於 0.85）</h1>
<p>抽查 ${results.length} 句，其中 ${low.length} 句需要試聽。多半是同音字（聽寫的字不同但讀音相同），請試聽確認是不是真的唸錯或漏字。</p>
<table><thead><tr><th>相似度</th><th>原句</th><th>Whisper 聽到</th><th>試聽</th><th>出處</th></tr></thead><tbody>
${rows}
</tbody></table></body></html>
`,
);
console.log(`完成：抽查 ${results.length} 句，相似度低於 0.85 的有 ${low.length} 句（試聽頁 ${path.join(OUT, 'index.html')}）`);
