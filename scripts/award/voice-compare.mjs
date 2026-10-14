/**
 * 展示影片配音的試聽比較（docs/award/apcea-2026/README.md）：Fish Audio 帳號裡所有「凱文大叔」聲音模型 ×
 * 問題句子的幾種寫法（原句、讀音標記、同音字…），做成試聽頁讓使用者挑聲音與寫法。
 * 問題來自使用者 2026-10-14 聽完凱文大叔版：知識島的「知識」不標準、「AI」唸得怪、「個」偏二聲（應該輕聲）。
 * 每個音檔也送 Groq Whisper 聽寫一次，寫在格子裡當參考（Whisper 聽不太出聲調，只能看出明顯唸錯的字）。
 * 音檔與試聽頁輸出到 award-out/voice-compare/（不進版控）；同一個聲音、同一段文字做過就不再呼叫 API。
 * 用法（PowerShell 7）：
 *   node --env-file-if-exists=.env scripts/award/voice-compare.mjs
 *   Start-Process award-out\voice-compare\index.html
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { esc, finish, fishTts, hash, pool, seconds, sleep } from '../voice/lib.mjs';
import { phonemeTag as t } from '../voice/rules.mjs';

const OUT = 'award-out/voice-compare';
const HEARD = `${OUT}/heard.json`;
const MODEL = 's2.1-pro-free';
const SPEED = 1.0;
const fish = process.env.FISH_API_KEY ?? '';
const groq = process.env.GROQ_API_KEY ?? '';
if (!fish) throw new Error('缺 FISH_API_KEY（.env）');
mkdirSync(OUT, { recursive: true });

/** 「個」唸輕聲：個別的個是四聲，不改 */
const ge = (s, tone) => s.replace(/個(?!別)/g, t(`ge${tone}`));

/** 比較的句子與寫法（text 是送去合成的文字） */
const ROWS = [
  {
    key: '知識島（影片 0:00）',
    variants: [
      { label: '原句', text: '知識島大冒險，是給國小二年級的 AI 適性學習島。' },
      { label: '識標四聲', text: `知${t('shi4')}島大冒險，是給國小二年級的 AI 適性學習島。` },
      { label: '知、識都標', text: `${t('zhi1')}${t('shi4')}島大冒險，是給國小二年級的 AI 適性學習島。` },
      { label: '同音字「知事」', text: '知事島大冒險，是給國小二年級的 AI 適性學習島。' },
    ],
  },
  {
    key: 'AI（影片 2:18）',
    variants: [
      { label: '原句', text: '按下「AI 分析全班」，送給 AI 的只有匿名統計，沒有任何姓名。' },
      { label: 'A.I.', text: '按下「A.I. 分析全班」，送給 A.I. 的只有匿名統計，沒有任何姓名。' },
      { label: 'A I（空格）', text: '按下「A I 分析全班」，送給 A I 的只有匿名統計，沒有任何姓名。' },
      { label: '全形 Ａ Ｉ', text: '按下「Ａ Ｉ 分析全班」，送給 Ａ Ｉ 的只有匿名統計，沒有任何姓名。' },
    ],
  },
  {
    key: '個（影片 0:26）',
    variants: [
      { label: '原句', text: '每棟建竹是一個科目：國語、數學、英語、生活都有。' },
      { label: '個標輕聲 ge5', text: ge('每棟建竹是一個科目：國語、數學、英語、生活都有。', 5) },
      { label: '個標輕聲 ge0', text: ge('每棟建竹是一個科目：國語、數學、英語、生活都有。', 0) },
    ],
  },
  {
    key: '結尾（影片 3:31）',
    variants: [
      { label: '原句', text: '知識島大冒險已經上線，免費使用。讓 AI 陪每個孩子，找到自己的學習節奏。' },
      { label: '識標四聲＋個輕聲', text: ge(`知${t('shi4')}島大冒險已經上線，免費使用。讓 AI 陪每個孩子，找到自己的學習節奏。`, 5) },
      { label: '知事＋個輕聲', text: ge('知事島大冒險已經上線，免費使用。讓 AI 陪每個孩子，找到自己的學習節奏。', 5) },
    ],
  },
];

// 帳號裡的「凱文大叔」聲音模型（最常用的排前面）
const res = await fetch('https://api.fish.audio/model?self=true&page_size=50', { headers: { Authorization: `Bearer ${fish}` } });
if (!res.ok) throw new Error(`Fish 聲音清單 HTTP ${res.status}`);
const voices = ((await res.json()).items ?? [])
  .filter((m) => m.title.includes('凱文大叔'))
  .sort((a, b) => (b.task_count ?? 0) - (a.task_count ?? 0))
  .map((m) => ({ id: m._id, title: m.title, created: m.created_at.slice(0, 10), uses: m.task_count ?? 0 }));
