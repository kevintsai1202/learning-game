import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZH_CHARS_ACTIVITIES } from '../../src/activities/zhChars';
import { questionSchema } from '../../src/content/schema';
import { createRng } from '../../src/core/rng';
import type { Question } from '../../src/core/types';
import { ALL_CHARS, ALL_WORDS, CHAR_BY, CHAR_INFO, COMMON_RADICALS, WORDS_BY_CHAR, WRITABLE_CHARS, ZHUYIN_SYMBOLS } from '../../src/content/zh/chars';
import { ZH_CHARS_INDICATORS } from '../../src/content/zh/codes-chars';
import { BOPOMOFO_ONLY } from '../../src/content/zh/language';
import kanghsuan from '../../src/content/editions/zh/kanghsuan.json';
import nani from '../../src/content/editions/zh/nani.json';
import hanlin from '../../src/content/editions/zh/hanlin.json';
import { checkAnswer, correctResponse } from '../../src/engine/check';
import { ZH_CHARS_IDS, makeZhuyinWrite, unitQuestions } from '../../src/engine/zh/chars';
import { charUnitGenerator } from '../../src/engine/zh/charsBridge';
import { ZHUYIN_STROKES } from '../../src/writing/zhuyinStrokes';

/** 筆順檔資料夾（建置腳本 scripts/build-hanzi-data.py 的產物） */
const STROKE_DIR = path.resolve('public/data/strokes/hanzi');
/** 一組測試用種子 */
const SEEDS = Array.from({ length: 6 }, (_, i) => i * 7919 + 1);
/** 「連玩三回合」用的三個種子 */
const THREE_SEEDS = [101, 202, 909];
const LEVELS = [1, 2, 3] as const;
/** e2e/hanzi.spec.ts 描寫測試用的 10 個字（筆畫 3～12、結構各異）；這裡確認它們都有筆順檔 */
const E2E_CHARS = ['木', '中', '生', '河', '明', '國', '雲', '森', '間', '鳥'];

/** 三版本所有課（生字、語詞） */
const UNITS = [kanghsuan, nani, hanlin].flatMap((ed) =>
  ed.volumes.flatMap((v) => v.units.map((u) => ({ label: `${ed.publisher}二${v.term}第${u.no}課`, chars: u.chars as string[], words: ((u as { words?: string[] }).words ?? []) as string[] }))),
);
/** 目標字集：三版本所有 chars 與 readChars 的聯集 */
const TARGET = new Set(
  [kanghsuan, nani, hanlin].flatMap((ed) => ed.volumes.flatMap((v) => v.units.flatMap((u) => [...u.chars, ...((u as { readChars?: string[] }).readChars ?? [])]))),
);

/** 筆順檔路徑 */
const strokeFile = (c: string) => path.join(STROKE_DIR, `${c.codePointAt(0)!.toString(16)}.json`);

/** 檢查一回合題目：格式、id 不重複、標準答案判對 */
function expectValid(qs: Question[], label: string) {
  expect(new Set(qs.map((q) => q.id)).size, `${label} id 不重複`).toBe(qs.length);
  for (const q of qs) {
    const r = questionSchema.safeParse(q);
    expect(r.success, `${label} ${q.id}：${r.success ? '' : JSON.stringify(r.error.issues[0])}`).toBe(true);
    expect(checkAnswer(q, correctResponse(q)), `${label} ${q.id}`).toBe(true);
    expect(q.indicators.length, q.id).toBeGreaterThan(0);
    for (const code of q.indicators) expect(ZH_CHARS_INDICATORS[code], `${q.id} ${code}`).toBeTruthy();
    if (q.type === 'choice') {
      const texts = q.options.map((o) => `${o.text ?? ''}|${o.emoji ?? ''}`);
      expect(new Set(texts).size, `${q.id} 選項不重複`).toBe(texts.length);
    }
  }
}

