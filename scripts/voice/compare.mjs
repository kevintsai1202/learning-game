/**
 * 預錄語音試聽比較：同一批句子分別用 Azure 與 Fish Audio 產生音檔，加上教育部注音符號官方發音，
 * 做成一個本機試聽頁（data-src/raw/voice-compare/index.html，不進版控、不會部署）。
 *
 * - 句子與聲音在 scripts/voice/compare-lines.json。
 * - 每個音檔都去頭尾靜音，先量響度再調整音量到 −16 LUFS 並限幅，避免「比較大聲的聽起來比較好」。
 * - 已經產生過的音檔不重做（檔名是「引擎＋聲音＋語速＋文字」的雜湊）；沒有金鑰的引擎直接略過，之後補金鑰再跑一次即可。
 * - 單一句失敗（例如 Azure 不接受台灣國語的讀音標記）只記錄錯誤，不中斷整批。
 *
 * 用法（PowerShell 7，專案根目錄；金鑰在 .env）：
 *   node --env-file-if-exists=.env scripts/voice/compare.mjs
 *   Start-Process data-src\raw\voice-compare\index.html
 *
 * 教育部注音發音檔要先下載解壓到 data-src/raw/moe-juyin/materials/（見 docs/plans/voice-clips.md 第 7 節）。
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('data-src/raw/voice-compare');
/** 引擎回傳的原始音檔 */
const RAW = path.join(OUT, 'raw');
/** 去靜音、響度標準化後的音檔（試聽頁用這些） */
const CLIPS = path.join(OUT, 'clips');
/** 教育部《國語注音符號手冊》開放部件 */
const MOE_DIR = path.resolve('data-src/raw/moe-juyin/materials/audio');
const MOE_MAP = path.resolve('data-src/raw/moe-juyin/audio-map.json');

