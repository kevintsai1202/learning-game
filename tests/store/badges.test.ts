import { describe, expect, it } from 'vitest';
import { BADGES, SKILL_MASTER_BOX, awardBadges, badgeById, badgeProgress, dayNumber, newlyEarned, shownTitle, streakDays, threeStarCount } from '../../src/store/badges';
import { MAX_BOX, addProfile, createEmptySave, type Profile, type SessionRecord } from '../../src/store/save';

const NOW = new Date('2026-10-02T10:00:00+08:00');
const TODAY = '2026-10-02';

/** 一位全新的小朋友 */
function kid(patch: Partial<Profile> = {}): Profile {
  const p = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW).profiles[0];
  return { ...p, ...patch };
}

/** 某些日期各有一回合的歷史紀錄 */
const historyOn = (...dates: string[]): SessionRecord[] =>
  dates.map((date) => ({ activityId: 'math.add', subject: 'math', date, total: 10, correct: 8, stars: 2, coins: 12, seconds: 60 }));

/** n 個技能，每個一次答對 firstTry 次、盒子等級 box */
const skillsWith = (n: number, firstTry: number, box = 1) =>
  Object.fromEntries(Array.from({ length: n }, (_, i) => [`skill.${i}`, { box, attempts: firstTry, firstTry, lastSeen: TODAY }]));

