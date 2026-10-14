/**
 * 比賽展示影片的剪接（docs/award/apcea-2026/README.md 第 7 節）：照分鏡表（storyboard.mjs）把
 * 字卡、架構圖與錄影片段（demo.award.ts 錄的畫面串流）接成 1280×720、每秒 30 格的影片，
 * 加上 AI 配音（narration.mjs）、燒進字幕與左上角的段落標籤、等 AI 的時間快轉並標示實際秒數，
 * 配樂用遊戲的 CC0 背景音樂（public/audio/music/island.mp3，Cozy Puzzle，MintoDog）。
 * 每一段的長度：至少放得下旁白（前留 0.5 秒、後留 0.7 秒）；錄影比旁白長很多時整段加速（最多 1.3 倍），
 * 錄影比旁白短就停在最後一格；有遊戲朗讀的段落（keepSpeed）不加速。
 * 遊戲的聲音：錄影時錄下的音效與預錄語音，加上裝置語音（記下唸了什麼，用 Edge 同一組 Azure 自然語音合成），
 * 調到 −20 LUFS 混進去，旁白在講的時候自動壓低（sidechaincompress），旁白的空檔聽得到朗讀與音效。
 * 輸出：award-out/知識島大冒險-展示影片.mp4；--voice kevin 用「凱文大叔」的配音，輸出 …-展示影片-凱文大叔.mp4（中間檔在 award-out/edit/）。
 * 用法（PowerShell 7）：node --env-file-if-exists=.env scripts/award/edit.mjs [--voice kevin]
 *   （先用同一個聲音跑過 narration.mjs；.env 的 AZURE_SPEECH_ 變數用來合成裝置語音，合成過的放在 award-out/tts-cache/）
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { azureTts, esc, finish, hash, sleep } from '../voice/lib.mjs';
import { STORYBOARD } from './storyboard.mjs';

/** 畫面大小、格率、資料夾、輸出檔 */
const W = 1280;
const H = 720;
const FPS = 30;
const REC = 'award-out/rec';
const WORK = 'award-out/edit';
/** 配音的聲音（narration.mjs 的 --voice）與對應的輸出檔名 */
const voiceAt = process.argv.indexOf('--voice');
const VOICE_NAME = voiceAt > 0 ? process.argv[voiceAt + 1] : 'shihan';
const OUT = { shihan: 'award-out/知識島大冒險-展示影片.mp4', kevin: 'award-out/知識島大冒險-展示影片-凱文大叔.mp4' }[VOICE_NAME];
if (!OUT) throw new Error(`沒有這個聲音：${VOICE_NAME}`);
const MUSIC = 'public/audio/music/island.mp3';
/** 旁白前後留白、句子之間的停頓、錄影比旁白長多少以內不加速、最多加速幾倍（秒／倍） */
const LEAD = 0.5;
const TAIL = 0.7;
const GAP = 0.35;
const SLACK = 4;
const MAX_SPEED = 1.3;

