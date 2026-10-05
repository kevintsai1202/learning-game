/**
 * 班級島與我的島（老師 GM 的 G0＋G1，docs/plans/teacher-gm.md 第 3、4 節）：
 * 班級角色在班級島用老師設定的教材版本（老師沒設定就照自己的設定），在我的島用自己的設定；
 * 家長在裝置上匯入的題庫只在我的島出現。沒有班級的角色只有自己的島，和改版前一樣。
 */
import { describe, expect, it } from 'vitest';
import { activeCurriculum, devicePacksVisible, islandOf } from '../../src/store/island';
import { DEFAULT_CURRICULUM, addProfile, createEmptySave, type CloudLink, type CurriculumChoice, type Profile } from '../../src/store/save';
import { curriculumActivities } from '../../src/activities/resolve';
import { BUILT_IN_EDITIONS } from '../../src/content/editions';

const NOW = new Date('2026-10-05T10:00:00+08:00');
/** 孩子自己的設定（家長專區選的） */
const OWN: CurriculumChoice = { zh: 'hanlin-zh', math: 'kanghsuan-math', term: '下' };
/** 老師設定的班級版本 */
const CLASS: CurriculumChoice = { zh: 'nani-zh', math: 'hanlin-math', term: '上' };

/** 建一位角色；cloud 給了就是雲端角色；curriculum 給 null 模擬缺少這個欄位的存檔 */
function kid(cloud?: CloudLink, curriculum: CurriculumChoice | null = OWN): Profile {
  const p = addProfile(createEmptySave(), { name: '小安', avatar: { animal: 'bear', color: '#8b5a2b', hat: null } }, NOW).profiles[0];
  return { ...p, curriculum: (curriculum ?? undefined) as CurriculumChoice, ...(cloud ? { cloud } : {}) };
}
const inClass: CloudLink = { server: 'https://island.example', room: '123456', roomName: '二年一班', accountId: 'a_1' };

describe('在哪座島', () => {
  it('班級角色預設在班級島，切到我的島之後在我的島', () => {
    expect(islandOf(kid(inClass))).toBe('class');
    expect(islandOf(kid({ ...inClass, island: 'mine' }))).toBe('mine');
  });

  it('單機角色、家長名下還沒加入班級的雲端角色：只有自己的島（就算本機記著我的島也一樣）', () => {
    expect(islandOf(kid())).toBe('mine');
    expect(islandOf(kid({ server: 'https://island.example', accountId: 'a_2' }))).toBe('mine');
    expect(islandOf(kid({ server: 'https://island.example', accountId: 'a_2', island: 'mine' }))).toBe('mine');
  });
});

describe('有效的教材版本', () => {
  it('班級島：老師設定了就用班級版本', () => {
    expect(activeCurriculum(kid({ ...inClass, roomCurriculum: CLASS }))).toEqual(CLASS);
  });

  it('班級島：老師還沒設定，照孩子自己的設定（和改版前一樣）', () => {
    expect(activeCurriculum(kid(inClass))).toEqual(OWN);
  });

  it('我的島：一律用孩子自己的設定', () => {
    expect(activeCurriculum(kid({ ...inClass, roomCurriculum: CLASS, island: 'mine' }))).toEqual(OWN);
  });

  it('沒有班級的角色：用自己的設定；本機殘留的班級版本不算數', () => {
    expect(activeCurriculum(kid())).toEqual(OWN);
    expect(activeCurriculum(kid({ server: 'https://island.example', accountId: 'a_2', roomCurriculum: CLASS }))).toEqual(OWN);
  });

  it('自己的設定缺少時用預設版本（和改版前的三個呼叫處一樣）', () => {
    expect(activeCurriculum(kid(inClass, null))).toEqual(DEFAULT_CURRICULUM);
  });

  it('老師設定的版本這台裝置沒有資料：課本單元是空的（選單顯示「依 108 課綱」），不會出錯', () => {
    const p = kid({ ...inClass, roomCurriculum: { zh: 'no-such-zh', math: 'no-such-math', term: 'auto' } });
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