describe('國語生字：charinfo 與筆順檔', () => {
  it('字集等於三版本 chars 與 readChars 的聯集，每字都有讀音、部首、筆畫', () => {
    expect(CHAR_INFO.length).toBe(TARGET.size);
    expect(new Set(ALL_CHARS)).toEqual(TARGET);
    for (const c of CHAR_INFO) {
      expect(c.readings.length, c.char).toBeGreaterThan(0);
      expect(c.readings, c.char).toContain(c.reading);
      for (const r of c.readings) expect(r, `${c.char} ${r}`).toMatch(BOPOMOFO_ONLY);
      expect([...c.radical].length, c.char).toBe(1);
      expect([...c.radicalKangxi].length, c.char).toBe(1);
      expect(Number.isInteger(c.strokeCount) && c.strokeCount >= 1 && c.strokeCount <= 30, `${c.char} ${c.strokeCount}`).toBe(true);
    }
  });

  it('writable 的字都有筆順檔，不可寫的字沒有檔也沒有來源並有原因；沒有多餘的檔', () => {
    for (const c of CHAR_INFO) {
      if (c.writable) {
        expect(existsSync(strokeFile(c.char)), `${c.char} 缺筆順檔`).toBe(true);
        expect(c.strokeSource, c.char).toMatch(/^(animcjk|makemeahanzi)(\+reorder)?$/);
      } else {
        expect(existsSync(strokeFile(c.char)), `${c.char} 不可寫卻有筆順檔`).toBe(false);
        expect(c.strokeSource, c.char).toBeNull();
        expect(c.unwritableReason, c.char).toBeTruthy();
      }
    }
    expect(readdirSync(STROKE_DIR).length).toBe(WRITABLE_CHARS.length);
    // 可寫字要佔絕大多數（覆蓋率報告：目標字集 914 字，可寫 852）
    expect(WRITABLE_CHARS.length / CHAR_INFO.length).toBeGreaterThan(0.9);
  });

  it('隨機抽 30 個筆順檔：格式正確、筆數等於 strokeCount', () => {
    const rng = createRng(20261001);
    const picked = rng.shuffle(WRITABLE_CHARS).slice(0, 30);
    for (const ch of picked) {
      const d = JSON.parse(readFileSync(strokeFile(ch), 'utf8'));
      const info = CHAR_BY.get(ch)!;
      expect(Object.keys(d).every((k) => ['strokes', 'medians', '_notice'].includes(k)), ch).toBe(true);
      expect(d.strokes.length, ch).toBe(info.strokeCount);
      expect(d.medians.length, ch).toBe(info.strokeCount);
      for (const s of d.strokes) expect(s, ch).toMatch(/^M[-\d\s.,LQCZ]+$/);
      for (const m of d.medians) {
        expect(m.length, ch).toBeGreaterThanOrEqual(2);
        for (const p of m) expect(p.length === 2 && p.every((n: number) => Number.isFinite(n)), ch).toBe(true);
      }
    }
  });

  it('全部筆順檔：筆數與 charinfo 一致（重排過的字帶有修改聲明）', () => {
    for (const c of CHAR_INFO.filter((x) => x.writable)) {
      const d = JSON.parse(readFileSync(strokeFile(c.char), 'utf8'));
      expect(d.strokes.length, c.char).toBe(c.strokeCount);
      expect(d.medians.length, c.char).toBe(c.strokeCount);
      if (c.strokeSource!.endsWith('+reorder')) expect(d._notice, c.char).toContain('重排');
    }
    // 讀 852 個筆順檔；全套平行跑時（伺服器測試同時啟動 PGlite）會超過預設的 5 秒
  }, 30_000);

  it('e2e 描寫用的 10 個字都可描寫，筆畫 3～12', () => {
    expect(new Set(E2E_CHARS).size).toBe(10);
    for (const ch of E2E_CHARS) {
      const c = CHAR_BY.get(ch);
      expect(c?.writable, ch).toBe(true);
      expect(c!.strokeCount, ch).toBeGreaterThanOrEqual(3);
      expect(c!.strokeCount, ch).toBeLessThanOrEqual(12);
    }
  });

  it('37 個注音符號與寫字板字形表一致', () => {
    // 字形表另含 4 個聲調符號；這裡只比對 37 個注音符號
    expect([...ZHUYIN_SYMBOLS].sort()).toEqual(Object.keys(ZHUYIN_STROKES).filter((k) => /[ㄅ-ㄩ]/.test(k)).sort());
  });

  it('課本語詞與常見部首資料可用', () => {
    expect(ALL_WORDS.length).toBeGreaterThan(500);
    expect(WORDS_BY_CHAR.size).toBeGreaterThan(300);
    expect(COMMON_RADICALS.length).toBe(24);
  });
});

