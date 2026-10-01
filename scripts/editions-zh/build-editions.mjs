// 由教育百科抓取結果（pedia-raw.json）與顏國雄試算表（gsheets-parsed.json）產生三個版本的 JSON。
// 規則：二上取 115 學年、二下取 114 學年；兩來源「該課字集合（習寫＋認讀）」完全一致 → verified，否則 single-source。
// 執行方式見同資料夾 README.md；中間檔放在目前工作目錄（建議 data-src/raw/editions-zh/）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/** 輸出到專案的 src/content/editions/zh（以本腳本位置推算，不寫死磁碟路徑） */
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/content/editions/zh');
const ped = JSON.parse(fs.readFileSync('pedia-raw.json', 'utf8'));
/** 第二來源（顏國雄試算表解析結果）可省略；省略時每課都標 single-source */
const sheets = fs.existsSync('gsheets-parsed.json') ? JSON.parse(fs.readFileSync('gsheets-parsed.json', 'utf8')) : {};

// 試算表（顏國雄「各版本筆順練習」）：每冊一個試算表檔，二年級三版本各一個分頁（gid）
const SHEET = {
  '115上': { id: '10Nq6prSt0s_ZI1Z1phlGEtr0MDDE1wDqEiPmnHWSM_Q', label: '115 上' },
  '114下': { id: '1veHorc7pgqXK-TX68mrki-78V4Rdt_zE6AXNq9a3jBU', label: '114 下' },
};
const GID = { 康軒: '1678501344', 南一: '1142161459', 翰林: '1569448306' };
// 康軒官方課程計畫（Google Drive docx）：只用來核對課名
const KH_PLAN = {
  上: { name: '康軒 115 學年度國語 2 上課程計畫（官方 docx，核對課名）', url: 'https://drive.google.com/file/d/13MHoZaWYBcQ0C588_CGP8jX2rxc1BElf/view' },
  下: { name: '康軒 115 學年度國語 2 下課程計畫（官方 docx，核對課名）', url: 'https://drive.google.com/file/d/18dnibp43K6ZoJWQZG0eMc98Pu8uQanii/view' },
};

const EDITIONS = [
  { file: 'kanghsuan.json', id: 'kanghsuan-zh', publisher: '康軒', press: '康軒版' },
  { file: 'nani.json', id: 'nani-zh', publisher: '南一', press: '南一版' },
  { file: 'hanlin.json', id: 'hanlin-zh', publisher: '翰林', press: '翰林版' },
];
// 各冊取用的資料集：term → { pedia 學期代碼, 試算表代碼, 學年度, 對照用的 113 學期 }
const VOL = {
  上: { py: '115_1', sheet: '115上', year: '115', y113: '113_1' },
  下: { py: '114_2', sheet: '114下', year: '114', y113: '113_2' },
};
// 人工判讀過的差異說明（key：版本id|冊|課次）
const MANUAL_NOTE = {
  'hanlin-zh|上|2': '115 上試算表作「使」，教育百科與 114 上試算表作「始」，且語詞有「開始」，採「始」。',
  'kanghsuan-zh|下|9': '試算表缺「抓」且「掀」重複，疑為筆誤；以教育百科為準。',
  'hanlin-zh|下|2': '試算表多列「圈」（認讀字），教育百科未列，未採用。',
  'nani-zh|下|12': '課名結尾為刪節號（教育百科作 ...）。',
};

/** 課名正規化：去「第N課：」前綴，半形問號改全形，結尾 ... 改 …… */
const normTitle = (t) => t.replace(/^第[一二三四五六七八九十]+課：/, '').replace(/\?/g, '？').replace(/\.\.\./g, '……');
const han = /^\p{Script=Han}$/u;

/** 自訂序列化：字元陣列等「全為短字串的陣列」排成一行，其餘 2 空白縮排 */
function ser(v, ind = '') {
  if (Array.isArray(v)) {
    if (v.every((x) => typeof x === 'string')) return '[' + v.map((x) => JSON.stringify(x)).join(', ') + ']';
    return '[\n' + v.map((x) => ind + '  ' + ser(x, ind + '  ')).join(',\n') + '\n' + ind + ']';
  }
  if (v && typeof v === 'object') {
    return '{\n' + Object.entries(v).map(([k, x]) => `${ind}  ${JSON.stringify(k)}: ${ser(x, ind + '  ')}`).join(',\n') + '\n' + ind + '}';
  }
  return JSON.stringify(v);
}

