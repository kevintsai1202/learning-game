/**
 * 介紹影片的剪接：把錄好的鏡頭（video-out/frames/<鏡頭>/，scripts/video/grand-rides.video.ts）照順序接起來，
 * 加上標題字卡（微軟正黑體粗體、白字粉紅邊、淡入淡出）與配樂（video-out/music.wav，scripts/video/music.mjs），
 * 再照錄影時每一格記下的音效排程（<鏡頭>/cues.json，遊戲的 src/store/rideSound.ts 算的）把設施的真實錄音
 * （public/audio/sfx/rides/）混成音效軌（video-out/sfx.wav），和配樂混在一起（配樂壓低一點，最後限幅），
 * 輸出 video-out/grand-rides.mp4（1280×720、每秒 31.25 格（一格 32 毫秒，錄影腳本的說明）、H.264＋AAC）。
 * 鏡頭長度照配樂的小節錄的（一小節 1.792 秒＝56 格），直接接起來就對拍。
 * 用法（PowerShell 7）：node scripts/video/edit.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const FRAMES = 'video-out/frames';
const SEQ = 'video-out/seq';
const OUT = 'video-out/grand-rides.mp4';
const FPS = 31.25;

/** 鏡頭的順序（資料夾名稱照錄影腳本） */
const shots = readdirSync(FRAMES)
  .filter((d) => /^\d\d-/.test(d))
  .sort();

/** 每個鏡頭從第幾秒開始（字卡對時間用） */
const startOf = {};
rmSync(SEQ, { recursive: true, force: true });
mkdirSync(SEQ, { recursive: true });
let n = 0;
for (const s of shots) {
  startOf[s] = n / FPS;
  for (const f of readdirSync(`${FRAMES}/${s}`).filter((x) => x.endsWith(".jpg")).sort()) copyFileSync(`${FRAMES}/${s}/${f}`, `${SEQ}/${String(n++).padStart(5, '0')}.jpg`);
}
const total = n / FPS;
console.log(`${shots.length} 個鏡頭、${n} 格、${total.toFixed(2)} 秒`);

/** 某個鏡頭的開始秒數（找不到丟錯，避免字卡默默不見） */
function at(prefix) {
  const s = shots.find((x) => x.startsWith(prefix));
  if (!s) throw new Error(`找不到鏡頭 ${prefix}`);
  return startOf[s];
}

/** 標題字卡：文字、開始與結束秒數、字的大小、垂直位置（畫面高度的比例） */
const titles = [
  { text: '知識島大冒險', a: 0.5, b: 6.7, size: 96, y: 0.14 },
  { text: '班級島遊樂園', a: 1.1, b: 6.7, size: 64, y: 0.31 },
  { text: '雲霄飛車', a: at('02') + 0.2, b: at('02') + 3.2, size: 88, y: 0.12 },
  { text: '巨大摩天輪', a: at('08') + 0.1, b: at('09') + 1.6, size: 88, y: 0.12 },
  { text: '環島飛船', a: at('12') + 0.2, b: at('12') + 3.2, size: 88, y: 0.12 },
  { text: '一起來班級島玩吧！', a: at('19') + 0.8, b: total - 0.4, size: 80, y: 0.13 },
];
/** 第一人稱的小標（左上角） */
const badges = ['04', '05', '10', '15'].map((p) => {
  const a = at(p);
  return { text: '第一人稱視角', a: a + 0.15, b: a + 3.45 };
});

// ---------- 音效軌：照每一格的排程混真實錄音 ----------