const cfg = JSON.parse(readFileSync('scripts/voice/compare-lines.json', 'utf8'));
const env = {
  fish: process.env.FISH_API_KEY ?? '',
  azureKey: process.env.AZURE_SPEECH_KEY ?? '',
  azureRegion: process.env.AZURE_SPEECH_REGION ?? '',
};
mkdirSync(RAW, { recursive: true });
mkdirSync(CLIPS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
/** XML／HTML 跳脫 */
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Azure 神經語音（REST）：回傳 mp3 bytes；speed 0.9 換成 prosody rate -10% */
async function azureTts(voice, lang, inner, speed) {
  const xmlLang = lang === 'zh' ? 'zh-TW' : 'en-US';
  const rate = `${Math.round((speed - 1) * 100)}%`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}"><voice name="${voice}"><prosody rate="${rate}">${inner}</prosody></voice></speak>`;
  const res = await fetch(`https://${env.azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': env.azureKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'learning-island-voice-compare',
    },
    body: ssml,
  });
  if (!res.ok) throw new Error(`Azure HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Fish Audio（公開聲音用 reference_id）：回傳 mp3 bytes；429 時依序等 2、5、10 秒重試 */
async function fishTts(referenceId, text, speed) {
  for (const wait of [0, 2000, 5000, 10000]) {
    if (wait) await sleep(wait);
    const res = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.fish}`, 'Content-Type': 'application/json', model: 's2.1-pro-free' },
      body: JSON.stringify({ text, reference_id: referenceId, format: 'mp3', normalize: true, prosody: { speed } }),
    });
    if (res.status === 429) continue;
    if (!res.ok) throw new Error(`Fish HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('Fish 一直回 429（請求太頻繁），稍後再跑一次');
}

/** 執行 ffmpeg，失敗時丟出 stderr 尾段 */
function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg 失敗：${r.stderr.slice(-400)}`);
  return r.stderr;
}

/** 去頭尾靜音的濾鏡（−50 dB 以下視為靜音） */
const TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse';

/**
 * 量測前在尾端補靜音到 1.5 秒：loudnorm 以 0.4 秒為一個區塊量響度，去靜音後只剩 0.3 秒的短音（例如單一個注音）
 * 會量成 -inf 而失敗。補的是靜音，不會被算進響度；處理完再用 TRIM 去掉。
 */
const PAD = 'apad=whole_dur=1.5';

/**
 * 整理音檔：轉單聲道、去頭尾靜音，先量整段響度，再直接調整音量到 −16 LUFS，最後用限幅器壓住超過 −1.5 dBFS 的峰值，輸出 24 kHz mp3。
 * 不用 loudnorm 的 linear 模式：句子的響度範圍太大或調整後峰值超標時，它會自動改成動態模式，短句因此偏小聲（實測 −19～−22 LUFS）。
 */
function finish(input, output) {
  const pre = `aformat=channel_layouts=mono,${TRIM},${PAD}`;
  const measure = ffmpeg(['-i', input, '-af', `${pre},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(measure.slice(measure.lastIndexOf('{'), measure.lastIndexOf('}') + 1));
  const loudness = Number(m.input_i);
  if (!Number.isFinite(loudness)) throw new Error('音檔幾乎沒有聲音（量不到響度）');
  const gain = (-16 - loudness).toFixed(2);
  ffmpeg(['-i', input, '-af', `${pre},volume=${gain}dB,alimiter=limit=0.84:level=false,${TRIM}`, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', output]);
}

/** 音檔長度（秒） */
function seconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim()) || 0;
}

/** 產生一個試聽音檔；回傳試聽頁需要的資料（檔名或錯誤、略過原因） */
async function makeClip(line, voice) {
  // 句子可以自訂語速（注音逐個確認用不同語速比較）
  const speed = line.speed ?? cfg.speed[line.lang];
  if (line.only && line.only !== voice.engine) return { skip: '不適用' };
  const payload = voice.engine === 'fish' ? (line.fish ?? line.text) : (line.azureSsml ?? esc(line.text));
  if (voice.engine === 'fish' && !env.fish) return { skip: '缺 FISH_API_KEY' };
  if (voice.engine === 'azure' && !(env.azureKey && env.azureRegion)) return { skip: '尚未填 Azure 金鑰' };
  const name = `${voice.id}-${hash(`${voice.engine}|${voice.voice}|${speed}|${payload}`)}`;
  const clip = path.join(CLIPS, `${name}.mp3`);
  if (!existsSync(clip)) {
    try {
      // 原始檔已經下載過就直接重新整理，不再呼叫 API（調整整理方式後可以刪掉 clips/ 重跑）
      const raw = path.join(RAW, `${name}.mp3`);
      if (!existsSync(raw)) {
        const audio = voice.engine === 'fish' ? await fishTts(voice.voice, payload, speed) : await azureTts(voice.voice, line.lang, payload, speed);
        writeFileSync(raw, audio);
      }
      finish(raw, clip);
    } catch (e) {
      return { error: e.message, payload };
    }
  }
  return { file: `clips/${name}.mp3`, sec: seconds(clip), payload };
}

/** 教育部注音發音：整理成和其他音檔一樣的格式與響度 */
function makeMoeClips() {
  if (!existsSync(MOE_MAP)) return [];
  const map = JSON.parse(readFileSync(MOE_MAP, 'utf8'));
  return Object.entries(map).map(([f, symbol]) => {
    const clip = path.join(CLIPS, `moe-${f}.mp3`);
    if (!existsSync(clip)) finish(path.join(MOE_DIR, `${f}.WAV`), clip);
    return { symbol, file: `clips/moe-${f}.mp3`, sec: seconds(clip) };
  });
}

// ---------- 產生音檔 ----------
const results = [];
for (const line of cfg.lines) {
  const cells = [];
  for (const voice of cfg.voices[line.lang]) {
    const r = await makeClip(line, voice);
    cells.push({ voice: voice.id, ...r });
    const tag = r.error ? `失敗：${r.error}` : r.skip ? `略過（${r.skip}）` : `${r.sec.toFixed(2)} 秒`;
    console.log(`${line.id.padEnd(14)} ${voice.id.padEnd(16)} ${tag}`);
  }
  results.push({ ...line, cells });
}
const moe = makeMoeClips();
console.log(`教育部注音發音 ${moe.length} 個`);

/**
 * 37 個注音符號用指定的聲音（compare-lines.json 的 zhuyinVoice）直接產生，不用替代字，
 * 每個語速（zhuyinSpeeds）各一份，和教育部錄音並排逐個確認。
 */
const zyVoice = Object.values(cfg.voices).flat().find((v) => v.id === cfg.zhuyinVoice);
const zySpeeds = cfg.zhuyinSpeeds ?? [cfg.speed.zh];
const zhuyin = [];
for (const m of moe) {
  const tts = [];
  for (const speed of zySpeeds) tts.push(zyVoice ? await makeClip({ lang: 'zh', text: m.symbol, speed }, zyVoice) : { skip: '未設定 zhuyinVoice' });
  zhuyin.push({ ...m, tts });
}
for (const [i, speed] of zySpeeds.entries()) {
  const secs = zhuyin.map((z) => z.tts[i].sec).filter(Boolean);
  console.log(`注音逐個確認（語速 ${speed}）：${secs.length}／${zhuyin.length} 個成功，長度 ${Math.min(...secs).toFixed(2)}～${Math.max(...secs).toFixed(2)} 秒`);
}
writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, moe, zhuyin }, null, 2));

