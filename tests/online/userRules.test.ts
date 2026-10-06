/**
 * 大人帳號的規則（前端表單與伺服器共用）：帳號名稱、密碼、email。
 */
import { describe, expect, it } from 'vitest';
import { checkEmail, checkPassword, checkUsername, pickUsername, PASSWORD_MIN, usernameBaseFromEmail } from '../../src/online/userRules';

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

describe('用 Google 註冊時自動產生的帳號名稱（docs/plans/login-ux-review.md 第 6 節第 1 點）', () => {
  it('取 email @ 前面的英文字母、數字、底線，保留大小寫；最多 16 個字（留 4 位給撞名時加的數字）', () => {
    expect(usernameBaseFromEmail('Mom.Chen@gmail.com')).toBe('MomChen');
    expect(usernameBaseFromEmail('wang_teacher99@school.edu.tw')).toBe('wang_teacher99');
    expect(usernameBaseFromEmail(`${'a'.repeat(30)}@gmail.com`)).toBe('a'.repeat(16));
    expect(usernameBaseFromEmail('mom+island@gmail.com')).toBe('momisland');
  });

  it('剩不到 4 個字時前面加 user_；一個都不剩時是 user；結果一定符合帳號名稱規則', () => {
    expect(usernameBaseFromEmail('ab@gmail.com')).toBe('user_ab');
    expect(usernameBaseFromEmail('王小明@gmail.com')).toBe('user');
    expect(usernameBaseFromEmail('...@gmail.com')).toBe('user');
    for (const email of ['Mom.Chen@gmail.com', 'ab@gmail.com', '王小明@gmail.com', `${'x'.repeat(40)}@gmail.com`, 'a.b-c@gmail.com']) {
      expect(checkUsername(usernameBaseFromEmail(email)).ok, email).toBe(true);
    }
  });

  it('撞名時從 2 開始往後加數字，比對不分大小寫；加了數字也不超過 20 個字', () => {
    expect(pickUsername('MomChen', new Set())).toBe('MomChen');
    expect(pickUsername('MomChen', new Set(['momchen']))).toBe('MomChen2');
    expect(pickUsername('MomChen', new Set(['momchen', 'momchen2', 'momchen3']))).toBe('MomChen4');
    // 別人的 momchen2 不影響「MomChen」本身可以用
    expect(pickUsername('MomChen', new Set(['momchen2']))).toBe('MomChen');
    const long = 'a'.repeat(16);
    const taken = new Set([long, ...Array.from({ length: 998 }, (_, i) => `${long}${i + 2}`)]);
    const picked = pickUsername(long, taken)!;
    expect(picked).toBe(`${long}1000`);
    expect(checkUsername(picked).ok).toBe(true);
  });

  it('全部都被用掉時回傳 null（伺服器改用亂數）', () => {
    const taken = new Set(['user', ...Array.from({ length: 9998 }, (_, i) => `user${i + 2}`)]);
    expect(pickUsername('user', taken)).toBeNull();
  });
});
