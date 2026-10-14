/**
 * 匿名造訪計數的「今天要不要送」（docs/plans/admin.md 第 3 節）：
 * 第一次開啟產生隨機 id；同一天不重送；隔天用同一個 id 再送；存的資料壞掉或 id 格式不對就換一個新的。
 */
import { describe, expect, it } from 'vitest';
import { planVisit } from '../../src/online/visit';

const ID = 'abcdef0123456789abcdef0123456789';
const newId = () => 'ffffffffffffffffffffffffffffffff';

describe('planVisit', () => {
  it('第一次開啟：產生新的 id、今天要送', () => {
    expect(planVisit(null, '2026-10-14', newId)).toEqual({ device: newId(), state: { id: newId(), day: '2026-10-14' } });
  });

  it('今天送過就不送；隔天用同一個 id 再送', () => {
    const stored = JSON.stringify({ id: ID, day: '2026-10-14' });
    expect(planVisit(stored, '2026-10-14', newId)).toBeNull();
    expect(planVisit(stored, '2026-10-15', newId)).toEqual({ device: ID, state: { id: ID, day: '2026-10-15' } });
  });

  it('存的資料壞掉或 id 格式不對：換一個新的 id 並送出', () => {
    for (const bad of ['not json', JSON.stringify({ id: 'x<y', day: '2026-10-14' }), JSON.stringify({ day: '2026-10-14' }), JSON.stringify(null)]) {
      expect(planVisit(bad, '2026-10-14', newId)).toEqual({ device: newId(), state: { id: newId(), day: '2026-10-14' } });
    }
  });
});
