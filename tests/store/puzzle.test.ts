/**
 * 益智遊戲館的存檔規則（前端與伺服器共用）：每局金幣、每日金幣上限、益智遊戲的遊玩時間、家長設定。
 * 規格見 docs/plans/puzzle-house.md 第 6 節。
 */
import { describe, expect, it } from 'vitest';
import {
  addPlayTime,
  addProfile,
  createEmptySave,
  loadSave,
  parseProfile,
  puzzleToday,
  recordPuzzle,
  recordSession,
  type Profile,
  type SaveData,
} from '../../src/store/save';
import { PUZZLE_DAILY_COIN_CAP, PUZZLE_DAYS_KEPT, DEFAULT_PUZZLE_LIMIT_MIN, puzzleCoinsFor } from '../../src/store/puzzle';
import type { AnswerRecord, Question } from '../../src/core/types';

const NOW = new Date('2026-10-04T10:00:00+08:00');
const q = (id: string, skill = 'math.add'): Question => ({ id, subject: 'math', skill, indicators: ['N-2-2'], prompt: id, type: 'choice', options: [{ text: '1' }, { text: '2' }], answer: 0 });

/** 一位剛建立的小朋友（0 金幣） */
function fresh(): SaveData {
  return addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW);
}
const kid = (s: SaveData): Profile => s.profiles[0];

describe('益智遊戲：每局金幣', () => {
  it('1 星 2 枚、2 星 3 枚、3 星 5 枚', () => {
    expect(puzzleCoinsFor(1, 0)).toBe(2);
    expect(puzzleCoinsFor(2, 0)).toBe(3);
    expect(puzzleCoinsFor(3, 0)).toBe(5);
  });

  it('每天最多 20 枚：快到上限時只給剩下的，到了上限就不給', () => {
    expect(PUZZLE_DAILY_COIN_CAP).toBe(20);
    expect(puzzleCoinsFor(3, 17)).toBe(3);
    expect(puzzleCoinsFor(3, 20)).toBe(0);
    expect(puzzleCoinsFor(1, 25)).toBe(0);
  });
});

