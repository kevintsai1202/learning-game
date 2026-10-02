/**
 * 預錄語音長度檢查（不花 API 額度）：比對每個音檔的長度和句子的音節數，找出長度異常的音檔。
 * 語音合成偶爾會亂唸一長串（例如句子裡留著數字鍵帽的組合字元 U+20E3，曾產生 50 秒的音檔）或漏唸一大段。
 *
 * - 音節數：漢字一個算一個、英文單字一個算 1.5、數字一位算一個；注音符號不查。
 * - 每音節秒數超過中位數 2.5 倍（而且超過 1.5 秒）列為「可能多唸」，低於 0.35 倍列為「可能漏唸」。
 *
 * 用法（PowerShell 7，專案根目錄）：node scripts/voice/check-durations.mjs
 * 輸出：data-src/raw/voice-check/duration-outliers.json（不進版控）；有異常時結束代碼為 1。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { seconds } from './lib.mjs';

const inventory = new Map(JSON.parse(readFileSync('data-src/voice/inventory.json', 'utf8')).items.map((it) => [it.key, it]));
const manifest = JSON.parse(readFileSync('public/audio/voice/manifest.json', 'utf8'));

const rows = [];
for (const [key, clip] of Object.entries(manifest.clips)) {
  const it = inventory.get(key);
  if (!it || it.voice === 'zhuyin') continue;
  const t = it.text;
  const units = (t.match(/[一-鿿]/g) ?? []).length + 1.5 * (t.match(/[A-Za-z]+/g) ?? []).length + (t.match(/\d/g) ?? []).length;
  if (units < 1) continue;
  const sec = seconds(path.resolve('public/audio/voice', clip.f));
  rows.push({ key, sec, units, rate: sec / units, file: clip.f });
}
const sorted = rows.map((r) => r.rate).sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
const slow = rows.filter((r) => r.rate > median * 2.5 && r.sec > 1.5).sort((a, b) => b.rate - a.rate);
const fast = rows.filter((r) => r.rate < median * 0.35).sort((a, b) => a.rate - b.rate);

mkdirSync('data-src/raw/voice-check', { recursive: true });
writeFileSync('data-src/raw/voice-check/duration-outliers.json', JSON.stringify({ median, slow, fast }, null, 1));
console.log(`檢查 ${rows.length} 句，每音節中位 ${median.toFixed(3)} 秒`);
console.log(`可能多唸 ${slow.length} 句、可能漏唸 ${fast.length} 句`);
for (const r of [...slow, ...fast].slice(0, 20)) console.log(`  ${r.sec.toFixed(2)} 秒／${r.units} 音節  ${r.key}`);
if (slow.length || fast.length) process.exitCode = 1;
