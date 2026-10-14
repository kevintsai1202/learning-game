/**
 * 比賽展示影片的 AI 配音：照分鏡表（storyboard.mjs）每一句旁白用 Fish Audio 合成（免費方案的 s2.1-pro-free 模型；
 * docs/award/apcea-2026/README.md 第 5 節），去頭尾靜音、統一響度（scripts/voice/lib.mjs 的 finish），
 * 存成 award-out/voice/<雜湊>.mp3；同一句已經做過就不再呼叫 API。
 * 最後寫出 award-out/voice/index-<聲音>.json（每句選用的檔案與秒數），剪接腳本照這份排。
 *
 * 聲音（--voice）：
 * - shihan（預設）：Fish Official 公開聲音「詩涵」，和遊戲的預錄語音同一個聲音
 * - kevin：Fish Audio 帳號內自建的聲音模型「凱文大叔快板」。使用者 2026-10-14 試聽比較（voice-compare.mjs）後選它
 *   （最順；3872b2 那個最準但偏慢，使用者以自然為主），並決定只對這個聲音套用的修正（fixes）：
 *   「知識」改同音字「知事」（原句不標準）、「AI」寫成「A I」（中間空格比較準）。
 *
 * 多轉幾次（--takes N）：同一句做 N 個版本（Fish 每次合成都不一樣），含「個」的句子另外多一個「個標輕聲」的版本；
 * 每個版本送 Groq Whisper 聽寫，預設選和原句最像的自然版本（同分選前面的）。
 * 使用者聽過試聽頁（award-out/voice/takes-<聲音>.html）想換版本時，寫進 award-out/voice/picks-<聲音>.json：
 * { "island#1": 3 }（段落#第幾句 → 第幾個版本，從 1 起算），重跑這支與 edit.mjs 就會換上。
 *
 * 用法（PowerShell 7）：
 *   node --env-file-if-exists=.env scripts/award/narration.mjs [--voice kevin] [--takes 3] [--check]
 *   （--check：takes 只有 1 個時也用 Whisper 聽寫比對；takes 多於 1 個時一定會聽寫）
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { esc, finish, fishTts, hash, pool, seconds, sleep } from '../voice/lib.mjs';
import { VOICES, phonemeTag } from '../voice/rules.mjs';
import { STORYBOARD } from './storyboard.mjs';

/** 可選的聲音：模型、聲音 id、語速（詩涵比遊戲的 0.9 快一點，旁白比較順）、只對這個聲音的讀音修正 */
const CHOICES = {
  shihan: { ...VOICES.find((v) => v.id === 'fish-shihan-zh'), speed: 1.0, fixes: [] },
  kevin: {
    model: 's2.1-pro-free',
    voice: '54e274adf1ee45b9adf7ad2c5c33aee1',
    speed: 1.0,
    fixes: [
      [/知識/g, '知事'],
      [/AI/g, 'A I'],
    ],
  },
};

/** 讀命令列的 --名稱 值 */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
}
/** 這次用的聲音名稱、聲音設定、每句做幾個版本、要不要聽寫 */
const NAME = arg('voice', 'shihan');
if (!CHOICES[NAME]) throw new Error(`沒有這個聲音：${NAME}（可選 ${Object.keys(CHOICES).join('、')}）`);
const VOICE = CHOICES[NAME];
const TAKES = Math.max(1, Number(arg('takes', '1')) || 1);
const CHECK = TAKES > 1 || process.argv.includes('--check');
const OUT = 'award-out/voice';
const HEARD = `${OUT}/heard.json`;
const PICKS = `${OUT}/picks-${NAME}.json`;
const key = process.env.FISH_API_KEY ?? '';
if (!key) throw new Error('缺 FISH_API_KEY（.env）');
mkdirSync(OUT, { recursive: true });

/** 「個」唸輕聲的讀音標記版本（個別的個是四聲，不改） */
const HAS_GE = /個(?!別)/;
const ge5 = (s) => s.replace(/個(?!別)/g, phonemeTag('ge5'));
/** 檔名：聲音、語速、唸法的雜湊；第 2 個版本起加上版本序號（第 1 個版本和以前做的同名，可以沿用） */
const fileOf = (say, k) => `${OUT}/${hash(`${VOICE.model}|${VOICE.voice}|${VOICE.speed}|${say}${k ? `|take${k}` : ''}`, 16)}.mp3`;

