/**
 * 班級島與我的島（老師 GM 的 G0＋G1，docs/plans/teacher-gm.md 第 3、4 節；多班級，docs/plans/multi-class.md）：
 * 班級角色在班級島用那一班老師設定的教材版本（老師沒設定就照自己的設定），在我的島用自己的設定；
 * 家長在裝置上匯入的題庫只在我的島出現。沒有班級的角色只有自己的島，和改版前一樣。
 * 多班級：每一班一座班級島；沒選過時在第一個班級（最早加入的）的班級島，選的那一班不在清單裡了就回到第一個班級。
 */
import { describe, expect, it } from 'vitest';
import { activeCurriculum, currentClass, devicePacksVisible, islandLook, islandOf, withIsland } from '../../src/store/island';
import { DEFAULT_CURRICULUM, addProfile, createEmptySave, type CloudLink, type CurriculumChoice, type Profile } from '../../src/store/save';
import { curriculumActivities } from '../../src/activities/resolve';
import { BUILT_IN_EDITIONS } from '../../src/content/editions';

const NOW = new Date('2026-10-05T10:00:00+08:00');
/** 孩子自己的設定（家長專區選的） */
const OWN: CurriculumChoice = { zh: 'hanlin-zh', math: 'kanghsuan-math', term: '下' };
/** 老師設定的班級版本 */
const CLASS: CurriculumChoice = { zh: 'nani-zh', math: 'hanlin-math', term: '上' };
/** 安親班老師設定的版本 */
const AFTER: CurriculumChoice = { zh: 'kanghsuan-zh', math: 'nani-math', term: '上' };

/** 建一位角色；cloud 給了就是雲端角色；curriculum 給 null 模擬缺少這個欄位的存檔 */
function kid(cloud?: CloudLink, curriculum: CurriculumChoice | null = OWN): Profile {
  const p = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW).profiles[0];
  return { ...p, curriculum: (curriculum ?? undefined) as CurriculumChoice, ...(cloud ? { cloud } : {}) };
}
const SERVER = 'https://island.example';
const inClass: CloudLink = { server: SERVER, accountId: 'a_1', rooms: [{ code: '123456', name: '二年一班' }] };
/** 學校（第一個班級）＋安親班 */
const twoClasses: CloudLink = {
  server: SERVER,
  accountId: 'a_1',
  rooms: [
    { code: '123456', name: '二年一班', curriculum: CLASS },
    { code: '654321', name: '安親班', curriculum: AFTER },
  ],
};

describe('在哪座島', () => {
  it('班級角色預設在班級島，切到我的島之後在我的島', () => {
    expect(islandOf(kid(inClass))).toBe('class');
    expect(currentClass(kid(inClass))?.code).toBe('123456');
    expect(islandOf(kid({ ...inClass, island: 'mine' }))).toBe('mine');
    expect(currentClass(kid({ ...inClass, island: 'mine' }))).toBeNull();
  });

  it('單機角色、家長名下還沒加入班級的雲端角色：只有自己的島（就算本機記著我的島也一樣）', () => {
    expect(islandOf(kid())).toBe('mine');
    expect(islandOf(kid({ server: SERVER, accountId: 'a_2' }))).toBe('mine');
    expect(islandOf(kid({ server: SERVER, accountId: 'a_2', rooms: [] }))).toBe('mine');
    expect(islandOf(kid({ server: SERVER, accountId: 'a_2', island: 'mine' }))).toBe('mine');
  });

  it('多班級：沒選過在第一個班級；選了安親班就在安親班；選的班級不在清單裡（退出了）回到第一個班級', () => {
    expect(currentClass(kid(twoClasses))?.code).toBe('123456');
    expect(currentClass(kid({ ...twoClasses, island: '654321' }))?.name).toBe('安親班');
    expect(islandOf(kid({ ...twoClasses, island: '654321' }))).toBe('class');
    expect(currentClass(kid({ ...twoClasses, island: '999999' }))?.code).toBe('123456');
  });

  it('換島：記下我的島或班級代碼；沒有班級的角色不變', () => {
    expect(withIsland(kid(twoClasses), '654321').cloud?.island).toBe('654321');
    expect(withIsland(kid(twoClasses), 'mine').cloud?.island).toBe('mine');
    const solo = kid({ server: SERVER, accountId: 'a_2' });
    expect(withIsland(solo, 'mine')).toBe(solo);
  });
});

describe('有效的教材版本', () => {
  it('班級島：老師設定了就用班級版本', () => {
    expect(activeCurriculum(kid({ ...inClass, rooms: [{ code: '123456', name: '二年一班', curriculum: CLASS }] }))).toEqual(CLASS);
  });

  it('班級島：老師還沒設定，照孩子自己的設定（和改版前一樣）', () => {
    expect(activeCurriculum(kid(inClass))).toEqual(OWN);
  });

  it('多班級：照所在那一班老師設定的版本', () => {
    expect(activeCurriculum(kid(twoClasses))).toEqual(CLASS);
    expect(activeCurriculum(kid({ ...twoClasses, island: '654321' }))).toEqual(AFTER);
  });

  it('我的島：一律用孩子自己的設定', () => {
    expect(activeCurriculum(kid({ ...twoClasses, island: 'mine' }))).toEqual(OWN);
  });

  it('沒有班級的角色：用自己的設定', () => {
    expect(activeCurriculum(kid())).toEqual(OWN);
    expect(activeCurriculum(kid({ server: SERVER, accountId: 'a_2' }))).toEqual(OWN);
  });

  it('自己的設定缺少時用預設版本（和改版前的三個呼叫處一樣）', () => {
    expect(activeCurriculum(kid(inClass, null))).toEqual(DEFAULT_CURRICULUM);
  });

  it('老師設定的版本這台裝置沒有資料：課本單元是空的（選單顯示「依 108 課綱」），不會出錯', () => {
    const p = kid({ ...inClass, rooms: [{ code: '123456', name: '二年一班', curriculum: { zh: 'no-such-zh', math: 'no-such-math', term: 'auto' } }] });
    expect(curriculumActivities('zh', BUILT_IN_EDITIONS, activeCurriculum(p))).toEqual([]);
  });
});

describe('裝置上匯入的題庫', () => {
  it('只在我的島出現；班級島不顯示', () => {
    expect(devicePacksVisible(kid(inClass))).toBe(false);
    expect(devicePacksVisible(kid({ ...inClass, island: 'mine' }))).toBe(true);
  });

  it('沒有班級的角色、還沒選角色：照舊顯示', () => {
    expect(devicePacksVisible(kid())).toBe(true);
    expect(devicePacksVisible(null)).toBe(true);
  });
});

describe('島的外觀（L5：班級島與我的島分得出來）', () => {
  it('沒有班級的角色只有自己的島（solo）：不區分，只帶名字（門牌與小屋用）', () => {
    expect(islandLook(kid())).toEqual({ kind: 'solo', kidName: '小安' });
  });

  it('有班級在班級島：class，帶那一班的代碼與名稱；切到我的島：mine', () => {
    expect(islandLook(kid(inClass))).toEqual({ kind: 'class', kidName: '小安', classCode: '123456', className: '二年一班' });
    expect(islandLook(withIsland(kid(inClass), 'mine'))).toEqual({ kind: 'mine', kidName: '小安' });
  });

  it('多班級：在哪一班的班級島就帶哪一班', () => {
    expect(islandLook(withIsland(kid(twoClasses), '654321'))).toEqual({ kind: 'class', kidName: '小安', classCode: '654321', className: '安親班' });
  });
});
