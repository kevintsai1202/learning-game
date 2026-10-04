/**
 * 益智搶答的規則（純函式）：出題、單人連對挑戰、和機器人搶答、機器人的答題行為。
 * 規格見 docs/plans/puzzle-house.md 第 6.5 節。
 */
import { describe, expect, it } from 'vitest';
import { ALL_ACTIVITIES } from '../../../src/activities/registry';
import { createRng } from '../../../src/core/rng';
import type { ChoiceQuestion } from '../../../src/core/types';
import {
  BOT_ACCURACY,
  DUEL_QUESTIONS,
  STREAK_MAX_MISSES,
  STREAK_MAX_QUESTIONS,
  botMove,
  buildQuizQuestions,
  duelAnswer,
  duelNext,
  duelOutcome,
  outcomeStars,
  startDuel,
  startStreak,
  streakAnswer,
  streakStars,
} from '../../../src/engine/puzzle/quizBattle';

/** 可以出題的活動（挑戰塔是混合各科的段考，不重複放進來） */
const ACTIVITIES = ALL_ACTIVITIES.filter((a) => a.zone !== 'tower' && !a.disabledReason);

describe('益智搶答：出題', () => {
  it('出指定題數的四選一題目：選項最多 4 個、正解索引正確、題目不重複', () => {
    const qs = buildQuizQuestions(ACTIVITIES, STREAK_MAX_QUESTIONS, 42, []);
    expect(qs).toHaveLength(STREAK_MAX_QUESTIONS);
    for (const q of qs) {
      expect(q.type).toBe('choice');
      expect(q.options.length).toBeGreaterThanOrEqual(2);
      expect(q.options.length).toBeLessThanOrEqual(4);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
    }
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });

  it('各科輪流出題：一局至少有三科', () => {
    const qs = buildQuizQuestions(ACTIVITIES, DUEL_QUESTIONS, 7, []);
    expect(new Set(qs.map((q) => q.subject)).size).toBeGreaterThanOrEqual(3);
  });

  it('同一個種子出同一組題目', () => {
    expect(buildQuizQuestions(ACTIVITIES, DUEL_QUESTIONS, 99, [])).toEqual(buildQuizQuestions(ACTIVITIES, DUEL_QUESTIONS, 99, []));
  });

  it('避開最近做過的題目', () => {
    const first = buildQuizQuestions(ACTIVITIES, DUEL_QUESTIONS, 5, []);
    const again = buildQuizQuestions(
      ACTIVITIES,
      DUEL_QUESTIONS,
      5,
      first.map((q) => q.id),
    );
    expect(again.filter((q) => first.some((f) => f.id === q.id))).toEqual([]);
  });

  it('換很多種子都出得滿題數', () => {
    for (let seed = 1; seed <= 30; seed++) expect(buildQuizQuestions(ACTIVITIES, DUEL_QUESTIONS, seed, []), `seed ${seed}`).toHaveLength(DUEL_QUESTIONS);
  });
});

describe('益智搶答：單人連對挑戰', () => {
  it('答對連對數加一並記最多連對；答錯連對歸零', () => {
    let s = startStreak();
    for (const c of [true, true, true, false, true]) s = streakAnswer(s, c, STREAK_MAX_QUESTIONS);
    expect(s).toMatchObject({ answered: 5, misses: 1, streak: 1, best: 3, done: false });
  });

  it(`答錯 ${STREAK_MAX_MISSES} 題就結束`, () => {
    let s = startStreak();
    for (const c of [false, true, false, false]) s = streakAnswer(s, c, STREAK_MAX_QUESTIONS);
    expect(s.done).toBe(true);
    expect(s.misses).toBe(3);
  });

  it('題目答完就結束；結束後再答不會改變', () => {
    let s = startStreak();
    for (let i = 0; i < 4; i++) s = streakAnswer(s, true, 4);
    expect(s).toMatchObject({ done: true, best: 4 });
    expect(streakAnswer(s, true, 4)).toEqual(s);
  });

  it('最多連對 10 題以上 3 星、5 題以上 2 星，其他 1 星', () => {
    expect(streakStars(0)).toBe(1);
    expect(streakStars(4)).toBe(1);
    expect(streakStars(5)).toBe(2);
    expect(streakStars(9)).toBe(2);
    expect(streakStars(10)).toBe(3);
  });
});