/** 音效軌的取樣率、一格幾個取樣 */
const SR = 44100;
const SPF = SR / FPS;
/** 解碼一個音效檔成單聲道浮點 PCM（ffmpeg 會照 MP3 的編碼補白資訊去掉頭尾補的靜音） */
const pcmCache = new Map();
function pcmOf(name) {
  if (!pcmCache.has(name)) {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `public/audio/sfx/rides/${name}.mp3`, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) throw new Error(`解碼失敗 ${name}`);
    pcmCache.set(name, new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length)));
  }
  return pcmCache.get(name);
}
/** 全部鏡頭的排程接成一串（每一格一筆；沒有 cues.json 的鏡頭當成沒有聲音） */
const cues = shots.flatMap((s) => {
  const f = `${FRAMES}/${s}/cues.json`;
  const frames = readdirSync(`${FRAMES}/${s}`).filter((x) => x.endsWith('.jpg')).length;
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : Array.from({ length: frames }, () => ({ loops: {}, shots: [] }));
});
const sfx = new Float32Array(Math.ceil(total * SR));
// 循環的聲音：每一個取樣照前後兩格的音量與速度內插；播放位置用累加的相位（速度變了不會跳）
const loopNames = [...new Set(cues.flatMap((c) => Object.keys(c.loops)))];
for (const name of loopNames) {
  const buf = pcmOf(name);
  let phase = 0;
  for (let n = 0; n < sfx.length; n++) {
    const f = Math.min(cues.length - 1, Math.floor(n / SPF));
    const g = Math.min(cues.length - 1, f + 1);
    const k = n / SPF - f;
    const a = cues[f].loops[name] ?? { gain: 0, rate: 1 };
    const b = cues[g].loops[name] ?? a;
    const gain = a.gain + (b.gain - a.gain) * k;
    const rate = a.rate + (b.rate - a.rate) * k;
    if (gain > 1e-4) {
      const i0 = Math.floor(phase);
      const fr = phase - i0;
      sfx[n] += (buf[i0 % buf.length] * (1 - fr) + buf[(i0 + 1) % buf.length] * fr) * gain;
    }
    phase = (phase + rate) % buf.length;
  }
}
// 一次的聲音：放在那一格的時間
cues.forEach((c, f) => {
  for (const s of c.shots) {
    const buf = pcmOf(s.name);
    const at = Math.round(f * SPF);
    for (let i = 0; i < buf.length && at + i < sfx.length; i++) sfx[at + i] += buf[i] * s.gain;
  }
});
writeFileSync('video-out/sfx.f32', Buffer.from(sfx.buffer));
console.log(`音效軌：${cues.length} 格的排程、循環 ${loopNames.length} 種、一次的聲音 ${cues.reduce((n, c) => n + c.shots.length, 0)} 個`);

const FONT = 'C\\:/Windows/Fonts/msjhbd.ttc';
/** 淡入淡出 0.3 秒的不透明度 */
const alpha = (a, b) => `if(lt(t\\,${a + 0.3})\\,(t-${a})/0.3\\,if(gt(t\\,${b - 0.3})\\,(${b}-t)/0.3\\,1))`;
const draw = [
  ...titles.map(
    (t) =>
      `drawtext=fontfile='${FONT}':text='${t.text}':fontsize=${t.size}:fontcolor=white:borderw=9:bordercolor=0xe8457c:shadowcolor=0x00000066:shadowx=5:shadowy=5:x=(w-text_w)/2:y=h*${t.y}:enable='between(t\\,${t.a}\\,${t.b})':alpha='${alpha(t.a, t.b)}'`,
  ),
  ...badges.map(
    (t) =>
      `drawtext=fontfile='${FONT}':text='${t.text}':fontsize=34:fontcolor=white:box=1:boxcolor=0x2f6fdecc:boxborderw=14:x=36:y=34:enable='between(t\\,${t.a}\\,${t.b})':alpha='${alpha(t.a, t.b)}'`,
  ),
];
// 聲音：配樂與音效各自統一響度（配樂 -21、音效 -17 LUFS，音效聽得清楚、配樂還在），混在一起後限幅、最後 1.2 秒淡出
const graph = [
  `[0:v]${draw.join(',')},format=yuv420p[v]`,
  `[1:a]loudnorm=I=-21:TP=-3,aresample=${SR},aformat=channel_layouts=stereo[m]`,
  `[2:a]loudnorm=I=-17:TP=-3,aresample=${SR},aformat=channel_layouts=stereo[s]`,
  `[m][s]amix=inputs=2:normalize=0,alimiter=limit=0.95,afade=t=in:d=0.3,afade=t=out:st=${(total - 1.2).toFixed(2)}:d=1.2[a]`,
].join(';');
writeFileSync('video-out/filter.txt', graph);

const r = spawnSync(
  'ffmpeg',
  ['-y', '-v', 'error', '-framerate', '125/4', '-i', `${SEQ}/%05d.jpg`, '-i', 'video-out/music.wav', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'video-out/sfx.f32', '-/filter_complex', 'video-out/filter.txt', '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-t', total.toFixed(3), '-movflags', '+faststart', OUT],
  { stdio: 'inherit' },
);
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`完成：${OUT}`);
