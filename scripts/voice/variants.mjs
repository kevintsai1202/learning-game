/**
 * 讀音修正的比較版本：同一句做幾種寫法（不加標記、讀音標記、同音字、加停頓），做成試聽頁讓使用者挑。
 * 挑好之後，把選中的寫法寫進 generate.mjs 的 SYNTH_OVERRIDES（指定句子）或 PRONOUNCE（全部句子），再重跑產生。
 *
 * - 比較清單：data-src/voice/variants.json（[{ key, note, variants: [{ label, text }] }]，text 是送去合成的文字）
 * - 聲音與語速和正式產生相同（Fish 詩涵，中文 0.9）；音檔與試聽頁輸出到 data-src/raw/voice-variants/（不進版控）
 *
 * 用法（PowerShell 7，專案根目錄）：
 *   node --env-file-if-exists=.env scripts/voice/variants.mjs
 *   Start-Process data-src\raw\voice-variants\index.html
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { esc, finish, fishTts, hash, seconds } from './lib.mjs';

const OUT = path.resolve('data-src/raw/voice-variants');
mkdirSync(path.join(OUT, 'raw'), { recursive: true });
const key = process.env.FISH_API_KEY;
if (!key) {
  console.error('找不到 FISH_API_KEY（專案根目錄 .env）');
  process.exit(1);
}
const VOICE = { model: 's2.1-pro-free', voice: '91ec588cf8ef443a9c0d5b21d0c1fa36', speed: 0.9 };
const list = JSON.parse(readFileSync('data-src/voice/variants.json', 'utf8'));

const rows = [];
for (const item of list) {
  const cells = [];
  for (const v of item.variants) {
    const name = `${hash(`${VOICE.model}|${VOICE.voice}|${VOICE.speed}|${v.text}`, 16)}.mp3`;
    const out = path.join(OUT, name);
    if (!existsSync(out)) {
      const raw = path.join(OUT, 'raw', name);
      if (!existsSync(raw)) writeFileSync(raw, await fishTts(key, VOICE.model, VOICE.voice, v.text, VOICE.speed));
      finish(raw, out);
    }
    cells.push({ ...v, file: name, sec: seconds(out) });
    console.log(`${item.key}｜${v.label}：${seconds(out).toFixed(2)} 秒`);
  }
  rows.push({ ...item, cells });
}

const body = rows
  .map(
    (r) => `<h2>${esc(r.key.split('|')[1])}</h2><p class="note">${esc(r.note ?? '')}</p>
<table><tbody>${r.cells
      .map((c, i) => `<tr><td class="n">${i + 1}</td><td>${esc(c.label)}<br><small>${esc(c.text)}</small></td><td><audio controls preload="none" src="${c.file}"></audio><div class="sec">${c.sec.toFixed(2)} 秒</div></td></tr>`)
      .join('')}</tbody></table>`,
  )
  .join('\n');
writeFileSync(
  path.join(OUT, 'index.html'),
  `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>讀音修正比較</title>
<style>body{font-family:system-ui,"Microsoft JhengHei",sans-serif;margin:24px auto;max-width:900px;padding:0 16px;background:#fffaf0;color:#2b2a4c}
h2{margin-top:28px;border-bottom:3px solid #2b2a4c}table{border-collapse:collapse;width:100%}td{border:1px solid #d9d2c3;padding:8px;vertical-align:top}
td.n{width:28px;text-align:center;font-weight:bold}small{color:#3b5b8c;font-family:Consolas,monospace}audio{width:240px;height:34px}.sec{font-size:12px;color:#6b6780}.note{color:#8a4b00}</style>
</head><body><h1>讀音修正比較</h1><p>每句挑一個最自然的版本（告訴我句子和編號）。畫面上顯示的文字不會變，只影響語音。</p>
${body}
</body></html>
`,
);
console.log(`試聽頁：${path.join(OUT, 'index.html')}`);
