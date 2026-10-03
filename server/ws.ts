/**
 * WebSocket 連線層：掛在同一個 HTTP 伺服器的 /ws，負責檢查來源、登入（第一則 hello 帶權杖）、
 * 心跳、格式驗證，然後把訊息交給即時中樞（server/hub.ts）。
 *
 * 關閉代碼：4001 被踢（另一台裝置登入、老師移除或重設密碼）、4002 逾時沒有 hello、4003 權杖不對、1008 格式錯誤。
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Db } from './db';
import type { Hub, HubConn, JoinInfo } from './hub';
import { lookupToken } from './tokens';
import { CLOSE_NO_CLASS, parseClientMessage } from '../src/online/realtime';
import type { Profile } from '../src/store/save';

/** 可以掛 upgrade 事件的 HTTP 伺服器（@hono/node-server 的 serve() 回傳值） */
interface UpgradeServer {
  on(event: 'upgrade', listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown;
  off(event: 'upgrade', listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): unknown;
}

/** attachRealtime 的設定 */
export interface RealtimeOptions {
  db: Db;
  hub: Hub;
  /** 允許連線的網站來源（和 HTTP 的 CORS 相同） */
  allowedOrigins: string[];
  now?: () => Date;
  /** 連上後多久沒送 hello 就斷線（毫秒） */
  helloTimeoutMs?: number;
  /** 位置打包廣播的間隔（毫秒） */
  flushMs?: number;
  /** 心跳間隔（毫秒）；一輪沒回 pong 就斷線 */
  pingMs?: number;
}

/** 單一訊息的大小上限（位元組）：裝置只會送很短的 JSON */
const MAX_PAYLOAD = 4 * 1024;

/** 掛上即時連線；回傳停止的函式（關閉所有連線與計時器） */
export function attachRealtime(server: UpgradeServer, opts: RealtimeOptions): { close: () => void } {
  const { db, hub } = opts;
  const now = opts.now ?? (() => new Date());
  const allowed = new Set(opts.allowedOrigins);
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });
  /** 每條連線上一輪心跳有沒有回應 */
  const alive = new WeakMap<WebSocket, boolean>();

  /** HTTP 升級成 WebSocket：只接受 /ws，來源要在允許清單內（沒有 Origin 的非瀏覽器用戶端放行，仍要權杖） */
  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    const origin = req.headers.origin;
    if (origin && !allowed.has(origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => handle(ws));
  };
  server.on('upgrade', onUpgrade);

  const flushTimer = setInterval(() => hub.flush(), opts.flushMs ?? 100);
  const pingTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (alive.get(ws) === false) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, opts.pingMs ?? 30_000);

  /** 用權杖查出加入房間需要的資料；不是有效的孩子權杖回傳 'bad'，角色沒有班級回傳 'noClass' */
  async function joinInfoOf(token: string): Promise<JoinInfo | 'bad' | 'noClass'> {
    const who = await lookupToken(db, token, now());
    if (!who || who.kind !== 'kid') return 'bad';
    if (!who.roomCode) return 'noClass';
    const row = (
      await db.query<{ id: string; nickname: string; profile: Profile; room_code: string; chat_open: boolean; gifts_open: boolean }>(
        'SELECT a.id, a.nickname, a.profile, a.room_code, r.chat_open, r.gifts_open FROM accounts a JOIN rooms r ON r.code = a.room_code WHERE a.id = $1',
        [who.accountId],
      )
    )[0];
    if (!row) return 'bad';
    return { accountId: row.id, roomCode: row.room_code, nickname: row.nickname, profile: row.profile, flags: { chatOpen: row.chat_open, giftsOpen: row.gifts_open } };
  }

  /** 一條新的連線 */
  function handle(ws: WebSocket) {
    const conn: HubConn = {
      send: (msg) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
      },
      close: (code, reason) => ws.close(code, reason),
    };
    let authed = false;
    let authing = false;
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const helloTimer = setTimeout(() => {
      if (!authed) ws.close(4002, 'no hello');
    }, opts.helloTimeoutMs ?? 5000);

    ws.on('message', (data, isBinary) => {
      const msg = isBinary ? null : parseClientMessage(String(data));
      if (!msg) {
        ws.close(1008, 'bad message');
        return;
      }
      if (!authed) {
        // 驗證權杖期間收到的其他訊息先忽略；第一則必須是 hello
        if (authing) return;
        if (msg.t !== 'hello') {
          ws.close(1008, 'hello first');
          return;
        }
        authing = true;
        void joinInfoOf(msg.token)
          .then((info) => {
            if (ws.readyState !== ws.OPEN) return;
            if (info === 'bad') {
              ws.close(4003, 'bad token');
              return;
            }
            if (info === 'noClass') {
              ws.close(CLOSE_NO_CLASS, 'no class');
              return;
            }
            authed = true;
            clearTimeout(helloTimer);
            hub.join(conn, info);
          })
          .catch(() => ws.close(1011, 'server error'));
        return;
      }
      switch (msg.t) {
        case 'move':
          hub.move(conn, msg.x, msg.z, msg.h);
          break;
        case 'where':
          hub.where(conn, msg.zone);
          break;
        case 'say':
          hub.say(conn, msg.phrase);
          break;
        case 'hello':
          ws.close(1008, 'already logged in');
          break;
      }
    });

    ws.on('close', () => {
      clearTimeout(helloTimer);
      if (authed) hub.leave(conn);
    });
  }

  return {
    close: () => {
      clearInterval(flushTimer);
      clearInterval(pingTimer);
      server.off('upgrade', onUpgrade);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
