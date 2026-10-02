/**
 * 把比較頁（variants.mjs）裡使用者核可的版本，設成遊戲用的正式音檔。
 * 語音合成每次結果都不同：同一段文字重新合成，可能又出現使用者聽到的問題。所以核可的那一份要直接沿用，不重新合成。
 *
 * 做法：先確認 rules.mjs 對這一句算出來的合成文字，和核可版本的文字完全相同（規則要先改好）；
 * 再把比較頁的原始音檔複製成 data-src/raw/voice-gen/<正式檔名>，並刪掉 public/audio/voice/ 的舊檔，
 * 之後跑 generate.mjs 就會用這份原始檔重新後製，不呼叫 API。
 *
 * 用法（PowerShell 7，專案根目錄）：
 *   node scripts/voice/adopt.mjs "zh-TW|雨靴" 2 "en-US|「雨」用英文怎麼說？" 4
 *   node --env-file-if-exists=.env scripts/voice/generate.mjs
 * 編號是比較頁上每句的版本編號（從 1 開始），對應 data-src/voice/variants.json。
 */
import { copyFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { hash } from './lib.mjs';
import { VOICES, clipName, synthText, voiceIndex } from './rules.mjs';

const args = process.argv.slice(2);
if (!args.length || args.length % 2) {
  console.error('用法：node scripts/voice/adopt.mjs "<鍵>" <版本編號> ["<鍵>" <版本編號> ...]');
  process.exit(1);
}
const inventory = new Map(JSON.parse(readFileSync('data-src/voice/inventory.json', 'utf8')).items.map((it) => [it.key, it]));
const variants = new Map(JSON.parse(readFileSync('data-src/voice/variants.json', 'utf8')).map((v) => [v.key, v]));

let failed = 0;
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const n = Number(args[i + 1]);
  const item = inventory.get(key);
  const group = variants.get(key);
  const variant = group?.variants[n - 1];
  if (!item || !variant) {
    console.error(`找不到：${key} 第 ${n} 個版本（鍵要和 inventory.json、variants.json 相同）`);
    failed++;
    continue;
  }
  const synth = synthText(item);
  if (synth !== variant.text) {
    console.error(`規則還沒改成這個寫法：${key}\n  規則算出：${synth}\n  核可版本：${variant.text}`);
    failed++;
    continue;
  }
  // 比較頁用的是中文聲音（詩涵、語速 0.9），要和正式產生用的聲音相同
  const v = VOICES[voiceIndex(item)];
  const src = path.resolve('data-src/raw/voice-variants/raw', `${hash(`${v.model}|${v.voice}|${v.speed}|${variant.text}`, 16)}.mp3`);
  if (v.engine !== 'fish' || !existsSync(src)) {
    console.error(`找不到比較頁的原始音檔（聲音或語速不同，或還沒跑 variants.mjs）：${key}`);
    failed++;
    continue;
  }
  const name = clipName(item);
  copyFileSync(src, path.resolve('data-src/raw/voice-gen', name));
  const out = path.resolve('public/audio/voice', name);
  if (existsSync(out)) unlinkSync(out);
  console.log(`沿用：${key} ← 第 ${n} 個版本（${variant.label}）`);
}
if (failed) process.exitCode = 1;
else console.log('接著執行：node --env-file-if-exists=.env scripts/voice/generate.mjs');