describe('益智遊戲：紀錄一局', () => {
  it('加金幣、記今天拿到的益智金幣與最佳星數；不寫學習的歷史紀錄與最佳星數', () => {
    let s = fresh();
    s = recordPuzzle(s, kid(s).id, { game: 'memory', stars: 2 }, NOW);
    s = recordPuzzle(s, kid(s).id, { game: 'memory', stars: 1 }, NOW);
    const p = kid(s);
    expect(p.coins).toBe(3 + 2);
    expect(puzzleToday(p, NOW)).toEqual({ seconds: 0, coins: 5 });
    expect(p.puzzle?.best).toEqual({ memory: 2 });
    expect(p.history).toEqual([]);
    expect(p.bestStars).toEqual({});
  });

  it('一天玩很多局，金幣停在 20 枚；隔天重新計算', () => {
    let s = fresh();
    for (let i = 0; i < 6; i++) s = recordPuzzle(s, kid(s).id, { game: 'quiz', stars: 3 }, NOW);
    expect(kid(s).coins).toBe(20);
    expect(puzzleToday(kid(s), NOW).coins).toBe(20);
    const tomorrow = new Date('2026-10-05T09:00:00+08:00');
    s = recordPuzzle(s, kid(s).id, { game: 'quiz', stars: 3 }, tomorrow);
    expect(kid(s).coins).toBe(25);
    expect(puzzleToday(kid(s), tomorrow).coins).toBe(5);
  });

  it('學習活動拿到的金幣不佔益智遊戲的上限', () => {
    let s = fresh();
    s = recordSession(
      s,
      kid(s).id,
      { activityId: 'math.add', subject: 'math', total: 1, correct: 1, stars: 3, coins: 7, seconds: 30, answers: [{ question: q('x'), correct: true, firstTry: true }] },
      NOW,
    );
    s = recordPuzzle(s, kid(s).id, { game: 'quiz', stars: 3 }, NOW);
    expect(kid(s).coins).toBe(7 + 5);
    expect(puzzleToday(kid(s), NOW).coins).toBe(5);
  });

  it('益智搶答的作答紀錄照學習的規則更新熟練度、課綱統計、錯題本，最近做過的題目記在 puzzle.quiz', () => {
    let s = fresh();
    const answers: AnswerRecord[] = [
      { question: q('a'), correct: true, firstTry: true },
      { question: q('b'), correct: false, firstTry: false },
    ];
    s = recordPuzzle(s, kid(s).id, { game: 'quiz', stars: 1, answers }, NOW);
    const p = kid(s);
    expect(p.skills['math.add']).toMatchObject({ attempts: 2, firstTry: 1 });
    expect(p.indicators['math:N-2-2']).toEqual({ attempts: 2, firstTry: 1 });
    expect(Object.keys(p.wrongBook)).toEqual(['b']);
    expect(p.recent['puzzle.quiz']).toEqual(['a', 'b']);
    expect(p.history).toEqual([]);
  });

  it('益智搶答答對的題目也算進獎章（例如一次答對 100 題）', () => {
    let s = fresh();
    s = { ...s, profiles: [{ ...kid(s), skills: { 'math.add': { box: 3, attempts: 120, firstTry: 99, lastSeen: '2026-10-03' } } }] };
    s = recordPuzzle(s, kid(s).id, { game: 'quiz', stars: 1, answers: [{ question: q('a'), correct: true, firstTry: true }] }, NOW);
    expect(kid(s).badges?.['correct-100']).toBe('2026-10-04');
  });

  it('不改動傳入的舊存檔（不可變更新）', () => {
    const s = fresh();
    const before = JSON.stringify(s);
    recordPuzzle(s, kid(s).id, { game: 'memory', stars: 3 }, NOW);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('益智遊戲：遊玩時間', () => {
  it('在益智遊戲館玩的時間同時加到整體與益智遊戲的秒數；其他地方只加整體', () => {
    let s = fresh();
    s = addPlayTime(s, kid(s).id, 30, NOW, true);
    s = addPlayTime(s, kid(s).id, 30, NOW, true);
    s = addPlayTime(s, kid(s).id, 30, NOW);
    expect(kid(s).playLog['2026-10-04']).toBe(90);
    expect(puzzleToday(kid(s), NOW)).toEqual({ seconds: 60, coins: 0 });
  });

  it('只保留最近 14 天的益智遊戲紀錄', () => {
    let s = fresh();
    for (let d = 1; d <= 20; d++) s = addPlayTime(s, kid(s).id, 30, new Date(2026, 8, d, 10), true);
    const days = Object.keys(kid(s).puzzle!.days).sort();
    expect(PUZZLE_DAYS_KEPT).toBe(14);
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('2026-09-07');
    expect(days[13]).toBe('2026-09-20');
  });

  it('沒玩過益智遊戲的角色：今天是 0 秒、0 枚', () => {
    expect(puzzleToday(kid(fresh()), NOW)).toEqual({ seconds: 0, coins: 0 });
  });
});

describe('益智遊戲：存檔相容', () => {
  it('家長設定預設每天 15 分鐘；舊存檔沒有這個欄位時補成預設值', () => {
    expect(DEFAULT_PUZZLE_LIMIT_MIN).toBe(15);
    expect(createEmptySave().settings.puzzleLimitMin).toBe(15);
    const old = createEmptySave() as unknown as { settings: Record<string, unknown> };
    delete old.settings.puzzleLimitMin;
    expect(loadSave(JSON.stringify(old)).settings.puzzleLimitMin).toBe(15);
  });

  it('改過的設定與益智遊戲紀錄可以存回來；舊角色沒有益智紀錄也讀得進來', () => {
    let s = fresh();
    s = recordPuzzle(s, kid(s).id, { game: 'spot', stars: 3 }, NOW);
    s = addPlayTime(s, kid(s).id, 30, NOW, true);
    s = { ...s, settings: { ...s.settings, puzzleLimitMin: 0 } };
    const back = loadSave(JSON.stringify(s));
    expect(back.settings.puzzleLimitMin).toBe(0);
    expect(back.profiles[0].puzzle).toEqual(kid(s).puzzle);
    expect(parseProfile(kid(fresh()))).not.toBeNull();
  });

  it('益智紀錄格式不對（金幣是負的、星數超過 3）時，角色資料驗證不通過', () => {
    const p = kid(fresh());
    expect(parseProfile({ ...p, puzzle: { days: { '2026-10-04': { seconds: 30, coins: -1 } }, best: {} } })).toBeNull();
    expect(parseProfile({ ...p, puzzle: { days: {}, best: { quiz: 4 } } })).toBeNull();
  });
});
