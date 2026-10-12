/**
 * 從 Freesound 找、下載作者標為 CC0 的真實錄音（班級島大型設施的音效，docs/plans/grand-rides.md 第 11 節）。
 * 使用者要求「聲音要自然，不要電子罐頭音」，所以設施的聲音一律用真實錄音。
 * - search：用 CC0 篩選搜尋（照下載數排），列出編號、名稱、長度、作者。篩選只是提示，下載時還會逐頁查證。
 * - fetch：逐頁讀授權欄（必須是 CC0 1.0，而且只有這一個授權）才下載高音質試聽檔（128 kbps MP3），
 *   存到 data-src/raw/audio/fs-<編號>.mp3（不進版控），作者、原頁網址、授權、標籤、說明寫進 data-src/audio/sources.json。
 * 用法（PowerShell 7）：
 *   node scripts/audio/freesound.mjs search "roller coaster chain" 15
 *   node scripts/audio/freesound.mjs fetch 171510 19344
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const RAW = 'data-src/raw/audio';
const META = 'data-src/audio/sources.json';
const CC0 = 'creativecommons.org/publicdomain/zero/1.0';

/** 取出 HTML 屬性（簡單的正規表示式，Freesound 的頁面結構固定） */
const attrs = (html, name) => [...html.matchAll(new RegExp(`${name}="([^"]*)"`, 'g'))].map((m) => m[1]);
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** 搜尋（CC0、照下載數排） */
async function search(query, n) {
  const url = `https://freesound.org/search/?q=${encodeURIComponent(query)}&f=${encodeURIComponent('license:"Creative Commons 0"')}&s=${encodeURIComponent('Downloads (most first)')}`;
  const html = await (await fetch(url)).text();
  const ids = attrs(html, 'data-sound-id');
  const titles = attrs(html, 'data-title').map(decode);
  const durs = attrs(html, 'data-duration');
  const users = attrs(html, 'data-username');
  for (let i = 0; i < Math.min(n, ids.length); i++) console.log(`${ids[i]}\t${Number(durs[i]).toFixed(1)}s\t${users[i]}\t${titles[i]}`);
  if (!ids.length) console.log('（沒有結果）');
}

/** 逐頁查證授權、下載高音質試聽檔、記下來源 */
async function fetchSounds(ids) {
  mkdirSync(RAW, { recursive: true });
  const meta = existsSync(META) ? JSON.parse(readFileSync(META, 'utf8')) : {};
  for (const id of ids) {
    // 搜尋結果的網址要有作者；用 /s/<編號>/ 會轉址到正式頁
    const res = await fetch(`https://freesound.org/s/${id}/`, { redirect: 'follow' });
    const page = res.url;
    const html = await res.text();
    const licenses = [...new Set([...html.matchAll(/title="Go to the full license text" href="([^"]*)"/g)].map((m) => m[1]))];
    if (licenses.length !== 1 || !licenses[0].includes(CC0)) {
      console.log(`✗ ${id}：授權不是只有 CC0（${licenses.join('、') || '找不到'}），不下載`);
      continue;
    }
    // 名稱裡可能也有「 by 」：作者取最後一個「 by 」後面
    const t = /<title>Freesound - (.*) by ([^<]*)<\/title>/.exec(html);
    const title = decode(t?.[1] ?? '');
    const author = decode(t?.[2] ?? '');
    const lq = /og:audio" content="[^"]*(https:\/\/cdn\.freesound\.org\/previews\/[^"]*-lq\.mp3)"/.exec(html)?.[1];
    if (!lq) {
      console.log(`✗ ${id}：找不到試聽檔`);
      continue;
    }
    const hq = lq.replace('-lq.mp3', '-hq.mp3');
    const tags = [...new Set([...html.matchAll(/href="\/browse\/tags\/([^/"]+)\/"/g)].map((m) => decodeURIComponent(m[1])))];
    const desc = decode((/<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '').slice(0, 300));
    const audio = Buffer.from(await (await fetch(hq)).arrayBuffer());
    writeFileSync(`${RAW}/fs-${id}.mp3`, audio);
    meta[id] = { id, title, author, page, license: 'CC0 1.0', licenseUrl: licenses[0], preview: hq, tags, description: desc, checked: new Date().toLocaleDateString('sv') };
    console.log(`✓ ${id}：${title}（${author}），${(audio.length / 1024).toFixed(0)} KB`);
  }
  mkdirSync('data-src/audio', { recursive: true });
  writeFileSync(META, JSON.stringify(meta, null, 2));
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'search') await search(rest[0], Number(rest[1] ?? 12));
else if (cmd === 'fetch') await fetchSounds(rest);
else console.log('用法：node scripts/audio/freesound.mjs search "<關鍵字>" [筆數] ｜ fetch <編號>...');