/** 某科 n 個活動三星 */
const stars = (subject: string, n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${subject}.a${i}`, 3]));

describe('獎章清單', () => {
  it('18 個、id 不重複，每個都有圖示、名稱、條件說明', () => {
    expect(BADGES).toHaveLength(18);
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(18);
    for (const b of BADGES) {
      expect(b.icon, b.id).toBeTruthy();
      expect(b.name, b.id).toBeTruthy();
      expect(b.goal, b.id).toBeTruthy();
    }
    expect(badgeById('wrong-20')).toMatchObject({ name: '錯題剋星', title: '錯題剋星' });
    expect(badgeById('nope')).toBeUndefined();
  });

  it('技能精熟的滿級和存檔的熟練度上限相同', () => {
    expect(SKILL_MASTER_BOX).toBe(MAX_BOX);
  });
});

describe('日期與連續天數', () => {
  it('日期換算成天數：跨月、跨年、閏年都連續', () => {
    expect(dayNumber('2026-10-01') - dayNumber('2026-09-30')).toBe(1);
    expect(dayNumber('2027-01-01') - dayNumber('2026-12-31')).toBe(1);
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
  });

  it('從最近一天往回數連續有完成回合的天數；同一天多回合只算一天', () => {
    expect(streakDays(kid({ history: historyOn('2026-09-30', '2026-10-01', '2026-10-01', '2026-10-02') }))).toBe(3);
    expect(streakDays(kid({ history: historyOn('2026-09-28', '2026-10-01', '2026-10-02') }))).toBe(2);
    expect(streakDays(kid())).toBe(0);
  });

  it('給今天的日期時：最近一次是前天以前，連續已經中斷，算 0', () => {
    const p = kid({ history: historyOn('2026-09-28', '2026-09-29') });
    expect(streakDays(p, '2026-10-02')).toBe(0);
    expect(streakDays(p, '2026-09-30')).toBe(2);
  });
});

describe('各科三星活動數', () => {
  it('依活動 id 的科目前綴計算；挑戰塔、錯題複習不算進科目', () => {
    const p = kid({ bestStars: { 'math.add': 3, 'math.sub': 2, 'tower.math': 3, 'review.math': 3, 'zh.order': 3 } });
    expect(threeStarCount(p, 'math')).toBe(1);
    expect(threeStarCount(p, 'zh')).toBe(1);
    expect(threeStarCount(p, 'en')).toBe(0);
  });

  it('跟著課本的單元活動（unit:…）：科目看歷史紀錄，查不到再看版本 id 的結尾', () => {
    const p = kid({
      bestStars: { 'unit:kanghsuan-zh:上:3': 3, 'unit:my-pack:上:1': 3, 'unit:nani-math:下:2': 3 },
      history: [{ activityId: 'unit:my-pack:上:1', subject: 'math', date: TODAY, total: 10, correct: 10, stars: 3, coins: 16, seconds: 60 }],
    });
    expect(threeStarCount(p, 'zh')).toBe(1);
    expect(threeStarCount(p, 'math')).toBe(2);
  });

  it('期中、期末模擬考（exam:…）算挑戰塔，不算進科目', () => {
    const p = kid({ bestStars: { 'exam:nani-math:上:final': 3 } });
    expect(threeStarCount(p, 'math')).toBe(0);
    expect(awardBadges(p, TODAY).badges?.['tower-hero']).toBe(TODAY);
  });
});

describe('獎章條件', () => {
  /** 檢查某個獎章：剛好達標會拿到，差一點不會 */
  const reach = (id: string, below: Partial<Profile>, at: Partial<Profile>) => {
    expect(awardBadges(kid(below), TODAY).badges?.[id], `${id} 未達標`).toBeUndefined();
    expect(awardBadges(kid(at), TODAY).badges?.[id], `${id} 達標`).toBe(TODAY);
  };

  it('初次冒險：完成第一回合', () => reach('first-adventure', {}, { history: historyOn(TODAY) }));
  it('答對 100／500／1000 題：各技能一次答對的總和', () => {
    reach('correct-100', { skills: skillsWith(9, 11) }, { skills: skillsWith(10, 10) });
    reach('correct-500', { skills: skillsWith(10, 49) }, { skills: skillsWith(10, 50) });
    reach('correct-1000', { skills: skillsWith(10, 99) }, { skills: skillsWith(10, 100) });
  });
  it('各科小達人：數學 10、國語 8、英語 8、生活 5 個活動三星', () => {
    reach('math-master', { bestStars: stars('math', 9) }, { bestStars: stars('math', 10) });
    reach('zh-master', { bestStars: stars('zh', 7) }, { bestStars: stars('zh', 8) });
    reach('en-master', { bestStars: stars('en', 7) }, { bestStars: stars('en', 8) });
    reach('life-master', { bestStars: stars('life', 4) }, { bestStars: stars('life', 5) });
  });
  it('全科探險家：四科都至少一個三星', () =>
    reach('all-subjects', { bestStars: { ...stars('math', 1), ...stars('zh', 1), ...stars('en', 1) } }, { bestStars: { ...stars('math', 1), ...stars('zh', 1), ...stars('en', 1), ...stars('life', 1) } }));
  it('錯題清道夫／剋星／終結者：清掉 5／20／50 題', () => {
    reach('wrong-5', { stats: { wrongCleared: 4, written: 0 } }, { stats: { wrongCleared: 5, written: 0 } });
    reach('wrong-20', { stats: { wrongCleared: 19, written: 0 } }, { stats: { wrongCleared: 20, written: 0 } });
    reach('wrong-50', { stats: { wrongCleared: 49, written: 0 } }, { stats: { wrongCleared: 50, written: 0 } });
  });
  it('每天都學習／一週不間斷：連續 3／7 天', () => {
    reach('streak-3', { history: historyOn('2026-10-01', TODAY) }, { history: historyOn('2026-09-30', '2026-10-01', TODAY) });
    const week = ['2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', TODAY];
    reach('streak-7', { history: historyOn(...week.slice(1)) }, { history: historyOn(...week) });
  });
  it('小小書法家／書法大師：描寫完成 20／100 個字', () => {
    reach('write-20', { stats: { wrongCleared: 0, written: 19 } }, { stats: { wrongCleared: 0, written: 20 } });
    reach('write-100', { stats: { wrongCleared: 0, written: 99 } }, { stats: { wrongCleared: 0, written: 100 } });
  });
  it('段考勇士：挑戰塔任一科三星', () => reach('tower-hero', { bestStars: { 'tower.math': 2 } }, { bestStars: { 'tower.zh': 3 } }));
  it('技能大師：10 個技能熟練度滿級', () =>
    reach('skill-master', { skills: { ...skillsWith(9, 1, SKILL_MASTER_BOX), x: { box: 4, attempts: 1, firstTry: 1, lastSeen: TODAY } } }, { skills: skillsWith(10, 1, SKILL_MASTER_BOX) }));
});

describe('頒發與保留', () => {
  it('已經得到的獎章不重複頒發、日期不變；沒有新獎章時回傳同一個存檔', () => {
    const once = awardBadges(kid({ history: historyOn(TODAY) }), TODAY);
    const twice = awardBadges(once, '2026-10-05');
    expect(twice).toBe(once);
    expect(twice.badges?.['first-adventure']).toBe(TODAY);
  });

  it('條件後來變少也不收回（例如技能熟練度掉下來）', () => {
    const earned = awardBadges(kid({ skills: skillsWith(10, 1, SKILL_MASTER_BOX) }), TODAY);
    const dropped = awardBadges({ ...earned, skills: skillsWith(10, 1, 2) }, '2026-10-03');
    expect(dropped.badges?.['skill-master']).toBe(TODAY);
  });

  it('newlyEarned 列出這次新得到的獎章（依清單順序）', () => {
    const before = kid();
    const after = awardBadges(kid({ history: historyOn(TODAY), stats: { wrongCleared: 5, written: 0 } }), TODAY);
    expect(newlyEarned(before, after)).toEqual(['first-adventure', 'wrong-5']);
  });

  it('進度：目前值與目標值（獎章簿顯示「還差幾個」）', () => {
    expect(badgeProgress(badgeById('wrong-20')!, kid({ stats: { wrongCleared: 7, written: 0 } }), TODAY)).toEqual({ value: 7, target: 20 });
    expect(badgeProgress(badgeById('streak-3')!, kid({ history: historyOn('2026-09-20') }), TODAY)).toEqual({ value: 0, target: 3 });
  });
});

describe('顯示的稱號', () => {
  it('選了已得到、而且有稱號的獎章才顯示；獎章不在了或沒有稱號都當作沒有', () => {
    const p = awardBadges(kid({ history: historyOn(TODAY), skills: skillsWith(10, 10) }), TODAY);
    expect(shownTitle({ ...p, title: 'first-adventure' })).toBe('冒險新手');
    expect(shownTitle({ ...p, title: 'wrong-20' })).toBeNull();
    expect(shownTitle({ ...p, title: 'correct-100' })).toBeNull();
    expect(shownTitle({ ...p, title: null })).toBeNull();
    expect(shownTitle(p)).toBeNull();
  });
});
