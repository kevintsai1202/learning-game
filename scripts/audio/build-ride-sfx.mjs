/**
 * 班級島大型設施的音效檔（docs/plans/grand-rides.md 第 11 節）：把挑好的真實錄音（Freesound，作者標為 CC0；
 * scripts/audio/freesound.mjs 下載到 data-src/raw/audio/）與使用者聽過同意的語音合成喊聲
 * （scripts/audio/screams.mjs，data-src/raw/audio/screams/）剪段、做成可以無縫循環的段落、統一響度，
 * 存成 public/audio/sfx/rides/<名稱>.mp3（單聲道 44.1 kHz、96 kbps），並產生同資料夾的 CREDITS.md（作者、原頁、授權、處理方式）。
 * 循環的接縫：多剪 xf 秒，把尾巴交叉淡化疊到開頭，最後一個取樣接回第一個取樣時聲音連續。
 * 用法（PowerShell 7）：node scripts/audio/build-ride-sfx.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RAW = 'data-src/raw/audio';
const TTS = 'data-src/raw/audio/screams';
const OUT = 'public/audio/sfx/rides';
const SR = 44100;

/**
 * 每個音效：名稱、來源（Freesound 編號或語音合成檔）、從第幾秒開始、多長、要不要循環、響度目標（LUFS）、用途。
 * 響度：循環的環境聲比較小（遊戲裡再依距離與速度調），一次的音效比較大
 */
const SFX = [
  { out: 'coaster-chain', fs: '171510', start: 2.0, dur: 12.0, loop: true, lufs: -20, use: '雲霄飛車爬坡的鏈條喀喀聲（循環）' },
  { out: 'coaster-roll', fs: '538758', start: 0.2, dur: 4.4, loop: true, lufs: -19, use: '雲霄飛車在軌道上跑的滾動聲（循環，越快越大聲）' },
  { out: 'coaster-wind', fs: '344887', start: 2.0, dur: 14.0, loop: true, lufs: -21, use: '雲霄飛車高速時的風聲（循環）' },
  { out: 'coaster-brake', fs: '457294', start: 0.0, dur: 3.6, lufs: -18, use: '雲霄飛車進站的煞車' },
  // 尖叫：只用逐秒聽寫都聽不出字的段落（675892 整段都在用英文喊「Oh my God」「Hold on」，不用；675529 第 45 秒有人講話，避開）
  { out: 'coaster-pass', fs: '675529', start: 49.5, dur: 9.5, lufs: -19, use: '站在島上聽列車經過（含車上孩子的尖叫）' },
  { out: 'scream-1', fs: '580724', start: 12.0, dur: 5.0, lufs: -17, use: '雲霄飛車上大家的尖叫（俯衝、迴圈；含設施聲）' },
  // 580724 的其他段落聽寫出英文髒話或「Oh my God」（可能是聽錯，兒童遊戲寧可不用）
  { out: 'scream-2', fs: '235592', start: 0.0, dur: 2.5, lufs: -17, use: '女孩的尖叫「啊——」' },
  { out: 'scream-3', fs: '235591', start: 0.0, dur: 3.4, lufs: -17, use: '女孩的尖叫「啊！」' },
  { out: 'scream-4', fs: '421832', start: 0.0, dur: 4.3, lufs: -17, use: '長長的尖叫「啊——」' },
  { out: 'bell', fs: '497561', start: 0.0, dur: 2.4, lufs: -18, use: '出發鈴（雲霄飛車、飛船、摩天輪上車）' },
  { out: 'wheel-wind', fs: '135193', start: 10.0, dur: 24.0, loop: true, lufs: -22, use: '摩天輪高空的風（循環，越高越大）' },
  { out: 'ship-propeller', fs: '515293', start: 5.0, dur: 16.0, loop: true, lufs: -21, use: '飛船的螺旋槳（循環）' },
  { out: 'ship-burner', fs: '778358', start: 0.3, dur: 6.0, lufs: -18, use: '飛船的熱氣球噴火（飛行中隔一陣子一次）' },
  { out: 'ship-horn', fs: '441223', start: 2.3, dur: 5.4, lufs: -17, use: '飛船起飛與降落的汽笛' },
  { out: 'sea-waves', fs: '463250', start: 30.0, dur: 30.0, loop: true, lufs: -23, use: '海浪（循環；在飛船上與海邊）' },
  { out: 'seagull-1', fs: '166703', start: 0.0, dur: 7.0, lufs: -21, use: '海鷗（偶爾）' },
  { out: 'seagull-2', fs: '510917', start: 3.5, dur: 8.0, lufs: -21, use: '海鷗（偶爾）' },
  // 語音合成（Fish Audio 官方聲音「詩涵」「承翰」升調），使用者 2026-10-13 試聽後同意第 6～10 段
  { out: 'yell-ya', tts: '14-chenghan-ya.mp3', lufs: -17, use: '孩子的喊聲「呀啊啊——」（語音合成）' },
  { out: 'yell-high-1', tts: '07-shihan-high-tag.mp3', lufs: -17, use: '「哇——好高喔！」（語音合成；爬到最高、摩天輪頂端）' },
  { out: 'yell-high-2', tts: '17-chenghan-high-tag.mp3', lufs: -17, use: '「哇——好高喔！」（語音合成）' },
  { out: 'yell-fun-1', tts: '09-shihan-fun-tag.mp3', lufs: -17, use: '「耶——！好好玩！」（語音合成；下車時）' },
  { out: 'yell-fun-2', tts: '19-chenghan-fun-tag.mp3', lufs: -17, use: '「耶——！好好玩！」（語音合成）' },
];

