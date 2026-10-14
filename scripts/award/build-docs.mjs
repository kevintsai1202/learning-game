/**
 * 比賽報名文件的建置（docs/award/apcea-2026/README.md 第 7 節）：
 * ① 架構圖與 AI 閉環圖（SVG）→ PNG（寄信的附件、影片的畫面）
 * ② 作品說明書（作品說明書.md）→ pandoc 轉 HTML → Playwright 印成 A4 PDF（頁尾有頁碼），印出總頁數
 * ③ 報名填寫文件（報名填寫.md）→ pandoc 轉 Word
 * ④ 系統畫面（award-out/shots/，錄影腳本截的）→ zip
 * 輸出都在 award-out/（不進版控）。說明書的封面寫創作者名稱：--author "名稱"（沒給時留【創作者】讓人看得出來要填）。
 * 用法（PowerShell 7）：node scripts/award/build-docs.mjs --author "<創作者或團隊名稱>"
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

/** 文件來源、輸出、說明書的建置暫存資料夾 */
const SRC = 'docs/award/apcea-2026';
const OUT = 'award-out';
const BUILD = join(OUT, 'build');
/** 附件與輸出檔名的前綴（作品名稱） */
const NAME = '知識島大冒險';

/** 讀命令列的 --author */
const argAt = process.argv.indexOf('--author');
const author = argAt > 0 ? process.argv[argAt + 1] : '【創作者】';