describe('國語生字：活動清單', { timeout: 60_000 }, () => {
  it('6 個活動、屬於國語屋與國語科、分組「生字與筆順」，描寫每回合 5 題', () => {
    expect(ZH_CHARS_ACTIVITIES.length).toBe(6);
    expect(new Set(ZH_CHARS_ACTIVITIES.map((a) => a.id)).size).toBe(6);
    for (const a of ZH_CHARS_ACTIVITIES) {
      expect(a.zone, a.id).toBe('zh');
      expect(a.subject, a.id).toBe('zh');
      expect(a.group, a.id).toBe('生字與筆順');
      expect(a.levels, a.id).toBe(true);
      for (const code of a.indicators) expect(ZH_CHARS_INDICATORS[code], `${a.id} ${code}`).toBeTruthy();
    }
    expect(ZH_CHARS_ACTIVITIES.find((a) => a.id === ZH_CHARS_IDS.write)!.count).toBe(5);
    expect(ZH_CHARS_ACTIVITIES.find((a) => a.id === ZH_CHARS_IDS.zhuyinWrite)!.count).toBe(5);
  });

  it('ZH_CHARS_INDICATORS 只收題目用到的代碼', () => {
    const used = new Set<string>();
    for (const a of ZH_CHARS_ACTIVITIES) {
      for (const level of LEVELS) for (const q of a.make({ seed: 7, count: 40, level })) q.indicators.forEach((c) => used.add(c));
      a.indicators.forEach((c) => used.add(c));
    }
    for (const code of Object.keys(ZH_CHARS_INDICATORS)) expect(used.has(code), code).toBe(true);
    for (const code of used) expect(ZH_CHARS_INDICATORS[code], code).toBeTruthy();
  });
});

