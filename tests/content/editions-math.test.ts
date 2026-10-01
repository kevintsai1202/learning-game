/**
 * 數學教材版本資料（康軒、南一、翰林二年級）的驗證：
 * 格式要通過 editionSchema、每個單元對應的出題技能都要真的存在、單元編號要連續、
 * 並檢查資料可信度與來源欄位彼此一致。資料說明見 docs/research/editions-math.md。
 */
import { describe, expect, it } from 'vitest';
import { editionSchema, type Edition } from '../../src/content/editions/schema';
import { MATH_SKILLS } from '../../src/engine/math';
import kanghsuan from '../../src/content/editions/math/kanghsuan.json';
import nani from '../../src/content/editions/math/nani.json';
import hanlin from '../../src/content/editions/math/hanlin.json';

/** 專案內建的數學技能 id 集合 */
const SKILL_IDS = new Set(MATH_SKILLS.map((s) => s.id));

/** 三個版本：檔案內容與預期的 id、出版社 */
const EDITIONS = [
  { label: '康軒', raw: kanghsuan as unknown, id: 'kanghsuan-math', publisher: '康軒' },
  { label: '南一', raw: nani as unknown, id: 'nani-math', publisher: '南一' },
  { label: '翰林', raw: hanlin as unknown, id: 'hanlin-math', publisher: '翰林' },
];

describe.each(EDITIONS)('數學教材版本：$label', ({ raw, id, publisher }) => {
  it('通過 editionSchema 驗證', () => {
    const r = editionSchema.safeParse(raw);
    // 失敗時把 zod 的問題清單帶進訊息，方便定位是哪一個欄位
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues, null, 2)).toBe(true);
  });

  const ed = editionSchema.parse(raw) as Edition;

  it('id、科目、出版社、年級正確', () => {
    expect(ed.id).toBe(id);
    expect(ed.subject).toBe('math');
    expect(ed.publisher).toBe(publisher);
    expect(ed.grade).toBe(2);
  });

  it('有「上」「下」兩冊，且每冊至少 6 個單元', () => {
    expect(ed.volumes.map((v) => v.term)).toEqual(['上', '下']);
    for (const v of ed.volumes) expect(v.units.length).toBeGreaterThanOrEqual(6);
  });

  it('每個單元的 no 從 1 開始依序、不重複', () => {
    for (const v of ed.volumes) {
      const nos = v.units.map((u) => u.no);
      expect(nos, `${v.term}冊`).toEqual(nos.map((_, i) => i + 1));
      expect(new Set(nos).size).toBe(nos.length);
    }
  });

  it('單元名稱在同一冊內不重複', () => {
    for (const v of ed.volumes) {
      const titles = v.units.map((u) => u.title);
      expect(new Set(titles).size, `${v.term}冊`).toBe(titles.length);
    }
  });

  it('每個單元的 skills 都存在於 MATH_SKILLS，且 1～4 個、不重複', () => {
    for (const v of ed.volumes) {
      for (const u of v.units) {
        const where = `${v.term}冊第 ${u.no} 單元「${u.title}」`;
        expect(u.skills, where).toBeDefined();
        const skills = u.skills ?? [];
        expect(skills.length, where).toBeGreaterThanOrEqual(1);
        expect(skills.length, where).toBeLessThanOrEqual(4);
        expect(new Set(skills).size, `${where} 有重複技能`).toBe(skills.length);
        for (const s of skills) expect(SKILL_IDS.has(s), `${where} 的技能 ${s} 不存在`).toBe(true);
      }
    }
  });

  it('可信度與來源一致：verified 至少兩個不同來源、single-source 一個以上、missing 才可以沒有來源', () => {
    for (const v of ed.volumes) {
      for (const u of v.units) {
        const where = `${v.term}冊第 ${u.no} 單元「${u.title}」`;
        const urls = u.sources.map((s) => s.url);
        expect(new Set(urls).size, `${where} 來源網址重複`).toBe(urls.length);
        if (u.confidence === 'verified') expect(urls.length, where).toBeGreaterThanOrEqual(2);
        if (u.confidence === 'single-source') expect(urls.length, where).toBeGreaterThanOrEqual(1);
        if (u.confidence !== 'missing') expect(urls.length, where).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('每個有學年度的來源都是 113～115 學年度', () => {
    for (const v of ed.volumes) {
      expect(['113', '114', '115']).toContain(v.schoolYear);
      for (const u of v.units) {
        for (const s of u.sources) {
          if (s.schoolYear !== undefined) expect(['113', '114', '115'], `${u.title}：${s.name}`).toContain(s.schoolYear);
        }
      }
    }
  });
});