/** 執行 ffmpeg，失敗就丟錯（印出最後一段錯誤訊息） */
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg 失敗：${(r.stderr || '').slice(-800)}`);
}
/** 影音檔長度（秒） */
function seconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim()) || 0;
}
/** 讀 JSON */
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

/** 錄影的時間點（「裝置:片段:事件」→ 毫秒） */
const marks = Object.fromEntries(readJson(`${REC}/marks.json`).map((m) => [`${m.dev}:${m.name}`, m.t]));
/** 每句旁白的檔案與秒數（narration.mjs 產生） */
const voice = readJson(`award-out/voice/index-${VOICE_NAME}.json`);

// ---------- 字卡與圖：用 HTML 畫成 PNG ----------

/** 字卡的背景：島上的截圖（模糊、壓暗）；沒有截圖就用藍綠漸層 */
const bgShot = existsSync('award-out/shots/01-island.png') ? `url('file:///${resolve('award-out/shots/01-island.png').replaceAll('\\', '/')}')` : 'none';
/** 字卡的 HTML（標題、副標、說明、條列） */
function cardHtml({ title, sub, note, bullets }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body { margin:0; width:${W}px; height:${H}px; overflow:hidden; font-family:'Microsoft JhengHei',sans-serif; }
    .bg { position:absolute; inset:-30px; background:${bgShot} center/cover, linear-gradient(135deg,#4fb3e8,#43c59e); filter:blur(10px) brightness(.55); }
    .box { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff; text-align:center; }
    h1 { font-size:${bullets && !sub ? 64 : 96}px; margin:0 0 18px; letter-spacing:4px; text-shadow:0 4px 16px rgba(0,0,0,.45); }
    .sub { font-size:44px; font-weight:700; color:#ffe27a; margin-bottom:22px; text-shadow:0 3px 10px rgba(0,0,0,.4); }
    .note { font-size:30px; opacity:.95; }
    ul { list-style:none; padding:0; margin:12px 0 0; text-align:left; }
    li { font-size:36px; margin:18px 0; padding:14px 28px; background:rgba(255,255,255,.14); border-radius:16px; }
  </style></head><body><div class="bg"></div><div class="box">
    <h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}${note ? `<div class="note">${note}</div>` : ''}
    ${bullets ? `<ul>${bullets.map((b) => `<li>${b}</li>`).join('')}</ul>` : ''}
  </div></body></html>`;
}
/** 整張圖（架構圖、AI 閉環圖）放在白底的上方，下面留給字幕，不讓字幕蓋到圖 */
function imageHtml(file) {
  const src = `file:///${resolve(file).replaceAll('\\', '/')}`;
  return `<!doctype html><html><body style="margin:0;width:${W}px;height:${H}px;background:#fbfcfe;display:flex;align-items:flex-start;justify-content:center;padding-top:14px;box-sizing:border-box">
    <img src="${src}" style="max-width:${W - 60}px;max-height:${H - 128}px"></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
for (const s of STORYBOARD.filter((x) => x.kind !== 'clip')) {
  const html = s.kind === 'card' ? cardHtml(s.card) : imageHtml(s.image);
  writeFileSync(`${WORK}/${s.id}.html`, html);
  await page.goto(`file:///${resolve(`${WORK}/${s.id}.html`).replaceAll('\\', '/')}`);
  await page.waitForLoadState('load');
  await page.screenshot({ path: `${WORK}/${s.id}.png` });
}
await browser.close();

// ---------- 每一段做成一支無聲的影片 ----------

// ---------- 遊戲的聲音（錄影時接出來的 audio.webm，與裝置語音的紀錄 speech.json；scripts/award/rec.ts） ----------

/** 錄下來的遊戲聲音要放進影片的片段：音檔、從第幾秒到第幾秒、放在影片第幾秒、加速倍率 */
const gameAudio = [];
/** 裝置語音：放在影片第幾秒、最晚唸到第幾秒（下一次朗讀或停止就被切掉）、每一句的文字與語言、語速 */
const deviceSpeech = [];

/**
 * 把一段錄影裡的遊戲聲音照畫面的時間對應收集起來：沒有快轉的區間照錄影的時間放（整段加速時聲音也加速、不變調），
 * 快轉的區間不放；裝置語音同一刻送出的幾句算一次朗讀，放在對應的時間，下一次朗讀或停止時切掉。
 * s：分鏡的段落；pieces：沒有快轉的錄影區間；speed：整段加速倍率；start／end：這一段在影片裡的起訖秒數
 */
function collectGameSound(s, pieces, speed, start, end) {
  /** 真實時間（毫秒）→ 影片的秒數；落在快轉區間就是 null */
  const toVideo = (ms) => {
    const p = pieces.find((x) => ms >= x.srcA && ms < x.srcB);
    return p ? start + (p.outA + (ms - p.srcA) / 1000) / speed : null;
  };
  for (const p of pieces) {
    const dir = `${REC}/${s.dev}/${p.seg}`;
    if (!existsSync(`${dir}/audio.webm`)) continue;
    const { startedAt } = readJson(`${dir}/audio.json`);
    let from = (p.srcA - startedAt) / 1000;
    const to = (p.srcB - startedAt) / 1000;
    let at = start + p.outA / speed;
    if (to <= 0) continue;
    if (from < 0) {
      at -= from / speed;
      from = 0;
    }
    gameAudio.push({ file: `${dir}/audio.webm`, from, to, at, tempo: speed });
  }
  for (const seg of new Set(pieces.map((p) => p.seg))) {
    const file = `${REC}/${s.dev}/${seg}/speech.json`;
    if (!existsSync(file)) continue;
    const log = readJson(file).sort((a, b) => a.t - b.t);
    /** 同一刻（60 毫秒內、中間沒有停止）送出的句子併成一次朗讀 */
    const groups = [];
    for (const e of log) {
      const last = groups.at(-1);
      if (e.type === 'speak' && last && !last.closed && e.t - last.lastT < 60) {
        last.parts.push(e);
        last.lastT = e.t;
      } else if (e.type === 'speak') groups.push({ t: e.t, lastT: e.t, parts: [e] });
      else if (last) last.closed = true;
    }
    for (const g of groups) {
      const at = toVideo(g.t);
      if (at === null) continue;
      const next = log.find((e) => e.t > g.lastT + 5);
      const cut = next ? (toVideo(next.t) ?? at + (next.t - g.t) / 1000 / speed) : end;
      deviceSpeech.push({ at, until: Math.min(cut, end), parts: g.parts.map((p) => ({ text: p.text, lang: p.lang, rate: p.rate })) });
    }
  }
}

