import { describe, expect, it } from 'vitest';
import {
  SAVE_SCHEMA_VERSION,
  addProfile,
  buyItem,
  createEmptySave,
  loadSave,
  recordSession,
  secondsPlayedOn,
  setPin,
  verifyPin,
  skillMastery,
  addPlayTime,
  RECENT_LIMIT,
  setCurriculum,
} from '../../src/store/save';
import type { AnswerRecord, Question, SessionResult } from '../../src/core/types';

const q = (id: string, skill = 'math.add', indicators = ['N-2-2']): Question => ({
  id,
  subject: 'math',
  skill,
  indicators,
  prompt: id,
  type: 'number',
  answer: 1,
});

const session = (answers: AnswerRecord[], extra: Partial<SessionResult> = {}): SessionResult => ({
  activityId: 'math.add',
  subject: 'math',
  total: answers.length,
  correct: answers.filter((a) => a.firstTry).length,
  stars: 2,
  coins: 7,
  seconds: 120,
  answers,
  ...extra,
});

const NOW = new Date('2026-10-01T09:00:00+08:00');

describe('存檔：小朋友角色', () => {
  it('新存檔沒有角色，版本號正確', () => {
    const s = createEmptySave();
    expect(s.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(s.profiles).toEqual([]);
    expect(s.activeProfileId).toBeNull();
  });

  it('新增角色後成為目前角色，名字前後空白會去掉', () => {
    const s = addProfile(createEmptySave(), { name: '  小安 ', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
    expect(s.profiles).toHaveLength(1);
    expect(s.profiles[0].name).toBe('小安');
    expect(s.activeProfileId).toBe(s.profiles[0].id);
    expect(s.profiles[0].coins).toBe(0);
  });

  it('名字空白時丟出錯誤', () => {
    expect(() => addProfile(createEmptySave(), { name: '   ', avatar: { animal: 'cat', color: '#fff', hat: null } }, NOW)).toThrow();
  });
});

describe('存檔：紀錄一回合', () => {
  const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
  const pid = base.profiles[0].id;

  it('加金幣、記最佳星數、寫入歷史', () => {
    let s = recordSession(base, pid, session([{ question: q('a'), correct: true, firstTry: true }], { stars: 2, coins: 7 }), NOW);
    s = recordSession(s, pid, session([{ question: q('a'), correct: true, firstTry: true }], { stars: 1, coins: 3 }), NOW);
    const p = s.profiles[0];
    expect(p.coins).toBe(10);
    expect(p.bestStars['math.add']).toBe(2);
    expect(p.history).toHaveLength(2);
    expect(p.history[0].date).toBe('2026-10-01');
  });

  it('一次答對讓技能盒子 +1，最多到 5；答錯 −1，最少 0', () => {
    let s = base;
    for (let i = 0; i < 7; i++) s = recordSession(s, pid, session([{ question: q(`a${i}`), correct: true, firstTry: true }]), NOW);
    expect(s.profiles[0].skills['math.add'].box).toBe(5);
    expect(skillMastery(s.profiles[0].skills['math.add'])).toBe(1);
    s = recordSession(s, pid, session([{ question: q('x'), correct: false, firstTry: false }]), NOW);
    expect(s.profiles[0].skills['math.add'].box).toBe(4);
    const fresh = recordSession(base, pid, session([{ question: q('y'), correct: false, firstTry: false }]), NOW);
    expect(fresh.profiles[0].skills['math.add'].box).toBe(0);
  });

  it('第二次才答對：盒子不變，但會進錯題本', () => {
    const s = recordSession(base, pid, session([{ question: q('b'), correct: true, firstTry: false }]), NOW);
    expect(s.profiles[0].skills['math.add'].box).toBe(0);
    expect(s.profiles[0].wrongBook['b'].wrongCount).toBe(1);
  });

  it('錯題連續兩次一次答對就從錯題本移除', () => {
    let s = recordSession(base, pid, session([{ question: q('c'), correct: false, firstTry: false }]), NOW);
    expect(s.profiles[0].wrongBook['c']).toBeDefined();
    s = recordSession(s, pid, session([{ question: q('c'), correct: true, firstTry: true }]), NOW);
    expect(s.profiles[0].wrongBook['c'].streak).toBe(1);
    s = recordSession(s, pid, session([{ question: q('c'), correct: true, firstTry: true }]), NOW);
    expect(s.profiles[0].wrongBook['c']).toBeUndefined();
  });

  it('依課綱代碼累計作答數與一次答對數', () => {
    const s = recordSession(
      base,
      pid,
      session([
        { question: q('d1', 'math.add', ['N-2-2']), correct: true, firstTry: true },
        { question: q('d2', 'math.times', ['N-2-7']), correct: false, firstTry: false },
        { question: q('d3', 'math.add', ['N-2-2']), correct: true, firstTry: false },
      ]),
      NOW,
    );
    // 鍵為「科目:代碼」，避免國語文、生活課程的 1-Ⅰ-1 這類相同代碼混在一起
    expect(s.profiles[0].indicators['math:N-2-2']).toEqual({ attempts: 2, firstTry: 1 });
    expect(s.profiles[0].indicators['math:N-2-7']).toEqual({ attempts: 1, firstTry: 0 });
  });

  it('不改動傳入的舊存檔（不可變更新）', () => {
    const before = JSON.stringify(base);
    recordSession(base, pid, session([{ question: q('e'), correct: true, firstTry: true }]), NOW);
    expect(JSON.stringify(base)).toBe(before);
  });

  it('歷史紀錄最多保留 300 筆', () => {
    let s = base;
    for (let i = 0; i < 305; i++) s = recordSession(s, pid, session([{ question: q('f'), correct: true, firstTry: true }]), NOW);
    expect(s.profiles[0].history).toHaveLength(300);
  });
});

describe('存檔：遊玩時間', () => {
  it('依日期累計秒數', () => {
    const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
    const pid = base.profiles[0].id;
    let s = addPlayTime(base, pid, 90, NOW);
    s = addPlayTime(s, pid, 30, NOW);
    s = addPlayTime(s, pid, 50, new Date('2026-10-02T09:00:00+08:00'));
    expect(secondsPlayedOn(s.profiles[0], NOW)).toBe(120);
  });
});

describe('存檔：商店', () => {
  it('金幣足夠才買得到，買過的不重複扣錢', () => {
    const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
    const pid = base.profiles[0].id;
    const rich = recordSession(base, pid, session([{ question: q('g'), correct: true, firstTry: true }], { coins: 30 }), NOW);
    expect(() => buyItem(base, pid, 'hat.crown', 20)).toThrow();
    const s = buyItem(rich, pid, 'hat.crown', 20);
    expect(s.profiles[0].coins).toBe(10);
    expect(s.profiles[0].inventory).toContain('hat.crown');
    expect(buyItem(s, pid, 'hat.crown', 20).profiles[0].coins).toBe(10);
  });
});

describe('存檔：家長 PIN', () => {
  it('設定後只有正確 PIN 能通過；PIN 必須是 4 位數字', () => {
    const s = setPin(createEmptySave(), '2580');
    expect(verifyPin(s, '2580')).toBe(true);
    expect(verifyPin(s, '0000')).toBe(false);
    expect(s.parent.pinHash).not.toContain('2580');
    expect(() => setPin(createEmptySave(), '12a4')).toThrow();
  });
});

describe('存檔：載入與相容', () => {
  it('壞掉或格式不符的資料回傳新存檔，不丟例外', () => {
    expect(loadSave('not json').profiles).toEqual([]);
    expect(loadSave(JSON.stringify({ foo: 1 })).profiles).toEqual([]);
    expect(loadSave(null).profiles).toEqual([]);
  });

  it('正常存檔可以完整讀回', () => {
    const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'rabbit', color: '#ffffff', hat: null } }, NOW);
    expect(loadSave(JSON.stringify(s))).toEqual(s);
  });

  it('新存檔預設「優先使用預錄語音」；舊存檔沒有這個欄位時補成開啟，其他設定不變', () => {
    expect(createEmptySave().settings.voiceClips).toBe(true);
    const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'rabbit', color: '#ffffff', hat: null } }, NOW);
    const { voiceClips: _omit, ...oldSettings } = { ...s.settings, voiceRate: 1.2 };
    const loaded = loadSave(JSON.stringify({ ...s, settings: oldSettings }));
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.settings.voiceClips).toBe(true);
    expect(loaded.settings.voiceRate).toBe(1.2);
  });

  it('關掉預錄語音的設定可以存回來', () => {
    const s = createEmptySave();
    const off = { ...s, settings: { ...s.settings, voiceClips: false } };
    expect(loadSave(JSON.stringify(off)).settings.voiceClips).toBe(false);
  });
});

