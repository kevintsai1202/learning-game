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
  replaceProfile,
  profileSchema,
  ANIMAL_IDS,
  setTitle,
  setAvatar,
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

  it.each(['bear', 'rabbit', 'cat', 'dog'] as const)('舊存檔只有原本 4 種動物（%s）照常讀得進來', (animal) => {
    const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal, color: '#ffffff', hat: null } }, NOW);
    const loaded = loadSave(JSON.stringify(s));
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.profiles[0].avatar.animal).toBe(animal);
  });

  it.each(['capybara', 'panda', 'penguin', 'fox', 'koala', 'pig', 'eagle', 'elephant'] as const)('新動物 %s 的存檔可以讀回', (animal) => {
    expect(ANIMAL_IDS).toContain(animal);
    const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal, color: '#ffffff', hat: null } }, NOW);
    const loaded = loadSave(JSON.stringify(s));
    expect(loaded.profiles).toHaveLength(1);
    expect(loaded.profiles[0].avatar.animal).toBe(animal);
  });

  it('共 12 種動物', () => {
    expect(ANIMAL_IDS).toHaveLength(12);
  });

  it('不存在的動物 id 讀檔失敗，回傳新存檔', () => {
    const s = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#ffffff', hat: null } }, NOW);
    const bad = JSON.parse(JSON.stringify(s));
    bad.profiles[0].avatar.animal = 'dragon';
    expect(loadSave(JSON.stringify(bad)).profiles).toEqual([]);
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

describe('存檔：雲端角色', () => {
  const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
  const cloud = { server: 'https://island.example', room: '123456', roomName: '二年一班', accountId: 'a_1' };

  it('雲端標記可以存回來；舊存檔沒有這個欄位也讀得進來', () => {
    const linked = replaceProfile(base, { ...base.profiles[0], cloud });
    expect(loadSave(JSON.stringify(linked)).profiles[0].cloud).toEqual(cloud);
    expect(loadSave(JSON.stringify(base)).profiles[0].cloud).toBeUndefined();
  });

  it('班級版本與我的島（老師 GM 的 G0＋G1）也存得回來；格式不對的整份不收', () => {
    const more = { ...cloud, roomCurriculum: { zh: 'nani-zh', math: 'hanlin-math', term: '上' as const }, island: 'mine' as const };
    const linked = replaceProfile(base, { ...base.profiles[0], cloud: more });
    expect(loadSave(JSON.stringify(linked)).profiles[0].cloud).toEqual(more);
    expect(profileSchema.safeParse({ ...base.profiles[0], cloud: { ...cloud, island: 'class' } }).success).toBe(false);
    expect(profileSchema.safeParse({ ...base.profiles[0], cloud: { ...cloud, roomCurriculum: { zh: 'nani-zh' } } }).success).toBe(false);
  });

  it('profileSchema 可以單獨驗證一位小朋友的資料（伺服器收上傳的進度用）', () => {
    expect(profileSchema.safeParse(base.profiles[0]).success).toBe(true);
    expect(profileSchema.safeParse({ ...base.profiles[0], coins: -1 }).success).toBe(false);
  });

  it('replaceProfile：同 id 就取代，其他角色與目前角色不變', () => {
    const two = addProfile(base, { name: '小美', avatar: { animal: 'cat', color: '#ffffff', hat: null } }, NOW);
    const first = two.profiles[0];
    const s = replaceProfile(two, { ...first, coins: 99 });
    expect(s.profiles.map((p) => p.coins)).toEqual([99, 0]);
    expect(s.profiles[1]).toBe(two.profiles[1]);
    expect(s.activeProfileId).toBe(two.activeProfileId);
  });

  it('replaceProfile：沒有同 id 的角色就加在最後', () => {
    const other = { ...base.profiles[0], id: 'p_other', name: '小華' };
    const s = replaceProfile(base, other);
    expect(s.profiles.map((p) => p.id)).toEqual([base.profiles[0].id, 'p_other']);
  });
});

describe('存檔：學習統計與獎章（R1）', () => {
  const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
  const pid = base.profiles[0].id;
  const write = (id: string): Question => ({ id, subject: 'zh', skill: 'zh.write', indicators: ['4-I-1'], prompt: id, type: 'write', char: '人' } as unknown as Question);

  it('玩完第一回合就得到「初次冒險」（同一回合當下，不是下一回合）', () => {
    const s = recordSession(base, pid, session([{ question: q('a'), correct: true, firstTry: true }]), NOW);
    expect(s.profiles[0].badges).toEqual({ 'first-adventure': '2026-10-01' });
  });

  it('描寫題完成才算寫完一個字；沒寫完不算', () => {
    const s = recordSession(
      base,
      pid,
      session([
        { question: write('w1'), correct: true, firstTry: true },
        { question: write('w2'), correct: true, firstTry: false },
        { question: write('w3'), correct: false, firstTry: false },
        { question: q('n1'), correct: true, firstTry: true },
      ]),
      NOW,
    );
    expect(s.profiles[0].stats).toEqual({ wrongCleared: 0, written: 2 });
  });

  it('錯題移出錯題本時加一；清掉第 5 題的那一回合就得到「錯題清道夫」', () => {
    const ids = ['e1', 'e2', 'e3', 'e4', 'e5'];
    // 先全部答錯進錯題本，再連續兩回合一次答對
    let s = recordSession(base, pid, session(ids.map((id) => ({ question: q(id), correct: false, firstTry: false }))), NOW);
    s = recordSession(s, pid, session(ids.map((id) => ({ question: q(id), correct: true, firstTry: true }))), NOW);
    expect(s.profiles[0].stats?.wrongCleared ?? 0).toBe(0);
    expect(s.profiles[0].badges?.['wrong-5']).toBeUndefined();
    s = recordSession(s, pid, session(ids.map((id) => ({ question: q(id), correct: true, firstTry: true }))), NOW);
    expect(s.profiles[0].stats?.wrongCleared).toBe(5);
    expect(s.profiles[0].badges?.['wrong-5']).toBe('2026-10-01');
  });

  it('統計、獎章、稱號可以存回來；舊存檔沒有這些欄位也讀得進來', () => {
    let s = recordSession(base, pid, session([{ question: q('a'), correct: true, firstTry: true }]), NOW);
    s = setTitle(s, pid, 'first-adventure');
    const loaded = loadSave(JSON.stringify(s)).profiles[0];
    expect(loaded.badges).toEqual({ 'first-adventure': '2026-10-01' });
    expect(loaded.title).toBe('first-adventure');
    expect(loaded.stats).toEqual({ wrongCleared: 0, written: 0 });
    expect(loadSave(JSON.stringify(base)).profiles[0].badges).toBeUndefined();
  });

  it('稱號：只能選已得到、而且有稱號的獎章；null 表示不顯示', () => {
    const s = recordSession(base, pid, session([{ question: q('a'), correct: true, firstTry: true }]), NOW);
    expect(setTitle(s, pid, 'first-adventure').profiles[0].title).toBe('first-adventure');
    expect(() => setTitle(s, pid, 'wrong-20')).toThrow();
    expect(setTitle(setTitle(s, pid, 'first-adventure'), pid, null).profiles[0].title).toBeNull();
  });
});

describe('存檔：外觀道具（R2）', () => {
  const base = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }, NOW);
  const pid = base.profiles[0].id;

  it('換外觀時沒戴的格子存成 null；有道具的外觀可以存回來', () => {
    const s = setAvatar(base, pid, { animal: 'cat', color: '#ffffff', hat: null, face: 'face.round' });
    expect(s.profiles[0].avatar).toEqual({ animal: 'cat', color: '#ffffff', hat: null, face: 'face.round', back: null, hand: null, pet: null, trail: null });
    expect(loadSave(JSON.stringify(s)).profiles[0].avatar.face).toBe('face.round');
  });

  it('舊存檔的外觀沒有眼鏡、背後、手持也讀得進來', () => {
    const old = { ...base, profiles: [{ ...base.profiles[0], avatar: { animal: 'bear', color: '#8B5A2B', hat: null } }] };
    expect(loadSave(JSON.stringify(old)).profiles[0].avatar.animal).toBe('bear');
  });

  it('已經擁有（含靠獎章擁有）的東西不重複扣款', () => {
    const hero = replaceProfile(base, { ...base.profiles[0], coins: 500, badges: { 'tower-hero': '2026-10-01' } });
    expect(buyItem(hero, pid, 'hat.scholar', 100).profiles[0].coins).toBe(500);
  });
});