/** 字幕與標籤的事件：起訖秒數（整支影片的時間）、樣式、文字 */
const events = [];
/** 旁白放在整支影片的哪裡：檔案與開始秒數 */
const narration = [];
/** 每一段的影片檔 */
const parts = [];
let clock = 0;

for (const s of STORYBOARD) {
  const lines = voice.filter((v) => v.seg === s.id).sort((a, b) => a.i - b.i);
  if (lines.length !== s.lines.length) throw new Error(`段落 ${s.id} 的配音不齊，先跑 narration.mjs`);
  const talk = lines.reduce((a, l) => a + l.seconds, 0) + GAP * (lines.length - 1);
  const need = LEAD + talk + TAIL;
  const file = `${WORK}/${s.id}.mp4`;
  let dur;
  /** 每句旁白在這一段裡的開始秒數 */
  const starts = [];
  /** 照順序排旁白：每句接在上一句後面，有 at 的句子最早從 earliest[i] 秒開始；回傳最後一句結束的秒數 */
  const place = (earliest) => {
    let at = LEAD;
    lines.forEach((l, k) => {
      at = Math.max(at, earliest[k] ?? 0);
      starts[k] = at;
      at += l.seconds + GAP;
    });
    return at - GAP;
  };

  if (s.kind !== 'clip') {
    // 字卡多停一下（開頭的字卡讓人看清楚），架構圖再多一點時間讀
    place([]);
    dur = need + (s.kind === 'image' ? 1.5 : 0.6);
    ffmpeg(['-loop', '1', '-i', `${WORK}/${s.id}.png`, '-t', dur.toFixed(3), '-vf', `fps=${FPS},format=yuv420p,fade=t=in:st=0:d=0.4,fade=t=out:st=${(dur - 0.4).toFixed(3)}:d=0.4`, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', file]);
  } else {
    /** 旁白要對齊的錄影時間點（毫秒）；舊的錄影沒有這個時間點就不對齊 */
    const alignAt = lines.map((l) => marks[`${s.dev}:${s.lines[l.i].at}`]);
    /** 那些時間點在這一段影片裡是第幾秒（加速前） */
    const alignOut = [];
    // 錄影：把各片段的格子接起來，每一格放到下一格出現為止；快轉區間的時間除以倍率
    // 舊的錄影沒有這個時間點時不快轉
    const fast = (s.fast ?? []).map((f) => ({ a: marks[`${s.dev}:${f.from}`], b: marks[`${s.dev}:${f.to}`], factor: f.factor, label: f.label })).filter((f) => f.a && f.b);
    const list = [];
    /** 快轉區間在這一段影片裡的起訖（秒）與實際等待秒數 */
    const fastAt = [];
    /** 沒有快轉的錄影區間（剪遊戲的聲音用）：哪一個片段、真實時間起訖（毫秒）、在這一段影片裡的開始秒數（加速前） */
    const pieces = [];
    let cur = null;
    let t = 0;
    for (const seg of s.segs) {
      const frames = readJson(`${REC}/${s.dev}/${seg}/index.json`);
      const end = marks[`${s.dev}:${seg}:end`] ?? frames.at(-1).t + 100;
      for (let i = 0; i < frames.length; i++) {
        const a = frames[i].t;
        const b = i + 1 < frames.length ? frames[i + 1].t : Math.max(end, a + 33);
        let d = (b - a) / 1000;
        // 這一格有沒有碰到快轉：快轉的地方不放遊戲的聲音（等 AI 的時候本來就沒什麼聲音）
        if (fast.some((f) => Math.min(b, f.b) > Math.max(a, f.a))) cur = null;
        else if (cur && cur.seg === seg) cur.srcB = b;
        else pieces.push((cur = { seg, srcA: a, srcB: b, outA: t }));
        for (const f of fast) {
          const inside = Math.max(0, Math.min(b, f.b) - Math.max(a, f.a)) / 1000;
          d -= inside - inside / f.factor;
          // 快轉從這一格開始（快轉的起點可能早於這一段的第一格）
          if (!f.shown && f.a < b) {
            f.shown = true;
            fastAt.push({ start: t, f });
          }
        }
        alignAt.forEach((m, k) => {
          if (m !== undefined && alignOut[k] === undefined && m < b) alignOut[k] = t;
        });
        list.push({ file: resolve(frames[i].file), d: Math.max(d, 0.001) });
        t += Math.max(d, 0.001);
        for (const fa of fastAt) if (fa.end === undefined && b >= fa.f.b) fa.end = t;
      }
    }
    // 長度：錄影太長就整段加速（最多 MAX_SPEED 倍）；旁白對齊畫面後，錄影太短就停在最後一格
    // 有遊戲朗讀的段落（keepSpeed）不加速，朗讀才對得上畫面
    let speed = 1;
    if (!s.keepSpeed && t > need + SLACK) speed = Math.min(MAX_SPEED, t / (need + SLACK));
    const talkEnd = place(alignOut.map((x) => (x === undefined ? undefined : x / speed + 0.2)));
    dur = Math.max(talkEnd + TAIL, t / speed);
    collectGameSound(s, pieces, speed, clock, clock + dur);
    for (const it of list) it.d /= speed;
    list.at(-1).d += Math.max(0, dur - t / speed);
    const txt = list.map((it) => `file '${it.file.replaceAll('\\', '/')}'\nduration ${it.d.toFixed(4)}`).join('\n') + `\nfile '${list.at(-1).file.replaceAll('\\', '/')}'\n`;
    writeFileSync(`${WORK}/${s.id}.txt`, txt);
    ffmpeg(['-f', 'concat', '-safe', '0', '-i', `${WORK}/${s.id}.txt`, '-t', dur.toFixed(3), '-vf', `fps=${FPS},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=white,format=yuv420p`, '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', file]);
    for (const fa of fastAt) {
      const real = Math.round((fa.f.b - fa.f.a) / 1000);
      events.push({ a: clock + fa.start / speed, b: clock + (fa.end ?? t) / speed, style: 'Fast', text: fa.f.label ?? `⏩ 快轉 ×${fa.f.factor}（實際等待 AI ${real} 秒）` });
    }
    if (s.caption) events.push({ a: clock + 0.2, b: clock + dur - 0.2, style: 'Badge', text: s.caption });
    console.log(`${s.id}：錄影 ${t.toFixed(1)} 秒 → ${dur.toFixed(1)} 秒（加速 ${speed.toFixed(2)} 倍）`);
  }

  // 旁白與字幕（放到整支影片的時間）
  lines.forEach((l, k) => {
    const at = clock + starts[k];
    narration.push({ file: l.file, at });
    events.push({ a: at, b: at + l.seconds + 0.15, style: 'Sub', text: l.text });
  });
  parts.push(file);
  clock += dur;
}
console.log(`總長 ${clock.toFixed(1)} 秒（${Math.floor(clock / 60)} 分 ${Math.round(clock % 60)} 秒）`);

// ---------- 接起來、配音、配樂、字幕 ----------

writeFileSync(`${WORK}/parts.txt`, parts.map((p) => `file '${resolve(p).replaceAll('\\', '/')}'`).join('\n'));
ffmpeg(['-f', 'concat', '-safe', '0', '-i', `${WORK}/parts.txt`, '-c', 'copy', `${WORK}/video.mp4`]);

// 旁白軌：每句延遲到它的位置再混在一起
const inputs = narration.flatMap((n) => ['-i', n.file]);
const delays = narration.map((n, i) => `[${i}:a]aresample=48000,adelay=${Math.round(n.at * 1000)}:all=1[n${i}]`).join(';');
const mix = `${narration.map((_, i) => `[n${i}]`).join('')}amix=inputs=${narration.length}:normalize=0,apad=whole_dur=${clock.toFixed(3)}[out]`;
ffmpeg([...inputs, '-filter_complex', `${delays};${mix}`, '-map', '[out]', '-t', clock.toFixed(3), '-ac', '2', `${WORK}/narration.wav`]);

// 遊戲聲音軌：錄下來的音效與預錄語音＋裝置語音（用 Edge 同一組 Azure 自然語音合成），各自調到同樣的響度再混在一起
/** 裝置語音用的聲音：Edge 的「自然」語音就是這幾個 Azure 神經語音（遊戲在 Edge 上自動挑的） */
const DEVICE_VOICE = { 'zh-TW': 'zh-TW-HsiaoChenNeural', 'en-US': 'en-US-AvaNeural' };
const TTS_DIR = 'award-out/tts-cache';
/** 合成一句裝置語音（快取；Azure F0 每分鐘 20 次，新做的每句之間等 3.2 秒） */
async function deviceVoiceFile(text, lang, rate) {
  const voice = DEVICE_VOICE[lang] ?? DEVICE_VOICE['zh-TW'];
  const out = `${TTS_DIR}/${hash(`${voice}|${rate}|${text}`, 16)}.mp3`;
  if (existsSync(out)) return out;
  mkdirSync(TTS_DIR, { recursive: true });
  const raw = `${out}.raw.mp3`;
  writeFileSync(raw, await azureTts({ key: process.env.AZURE_SPEECH_KEY, region: process.env.AZURE_SPEECH_REGION }, voice, lang, esc(text), rate || 1));
  finish(raw, out, { bitrate: '96k' });
  rmSync(raw);
  await sleep(3200);
  return out;
}
/** 整段的響度（LUFS）；幾乎沒聲音時是 null */
function loudness(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /"input_i" : "(-?[\d.]+|-inf)"/.exec(r.stderr);
  const v = m ? Number(m[1]) : NaN;
  return Number.isFinite(v) && v > -60 ? v : null;
}
/** 把幾個片段（檔案、從第幾秒、到第幾秒、放在第幾秒、加速倍率）混成一軌，回傳檔名；沒有片段就是 null */
function mixPieces(list, out) {
  if (!list.length) return null;
  const inputs = list.flatMap((p) => ['-i', p.file]);
  const chains = list
    .map((p, i) => {
      const trim = `atrim=start=${p.from.toFixed(3)}${p.to !== undefined ? `:end=${p.to.toFixed(3)}` : ''},asetpts=PTS-STARTPTS`;
      const tempo = p.tempo && Math.abs(p.tempo - 1) > 0.001 ? `,atempo=${p.tempo.toFixed(4)}` : '';
      const fade = p.fadeAt !== undefined ? `,afade=t=out:st=${Math.max(0, p.fadeAt - 0.08).toFixed(3)}:d=0.08` : '';
      return `[${i}:a]${trim}${tempo}${fade},aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(p.at * 1000)}:all=1[g${i}]`;
    })
    .join(';');
  const mix = `${list.map((_, i) => `[g${i}]`).join('')}amix=inputs=${list.length}:normalize=0,apad=whole_dur=${clock.toFixed(3)}[out]`;
  ffmpeg([...inputs, '-filter_complex', `${chains};${mix}`, '-map', '[out]', '-t', clock.toFixed(3), out]);
  return out;
}

// 裝置語音：每次朗讀的句子接起來（句子之間停 0.12 秒），唸到被切掉為止
const speechPieces = [];
if (deviceSpeech.length && !process.env.AZURE_SPEECH_KEY) console.log('⚠ 沒有 AZURE_SPEECH_KEY（用 node --env-file-if-exists=.env 執行）：裝置語音不會放進影片');
else
  for (const [k, sp] of deviceSpeech.entries()) {
    const files = [];
    for (const p of sp.parts) files.push(await deviceVoiceFile(p.text, p.lang, p.rate));
    const joined = `${WORK}/speech-${k}.wav`;
    const chain = files.map((_, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=mono,apad=pad_dur=0.12[s${i}]`).join(';');
    ffmpeg([...files.flatMap((f) => ['-i', f]), '-filter_complex', `${chain};${files.map((_, i) => `[s${i}]`).join('')}concat=n=${files.length}:v=0:a=1[out]`, '-map', '[out]', joined]);
    const len = Math.min(seconds(joined), sp.until - sp.at);
    if (len > 0.2) speechPieces.push({ file: joined, from: 0, to: len, at: sp.at, fadeAt: len });
  }
const recTrack = mixPieces(gameAudio, `${WORK}/game-rec.wav`);
const ttsTrack = mixPieces(speechPieces, `${WORK}/game-speech.wav`);
console.log(`遊戲聲音：錄音片段 ${gameAudio.length} 個、裝置語音 ${speechPieces.length} 次`);
/** 遊戲聲音調到的響度（旁白是 −16 LUFS，遊戲小一點；旁白在講的時候再自動壓低） */
const GAME_LUFS = -20;
const gameTracks = [recTrack, ttsTrack].filter(Boolean).map((f) => ({ f, gain: GAME_LUFS - (loudness(f) ?? GAME_LUFS) }));
let gameFile = null;
if (gameTracks.length) {
  gameFile = `${WORK}/game.wav`;
  const chain = gameTracks.map((g, i) => `[${i}:a]volume=${g.gain.toFixed(2)}dB[t${i}]`).join(';');
  ffmpeg([...gameTracks.flatMap((g) => ['-i', g.f]), '-filter_complex', `${chain};${gameTracks.map((_, i) => `[t${i}]`).join('')}amix=inputs=${gameTracks.length}:normalize=0[out]`, '-map', '[out]', '-t', clock.toFixed(3), gameFile]);
}

/** 秒數 → ASS 的時間格式 */
const ts = (x) => {
  const cs = Math.max(0, Math.round(x * 100));
  return `${Math.floor(cs / 360000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, '0')}:${String(Math.floor(cs / 100) % 60).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
};
/** 太長的字幕在中間附近的標點斷成兩行 */
function wrap(text) {
  if (text.length <= 28) return text;
  const mid = text.length / 2;
  let best = -1;
  for (let i = 8; i < text.length - 6; i++) if ('，、；：。'.includes(text[i]) && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  if (best < 0) best = Math.round(mid) - 1;
  return `${text.slice(0, best + 1)}\\N${text.slice(best + 1)}`;
}
const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,Microsoft JhengHei,36,&H00FFFFFF,&H00FFFFFF,&H50202020,&H00000000,1,0,0,0,100,100,1,0,3,10,0,2,60,60,28,1
Style: Badge,Microsoft JhengHei,26,&H00FFFFFF,&H00FFFFFF,&H00D86F3B,&H00000000,1,0,0,0,100,100,1,0,3,8,0,7,24,24,20,1
Style: Fast,Microsoft JhengHei,26,&H00FFFFFF,&H00FFFFFF,&H002D9BE3,&H00000000,1,0,0,0,100,100,1,0,3,8,0,9,24,24,20,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.map((e) => `Dialogue: 0,${ts(e.a)},${ts(e.b)},${e.style},,0,0,0,,${e.style === 'Sub' ? wrap(e.text) : e.text}`).join('\n')}
`;
writeFileSync(`${WORK}/subs.ass`, ass);

// 最後一次編碼：燒字幕、旁白＋配樂（配樂壓低、頭尾淡入淡出）＋遊戲聲音（旁白在講的時候自動壓低，旁白的空檔聽得到朗讀與音效）
const music = `[2:a]aresample=48000,volume=0.16,afade=t=in:st=0:d=1.5,afade=t=out:st=${(clock - 3).toFixed(2)}:d=3[m]`;
const audioMix = gameFile
  ? `[1:a]asplit=2[nar][key];${music};[3:a]aresample=48000[g];[g][key]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=450[gd];[nar][gd][m]amix=inputs=3:normalize=0:duration=first,alimiter=limit=0.9[a]`
  : `${music};[1:a][m]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.9[a]`;
// 聲音先另外混成一個 wav，再和畫面合併：和燒字幕的畫面放在同一個指令裡混時，輸出的聲音曾經出現 30 秒的空白（2026-10-14 實測）
/** 混音的輸入：0 是畫面（只為了讓輸入編號和 audioMix 對得上，不會用到）、1 旁白、2 配樂、3 遊戲聲音 */
const audioInputs = ['-i', `${WORK}/video.mp4`, '-i', `${WORK}/narration.wav`, '-stream_loop', '-1', '-i', MUSIC, ...(gameFile ? ['-i', gameFile] : [])];
ffmpeg([...audioInputs, '-filter_complex', audioMix, '-map', '[a]', '-t', clock.toFixed(3), '-ar', '48000', `${WORK}/final-audio.wav`]);
ffmpeg([
  '-i', `${WORK}/video.mp4`,
  '-i', `${WORK}/final-audio.wav`,
  '-filter_complex',
  `[0:v]subtitles=${WORK}/subs.ass[v]`,
  '-map', '[v]', '-map', '1:a', '-t', clock.toFixed(3),
  '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', OUT,
]);
const mb = readFileSync(OUT).length / 1024 / 1024;
console.log(`輸出：${OUT}（${seconds(OUT).toFixed(1)} 秒、${mb.toFixed(1)} MB）`);
