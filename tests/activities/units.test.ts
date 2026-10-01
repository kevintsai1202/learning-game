import { describe, expect, it } from 'vitest';
import { examActivities, unitActivities } from '../../src/activities/units';
import { currentVolume, mergeEditions } from '../../src/content/editions';
import { editionSchema, type Edition } from '../../src/content/editions/schema';
import { registerCharUnitGenerator } from '../../src/engine/zh/charsBridge';
import { termOf } from '../../src/store/save';

/** 測試用的數學版本（兩冊各三個單元） */
const MATH: Edition = editionSchema.parse({
  format: 'learning-island-edition',
  version: 1,
  id: 'test-math',
  subject: 'math',
  publisher: '測試',
  grade: 2,
  volumes: [
    {
      term: '上',
      schoolYear: '115',
      units: [
        { no: 1, title: '1000 以內的數', skills: ['math.place-value'], confidence: 'verified', sources: [{ name: 'A', url: 'https://example.com/a' }] },
        { no: 2, title: '二位數的加減', skills: ['math.add', 'math.sub'], maxLevel: 1, confidence: 'single-source', sources: [{ name: 'A', url: 'https://example.com/a' }] },
        { no: 3, title: '乘法', skills: ['math.times'], confidence: 'verified', sources: [] },
        { no: 4, title: '待補單元', confidence: 'missing', sources: [] },
      ],
    },
    { term: '下', schoolYear: '115', units: [{ no: 1, title: '時間', skills: ['math.clock-read'], confidence: 'verified', sources: [] }] },
  ],
});

const ZH: Edition = editionSchema.parse({
  format: 'learning-island-edition',
  version: 1,
  id: 'test-zh',
  subject: 'zh',
  publisher: '測試',
  grade: 2,
  volumes: [
    {
      term: '上',
      schoolYear: '115',
      units: [
        { no: 1, title: '有生字的課', chars: ['山', '水'], confidence: 'verified', sources: [] },
        { no: 2, title: '生字待補的課', confidence: 'missing', sources: [] },
      ],
    },
  ],
});

describe('課本單元活動', () => {
  const units = unitActivities(MATH, MATH.volumes[0]);

  it('每個單元一個活動，id 與標題依課次', () => {
    expect(units.map((u) => u.id)).toEqual(['unit:test-math:上:1', 'unit:test-math:上:2', 'unit:test-math:上:3', 'unit:test-math:上:4']);
    expect(units[1].title).toBe('第 2 單元 二位數的加減');
  });

  it('數學單元只出對應技能的題目，難度不超過單元上限', () => {
    const qs = units[1].make({ seed: 3, count: 10, level: 3 });
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.skill))).toEqual(new Set(['math.add', 'math.sub']));
    // 單元上限 1：直式加減不進位、不退位
    for (const q of qs) expect(q.difficulty).toBe(1);
  });

  it('沒有對應技能的單元標示待補，不能玩', () => {
    expect(units[3].disabledReason).toBe('單元資料待補');
    expect(units[0].disabledReason).toBeUndefined();
  });

  it('期中考只從前半冊出題，期末考涵蓋全冊', () => {
    const [mid, final] = examActivities(MATH, MATH.volumes[0]);
    const midSkills = new Set(mid.make({ seed: 9, count: 15, level: 2 }).map((q) => q.skill));
    expect([...midSkills].every((s) => ['math.place-value', 'math.add', 'math.sub'].includes(s))).toBe(true);
    const finalQs = final.make({ seed: 9, count: 15, level: 2 });
    expect(finalQs.length).toBeGreaterThanOrEqual(10);
    expect(finalQs.some((q) => q.skill === 'math.times')).toBe(true);
  });

  it('國語單元：沒有生字的課標示待補；註冊生字出題器後有生字的課可以出題', () => {
    const zhUnits = unitActivities(ZH, ZH.volumes[0]);
    expect(zhUnits[1].disabledReason).toBe('生字資料待補');
    registerCharUnitGenerator((input, opts) =>
      input.chars.slice(0, opts.count).map((c) => ({ id: `t:${c}`, subject: 'zh', skill: 'zh.test', indicators: ['Ab-Ⅰ-1'], prompt: c, type: 'number', answer: 1 })),
    );
    const again = unitActivities(ZH, ZH.volumes[0]);
    expect(again[0].disabledReason).toBeUndefined();
    expect(again[0].make({ seed: 1, count: 8, level: 1 }).map((q) => q.prompt)).toEqual(['山', '水']);
  });
});

describe('教材版本工具', () => {
  it('學期自動判斷：8～1 月上學期、2～7 月下學期', () => {
    expect(termOf(new Date('2026-10-01T12:00:00'))).toBe('上');
    expect(termOf(new Date('2027-01-15T12:00:00'))).toBe('上');
    expect(termOf(new Date('2027-03-01T12:00:00'))).toBe('下');
    expect(currentVolume(MATH, 'auto', new Date('2027-03-01T12:00:00'))?.term).toBe('下');
    expect(currentVolume(MATH, '上')?.term).toBe('上');
    expect(currentVolume(ZH, '下')).toBeNull();
  });

  it('匯入的版本與內建 id 相同時覆蓋內建', () => {
    const fixed: Edition = { ...MATH, publisher: '修正版' };
    const merged = mergeEditions([MATH, ZH], [fixed]);
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.id === 'test-math')?.publisher).toBe('修正版');
  });
});