describe('國語生字：各活動出題', { timeout: 120_000 }, () => {
  for (const a of ZH_CHARS_ACTIVITIES) {
    for (const level of LEVELS) {
      it(`${a.title} 難度 ${level}：題數足夠、格式正確、標準答案判對、相同種子結果相同`, () => {
        for (const seed of SEEDS) {
          const qs = a.make({ seed, count: a.count, level });
          expect(qs.length, `${a.id} L${level} seed ${seed}`).toBe(a.count);
          expectValid(qs, `${a.id} L${level}`);
          expect(a.make({ seed, count: a.count, level })).toEqual(qs);
          for (const q of qs) expect(q.skill).toBe(a.id);
        }
      });
    }
  }

  it('描寫題：只出可描寫的字；難度 3 默寫的題幹不出現要寫的字；注音描寫的符號在字形表內', () => {
    const writable = new Set(WRITABLE_CHARS);
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        for (const q of ZH_CHARS_ACTIVITIES[0].make({ seed, count: 5, level })) {
          expect(q.type).toBe('write');
          if (q.type !== 'write') continue;
          expect(q.script).toBe('hanzi');
          expect(writable.has(q.target), q.target).toBe(true);
          expect(q.difficulty).toBe(level);
          if (level === 3) expect(q.prompt, q.id).not.toContain(q.target);
        }
        for (const q of ZH_CHARS_ACTIVITIES[1].make({ seed, count: 5, level })) {
          expect(q.type).toBe('write');
          if (q.type === 'write') {
            expect(q.script).toBe('zhuyin');
            expect(ZHUYIN_SYMBOLS).toContain(q.target);
          }
        }
      }
    }
  });

  it('看字選注音：干擾選項不含該字的任何讀音；看注音選字：干擾字沒有相同讀音', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        for (const q of ZH_CHARS_ACTIVITIES[2].make({ seed, count: 12, level })) {
          if (q.type !== 'choice') continue;
          if (q.id.includes(':c2z:')) {
            const ch = q.id.split(':')[2];
            const info = CHAR_BY.get(ch)!;
            expect(q.options[q.answer].text, q.id).toBe(info.reading);
            q.options.forEach((o, i) => {
              if (i !== q.answer) expect(info.readings, `${q.id} ${o.text}`).not.toContain(o.text);
            });
            expect(q.speak, q.id).not.toContain(ch);
          } else {
            const ch = q.options[q.answer].text!;
            const zhuyin = CHAR_BY.get(ch)!.reading;
            q.options.forEach((o, i) => {
              if (i !== q.answer) expect(CHAR_BY.get(o.text!)!.readings, `${q.id} ${o.text}`).not.toContain(zhuyin);
            });
          }
        }
      }
    }
  });

  it('部首與筆畫：答案與字資訊一致', () => {
    for (const seed of SEEDS) {
      for (const q of ZH_CHARS_ACTIVITIES[3].make({ seed, count: 12, level: 2 })) {
        if (q.id.includes(':of:') && q.type === 'choice') expect(q.options[q.answer].text).toBe(CHAR_BY.get(q.id.split(':')[2])!.radical);
      }
      for (const q of ZH_CHARS_ACTIVITIES[4].make({ seed, count: 12, level: 3 })) {
        if (q.type === 'number') {
          const info = CHAR_BY.get(q.id.split(':')[2])!;
          expect(info.writable).toBe(true);
          expect(q.answer).toBe(info.strokeCount);
        }
      }
    }
  });

  it('造詞：正確選項含該字、干擾語詞不含；缺字題填回去是課本語詞', () => {
    for (const level of LEVELS) {
      for (const seed of SEEDS) {
        for (const q of ZH_CHARS_ACTIVITIES[5].make({ seed, count: 12, level })) {
          if (q.type !== 'choice') continue;
          const parts = q.id.split(':');
          if (parts[1] === 'with') {
            const c = parts[2];
            q.options.forEach((o, i) => expect(o.text!.includes(c), `${q.id} ${o.text}`).toBe(i === q.answer));
          } else {
            const [, , w, c] = parts;
            expect(ALL_WORDS).toContain(w);
            expect(q.options[q.answer].text).toBe(c);
            q.options.forEach((o, i) => {
              if (i !== q.answer) expect(ALL_WORDS, `${q.id} ${o.text}`).not.toContain(w.replace(c, o.text!));
            });
          }
        }
      }
    }
  });

  it('題目變化：每個活動連玩三回合不重複的題數夠多', () => {
    for (const a of ZH_CHARS_ACTIVITIES) {
      for (const level of LEVELS) {
        const ids = new Set<string>();
        for (const seed of THREE_SEEDS) a.make({ seed, count: a.count, level }).forEach((q) => ids.add(q.id));
        expect(ids.size, `${a.id} L${level}`).toBeGreaterThanOrEqual(Math.ceil(a.count * 3 * 0.9));
      }
    }
  });

  it('題目池夠大：同一個活動用 100 個種子可湊出的不同題目遠多於三回合', () => {
    const min: Record<string, number> = { [ZH_CHARS_IDS.zhuyinWrite]: 37, [ZH_CHARS_IDS.write]: 300 };
    for (const a of ZH_CHARS_ACTIVITIES) {
      const ids = new Set<string>();
      for (let s = 1; s <= 100; s++) a.make({ seed: s, count: a.count, level: 2 }).forEach((q) => ids.add(q.id));
      expect(ids.size, a.id).toBeGreaterThanOrEqual(min[a.id] ?? 500);
    }
  });
});