const report = [];
for (const ed of EDITIONS) {
  const volumes = [];
  for (const term of ['上', '下']) {
    const cfg = VOL[term];
    const rows = ped[`${ed.press}|${cfg.py}`];
    const rows113 = ped[`${ed.press}|${cfg.y113}`];
    const sheetRows = sheets[`${cfg.sheet}|${ed.publisher}`];
    const sh = SHEET[cfg.sheet];
    const units = rows.map((l, i) => {
      const no = i + 1;
      const title = normTitle(l.title);
      const chars = l.chars, readChars = l.readChars;
      for (const c of [...chars, ...readChars]) if (!han.test(c)) throw new Error(`非單一漢字 ${ed.id} ${term} L${no}: ${c}`);
      if (new Set(chars).size !== chars.length) throw new Error('chars 重複');
      const words = [...new Set(l.words.map((w) => w.trim()).filter((w) => w.length >= 1 && w.length <= 8))].slice(0, 40);
      if (words.length !== new Set(l.words).size) report.push(`語詞被過濾/截斷 ${ed.id} ${term} L${no}`);
      // 與第二來源比對（習寫＋認讀的字集合）
      const a = new Set([...chars, ...readChars]);
      const b = new Set((sheetRows ?? {})[no] ?? []);
      const same = a.size === b.size && [...a].every((c) => b.has(c));
      const confidence = same ? 'verified' : 'single-source';
      const sources = [
        { name: `教育百科生字詞彙表（${ed.press} 二${term} 第${no}課）`, url: `https://pedia.cloud.edu.tw/Bookmark/TCollection?TextNameId=${l.id}`, schoolYear: cfg.year },
        { name: `顏國雄「各版本筆順練習」試算表（${sh.label} ${ed.publisher} 2 年級）`, url: `https://docs.google.com/spreadsheets/d/${sh.id}/edit?gid=${GID[ed.publisher]}`, schoolYear: cfg.year },
      ];
      if (ed.publisher === '康軒') sources.push({ ...KH_PLAN[term], schoolYear: '115' });
      // 註記：與 113 學年同課次課名不同、人工判讀的差異
      const notes = [];
      const t113 = rows113?.[i] ? normTitle(rows113[i].title) : null;
      if (t113 && t113 !== title) notes.push(`113 學年同課次為〈${t113}〉。`);
      const man = MANUAL_NOTE[`${ed.id}|${term}|${no}`];
      if (man) notes.push(man);
      const note = notes.join('');
      if (note.length > 200) throw new Error('note 過長');
      const u = { no, title, chars };
      if (readChars.length) u.readChars = readChars;
      if (words.length) u.words = words;
      u.confidence = confidence;
      u.sources = sources;
      if (note) u.note = note;
      return u;
    });
    volumes.push({ term, schoolYear: cfg.year, units });
  }
  const edition = {
    format: 'learning-island-edition', version: 1, id: ed.id, subject: 'zh', publisher: ed.publisher, grade: 2, volumes,
    note: '二上整理自 115 學年度、二下自 114 學年度（115 下尚無公開生字資料）。同課名的生字逐年有調整，勿與其他學年度混用。習寫字與認讀字的區分以教育百科為準；試算表來源不分兩者。',
  };
  fs.writeFileSync(`${OUT}/${ed.file}`, ser(edition) + '\n', 'utf8');
  const conf = volumes.map((v) => v.units.reduce((m, u) => ((m[u.confidence] = (m[u.confidence] || 0) + 1), m), {}));
  console.log(ed.id, JSON.stringify(conf), '寫字', volumes.map((v) => v.units.reduce((n, u) => n + u.chars.length, 0)).join('/'));
}
console.log(report.join('\n') || '無語詞過濾');
