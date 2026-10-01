// 驗證：詳細頁「此標籤共 N 筆詞條」是否等於 生字+認讀字+語詞 列數（確認沒有漏抓）
import fs from 'node:fs';
const ped = JSON.parse(fs.readFileSync('pedia-raw.json','utf8'));
const sets = ['康軒版|115_1','南一版|115_1','翰林版|115_1','康軒版|114_2','南一版|114_2','翰林版|114_2'];
const strip = (s) => s.replace(/<[^>]+>/g, '').trim();
const res = {};
for (const key of sets) {
  for (const l of ped[key]) {
    const h = await (await fetch(`https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=${l.id}`)).text();
    const n = +(h.match(/此標籤共\s*(\d+)\s*筆詞條/)?.[1] ?? -1);
    const rows = [...h.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(x => strip(x[1])));
    const cats = {};
    for (const r of rows) if (r.length >= 2 && ['生字','認讀字','語詞'].includes(r[0])) cats[r[0]] = (cats[r[0]] || 0) + 1;
    const total = Object.values(cats).reduce((a, b) => a + b, 0);
    const flag = total === n ? 'OK' : 'MISMATCH';
    const dupChars = l.chars.length !== (cats['生字'] || 0) ? `(生字列${cats['生字']}→去重${l.chars.length})` : '';
    console.log(key, l.title, 'N=', n, '列=', total, JSON.stringify(cats), flag, dupChars);
    await new Promise(r => setTimeout(r, 100));
  }
}
