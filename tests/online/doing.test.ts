/**
 * 孩子在做什麼（老師 GM 的 G3，src/online/doing.ts）：回報給老師的活動名稱。
 * 在答題、結算時是活動名稱；在益智遊戲館玩某個遊戲時是遊戲名稱；其他時候（島上、建築選單、百寶屋）沒有（只看在哪棟建築）。
 * 名稱最多 40 字（伺服器的格式檢查）。
 */
import { describe, expect, it } from 'vitest';
import { DOING_MAX } from '../../src/online/realtime';
import { doingLabel } from '../../src/online/doing';

describe('doingLabel', () => {
  it('答題與結算：活動名稱', () => {
    expect(doingLabel('activity', '加法練習', null)).toBe('加法練習');
    expect(doingLabel('result', '加法練習', null)).toBe('加法練習');
  });

  it('益智遊戲館正在玩：遊戲名稱；在遊戲選單：沒有', () => {
    expect(doingLabel('puzzle', null, '益智搶答')).toBe('益智搶答');
    expect(doingLabel('puzzle', null, null)).toBeNull();
  });

  it('島上、建築選單、百寶屋：沒有', () => {
    for (const screen of ['island', 'zone', 'shop'] as const) expect(doingLabel(screen, '加法練習', '益智搶答')).toBeNull();
  });

  it('太長的名稱截短到上限', () => {
    expect(doingLabel('activity', '字'.repeat(50), null)).toHaveLength(DOING_MAX);
  });
});