/** 全部要唸的句子：段落、第幾句、字幕、比對用的原句、各個版本（標籤、唸法、檔名、是不是自然版本） */
const items = STORYBOARD.flatMap((s) =>
  s.lines.map((l, i) => {
    let say = l.say ?? l.text;
    for (const [re, sub] of VOICE.fixes) say = say.replace(re, sub);
    const takes = Array.from({ length: TAKES }, (_, k) => ({ label: `第 ${k + 1} 次`, say, file: fileOf(say, k), natural: true }));
    if (TAKES > 1 && HAS_GE.test(say)) takes.push({ label: '個標輕聲', say: ge5(say), file: fileOf(ge5(say), 0), natural: false });
    // 有讀音標記的句子和字幕比（標記裡的拼音不是字）
    const ref = (l.say ?? l.text).includes('phoneme_start') ? l.text : (l.say ?? l.text);
    return { seg: s.id, i, id: `${s.id}#${i}`, text: l.text, ref, takes };
  }),
);

// ---------- 合成 ----------
let made = 0;
await pool(
  items.flatMap((it) => it.takes.map((t) => ({ it, t }))),
  3,
  async ({ it, t }) => {
    if (existsSync(t.file)) return;
    const raw = `${t.file}.raw.mp3`;
    writeFileSync(raw, await fishTts(key, VOICE.model, VOICE.voice, t.say, VOICE.speed));
    finish(raw, t.file, { bitrate: '96k' });
    rmSync(raw);
    made++;
    console.log(`配音 ${it.id}（${t.label}）：${t.say}`);
  },
);

