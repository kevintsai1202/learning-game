/**
 * 寄信（A3，docs/plans/accounts.md 第 7、8 節）。依環境變數決定：
 * - MAIL_SMTP_USERNAME＋MAIL_SMTP_PASSWORD 都設：用 Gmail SMTP（smtp.gmail.com:465，TLS，會驗證伺服器憑證）寄；
 *   應用程式密碼裡的空白去掉（Google 顯示時每 4 個字一組）。寄件人用 MAIL_FROM，沒設就是「知識島大冒險 <寄件信箱>」
 * - TEST_MAIL_OUTBOX=1＋ALLOW_TEST_MAIL=1：測試用信箱，信放在記憶體（GET /api/test/mails 讀，給 e2e 用）。
 *   兩個都要故意設才開；只設一個、或和 MAIL_SMTP_USERNAME 同時設就拒絕啟動。正式環境絕不能設
 * - 都沒設（或 SMTP 只設一半，會警告）：停用，寄信回「伺服器沒有設定寄信」
 * 不把信的內容寫進記錄（驗證與重設連結等於密碼）；寄信失敗只回三種固定訊息，SMTP 伺服器的回應不轉出、不寫進記錄。
 */
import nodemailer from 'nodemailer';

/** 一封信（純文字） */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** 寄信失敗：message 是可以直接顯示給大人看的固定訊息 */
export class MailError extends Error {}

/** 寄信器 */
export interface Mailer {
  /** smtp：真的寄；outbox：測試信箱；disabled：沒有設定寄信 */
  readonly kind: 'smtp' | 'outbox' | 'disabled';
  send(msg: MailMessage): Promise<void>;
  /** 測試信箱裡的信（只有 outbox 有） */
  readonly outbox?: MailMessage[];
}

/** 這裡用到的 SMTP 傳輸介面（nodemailer 的 transporter 只用 sendMail；測試換成假的） */
export interface MailTransport {
  sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<unknown>;
}

/** Gmail SMTP 的連線設定：465 走 TLS（nodemailer 預設驗證憑證與主機名稱）；連線、打招呼、傳輸各有逾時 */
export function smtpOptions(user: string, pass: string) {
  return {
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass: pass.replace(/\s+/g, '') },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  };
}

/** 寄信錯誤轉成固定訊息（依 nodemailer 的錯誤代碼） */
export function mailErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === 'EAUTH') return '寄信帳號登入失敗';
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'EDNS') return '連不上寄信伺服器';
  return '寄信失敗';
}

/** 預設的寄件人顯示 */
const DEFAULT_FROM_NAME = '知識島大冒險';

/**
 * 依環境變數建立寄信器（純函式：env 由呼叫的一方傳入，測試不碰 process.env）。
 * 測試模式設定錯誤時丟出例外（main.ts 會拒絕啟動）；SMTP 只設一半時回傳警告（只列變數名稱）。
 */
export function createMailer(
  env: Record<string, string | undefined>,
  opts: { createTransport?: (options: ReturnType<typeof smtpOptions>) => MailTransport; log?: (msg: string) => void } = {},
): { mailer: Mailer; warnings: string[] } {
  const log = opts.log ?? ((msg: string) => console.error(msg));
  const testOutbox = env.TEST_MAIL_OUTBOX === '1';
  const allowTest = env.ALLOW_TEST_MAIL === '1';
  if (testOutbox !== allowTest) {
    throw new Error(
      testOutbox
        ? '設了 TEST_MAIL_OUTBOX（測試用信箱）但沒有設 ALLOW_TEST_MAIL=1，拒絕啟動。正式環境不能設 TEST_MAIL_OUTBOX。'
        : '設了 ALLOW_TEST_MAIL 但沒有設 TEST_MAIL_OUTBOX=1，拒絕啟動。正式環境兩個都不能設。',
    );
  }
  if (testOutbox) {
    if (env.MAIL_SMTP_USERNAME) throw new Error('測試用信箱（TEST_MAIL_OUTBOX）和 MAIL_SMTP_USERNAME 不能同時設，拒絕啟動：測試模式不能在會真的寄信的環境開。');
    const outbox: MailMessage[] = [];
    return {
      mailer: {
        kind: 'outbox',
        outbox,
        send: async (msg) => void outbox.push({ ...msg }),
      },
      warnings: [],
    };
  }

  const user = env.MAIL_SMTP_USERNAME?.trim();
  const pass = env.MAIL_SMTP_PASSWORD;
  if (user && pass) {
    const options = smtpOptions(user, pass);
    const transport = opts.createTransport ? opts.createTransport(options) : (nodemailer.createTransport(options) as unknown as MailTransport);
    const from = env.MAIL_FROM?.trim() || `"${DEFAULT_FROM_NAME}" <${user}>`;
    return {
      mailer: {
        kind: 'smtp',
        send: async (msg) => {
          try {
            await transport.sendMail({ from, to: msg.to, subject: msg.subject, text: msg.text });
          } catch (err) {
            // 只記錯誤代碼與類別：SMTP 的回應（例如 535）可能帶帳號資訊
            const e = err as { code?: unknown; name?: unknown };
            log(`寄信失敗：${String(e?.name ?? 'Error')} ${String(e?.code ?? '')}`.trim());
            throw new MailError(mailErrorMessage(err));
          }
        },
      },
      warnings: [],
    };
  }

  const warnings = user || pass ? [`寄信設定不完整：MAIL_SMTP_USERNAME 與 MAIL_SMTP_PASSWORD 要一起設（缺 ${user ? 'MAIL_SMTP_PASSWORD' : 'MAIL_SMTP_USERNAME'}），先停用寄信`] : [];
  return {
    mailer: {
      kind: 'disabled',
      send: async () => {
        throw new MailError('伺服器沒有設定寄信');
      },
    },
    warnings,
  };
}
