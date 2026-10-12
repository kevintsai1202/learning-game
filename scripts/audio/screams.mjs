/**
 * 雲霄飛車的尖叫（docs/plans/grand-rides.md 第 11 節）：用 Fish Audio（遊戲預錄語音同一套，只用官方聲音）
 * 合成「哇啊啊啊～」「呀～～」等幾段，再升高音調像孩子的聲音，給使用者試聽挑選。
 * 官方的台灣聲音只有詩涵（女）與承翰（男），沒有童聲，所以用 ffmpeg 的 rubberband 升調（不改速度）。
 * 每段做「有情緒標記」與「沒有」兩種寫法（Fish 對標記的反應依聲音而不同）。S2 系列的標記是方括號（[screaming]），
 * 而且可以寫自然語言；圓括號是舊版 S1 的寫法，S2 會把它直接唸出來（2026-10-13 試過）。
 * 產生：data-src/raw/audio/screams/<編號>.mp3（不進版控）與一個串起來的試聽檔 preview.mp3（每段中間停 0.8 秒），
 * 編號與文字列在 candidates.json。選用的段落由 scripts/audio/build-ride-sfx.mjs 做成 public/audio/sfx/rides/yell-*.mp3。
 * 用法（PowerShell 7，金鑰在 .env 的 FISH_API_KEY）：node --env-file-if-exists=.env scripts/audio/screams.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fishTts, ffmpeg } from '../voice/lib.mjs';

const KEY = process.env.FISH_API_KEY;
if (!KEY) {
  console.error('找不到 FISH_API_KEY（專案根目錄 .env）');
  process.exit(1);
}
const OUT = 'data-src/raw/audio/screams';
mkdirSync(OUT, { recursive: true });

/** 官方的台灣聲音 */
const VOICES = [
  { id: 'shihan', ref: '91ec588cf8ef443a9c0d5b21d0c1fa36', pitch: 1.3 },
  { id: 'chenghan', ref: '1e85fd1e0d3e4cc2b79fbca800e7e3fe', pitch: 1.55 },
];
/** 要合成的句子（tag 是 Fish 的情緒標記） */
const LINES = [
  { id: 'wa', text: '哇啊啊啊啊——！', tag: '[a child screaming with joy on a roller coaster]' },
  { id: 'ya', text: '呀啊啊啊——！', tag: '[screaming]' },
  { id: 'ah', text: '啊啊啊啊啊——！', tag: '[screaming excitedly]' },
  { id: 'high', text: '哇——好高喔！', tag: '[excited][shouting]' },
  { id: 'fun', text: '耶——！好好玩！', tag: '[excited]' },
];

const list = [];
for (const v of VOICES) {
  for (const line of LINES) {
    for (const tagged of [true, false]) {
      const name = `${String(list.length + 1).padStart(2, '0')}-${v.id}-${line.id}${tagged ? '-tag' : ''}`;
      const raw = `${OUT}/${name}.raw.mp3`;
      const mp3 = await fishTts(KEY, 's2.1-pro-free', v.ref, `${tagged ? line.tag : ''}${line.text}`, 1.0);
      writeFileSync(raw, mp3);
      // 去頭尾靜音、升調（rubberband 只改音高不改速度）、響度一致
      ffmpeg([
        '-i', raw,
        '-af', `silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,rubberband=pitch=${v.pitch},loudnorm=I=-16:TP=-1.5`,
        '-ar', '44100', '-ac', '1', '-b:a', '128k', `${OUT}/${name}.mp3`,
      ]);
      list.push({ n: list.length + 1, file: `${name}.mp3`, voice: v.id, text: line.text, tag: tagged ? line.tag : '' });
      console.log(`${list.length}. ${name}：${tagged ? line.tag : ''}${line.text}`);
    }
  }
}
writeFileSync(`${OUT}/candidates.json`, JSON.stringify(list, null, 2));

// 串起來的試聽檔：每段中間停 0.8 秒
const inputs = list.flatMap((c) => ['-i', `${OUT}/${c.file}`]);
const parts = list.map((_, i) => `[${i}:a]apad=pad_dur=0.8[a${i}]`).join(';');
const concat = `${parts};${list.map((_, i) => `[a${i}]`).join('')}concat=n=${list.length}:v=0:a=1[out]`;
ffmpeg([...inputs, '-filter_complex', concat, '-map', '[out]', '-ar', '44100', '-ac', '1', '-b:a', '128k', `${OUT}/preview.mp3`]);
console.log(`試聽檔：${OUT}/preview.mp3（${list.length} 段）`);
