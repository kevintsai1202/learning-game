/**
 * 英語科：活動清單、課綱代碼、出題器（同種子同結果、題目池夠大、題型輪流、選項不重複）與資料檢查。
 */
import { describe, expect, it } from 'vitest';
import { EN_ACTIVITIES } from '../../src/activities/en';
import { EN_INDICATORS } from '../../src/content/en/codes';
import { PHONICS, PHONICS_LETTERS } from '../../src/content/en/phonics';
import { PHRASES } from '../../src/content/en/phrases';
import { WORDS } from '../../src/content/en/words';
import { questionSchema } from '../../src/content/schema';
import type { Question } from '../../src/core/types';
import { checkAnswer, correctResponse } from '../../src/engine/check';
import { wordPool } from '../../src/engine/en/words';
import { LATIN_STROKES } from '../../src/writing/latinStrokes';

const LEVELS = [1, 2, 3] as const;
/** 一組測試用種子 */
const SEEDS = Array.from({ length: 12 }, (_, i) => i * 7919 + 1);

type Activity = (typeof EN_ACTIVITIES)[number];

/** 某活動某難度在很多種子下出現過的所有題目 */
function allQuestions(a: Activity, level: 1 | 2 | 3, seeds = 80): Question[] {
  return Array.from({ length: seeds }, (_, i) => a.make({ seed: i * 104729 + 3, count: a.count, level })).flat();
}

describe('英語：活動清單', () => {
  it('至少 6 個活動，id 不重複、屬於英語區與英語科', () => {
    expect(EN_ACTIVITIES.length).toBeGreaterThanOrEqual(6);
    const ids = EN_ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of EN_ACTIVITIES) {
      expect(a.zone, a.id).toBe('en');
      expect(a.subject, a.id).toBe('en');
      expect(a.indicators.length, a.id).toBeGreaterThan(0);
      for (const c of a.indicators) expect(EN_INDICATORS[c], `${a.id} ${c}`).toBeTruthy();
    }
  });

  it('字母描寫每回合 6 題，其他活動每回合 10 題', () => {
    for (const a of EN_ACTIVITIES) expect(a.count, a.id).toBe(a.id === 'en.letter-write' ? 6 : 10);
  });

  it('EN_INDICATORS 只收有用到的代碼，條文不為空，地方代碼的條文註明出處', () => {
    const used = new Set(EN_ACTIVITIES.flatMap((a) => a.indicators));
    for (const [code, text] of Object.entries(EN_INDICATORS)) {
      expect(used.has(code), `${code} 沒有被任何活動使用`).toBe(true);
      expect(text.length, code).toBeGreaterThan(2);
      if (code.startsWith('TPE-')) expect(text, code).toContain('臺北市');
      if (code.startsWith('NTPC-')) expect(text, code).toContain('新北市');
    }
    // 國定代碼用全形 Ⅱ
    for (const code of Object.keys(EN_INDICATORS)) if (!/^(TPE|NTPC)-/.test(code)) expect(code, code).toMatch(/Ⅱ/);
  });
});