// ---------- 試聽頁 ----------
const groups = [...new Set(results.map((r) => r.group))];
const cell = (c) => {
  if (c.skip) return `<td class="muted">${esc(c.skip)}</td>`;
  if (c.error) return `<td class="err">不支援或失敗<br><small>${esc(c.error)}</small></td>`;
  return `<td><audio controls preload="none" src="${c.file}"></audio><div class="sec">${c.sec.toFixed(2)} 秒</div></td>`;
};
const table = (group) => {
  const rows = results.filter((r) => r.group === group);
  const lang = rows[0].lang;
  const voices = cfg.voices[lang];
  return `<h2>${esc(group)}</h2>
<table><thead><tr><th>句子</th>${voices.map((v) => `<th>${esc(v.label)}</th>`).join('')}<th>這台裝置</th></tr></thead><tbody>
${rows
  .map(
    (r) => `<tr><td class="text"><div>${esc(r.text)}</div>${r.from ? `<small>${esc(r.from)}</small>` : ''}${r.note ? `<small class="note">${esc(r.note)}</small>` : ''}${
      r.fish || r.azureSsml ? `<small class="code">${r.fish ? `Fish：${esc(r.fish)}` : ''}${r.azureSsml ? `<br>Azure：${esc(r.azureSsml)}` : ''}</small>` : ''
    }</td>${r.cells.map(cell).join('')}<td><button onclick="say(${esc(JSON.stringify(r.text))}, '${lang}')">🔊</button></td></tr>`,
  )
  .join('\n')}
</tbody></table>`;
};
const moeGrid = moe.length
  ? `<h2>注音逐個確認（37 個）</h2>
<p>左邊是教育部《國語注音符號手冊》的官方錄音，右邊是${esc(zyVoice?.label ?? '指定的聲音')}直接唸注音符號（不用替代字）。音量都已調成一樣。請逐個確認右邊的唸法能不能用，不能用的告訴我是哪幾個。</p>
<table class="zy-table"><thead><tr><th>符號</th><th>教育部錄音</th>${zySpeeds.map((s) => `<th>${esc(zyVoice?.label ?? '')}<br>語速 ${s} 倍</th>`).join('')}</tr></thead><tbody>
${zhuyin.map((z) => `<tr><td class="zy">${esc(z.symbol)}</td>${cell(z)}${z.tts.map(cell).join('')}</tr>`).join('\n')}
</tbody></table>
<p class="credit">2017 © 教育部，國語注音符號手冊-開放部件。此素材依「創用CC 姓名標示 4.0 國際版本」授權條款進行公眾釋出（https://creativecommons.org/licenses/by/4.0/deed.zh_TW）。本頁已轉檔並調整音量。</p>`
  : '<p class="muted">（沒有找到教育部注音發音檔）</p>';

const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>預錄語音試聽比較</title>
<style>
  :root { color-scheme: light; }
  body { font-family: system-ui, "Microsoft JhengHei", sans-serif; margin: 24px auto; max-width: 1280px; padding: 0 16px; color: #2b2a4c; background: #fffaf0; }
  h1 { margin-bottom: 4px; } h2 { margin-top: 32px; border-bottom: 3px solid #2b2a4c; padding-bottom: 4px; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #d9d2c3; padding: 8px; vertical-align: top; text-align: left; }
  th { background: #f1e9d8; font-size: 14px; } td.text { min-width: 260px; } td.text div { font-size: 18px; }
  small { display: block; color: #6b6780; margin-top: 4px; } small.note { color: #8a4b00; } small.code { font-family: Consolas, monospace; color: #3b5b8c; }
  audio { width: 210px; height: 36px; } .sec { font-size: 12px; color: #6b6780; } .muted { color: #9a95aa; } .err { color: #b3261e; font-size: 14px; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; } button { font-size: 18px; padding: 6px 12px; border-radius: 10px; border: 2px solid #2b2a4c; background: #fff; cursor: pointer; }
  .zy { font-size: 28px; width: 64px; } .credit { font-size: 13px; color: #6b6780; }
  .zy-table { width: auto; } .zy-table td.zy { text-align: center; vertical-align: middle; }
</style></head><body>
<h1>預錄語音試聽比較</h1>
<p>同一句話用不同聲音唸，音量都已調成一樣。最右邊「這台裝置」是瀏覽器內建語音：在 Edge 上就是 Azure 同一組自然語音，可以當參考。<br>
聽的重點：哪個聲音適合二年級孩子、破音字有沒有唸對、注音能不能唸、英文發音是否自然。</p>
${groups.map(table).join('\n')}
${moeGrid}
<script>
  /** 播放音檔（教育部注音） */
  function play(src) { new Audio(src).play(); }
  /** 用這台裝置的語音唸：優先挑自然語音（Edge 的 Natural、Chrome 的 Google） */
  function say(text, lang) {
    const want = lang === 'zh' ? 'zh-TW' : 'en-US';
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.replace('_', '-').toLowerCase() === want.toLowerCase());
    const u = new SpeechSynthesisUtterance(text);
    u.lang = want;
    u.voice = voices.find((v) => /natural|google/i.test(v.name)) || voices[0] || null;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }
  speechSynthesis.getVoices();
</script>
</body></html>
`;
writeFileSync(path.join(OUT, 'index.html'), html);
console.log(`試聽頁：${path.join(OUT, 'index.html')}`);
