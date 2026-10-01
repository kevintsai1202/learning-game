/**
 * 查 Fish Audio 公開聲音庫（查詢不花額度），只列出作者是 Fish 官方的聲音，
 * 給試聽比較與預錄語音檔挑聲音用。名人仿聲等非官方聲音不能用在公開網站，所以不列。
 *
 * 用法（PowerShell 7，專案根目錄；金鑰放在 .env 的 FISH_API_KEY）：
 *   node --env-file-if-exists=.env scripts/voice/fish-voices.mjs zh 台灣
 *   node --env-file-if-exists=.env scripts/voice/fish-voices.mjs en
 */
const [lang = 'zh', title = ''] = process.argv.slice(2);
const key = process.env.FISH_API_KEY;
if (!key) {
  console.error('找不到 FISH_API_KEY（專案根目錄 .env）');
  process.exit(1);
}

/**
 * 官方聲音的作者暱稱必須完全等於「Fish Official」。
 * 不能寬鬆比對：作者「fishaudio」底下有名人仿聲（例如 sydney sweeney），不能用。
 */
const OFFICIAL = /^Fish Official$/;

const found = new Map();
for (let page = 1; page <= 5; page++) {
  const q = new URLSearchParams({ page_size: '50', page_number: String(page), language: lang, sort_by: 'task_count' });
  if (title) q.set('title', title);
  const res = await fetch(`https://api.fish.audio/model?${q}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    console.error(`查詢失敗：HTTP ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const data = await res.json();
  const items = data.items ?? [];
  for (const m of items) {
    const author = m.author?.nickname ?? '';
    if (m.type !== 'tts' || !OFFICIAL.test(author)) continue;
    found.set(m._id, { id: m._id, title: m.title, author, languages: (m.languages ?? []).join(','), tasks: m.task_count ?? 0 });
  }
  if (items.length < 50) break;
}
const list = [...found.values()].sort((a, b) => b.tasks - a.tasks);
for (const v of list) console.log(`${v.id}  ${v.title}  [${v.languages}]  作者 ${v.author}  使用 ${v.tasks}`);
console.log(`共 ${list.length} 個官方聲音（語言 ${lang}${title ? `、標題含「${title}」` : ''}）`);