console.log(`凱文大叔聲音 ${voices.length} 個：${voices.map((v) => `${v.title}(${v.id.slice(0, 6)})`).join('、')}`);

/** 全部要做的音檔：聲音 × 寫法 */
const jobs = voices.flatMap((v) => ROWS.flatMap((r, ri) => r.variants.map((x, xi) => ({ v, ri, xi, text: x.text, file: `${hash(`${MODEL}|${v.id}|${SPEED}|${x.text}`, 16)}.mp3` }))));
let made = 0;
await pool(jobs, 3, async (j) => {
  const out = `${OUT}/${j.file}`;
  if (existsSync(out)) return;
  const raw = `${out}.raw.mp3`;
  writeFileSync(raw, await fishTts(fish, MODEL, j.v.id, j.text, SPEED));
  finish(raw, out, { bitrate: '96k' });
  rmSync(raw);
  made++;
});
console.log(`音檔 ${jobs.length} 個（新做 ${made} 個）`);

/** Whisper 聽寫（有 GROQ_API_KEY 才做；結果存起來，不重複送） */
const heard = existsSync(HEARD) ? JSON.parse(readFileSync(HEARD, 'utf8')) : {};
if (groq) {
  for (const j of jobs) {
    if (heard[j.file] !== undefined) continue;
    for (let attempt = 0; attempt < 6; attempt++) {
      const form = new FormData();
      form.append('file', new Blob([readFileSync(`${OUT}/${j.file}`)], { type: 'audio/mpeg' }), 'clip.mp3');
      form.append('model', process.env.GROQ_ASR_MODEL || 'whisper-large-v3-turbo');
      form.append('language', 'zh');
      form.append('prompt', '以下是繁體中文的句子。');
      const r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${groq}`, 'User-Agent': 'learning-island-voice-check/1.0' }, body: form });
      if (r.status === 429) {
        await sleep(Math.min(60, (Number(r.headers.get('retry-after')) || 10) + 0.5) * 1000);
        continue;
      }
      if (!r.ok) throw new Error(`Groq HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
      heard[j.file] = (await r.json()).text ?? '';
      break;
    }
    writeFileSync(HEARD, JSON.stringify(heard, null, 1));
  }
}

/** 給人看的文字：讀音標記寫成「[拼音]」 */
const show = (s) => esc(s.replace(/<\|phoneme_start\|>([a-z]+\d)<\|phoneme_end\|>/g, '[$1]'));
const cell = (v, ri, xi) => {
  const j = jobs.find((x) => x.v === v && x.ri === ri && x.xi === xi);
  const h = heard[j.file];
  return `<td><audio controls preload="none" src="${j.file}"></audio><div class="sec">${seconds(`${OUT}/${j.file}`).toFixed(1)} 秒</div>${h !== undefined ? `<div class="heard">聽寫：${esc(h)}</div>` : ''}</td>`;
};
const html = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>凱文大叔聲音比較</title><style>
  body { font-family: 'Microsoft JhengHei', sans-serif; margin: 20px; color: #1f2a37; }
  table { border-collapse: collapse; } th, td { border: 1px solid #c9d3df; padding: 6px 8px; vertical-align: top; font-size: 14px; }
  th { background: #f3f6fb; position: sticky; top: 0; } h2 { margin: 26px 0 8px; font-size: 18px; }
  audio { width: 210px; height: 32px; } .sec { color: #8a97a8; font-size: 12px; } .heard { color: #4a5768; font-size: 12px; max-width: 210px; }
  .text { max-width: 280px; } .label { font-weight: 700; }
</style></head><body>
<h1>凱文大叔聲音比較</h1>
<p>Fish Audio 帳號裡的「凱文大叔」聲音模型（模型 ${MODEL}、語速 ${SPEED}）。請挑：① 哪個聲音 ② 每一列哪種寫法最自然。「聽寫」是 Whisper 聽到的字，只能當參考。</p>
${ROWS.map(
  (r, ri) => `<h2>${esc(r.key)}</h2><table><tr><th>寫法</th>${voices.map((v) => `<th>${esc(v.title)}<br><small>${v.id.slice(0, 8)}・${v.created}・用過 ${v.uses} 次</small></th>`).join('')}</tr>
${r.variants.map((x, xi) => `<tr><td class="text"><div class="label">${esc(x.label)}</div>${show(x.text)}</td>${voices.map((v) => cell(v, ri, xi)).join('')}</tr>`).join('\n')}</table>`,
).join('\n')}
</body></html>`;
writeFileSync(`${OUT}/index.html`, html);
console.log(`試聽頁：${OUT}/index.html`);
