/**
 * 寄信模組（A3，server/mail.ts）：依環境變數決定用 Gmail SMTP、測試信箱或停用；測試模式的守門；
 * 錯誤只回三種固定訊息（不把 SMTP 伺服器的回應轉出去，535 有時會帶帳號資訊）。
 */
import { describe, expect, it } from 'vitest';
import { createMailer, mailErrorMessage, smtpOptions, MailError, type MailTransport } from '../../server/mail';

const MSG = { to: 'mom@example.com', subject: '驗證你的 email', text: '請打開這個連結：https://example.com/?verify=abc' };

/** 假的 SMTP 傳輸：記下寄出的信，或照設定丟出錯誤 */
function fakeTransport(fail?: { code?: string; response?: string }) {
  const sent: unknown[] = [];
  const options: unknown[] = [];
  const create = (opts: unknown): MailTransport => {
    options.push(opts);
    return {
      sendMail: async (m) => {
        if (fail) throw Object.assign(new Error(`SMTP 失敗 ${fail.response ?? ''}`), fail);
        sent.push(m);
        return {};
      },
    };
  };
  return { sent, options, create };
}

describe('依環境變數選擇寄信方式', () => {
  it('都沒設：停用，寄信回「伺服器沒有設定寄信」，不把信的內容寫進記錄', async () => {
    const logs: string[] = [];
    const { mailer, warnings } = createMailer({}, { log: (m) => logs.push(m) });
    expect(mailer.kind).toBe('disabled');
    expect(warnings).toEqual([]);
    await expect(mailer.send(MSG)).rejects.toThrow(new MailError('伺服器沒有設定寄信'));
    expect(logs.join('\n')).not.toContain('verify=abc');
  });

  it('SMTP_USER＋SMTP_PASS：用 Gmail（465、TLS、逾時），應用程式密碼去掉空白；寄件人預設「知識島大冒險 <寄件信箱>」', async () => {
    const t = fakeTransport();
    const { mailer } = createMailer({ SMTP_USER: 'island@gmail.com', SMTP_PASS: 'abcd efgh ijkl mnop' }, { createTransport: t.create });
    expect(mailer.kind).toBe('smtp');
    expect(t.options[0]).toEqual(smtpOptions('island@gmail.com', 'abcd efgh ijkl mnop'));
    expect(t.options[0]).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'island@gmail.com', pass: 'abcdefghijklmnop' } });
    expect(t.options[0]).toMatchObject({ connectionTimeout: expect.any(Number), greetingTimeout: expect.any(Number), socketTimeout: expect.any(Number) });
    await mailer.send(MSG);
    expect(t.sent).toEqual([{ from: '"知識島大冒險" <island@gmail.com>', to: MSG.to, subject: MSG.subject, text: MSG.text }]);
  });

  it('MAIL_FROM 有設就用它當寄件人', async () => {
    const t = fakeTransport();
    const { mailer } = createMailer({ SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x', MAIL_FROM: '知識島 <a@gmail.com>' }, { createTransport: t.create });
    await mailer.send(MSG);
    expect(t.sent[0]).toMatchObject({ from: '知識島 <a@gmail.com>' });
  });

  it('SMTP 只設一半：停用並警告（只列變數名稱，不列值）', () => {
    const { mailer, warnings } = createMailer({ SMTP_USER: 'island@gmail.com' });
    expect(mailer.kind).toBe('disabled');
    expect(warnings.join('\n')).toContain('SMTP_PASS');
    expect(warnings.join('\n')).not.toContain('island@gmail.com');
  });

  it('TEST_MAIL_OUTBOX=1＋ALLOW_TEST_MAIL=1：測試信箱，信放在記憶體', async () => {
    const { mailer } = createMailer({ TEST_MAIL_OUTBOX: '1', ALLOW_TEST_MAIL: '1' });
    expect(mailer.kind).toBe('outbox');
    await mailer.send(MSG);
    expect(mailer.outbox).toEqual([MSG]);
  });

  it('測試模式的守門：只設其中一個、或和 SMTP_USER 同時設，拒絕啟動', () => {
    expect(() => createMailer({ TEST_MAIL_OUTBOX: '1' })).toThrow(/ALLOW_TEST_MAIL/);
    expect(() => createMailer({ ALLOW_TEST_MAIL: '1' })).toThrow(/TEST_MAIL_OUTBOX/);
    expect(() => createMailer({ TEST_MAIL_OUTBOX: '1', ALLOW_TEST_MAIL: '1', SMTP_USER: 'a@gmail.com', SMTP_PASS: 'x' })).toThrow(/SMTP_USER/);
  });
});

describe('寄信失敗', () => {
  it('錯誤只回三種固定訊息', () => {
    expect(mailErrorMessage({ code: 'EAUTH' })).toBe('寄信帳號登入失敗');
    for (const code of ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS']) expect(mailErrorMessage({ code })).toBe('連不上寄信伺服器');
    expect(mailErrorMessage({ code: 'EENVELOPE' })).toBe('寄信失敗');
    expect(mailErrorMessage(new Error('x'))).toBe('寄信失敗');
  });

  it('SMTP 伺服器的回應文字不會出現在錯誤裡，也不寫進記錄', async () => {
    const logs: string[] = [];
    const t = fakeTransport({ code: 'EAUTH', response: '535 5.7.8 SECRET_DETAIL island@gmail.com' });
    const { mailer } = createMailer({ SMTP_USER: 'island@gmail.com', SMTP_PASS: 'x' }, { createTransport: t.create, log: (m) => logs.push(m) });
    const err = await mailer.send(MSG).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailError);
    expect((err as Error).message).toBe('寄信帳號登入失敗');
    expect(logs.join('\n')).not.toContain('SECRET_DETAIL');
    expect(logs.join('\n')).toContain('EAUTH');
  });
});