describe('益智搶答：和機器人搶答', () => {
  it('先答對的得分，這一題就結束；之後的作答不算', () => {
    let s = startDuel();
    s = duelAnswer(s, 'bot', true);
    expect(s).toMatchObject({ phase: 'bot', bot: 1, kid: 0 });
    expect(duelAnswer(s, 'kid', true)).toEqual(s);
  });

  it('答錯的人這一題不能再答，另一方還可以搶', () => {
    let s = startDuel();
    s = duelAnswer(s, 'kid', false);
    expect(s).toMatchObject({ phase: 'open', kidOut: true });
    expect(duelAnswer(s, 'kid', true)).toEqual(s);
    s = duelAnswer(s, 'bot', true);
    expect(s).toMatchObject({ phase: 'bot', bot: 1 });
  });

  it('兩個人都答錯：沒有人得分', () => {
    let s = startDuel();
    s = duelAnswer(s, 'kid', false);
    s = duelAnswer(s, 'bot', false);
    expect(s).toMatchObject({ phase: 'none', kid: 0, bot: 0 });
  });

  it('還沒有結果不能換下一題；最後一題之後結束', () => {
    let s = startDuel();
    expect(duelNext(s, 2)).toEqual(s);
    s = duelNext(duelAnswer(s, 'kid', true), 2);
    expect(s).toMatchObject({ index: 1, phase: 'open', kidOut: false, botOut: false, done: false, kid: 1 });
    s = duelNext(duelAnswer(s, 'bot', true), 2);
    expect(s.done).toBe(true);
  });

  it('比分決定輸贏與星數：贏 3 星、平手 2 星、輸 1 星', () => {
    expect(duelOutcome({ ...startDuel(), kid: 6, bot: 4 })).toBe('win');
    expect(duelOutcome({ ...startDuel(), kid: 5, bot: 5 })).toBe('tie');
    expect(duelOutcome({ ...startDuel(), kid: 3, bot: 7 })).toBe('lose');
    expect(outcomeStars('win')).toBe(3);
    expect(outcomeStars('tie')).toBe(2);
    expect(outcomeStars('lose')).toBe(1);
  });
});

describe('益智搶答：機器人', () => {
  const q: ChoiceQuestion = {
    id: 'q',
    subject: 'math',
    skill: 'math.add',
    indicators: ['N-2-2'],
    prompt: '3 + 4 = ?',
    type: 'choice',
    options: [{ text: '6' }, { text: '7' }, { text: '8' }, { text: '9' }],
    answer: 1,
  };

  it('答對率接近設定（簡單 60％、普通 75％、厲害 90％）', () => {
    for (const level of [1, 2, 3] as const) {
      const rng = createRng(level * 1000);
      let right = 0;
      for (let i = 0; i < 3000; i++) if (botMove(q, level, rng).pick === q.answer) right++;
      expect(right / 3000, `level ${level}`).toBeCloseTo(BOT_ACCURACY[level], 1);
    }
  });

  it('選錯時選的是別的選項，索引不會超出範圍', () => {
    const rng = createRng(3);
    for (let i = 0; i < 500; i++) {
      const m = botMove(q, 1, rng);
      expect(m.pick).toBeGreaterThanOrEqual(0);
      expect(m.pick).toBeLessThan(q.options.length);
    }
  });

  it('像人一樣要時間讀題與思考；越厲害反應越快', () => {
    const avg = (level: 1 | 2 | 3) => {
      const rng = createRng(11);
      let sum = 0;
      for (let i = 0; i < 400; i++) {
        const d = botMove(q, level, rng).delayMs;
        expect(d).toBeGreaterThanOrEqual(2000);
        expect(d).toBeLessThanOrEqual(8000);
        sum += d;
      }
      return sum / 400;
    };
    expect(avg(3)).toBeLessThan(avg(2));
    expect(avg(2)).toBeLessThan(avg(1));
  });

  it('題目越長，讀題時間越久', () => {
    const long = { ...q, prompt: '小明有 3 顆蘋果，媽媽又給他 4 顆，後來他吃掉 2 顆，請問小明現在有幾顆蘋果？' };
    const rngA = createRng(8);
    const rngB = createRng(8);
    expect(botMove(long, 2, rngA).delayMs).toBeGreaterThan(botMove(q, 2, rngB).delayMs);
  });
});
