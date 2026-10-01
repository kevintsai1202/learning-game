/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { editionSchema, type Edition } from '../../src/content/editions/schema';
import kanghsuan from '../../src/content/editions/zh/kanghsuan.json';
import nani from '../../src/content/editions/zh/nani.json';
import hanlin from '../../src/content/editions/zh/hanlin.json';

/** 三個內建的國語版本：檔案內容、預期 id 與出版社 */
const FILES = [
  { name: 'kanghsuan.json', data: kanghsuan as unknown, id: 'kanghsuan-zh', publisher: '康軒' },
  { name: 'nani.json', data: nani as unknown, id: 'nani-zh', publisher: '南一' },
  { name: 'hanlin.json', data: hanlin as unknown, id: 'hanlin-zh', publisher: '翰林' },
];

/** 單一漢字（含擴充區）；Script=Han 排除注音符號、標點、拉丁字母與數字 */
const HAN_CHAR = /^\p{Script=Han}$/u;

/**
 * 解析並驗證一個版本檔；格式不符會直接丟出 zod 錯誤，讓測試失敗時能看到是哪個欄位。
 * @param data 從 JSON 讀進來的原始內容
 */
function parseEdition(data: unknown): Edition {
  return editionSchema.parse(data);
}

describe('內建國語版本（康軒、南一、翰林二年級）', () => {
  for (const f of FILES) {
    describe(f.name, () => {
      const edition = parseEdition(f.data);

      it('通過 editionSchema，id、科目、出版社、年級正確', () => {
        expect(edition.id).toBe(f.id);
        expect(edition.subject).toBe('zh');
        expect(edition.publisher).toBe(f.publisher);
        expect(edition.grade).toBe(2);
      });

      it('有上、下兩冊，且各冊至少 10 課', () => {
        expect(edition.volumes.map((v) => v.term)).toEqual(['上', '下']);
        for (const v of edition.volumes) {
          expect(v.units.length, `${f.id} 二${v.term}`).toBeGreaterThanOrEqual(10);
        }
      });

      it('課次 no 由 1 開始、依序遞增、不重複', () => {
        for (const v of edition.volumes) {
          const nos = v.units.map((u) => u.no);
          expect(nos[0], `${f.id} 二${v.term}`).toBe(1);
          expect(new Set(nos).size, `${f.id} 二${v.term} 課次重複`).toBe(nos.length);
          for (let i = 1; i < nos.length; i++) expect(nos[i]).toBeGreaterThan(nos[i - 1]);
        }
      });

      it('chars／readChars 每個元素都是單一漢字，同一課內不重複，且兩者不重疊', () => {
        for (const v of edition.volumes) {
          for (const u of v.units) {
            const where = `${f.id} 二${v.term} 第${u.no}課`;
            const chars = u.chars ?? [];
            const read = u.readChars ?? [];
            for (const c of [...chars, ...read]) expect(HAN_CHAR.test(c), `${where} 的「${c}」不是單一漢字`).toBe(true);
            expect(new Set(chars).size, `${where} 生字重複`).toBe(chars.length);
            expect(new Set(read).size, `${where} 認讀字重複`).toBe(read.length);
            expect(chars.filter((c) => read.includes(c)), `${where} 生字與認讀字重疊`).toEqual([]);
          }
        }
      });

      it('confidence 與資料一致：missing 以外都要有生字與來源', () => {
        for (const v of edition.volumes) {
          for (const u of v.units) {
            const where = `${f.id} 二${v.term} 第${u.no}課`;
            if (u.confidence === 'missing') continue;
            expect((u.chars ?? []).length, `${where} 沒有生字卻不是 missing`).toBeGreaterThan(0);
            expect(u.sources.length, `${where} 沒有來源`).toBeGreaterThan(0);
            // verified 要有兩個以上來源
            if (u.confidence === 'verified') expect(u.sources.length, `${where} verified 但來源不足兩個`).toBeGreaterThanOrEqual(2);
          }
        }
      });
    });
  }

  it('統計：每冊生字總數與 missing 課數（僅輸出資訊）', () => {
    const lines: string[] = [];
    for (const f of FILES) {
      const edition = parseEdition(f.data);
      for (const v of edition.volumes) {
        const total = v.units.reduce((n, u) => n + (u.chars?.length ?? 0), 0);
        const read = v.units.reduce((n, u) => n + (u.readChars?.length ?? 0), 0);
        const count = (c: string) => v.units.filter((u) => u.confidence === c).length;
        lines.push(
          `${f.publisher} 二${v.term}（${v.schoolYear} 學年）：${v.units.length} 課，生字 ${total}、認讀字 ${read}；` +
            `verified ${count('verified')}／single-source ${count('single-source')}／missing ${count('missing')}`,
        );
      }
    }
    const report = lines.join('\n');
    // console.log 在 verbose 報告器會顯示；預設報告器（非 TTY）會隱藏通過測試的 console 輸出，
    // 所以另用 process.stdout.write 確保直接執行時也看得到統計
    console.log(report);
    process.stdout.write(`${report}\n`);
    expect(lines).toHaveLength(6);
  });
});
