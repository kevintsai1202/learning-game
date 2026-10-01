// 抓教育部教育百科「生字詞彙表」二年級國語：三版本 x 多學年度，輸出 pedia-raw.json
import fs from 'node:fs';
const presses = ['康軒版', '南一版', '翰林版'];
const terms = process.argv[2] ? process.argv[2].split(',') : ['108_1','108_2','109_1','109_2','110_1','110_2','111_1','111_2','112_1','112_2','113_1','113_2','114_1','114_2','115_1','115_2'];
const out = fs.existsSync('pedia-raw.json') ? JSON.parse(fs.readFileSync('pedia-raw.json','utf8')) : {};
const strip = (s) => s.replace(/<[^>]+>/g, '').trim();
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url); if (r.ok) return await r.text(); } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}
for (const press of presses) for (const t of terms) {
  const key = `${press}|${t}`;
  if (out[key]) continue;
  const listUrl = `https://pedia.cloud.edu.tw/Bookmark/Textword?category=${encodeURIComponent('國語')}&year=${t}&degree=2&press=${encodeURIComponent(press)}`;
  const h = await get(listUrl);
  if (!h) { console.log('FAIL list', key); continue; }
  const rows = [...h.matchAll(/class="textname[^"]*" id="(\d+)">\s*<strong>([^<]+)<\/strong>\s*<span[^>]*>([^<]+)<\/span>/g)];
  if (!rows.length) { console.log('EMPTY', key); out[key] = []; continue; }
  const lessons = [];
  for (const [, id, title, meta] of rows) {
    const d = await get(`https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=${id}`);
    if (!d) { console.log('FAIL lesson', id); continue; }
    // 詞條表格：每列含詞條類別、名稱
    const tbody = d;
    const items = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(x => strip(x[1]).replace(/\s+/g,' ')));
    const chars = [], readChars = [], words = [];
    for (const cells of items) {
      if (cells.length < 2) continue;
      const [cat, name] = cells;
      if (cat === '生字') { if (!chars.includes(name)) chars.push(name); }
      else if (cat === '認讀字') { if (!readChars.includes(name)) readChars.push(name); }
      else if (cat === '語詞') words.push(name);
    }
    const media = [...d.matchAll(/教育媒體影音/g)].length;
    lessons.push({ id, title: title.trim(), meta: meta.trim(), chars, readChars, words, rowCount: items.length, media });
    await new Promise(r => setTimeout(r, 150));
  }
  out[key] = lessons;
  console.log(key, lessons.length, lessons.map(l => `${l.title}(${l.chars.length}/${l.readChars.length}/${l.words.length})`).join(' '));
  fs.writeFileSync('pedia-raw.json', JSON.stringify(out, null, 1));
}
