/**
 * 班級伺服器進入點：讀環境變數、開資料庫、啟動 HTTP 與即時連線（WebSocket /ws）。
 *
 * 環境變數：
 * - PORT：監聽埠（預設 8787）
 * - DATABASE_URL：PostgreSQL 連線字串；沒有時用 PGlite（PGLITE_DIR 有設就存檔案，否則存記憶體，重啟就清空）
 * - ALLOWED_ORIGINS：允許跨網域呼叫的前端網址，逗號分隔（預設本機開發與 preview 的網址）
 * - GOOGLE_CLIENT_ID：Google 快速登入的 OAuth Client ID；沒有就不開 Google 登入
 * - GOOGLE_TEST_JWKS＋ALLOW_TEST_GOOGLE=1：e2e 的測試模式（用測試公鑰驗證），正式環境絕不能設
 */
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { migrate, openDb, pruneAppliedOps } from './db';
import { expireGifts } from './gifts';
import { googleFromEnv } from './google';
import { Hub } from './hub';
import { attachRealtime } from './ws';

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
  const db = await openDb({ url: process.env.DATABASE_URL, pgliteDir: process.env.PGLITE_DIR });
  await migrate(db);
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
    isOnline: (id) => hub.isOnline(id),
    onProfileChanged: (id, rev, profile) => hub.profileChanged(id, rev, profile),
    onRoomChanged: (code, flags) => hub.roomSettings(code, flags),
    onKick: (id, reason) => hub.kick(id, reason),
    onGift: (id) => hub.notify(id, { t: 'gift' }),
  });
  // 過期的禮物：啟動時與每小時退款給送禮人（退款一樣通知送禮人的裝置）
  const sweepGifts = () =>
    void expireGifts({ db, onProfileChanged: (id, rev, profile) => hub.profileChanged(id, rev, profile), onGift: (id) => hub.notify(id, { t: 'gift' }) }).catch(console.error);
  sweepGifts();
  const giftTimer = setInterval(sweepGifts, GIFT_SWEEP_MS);
  const server = serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
    console.log(
      `班級伺服器啟動：port ${info.port}，資料庫 ${process.env.DATABASE_URL ? 'PostgreSQL' : 'PGlite'}，Google 登入 ${google ? (google.testMode ? '測試模式' : '開啟') : '關閉'}，允許 ${allowedOrigins.join(', ')}`,
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
