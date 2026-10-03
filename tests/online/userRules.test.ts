/**
 * 大人帳號的規則（前端表單與伺服器共用）：帳號名稱、密碼、email。
 */
import { describe, expect, it } from 'vitest';
import { checkEmail, checkPassword, checkUsername, PASSWORD_MIN } from '../../src/online/userRules';

describe('帳號名稱', () => {
  it('4～20 個英文字母、數字或底線；保留原本的大小寫，比對用小寫', () => {
    expect(checkUsername('  Teacher_Wang ')).toEqual({ ok: true, username: 'Teacher_Wang', key: 'teacher_wang' });
    expect(checkUsername('mom1')).toEqual({ ok: true, username: 'mom1', key: 'mom1' });
    expect(checkUsername('a'.repeat(20)).ok).toBe(true);
  });

  it('太短、太長、有中文或符號都不行，並說明原因', () => {
    for (const bad of ['abc', 'a'.repeat(21), '王老師', 'mom-1', 'mom 1', 'mom@x', '']) {
      const r = checkUsername(bad);
      expect(r.ok, bad).toBe(false);
      if (!r.ok) expect(r.reason).toContain('4～20');
    }
  });
});

describe('密碼', () => {
  it(`至少 ${PASSWORD_MIN} 個字；太長也不行`, () => {
    expect(checkPassword('12345678')).toBeNull();
    expect(checkPassword('1234567')).toContain(`${PASSWORD_MIN}`);
    expect(checkPassword('x'.repeat(129))).not.toBeNull();
    expect(checkPassword('        ')).not.toBeNull();
  });
});

describe('email', () => {
  it('去掉前後空白；格式要像 email', () => {
    expect(checkEmail('  wang@example.com ')).toEqual({ ok: true, email: 'wang@example.com' });
    for (const bad of ['', 'wang', 'wang@', '@example.com', 'wang@example', 'wa ng@example.com']) {
      expect(checkEmail(bad).ok, bad).toBe(false);
    }
  });
});
