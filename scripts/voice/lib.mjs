/**
 * 語音合成與音檔後製的共用函式（compare.mjs 試聽比較、generate.mjs 產生遊戲用的預錄語音都用這裡）。
 * 金鑰由呼叫端從環境變數傳入（.env 用 node --env-file-if-exists=.env 載入），這裡不讀檔。
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** fetch 遇到網路錯誤（連線中斷、DNS 失敗，fetch 直接丟出例外）時回傳 null，讓呼叫端照 429 的方式重試 */
async function tryFetch(url, init) {
  try {
    return await fetch(url, init);
  } catch {
    return null;
  }
}

/** 短雜湊（檔名用） */
export const hash = (s, n = 12) => createHash('sha1').update(s).digest('hex').slice(0, n);

/** XML／HTML 跳脫 */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Azure 神經語音（REST）：回傳 mp3 bytes。inner 是 SSML 的 <prosody> 內容（已跳脫的文字或標記），speed 0.9 換成 rate -10%。
 * 429／5xx／網路錯誤依序等 3、6、12 秒重試（F0 每 60 秒最多 20 次請求，呼叫端也要自己控制間隔）。
 */
export async function azureTts({ key, region }, voice, lang, inner, speed) {
  const rate = `${Math.round((speed - 1) * 100)}%`;
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="${rate}">${inner}</prosody></voice></speak>`;
  for (const wait of [0, 3000, 6000, 12000]) {
    if (wait) await sleep(wait);
    const res = await tryFetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'learning-island-voice',
      },
      body: ssml,
    });
    if (!res || res.status === 429 || res.status >= 500) continue;
    if (!res.ok) throw new Error(`Azure HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('Azure 一直回 429、5xx 或連不上，稍後再跑一次');
}

/**
 * Fish Audio（公開聲音用 reference_id）：回傳 mp3 bytes。429／5xx／網路錯誤依序等 2、5、10、20 秒重試。
 * model 用 HTTP header 指定（例如 s2.1-pro-free）。
 */
export async function fishTts(key, model, referenceId, text, speed) {
  for (const wait of [0, 2000, 5000, 10000, 20000]) {
    if (wait) await sleep(wait);
    const res = await tryFetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model },
      body: JSON.stringify({ text, reference_id: referenceId, format: 'mp3', normalize: true, prosody: { speed } }),
    });
    if (!res || res.status === 429 || res.status >= 500) continue;
    if (!res.ok) throw new Error(`Fish HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('Fish 一直回 429、5xx 或連不上（請求太頻繁、服務忙碌或網路中斷），稍後再跑一次');
}

/** 執行 ffmpeg，失敗時丟出 stderr 尾段 */
export function ffmpeg(args) {
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
 * 整理音檔：轉單聲道、去頭尾靜音，先量整段響度，再直接調整音量到 −16 LUFS，最後用限幅器壓住超過 −1.5 dBFS 的峰值。
 * 不用 loudnorm 的 linear 模式：句子的響度範圍太大或調整後峰值超標時，它會自動改成動態模式，短句因此偏小聲（實測 −19～−22 LUFS）。
 * tailPad 秒：結尾補一點靜音（句子之間的停頓，注音符號用）。
 */
export function finish(input, output, { bitrate = '48k', tailPad = 0 } = {}) {
  const pre = `aformat=channel_layouts=mono,${TRIM},${PAD}`;
  const measure = ffmpeg(['-i', input, '-af', `${pre},loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(measure.slice(measure.lastIndexOf('{'), measure.lastIndexOf('}') + 1));
  const loudness = Number(m.input_i);
  if (!Number.isFinite(loudness)) throw new Error('音檔幾乎沒有聲音（量不到響度）');
  const gain = (-16 - loudness).toFixed(2);
  const tail = tailPad > 0 ? `,apad=pad_dur=${tailPad}` : '';
  ffmpeg(['-i', input, '-af', `${pre},volume=${gain}dB,alimiter=limit=0.84:level=false,${TRIM}${tail}`, '-ar', '24000', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', bitrate, output]);
}

/** 音檔長度（秒） */
export function seconds(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim()) || 0;
}

/** 以固定並行數處理清單（worker 依序取下一個） */
export async function pool(items, concurrency, worker) {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}