/** 循環接縫交叉淡化的長度（秒） */
const XF = 0.6;

/** ffmpeg 解碼一段成單聲道 32 位元浮點 PCM */
function decode(file, start, dur) {
  const args = ['-v', 'error', ...(start !== undefined ? ['-ss', String(start)] : []), '-i', file, ...(dur !== undefined ? ['-t', String(dur)] : []), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'];
  const r = spawnSync('ffmpeg', args, { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`解碼失敗 ${file}：${r.stderr}`);
  const b = r.stdout;
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

/** 浮點 PCM 經 ffmpeg 統一響度、淡入淡出後編成 MP3 */
function encode(pcm, out, lufs, fades) {
  const tmp = `${RAW}/_tmp.f32`;
  writeFileSync(tmp, Buffer.from(pcm.buffer));
  const dur = pcm.length / SR;
  const af = [`loudnorm=I=${lufs}:TP=-2:LRA=15`, `aresample=${SR}`];
  if (fades) af.push('afade=t=in:d=0.02', `afade=t=out:st=${Math.max(0, dur - 0.25).toFixed(3)}:d=0.25`);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', tmp, '-af', af.join(','), '-ac', '1', '-ar', String(SR), '-c:a', 'libmp3lame', '-b:a', '96k', '-map_metadata', '-1', out]);
  if (r.status !== 0) throw new Error(`編碼失敗 ${out}：${r.stderr}`);
}

mkdirSync(OUT, { recursive: true });
const meta = JSON.parse(readFileSync('data-src/audio/sources.json', 'utf8'));
for (const s of SFX) {
  let pcm;
  if (s.tts) pcm = decode(`${TTS}/${s.tts}`);
  else if (s.loop) {
    // 多剪 XF 秒：尾巴交叉淡化疊到開頭
    const seg = decode(`${RAW}/fs-${s.fs}.mp3`, s.start, s.dur + XF);
    const n = Math.round(s.dur * SR);
    const x = Math.round(XF * SR);
    pcm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      if (i < x) {
        const k = i / x;
        pcm[i] = seg[i] * Math.sqrt(k) + (seg[n + i] ?? 0) * Math.sqrt(1 - k);
      } else pcm[i] = seg[i];
    }
  } else pcm = decode(`${RAW}/fs-${s.fs}.mp3`, s.start, s.dur);
  encode(pcm, `${OUT}/${s.out}.mp3`, s.lufs, !s.loop);
  console.log(`${s.out}.mp3　${(pcm.length / SR).toFixed(2)} 秒${s.loop ? '（循環）' : ''}`);
}

// 授權與來源（CREDITS.md）
const lines = [
  '# 班級島大型設施的音效：授權與來源（CREDITS）',
  '',
  '由 `scripts/audio/build-ride-sfx.mjs` 產生（docs/plans/grand-rides.md 第 11 節）。使用者要求「聲音要自然，不要電子罐頭音」，所以設施的聲音都是真實錄音。',
  '',
  '- **真實錄音**：來自 Freesound.org，作者在作品頁把授權標為 **CC0 1.0（公眾領域貢獻宣告）**。下載時以程式逐頁讀取作品頁的授權欄（`scripts/audio/freesound.mjs`），只接受「只有 CC0 一項」的作品；查證日期記在下表。CC0 不要求署名，這裡仍列出作者與原頁，以示尊重、方便查證。CC0 1.0 說明：https://creativecommons.org/publicdomain/zero/1.0/',
  '- **孩子的喊聲**：Fish Audio 語音合成（官方聲音「詩涵」「承翰」，和遊戲的預錄語音同一個服務與帳號），再以 ffmpeg rubberband 升調；使用者 2026-10-13 試聽後同意使用。',
  '- 共同處理：剪段、轉單聲道 44.1 kHz、`loudnorm` 統一響度、一次的音效加淡入淡出、循環的音效把尾巴 0.6 秒交叉淡化疊到開頭（無縫循環），以 libmp3lame 96 kbps 編碼並移除中繼資料。',
  '',
  '| 成品檔 | 用途 | 來源 | 作者 | 授權 | 剪的段落 | 查證日期 |',
  '| --- | --- | --- | --- | --- | --- | --- |',
];
for (const s of SFX) {
  if (s.tts) {
    lines.push(`| \`${s.out}.mp3\` | ${s.use} | Fish Audio 語音合成（${s.tts}） | — | 本專案產生 | 全段 | 2026-10-13 |`);
    continue;
  }
  const m = meta[s.fs];
  lines.push(`| \`${s.out}.mp3\` | ${s.use} | [${m.title.replace(/\|/g, '／')}](${m.page}) | ${m.author} | ${m.license} | ${s.start}～${(s.start + s.dur).toFixed(1)} 秒 | ${m.checked} |`);
}
writeFileSync(`${OUT}/CREDITS.md`, `${lines.join('\n')}\n`);
console.log(`授權與來源：${OUT}/CREDITS.md`);
