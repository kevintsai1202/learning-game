/**
 * 下載的錄音的客觀檢查（挑音效用；沒辦法用耳朵聽時的替代）：
 * - 長度、整體響度（LUFS）、峰值（看有沒有爆音）。
 * - 有沒有人在講話：用 Groq 的 Whisper 聽寫（設施的聲音不該有人講話；尖叫的錄音看有沒有喊出字）。
 * - 一張圖：每個檔一列「頻譜＋波形」，左邊標編號，存到 data-src/raw/audio/sheet-<名稱>.png。
 * 用法（PowerShell 7，金鑰在 .env 的 GROQ_API_KEY）：
 *   node --env-file-if-exists=.env scripts/audio/inspect.mjs <名稱> <Freesound 編號>...
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const RAW = 'data-src/raw/audio';
const [name, ...ids] = process.argv.slice(2);
const meta = JSON.parse(readFileSync('data-src/audio/sources.json', 'utf8'));

/** 執行 ffmpeg／ffprobe 回傳 stderr＋stdout */
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return `${r.stdout}${r.stderr}`;
};

for (const id of ids) {
  const file = `${RAW}/fs-${id}.mp3`;
  const dur = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).trim());
  const ln = run('ffmpeg', ['-hide_banner', '-i', file, '-af', 'loudnorm=print_format=summary', '-f', 'null', '-']);
  const lufs = /Input Integrated:\s*(-?[\d.]+)/.exec(ln)?.[1];
  const peak = /Input True Peak:\s*(-?[\d.+]+)/.exec(ln)?.[1];
  let text = '';
  if (process.env.GROQ_API_KEY) {
    const fd = new FormData();
    fd.append('file', new Blob([readFileSync(file)]), `${id}.mp3`);
    fd.append('model', 'whisper-large-v3');
    const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: fd });
    text = r.ok ? ((await r.json()).text ?? '').trim() : `（聽寫失敗 HTTP ${r.status}）`;
  }
  console.log(
    `${id}\t${dur.toFixed(1)}s\t${lufs} LUFS\tpeak ${peak}\t${meta[id]?.title ?? ''}\n\t聽寫：${text.slice(0, 80) || '（沒有字）'}`,
  );
}

// 頻譜＋波形的總覽圖（每個檔一列，最多 60 秒）
const inputs = ids.flatMap((id) => ['-t', '60', '-i', `${RAW}/fs-${id}.mp3`]);
const rows = ids
  .map(
    (id, i) =>
      `[${i}:a]asplit=2[s${i}][w${i}];[s${i}]showspectrumpic=s=900x110:legend=0:scale=log:fscale=log[sp${i}];[w${i}]showwavespic=s=900x50:colors=0x2f6fde[wv${i}];[sp${i}][wv${i}]vstack,pad=1000:160:100:0:color=white,drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='${id}':x=6:y=60:fontsize=18[r${i}]`,
  )
  .join(';');
const graph = `${rows};${ids.map((_, i) => `[r${i}]`).join('')}vstack=inputs=${ids.length}[out]`;
const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[out]', '-frames:v', '1', `${RAW}/sheet-${name}.png`], { encoding: 'utf8' });
console.log(r.status === 0 ? `總覽圖：${RAW}/sheet-${name}.png` : `總覽圖失敗：${r.stderr.slice(-300)}`);