/** 執行外部指令，失敗就丟錯（印出 stderr） */
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} 失敗：${r.stderr || r.error}`);
  return r.stdout;
}

/** 數 PDF 有幾頁（數 /Type /Page，不含 /Pages） */
const pdfPages = (file) => (readFileSync(file, 'latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

rmSync(BUILD, { recursive: true, force: true });
mkdirSync(BUILD, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

// ---------- ① SVG → PNG（兩倍解析度） ----------
for (const [svg, png] of [
  ['architecture.svg', `${NAME}-架構圖.png`],
  ['ai-loop.svg', `${NAME}-AI閉環.png`],
]) {
  const text = readFileSync(join(SRC, svg), 'utf8');
  const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(text);
  const p = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
  await p.setContent(`<html><body style="margin:0">${text}</body></html>`);
  await p.locator('svg').screenshot({ path: join(OUT, png) });
  await p.close();
  copyFileSync(join(SRC, svg), join(BUILD, svg));
  console.log(`圖：${join(OUT, png)}`);
}

// ---------- ② 作品說明書 → PDF ----------
/** 截圖：錄影腳本存在 award-out/shots/；缺的圖換成提示框，PDF 仍然印得出來 */
const md = readFileSync(join(SRC, '作品說明書.md'), 'utf8').replaceAll('{{AUTHOR}}', author);
const missing = [];
const mdFixed = md.replace(/!\[([^\]]*)\]\((shots\/[^)]+)\)/g, (all, alt, path) => {
  if (existsSync(join(OUT, path))) return all;
  missing.push(path);
  return `[（缺截圖 ${path}：${alt}）]{.missing}`;
});
if (existsSync(join(OUT, 'shots'))) {
  mkdirSync(join(BUILD, 'shots'), { recursive: true });
  for (const f of readdirSync(join(OUT, 'shots'))) copyFileSync(join(OUT, 'shots', f), join(BUILD, 'shots', f));
}
writeFileSync(join(BUILD, 'manual.md'), mdFixed);
const body = run('pandoc', [join(BUILD, 'manual.md'), '-f', 'markdown', '-t', 'html5']);

/** 說明書的版面：A4、微軟正黑體、表格與圖的大小（控制在正文 5 頁） */
const css = `
  @page { size: A4; margin: 14mm 15mm 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Microsoft JhengHei', 'Noto Sans TC', sans-serif; font-size: 9.6pt; line-height: 1.5; color: #1f2a37; margin: 0; }
  h1 { font-size: 24pt; margin: 0 0 2pt; color: #1d3f8f; }
  h2 { font-size: 13.5pt; margin: 12pt 0 5pt; padding: 3pt 8pt; background: #eef4ff; border-left: 5pt solid #3b6fd8; break-after: avoid; }
  h3 { font-size: 11pt; margin: 9pt 0 3pt; color: #1d3f8f; break-after: avoid; }
  p { margin: 3pt 0 5pt; }
  ul, ol { margin: 3pt 0 5pt; padding-left: 18pt; }
  li { margin: 1.5pt 0; }
  table { border-collapse: collapse; width: 100%; margin: 4pt 0 6pt; font-size: 8.6pt; line-height: 1.4; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 0.6pt solid #c9d3df; padding: 2.4pt 4.5pt; vertical-align: top; text-align: left; }
  th { background: #f3f6fb; }
  code { font-family: Consolas, monospace; font-size: 8.5pt; background: #f3f6fb; padding: 0 2pt; border-radius: 2pt; }
  .cover { border: 1.2pt solid #c9d3df; border-radius: 8pt; padding: 10pt 14pt 6pt; margin-bottom: 4pt; background: #fbfcfe; }
  .cover .sub { font-size: 14pt; font-weight: 700; color: #3b6fd8; }
  .cover .meta { font-size: 9pt; color: #4a5768; }
  .cover table { margin-top: 6pt; }
  figure { margin: 6pt 0; text-align: center; break-inside: avoid; }
  figure img { max-width: 100%; }
  img.fig, figure img.fig { width: 76%; }
  figcaption { font-size: 8.5pt; color: #4a5768; }
  .shots { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt 10pt; margin: 6pt 0; }
  .shots figure { margin: 0; }
  .shots img { width: 100%; border: 0.6pt solid #c9d3df; border-radius: 4pt; }
  .shots.four { grid-template-columns: repeat(4, 1fr); gap: 4pt 6pt; }
  .shots.four figcaption { font-size: 7.5pt; }
  .appendix { font-size: 8.4pt; }
  .appendix table { font-size: 7.8pt; line-height: 1.32; }
  .appendix th, .appendix td { padding: 1.8pt 4pt; }
  .missing { display: block; border: 1pt dashed #e39b2d; padding: 18pt 6pt; color: #b8741a; text-align: center; font-size: 9pt; }
  .pb { break-after: page; }
`;
writeFileSync(join(BUILD, 'manual.html'), `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${NAME} 作品說明書</title><style>${css}</style></head><body>${body}</body></html>`);
await page.goto('file://' + resolve(BUILD, 'manual.html').replaceAll('\\', '/'));
await page.waitForLoadState('networkidle');
const pdf = join(OUT, `${NAME}-作品說明書.pdf`);
await page.pdf({
  path: pdf,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font-size:8pt;color:#8a97a8;text-align:center;font-family:'Microsoft JhengHei'">${NAME}｜作品說明書　<span class="pageNumber"></span> / <span class="totalPages"></span></div>`,
});
console.log(`說明書：${pdf}（${pdfPages(pdf)} 頁）`);
if (missing.length) console.log(`⚠ 缺截圖（先跑錄影腳本）：${missing.join('、')}`);

await browser.close();

// ---------- ③ 報名填寫文件 → Word ----------
const docx = join(OUT, `${NAME}-報名填寫.docx`);
run('pandoc', [join(SRC, '報名填寫.md'), '-f', 'markdown', '-t', 'docx', '-o', docx]);
console.log(`報名填寫：${docx}`);

// ---------- ④ 系統畫面 → zip ----------
if (existsSync(join(OUT, 'shots')) && readdirSync(join(OUT, 'shots')).length) {
  const zip = resolve(OUT, `${NAME}-系統畫面.zip`);
  rmSync(zip, { force: true });
  run('pwsh', ['-NoProfile', '-Command', `Compress-Archive -Path '${resolve(OUT, 'shots')}\\*' -DestinationPath '${zip}'`]);
  console.log(`系統畫面：${zip}`);
}