describe('存檔：版本遷移與最近做過的題', () => {
  it('第 1 版存檔可以完整升級到第 2 版，原有資料不遺失', () => {
    const v1 = {
      schemaVersion: 1,
      profiles: [
        {
          id: 'p1',
          name: '舊存檔',
          avatar: { animal: 'cat', color: '#fff', hat: 'hat.cap' },
          createdAt: '2026-09-01T00:00:00.000Z',
          coins: 42,
          bestStars: { 'math.add': 3 },
          skills: { 'math.add': { box: 2, attempts: 5, firstTry: 4, lastSeen: '2026-09-30' } },
          indicators: { 'math:N-2-2': { attempts: 5, firstTry: 4 } },
          wrongBook: {},
          history: [{ activityId: 'math.add', subject: 'math', date: '2026-09-30', total: 10, correct: 9, stars: 3, coins: 15, seconds: 120 }],
          playLog: { '2026-09-30': 600 },
          inventory: ['hat.cap'],
        },
      ],
      activeProfileId: 'p1',
      parent: { pinHash: 'v1:abc' },
      settings: { zhuyin: true, voice: true, voiceRate: 0.9, sfx: true, music: true, dailyLimitMin: 30, quality: 'auto' },
    };
    const s = loadSave(JSON.stringify(v1));
    expect(s.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(s.profiles).toHaveLength(1);
    const p = s.profiles[0];
    expect(p.coins).toBe(42);
    expect(p.history).toHaveLength(1);
    expect(p.inventory).toEqual(['hat.cap']);
    expect(p.recent).toEqual({});
    expect(p.curriculum).toEqual({ zh: 'kanghsuan-zh', math: 'nani-math', term: 'auto' });
    expect(s.parent.pinHash).toBe('v1:abc');
  });

  it('紀錄一回合會把題目 id 記進 recent，每個活動最多保留 RECENT_LIMIT 題', () => {
    const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
    const pid = base.profiles[0].id;
    let s = base;
    for (let i = 0; i < 12; i++) {
      const answers = Array.from({ length: 10 }, (_, j) => ({ question: q(`r${i}-${j}`), correct: true, firstTry: true }));
      s = recordSession(s, pid, session(answers), NOW);
    }
    const recent = s.profiles[0].recent['math.add'];
    expect(recent.length).toBe(RECENT_LIMIT);
    // 最新的在最後
    expect(recent[recent.length - 1]).toBe('r11-9');
  });

  it('可以設定每位小朋友的教材版本與學期', () => {
    const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
    const s = setCurriculum(base, base.profiles[0].id, { zh: 'hanlin-zh', math: 'kanghsuan-math', term: '下' });
    expect(s.profiles[0].curriculum).toEqual({ zh: 'hanlin-zh', math: 'kanghsuan-math', term: '下' });
  });
});