describe('國語生字：課本單元出題器', { timeout: 120_000 }, () => {
  it('已註冊到 charsBridge', () => {
    expect(charUnitGenerator()).toBe(unitQuestions);
  });

  it(`三版本每一課都能出題（共 ${UNITS.length} 課）：8 題、格式正確、有可寫字的課才出描寫、相同種子結果相同`, () => {
    const gen = charUnitGenerator()!;
    for (const u of UNITS) {
      const hasWritable = u.chars.some((c) => CHAR_BY.get(c)?.writable);
      for (const seed of [1, 2, 3]) {
        const opts = { seed, count: 8, level: 1 as const };
        const qs = gen({ chars: u.chars, words: u.words, unitId: '1' }, opts);
        expect(qs.length, `${u.label} seed ${seed}`).toBe(8);
        expectValid(qs, u.label);
        expect(qs.some((q) => q.type === 'write'), `${u.label} 描寫題`).toBe(hasWritable);
        for (const q of qs) if (q.type === 'write') expect(CHAR_BY.get(q.target)?.writable, `${u.label} ${q.target}`).toBe(true);
        expect(gen({ chars: u.chars, words: u.words, unitId: '1' }, opts)).toEqual(qs);
      }
    }
  });

  it('混合題比例：描寫 3、認讀 2、部首 1、筆畫 1、造詞 1（有語詞的課）', () => {
    const u = UNITS.find((x) => x.words.length >= 6 && x.chars.every((c) => CHAR_BY.get(c)?.writable))!;
    const qs = unitQuestions({ chars: u.chars, words: u.words, unitId: 'x' }, { seed: 5, count: 8, level: 1 });
    const count = (skill: string) => qs.filter((q) => q.skill === skill).length;
    expect(count(ZH_CHARS_IDS.write)).toBe(3);
    expect(count(ZH_CHARS_IDS.read)).toBe(2);
    expect(count(ZH_CHARS_IDS.radical)).toBe(1);
    expect(count(ZH_CHARS_IDS.strokes)).toBe(1);
    expect(count(ZH_CHARS_IDS.words)).toBe(1);
  });

  it('題目 id 穩定：id 取自內容，不含種子與課號', () => {
    const u = UNITS[0];
    const a = unitQuestions({ chars: u.chars, words: u.words, unitId: '1' }, { seed: 1, count: 8, level: 1 });
    expect(unitQuestions({ chars: u.chars, words: u.words, unitId: '9' }, { seed: 1, count: 8, level: 1 }).map((q) => q.id)).toEqual(a.map((q) => q.id));
  });

  it('沒有語詞的課不出造詞；沒有可寫字的課不出描寫；段考用小題數與 allowFewer 也能出題', () => {
    const u = UNITS[0];
    const noWords = unitQuestions({ chars: u.chars, words: [], unitId: '1' }, { seed: 3, count: 8, level: 1 });
    expect(noWords.length).toBe(8);
    expect(noWords.some((q) => q.skill === ZH_CHARS_IDS.words)).toBe(false);
    const unwritable = CHAR_INFO.filter((c) => !c.writable).slice(0, 4).map((c) => c.char);
    const noWrite = unitQuestions({ chars: unwritable, words: [], unitId: '1' }, { seed: 3, count: 8, level: 1 });
    expect(noWrite.length).toBeGreaterThan(0);
    expect(noWrite.some((q) => q.type === 'write')).toBe(false);
    for (const count of [1, 2, 3]) {
      const qs = unitQuestions({ chars: u.chars, words: u.words, unitId: '1' }, { seed: 4, count, level: 2, allowFewer: true });
      expect(qs.length, `count ${count}`).toBe(count);
      expectValid(qs, `count ${count}`);
    }
    expect(unitQuestions({ chars: ['X'], words: [], unitId: '1' }, { seed: 1, count: 8, level: 1 })).toEqual([]);
  });

  it('每一課連玩三回合：不重複的題數至少 18（共 24 題）', () => {
    for (const u of UNITS) {
      const ids = new Set<string>();
      for (const seed of THREE_SEEDS) unitQuestions({ chars: u.chars, words: u.words, unitId: '1' }, { seed, count: 8, level: 1 }).forEach((q) => ids.add(q.id));
      expect(ids.size, u.label).toBeGreaterThanOrEqual(18);
    }
  });
});

describe('國語生字：注音符號描寫先唸出符號', () => {
  it('每一題的朗讀都以「符號。」開頭（預錄的注音音檔會唸出符號，裝置語音則略過這一句）', () => {
    for (const level of [1, 2, 3] as const) {
      for (const seed of [1, 2, 3, 4, 5]) {
        for (const q of makeZhuyinWrite({ seed, count: 5, level })) {
          if (q.type !== 'write') throw new Error('注音描寫應為描寫題');
          expect(q.speak, q.id).toMatch(new RegExp(`^${q.target}。`));
        }
      }
    }
  });
});