for (const a of EN_ACTIVITIES) {
  describe(a.id, () => {
    for (const level of LEVELS) {
      it(`難度 ${level}：題目合格（格式、標準答案、代碼、依據、朗讀語言）`, () => {
        for (const seed of SEEDS) {
          for (const q of a.make({ seed, count: a.count, level })) {
            const r = questionSchema.safeParse(q);
            expect(r.success, `${q.id}：${r.success ? '' : JSON.stringify(r.error.issues[0])}`).toBe(true);
            expect(checkAnswer(q, correctResponse(q)), q.id).toBe(true);
            expect(q.subject).toBe('en');
            expect(q.indicators.length, q.id).toBeGreaterThan(0);
            for (const c of q.indicators) {
              expect(EN_INDICATORS[c], `${q.id} ${c}`).toBeTruthy();
              expect(a.indicators, `${q.id} ${c} 不在活動代碼裡`).toContain(c);
            }
            expect(q.source, q.id).toBe('依 108 課綱與臺北市國小英語課綱自編');
            // 不做拼字排序：只有選擇題與描寫題
            expect(['choice', 'write'], q.id).toContain(q.type);
            // 要唸英文就要指定語言
            if (q.speak) expect(q.speakLang, q.id).toBe('en-US');
            if (q.type === 'choice') {
              const keys = q.options.map((o) => `${o.text ?? ''}|${o.emoji ?? ''}`);
              expect(new Set(keys).size, `${q.id} 選項重複`).toBe(keys.length);
              // 是非題只有 Yes／No 兩個選項，其他題型至少 3 個
              expect(q.options.length, q.id).toBeGreaterThanOrEqual(q.id.includes(':yesno:') ? 2 : 3);
              for (const o of q.options) if (o.speak) expect(o.speakLang, q.id).toBe('en-US');
              // 英文選項要能朗讀
              for (const o of q.options) if (o.text && /^[A-Za-z]/.test(o.text)) expect(o.speak, `${q.id} ${o.text}`).toBeTruthy();
            }
          }
        }
      });

      it(`難度 ${level}：指定題數、id 不重複、相同種子結果相同`, () => {
        for (const seed of SEEDS) {
          const qs = a.make({ seed, count: a.count, level });
          expect(qs.length).toBe(a.count);
          expect(new Set(qs.map((q) => q.id)).size).toBe(a.count);
          expect(a.make({ seed, count: a.count, level })).toEqual(qs);
        }
        const x = a.make({ seed: 1, count: a.count, level }).map((q) => q.id).join();
        const y = a.make({ seed: 2, count: a.count, level }).map((q) => q.id).join();
        expect(x).not.toBe(y);
      });

      it(`難度 ${level}：題目池夠大（連玩 3 回合不重複），3 個不同種子的 3 回合重複率很低`, () => {
        const ids = new Set(allQuestions(a, level).map((q) => q.id));
        // 題目池至少是每回合題數的 3 倍
        expect(ids.size, `${a.id} L${level} 題目池`).toBeGreaterThanOrEqual(a.count * 3);
        const three = [11, 222, 3333].flatMap((seed) => a.make({ seed, count: a.count, level }).map((q) => q.id));
        // 3 回合各 count 題、回合內不重複，從 N 題的題目池隨機抽，期望的不重複題數是 N × (1 − (1 − count/N)^3)。
        // 門檻取期望值的 85% 與「10 題一回合 25 題、描寫題 15 題」兩者較小者，池越大門檻越高。
        const n = ids.size;
        const expected = n * (1 - Math.pow(1 - a.count / n, 3));
        const need = Math.min(a.count === 6 ? 15 : 25, Math.floor(expected * 0.85));
        expect(new Set(three).size, `${a.id} L${level} 三回合（題目池 ${n}）`).toBeGreaterThanOrEqual(need);
      });
    }

    if (a.id !== 'en.letter-write') {
      it('同一概念用不同題型輪流出（至少 2 種題型、題幹不只一種說法）', () => {
        const qs = allQuestions(a, 1, 40);
        const forms = new Set(qs.map((q) => q.id.split(':')[1]));
        expect(forms.size, `${a.id} 題型`).toBeGreaterThanOrEqual(2);
        // 題幹把英文單字、字母、引號內容換掉後，至少有 3 種不同的說法
        const stems = new Set(qs.map((q) => q.prompt.replace(/「[^」]*」/g, '「＊」').replace(/[A-Za-z][A-Za-z'’ .!?,\-–"]*/g, '＊')));
        expect(stems.size, `${a.id} 題幹`).toBeGreaterThanOrEqual(3);
      });
    }
  });
}

describe('字母描寫', () => {
  const a = EN_ACTIVITIES.find((x) => x.id === 'en.letter-write')!;
  it('難度 1 大寫、2 小寫、3 混合；target 都有中心線；不設 difficulty（保留淡色字形）', () => {
    for (const level of LEVELS) {
      const qs = allQuestions(a, level, 40);
      for (const q of qs) {
        expect(q.type).toBe('write');
        if (q.type !== 'write') continue;
        expect(q.script).toBe('latin');
        expect(LATIN_STROKES[q.target], q.target).toBeTruthy();
        expect(q.speak).toBe(q.target.toUpperCase());
        expect(q.difficulty).toBeUndefined();
      }
      const targets = qs.map((q) => (q.type === 'write' ? q.target : ''));
      if (level === 1) expect(targets.every((t) => t === t.toUpperCase())).toBe(true);
      if (level === 2) expect(targets.every((t) => t === t.toLowerCase())).toBe(true);
      if (level === 3) {
        expect(targets.some((t) => t === t.toUpperCase())).toBe(true);
        expect(targets.some((t) => t === t.toLowerCase())).toBe(true);
      }
    }
  });
});

describe('字母題：選項不會混淆', () => {
  const textsOf = (q: Question) => (q.type === 'choice' ? q.options.map((o) => o.text ?? '') : []);
  it('聽字母、大小寫配對：選項沒有同一個字母的大小寫、也沒有 I 與 l 並列', () => {
    for (const id of ['en.letter-listen', 'en.case-match']) {
      const a = EN_ACTIVITIES.find((x) => x.id === id)!;
      for (const level of LEVELS) {
        for (const q of allQuestions(a, level, 60)) {
          if (q.id.includes(':pair:')) continue;
          const t = textsOf(q);
          const lower = t.map((x) => x.toLowerCase());
          expect(new Set(lower).size, `${q.id} ${t.join()}`).toBe(t.length);
          expect(t.includes('I') && t.includes('l'), q.id).toBe(false);
          // 大小寫配對：畫面上的字母與選項也不能是 I／l 並列
          if (q.visual?.kind === 'bigtext') expect((q.visual.text === 'I' && t.includes('l')) || (q.visual.text === 'l' && t.includes('I')), q.id).toBe(false);
        }
      }
    }
  });

  it('辨認大小寫：四個選項裡只有答案是題目要的大小寫', () => {
    const a = EN_ACTIVITIES.find((x) => x.id === 'en.case-match')!;
    for (const level of LEVELS) {
      for (const q of allQuestions(a, level, 60)) {
        if (q.type !== 'choice' || !/:(isUpper|isLower):/.test(q.id)) continue;
        const wantUpper = q.id.includes(':isUpper:');
        const hits = q.options.filter((o) => (wantUpper ? o.text === o.text?.toUpperCase() : o.text === o.text?.toLowerCase()));
        expect(hits.length, `${q.id} ${q.options.map((o) => o.text).join()}`).toBe(1);
        expect(q.options[q.answer]).toBe(hits[0]);
      }
    }
  });

  it('字母開頭音：選項沒有發音相同的字母（C 與 K），x 不當答案', () => {
    const a = EN_ACTIVITIES.find((x) => x.id === 'en.phonics')!;
    for (const level of LEVELS) {
      for (const q of allQuestions(a, level, 60)) {
        const t = textsOf(q);
        expect(t.includes('Cc') && t.includes('Kk'), q.id).toBe(false);
        if (q.type === 'choice' && q.options[q.answer].text) expect(q.options[q.answer].text, q.id).not.toBe('Xx');
      }
    }
  });
});

describe('單字資料', () => {
  it('可配圖的字 emoji 不重複（避免看圖有兩個正確答案），英文不重複', () => {
    const pics = WORDS.filter((w) => w.pic);
    expect(new Set(pics.map((w) => w.emoji)).size).toBe(pics.length);
    expect(new Set(WORDS.map((w) => w.en)).size).toBe(WORDS.length);
  });

  it('每個難度的字池夠大；主題活動至少 10 個字', () => {
    for (const level of LEVELS) expect(wordPool(level).length).toBeGreaterThanOrEqual(30);
    expect(wordPool(1).every((w) => w.lv === 1)).toBe(true);
    for (const a of EN_ACTIVITIES.filter((x) => x.id.startsWith('en.words-'))) {
      const ids = new Set(allQuestions(a, 1, 60).map((q) => q.id.split(':')[2]));
      expect(ids.size, a.id).toBeGreaterThanOrEqual(10);
    }
  });

  it('臺北市低年段 58 字中的名詞、形容詞、動詞都在難度 1', () => {
    const tpe1 = ['boy', 'girl', 'friend', 'teacher', 'dad', 'mom', 'brother', 'sister', 'apple', 'banana', 'cake', 'egg', 'milk', 'bag', 'ball', 'book', 'box', 'bird', 'cat', 'cow', 'dog', 'fish', 'pig', 'home', 'school', 'zoo', 'one', 'two', 'three', 'four', 'five', 'good', 'happy', 'hat', 'look', 'go'];
    for (const en of tpe1) expect(WORDS.find((w) => w.en === en)?.lv, en).toBe(1);
  });
});

describe('字母發音資料', () => {
  it('除了 X，每個字母都有以它開頭的示範字，且恰有一個新北代表字', () => {
    expect(PHONICS_LETTERS).toHaveLength(25);
    for (const l of PHONICS_LETTERS) {
      expect(PHONICS[l].length, l).toBeGreaterThanOrEqual(2);
      for (const w of PHONICS[l]) expect(w.en[0].toUpperCase(), `${l} ${w.en}`).toBe(l);
      expect(PHONICS[l].filter((w) => w.rep).length, l).toBe(1);
    }
  });
});

describe('生活用語資料', () => {
  it('句子不重複，新北市 10 句教室用語都在難度 1', () => {
    expect(new Set(PHRASES.map((p) => p.en)).size).toBe(PHRASES.length);
    expect(PHRASES.filter((p) => p.ntpc).every((p) => p.lv === 1)).toBe(true);
    expect(PHRASES.filter((p) => p.lv === 1).length).toBeGreaterThanOrEqual(10);
  });
});