// ---------- 聽寫與相似度 ----------
const DIGIT_ZH = '零一二三四五六七八九';
/** 比對用：數字換成國字、只留漢字與英數（小寫、去空格） */
const norm = (s) => s.toLowerCase().replace(/\d/g, (d) => DIGIT_ZH[Number(d)]).replace(/[^一-鿿a-z]/g, '');
/** 相似度：2 × 最長共同子序列 ÷ 兩邊長度和 */
function similarity(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  return (2 * dp[a.length][b.length]) / (a.length + b.length || 1);
}
/** 送 Groq Whisper 聽寫一個音檔（429 照 Retry-After 等） */
async function transcribe(file) {
  const groq = process.env.GROQ_API_KEY ?? '';
  if (!groq) throw new Error('缺 GROQ_API_KEY（.env）');
  for (let attempt = 0; attempt < 6; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([readFileSync(file)], { type: 'audio/mpeg' }), 'clip.mp3');
    form.append('model', process.env.GROQ_ASR_MODEL || 'whisper-large-v3-turbo');
    form.append('language', 'zh');
    form.append('prompt', '以下是繁體中文的句子。');
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${groq}`, 'User-Agent': 'learning-island-voice-check/1.0' }, body: form });
    if (res.status === 429) {
      await sleep(Math.min(60, (Number(res.headers.get('retry-after')) || 10) + 0.5) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Groq HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    return (await res.json()).text ?? '';
  }
  throw new Error('Groq 一直回 429');
}
/** 聽寫結果（音檔名 → 文字），存起來不重複送 */
const heard = existsSync(HEARD) ? JSON.parse(readFileSync(HEARD, 'utf8')) : {};
if (CHECK) {
  for (const it of items)
    for (const t of it.takes) {
      const name = t.file.split('/').pop();
      if (heard[name] === undefined) {
        heard[name] = await transcribe(t.file);
        writeFileSync(HEARD, JSON.stringify(heard, null, 1));
      }
      t.heard = heard[name];
      t.sim = similarity(norm(it.ref), norm(t.heard));
    }
}

// ---------- 每句選一個版本：使用者指定的 > 和原句最像的自然版本 > 第 1 個 ----------
const picks = existsSync(PICKS) ? JSON.parse(readFileSync(PICKS, 'utf8')) : {};
for (const it of items) {
  const want = picks[it.id];
  if (want && it.takes[want - 1]) it.chosen = want - 1;
  else {
    const natural = it.takes.map((t, k) => ({ t, k })).filter((x) => x.t.natural);
    it.chosen = natural.reduce((best, x) => ((x.t.sim ?? 0) > (it.takes[best].sim ?? 0) ? x.k : best), natural[0].k);
  }
}

const index = items.map((it) => {
  const t = it.takes[it.chosen];
  return { seg: it.seg, i: it.i, text: it.text, say: t.say, file: t.file, take: it.chosen + 1, seconds: seconds(t.file) };
});
writeFileSync(`${OUT}/index-${NAME}.json`, JSON.stringify(index, null, 1));
const total = index.reduce((a, b) => a + b.seconds, 0);
console.log(`聲音 ${NAME}：共 ${index.length} 句、每句 ${TAKES} 個版本（新做 ${made} 個），旁白合計 ${total.toFixed(1)} 秒`);
if (CHECK)
  for (const it of items) {
    const t = it.takes[it.chosen];
    if (t.sim < 0.9) console.log(`⚠ ${(t.sim * 100).toFixed(0)}% ${it.id}（選${t.label}）\n   原句：${it.ref}\n   聽到：${t.heard}`);
  }

// ---------- 版本的試聽頁 ----------
if (TAKES > 1) {
  /** 給人看的文字：讀音標記寫成「[拼音]」 */
  const show = (s) => esc(s.replace(/<\|phoneme_start\|>([a-z]+\d)<\|phoneme_end\|>/g, '[$1]'));
  /** 這句有沒有使用者特別在意的字（知識、AI、個） */
  const focus = (it) => /知識|AI|個(?!別)/.test(it.text);
  const max = Math.max(...items.map((it) => it.takes.length));
  const rows = items.map((it) => {
    const cells = it.takes
      .map((t, k) => {
        const src = t.file.split('/').pop();
        return `<td class="${k === it.chosen ? 'chosen' : ''}"><div class="label">${k + 1}. ${esc(t.label)}${k === it.chosen ? '　✔ 目前選用' : ''}</div><audio controls preload="none" src="${src}"></audio><div class="heard">聽寫 ${t.sim !== undefined ? `${Math.round(t.sim * 100)}%` : ''}：${esc(t.heard ?? '')}</div></td>`;
      })
      .join('');
    return `<tr class="${focus(it) ? 'focus' : ''}"><td class="text"><b>${esc(it.id)}</b><br>${show(it.takes[0].say)}</td>${cells}${'<td></td>'.repeat(max - it.takes.length)}</tr>`;
  });
  const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>旁白版本（${NAME}）</title><style>
  body { font-family: 'Microsoft JhengHei', sans-serif; margin: 20px; color: #1f2a37; }
  table { border-collapse: collapse; } td { border: 1px solid #c9d3df; padding: 6px 8px; vertical-align: top; font-size: 14px; }
  tr.focus td.text { background: #fff6e8; } td.chosen { background: #eef9f0; }
  audio { width: 220px; height: 32px; } .label { font-weight: 700; font-size: 13px; } .heard { color: #4a5768; font-size: 12px; max-width: 220px; }
  .text { max-width: 300px; }
</style></head><body>
<h1>旁白版本（${esc(NAME)}）</h1>
<p>每句做了 ${TAKES} 次（含「個」的句子另有一個「個標輕聲」版本）。綠底是目前選用的（Whisper 聽寫和原句最像的自然版本）；橘底的句子有「知識」「AI」「個」。
想換版本就告訴 Claude「段落#句子 用第幾個」，或寫進 award-out/voice/picks-${esc(NAME)}.json（例如 {"island#1": 3}）後重跑 narration.mjs 與 edit.mjs。</p>
<table>${rows.join('\n')}</table></body></html>`;
  writeFileSync(`${OUT}/takes-${NAME}.html`, html);
  console.log(`版本試聽頁：${OUT}/takes-${NAME}.html`);
}
