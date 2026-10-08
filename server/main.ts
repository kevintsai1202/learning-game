/**
 * 班級伺服器進入點：讀環境變數、開資料庫、啟動 HTTP 與即時連線（WebSocket /ws）。
 *
 * 環境變數：
 * - PORT：監聽埠（預設 8787）
 * - DATABASE_URL：PostgreSQL 連線字串；沒有時用 PGlite（PGLITE_DIR 有設就存檔案，否則存記憶體，重啟就清空）
 * - ALLOWED_ORIGINS：允許跨網域呼叫的前端網址，逗號分隔（預設本機開發與 preview 的網址）
 * - GOOGLE_CLIENT_ID：Google 快速登入的 OAuth Client ID；沒有就不開 Google 登入
 * - GOOGLE_TEST_JWKS＋ALLOW_TEST_GOOGLE=1：e2e 的測試模式（用測試公鑰驗證），正式環境絕不能設
 * - MAIL_SMTP_USERNAME＋MAIL_SMTP_PASSWORD（＋MAIL_FROM）：用 Gmail SMTP 寄驗證信與重設密碼信；沒有就停用寄信（server/mail.ts）
 * - TEST_MAIL_OUTBOX＋ALLOW_TEST_MAIL=1：e2e 的測試信箱（GET /api/test/mails），正式環境絕不能設
 * - STATIC_DIR：前端建置產物（dist/）的目錄；設定時伺服器同時提供前端（Docker 映像檔設成 /app/dist）
 */
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { migrate, openDb, pruneAppliedOps } from './db';
import { expireGifts } from './gifts';
import { googleFromEnv } from './google';
import { Hub } from './hub';
import { createMailer } from './mail';
import { attachRealtime } from './ws';
import { retryConnect } from './startup';

/** 預設允許的前端網址：vite dev 與 vite preview */
const DEFAULT_ORIGINS = 'http://localhost:5173,http://localhost:4183';
const DAY_MS = 24 * 3600 * 1000;
/** 多久掃一次過期的禮物（7 天沒收下就退款） */
const GIFT_SWEEP_MS = 3600 * 1000;

/** 啟動伺服器 */
async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 8787);
  // 先檢查 Google 設定：測試模式的變數設錯就在開資料庫之前拒絕啟動
  const google = googleFromEnv(process.env);
  if (google?.testMode) console.warn('⚠️ Google 登入測試模式：接受測試金鑰簽的 token，只能用在 e2e，正式環境絕不能開。');
  // 寄信設定：測試信箱的變數設錯同樣拒絕啟動；SMTP 只設一半只警告（只列變數名稱）
  const { mailer, warnings: mailWarnings } = createMailer(process.env);
  for (const w of mailWarnings) console.warn(`⚠️ ${w}`);
  if (mailer.kind === 'outbox') console.warn('⚠️ 測試信箱模式：信放在記憶體、GET /api/test/mails 讀得到，只能用在 e2e，正式環境絕不能開。');
  if (mailer.kind === 'disabled') console.warn('寄信停用（沒有設定 MAIL_SMTP_USERNAME／MAIL_SMTP_PASSWORD）：註冊照常，驗證信與重設密碼信不會寄出。');
  const db = await openDb({ url: process.env.DATABASE_URL, pgliteDir: process.env.PGLITE_DIR });
  // 第一次碰資料庫：平台重建時資料庫常比伺服器晚好，連線錯誤每 3 秒再試、最多約 1 分鐘（server/startup.ts）
  await retryConnect(() => migrate(db), { tries: 20, delayMs: 3000 });
  await pruneAppliedOps(db, new Date());
  const pruneTimer = setInterval(() => void pruneAppliedOps(db, new Date()).catch(console.error), DAY_MS);

  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? DEFAULT_ORIGINS)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // 即時中樞：誰在線上、位置、公頻；HTTP 路由在存檔改變、老師管理時通知它
  const hub = new Hub();
  const app = createApp({
    db,
    allowedOrigins,
    google,
    mailer,
    isOnline: (id) => hub.isOnline(id),
    whereOf: (id, room) => hub.whereOf(id, room),
    onProfileChanged: (id, rev, profile) => hub.profileChanged(id, rev, profile),
    onRoomChanged: (code, flags) => hub.roomSettings(code, flags),
    onRoomContent: (code) => hub.roomContent(code),
    onClassChanged: (id) => hub.reconnect(id),
    onKick: (id, reason, via, room) => hub.kick(id, reason, via, room),
    onLeftClass: (id, room, reason) => hub.leftClass(id, room, reason),
    onGift: (id) => hub.notify(id, { t: 'gift' }),
    staticDir: process.env.STATIC_DIR || undefined,
  });
  // 過期的禮物：啟動時與每小時退款給送禮人（退款一樣通知送禮人的裝置）
  const sweepGifts = () =>
    void expireGifts({ db, onProfileChanged: (id, rev, profile) => hub.profileChanged(id, rev, profile), onGift: (id) => hub.notify(id, { t: 'gift' }) }).catch(console.error);
  sweepGifts();
  const giftTimer = setInterval(sweepGifts, GIFT_SWEEP_MS);
  const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(
      `班級伺服器啟動：port ${info.port}，資料庫 ${process.env.DATABASE_URL ? 'PostgreSQL' : 'PGlite'}，Google 登入 ${google ? (google.testMode ? '測試模式' : '開啟') : '關閉'}，前端 ${process.env.STATIC_DIR || '不提供'}，允許 ${allowedOrigins.join(', ')}`,
    );
  });

  const realtime = attachRealtime(server, { db, hub, allowedOrigins });

  /** 收到停止訊號：關閉即時連線、停止接受連線、關閉資料庫 */
  const shutdown = () => {
    clearInterval(pruneTimer);
    clearInterval(giftTimer);
    realtime.close();
    server.close(() => void db.close().finally(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('伺服器啟動失敗', err);
  process.exit(1);
});
