/**
 * WebSocket 連線層：掛在同一個 HTTP 伺服器的 /ws，負責檢查來源、登入（第一則 hello 帶權杖）、
 * 心跳、格式驗證，然後把訊息交給即時中樞（server/hub.ts）。
 *
 * 關閉代碼：4001 被踢（另一台裝置登入、老師移除或重設密碼）、4002 逾時沒有 hello、4003 權杖不對、
 * 4005 換了班級要重新上線（家長掃 QR code 讓孩子加入班級）、1008 格式錯誤。
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import type { Db } from './db';
import type { Hub, HubConn, JoinInfo } from './hub';
import { lookupToken } from './tokens';
import { flagsOf, membershipsOf, sharedClassNames, sharedMembershipsOf } from './classes';
import { parseClientMessage, type IslandKind } from '../src/online/realtime';
import { equippedOf } from '../src/store/catalog';
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

  /**
   * 用權杖查出上線需要的資料；不是有效的孩子權杖回傳 'bad'。
   * 沒有班級的孩子（家長名下）也能上線，進自己的島（島嶼互訪 I1；改版前回 4004「沒有班級」）。
   * 多班級（docs/plans/multi-class.md）：所有班級與各班的暱稱、開關（第一個班級在前面）；room 是要去哪一班的班級島。
   * 朋友：有共同班級的同學（名字是最早建立的共同班級裡的暱稱，兩邊一致）、兄弟姊妹（同一位家長名下，名字是角色名字；
   * 同時是同學的照班級暱稱）。
   */
  async function joinInfoOf(token: string, island: IslandKind | undefined, room: string | undefined): Promise<JoinInfo | 'bad'> {
    const who = await lookupToken(db, token, now());
    if (!who || who.kind !== 'kid') return 'bad';
    const row = (await db.query<{ id: string; profile: Profile; parent_id: string | null }>('SELECT id, profile, parent_id FROM accounts WHERE id = $1', [who.accountId]))[0];
    if (!row) return 'bad';
    const classes = (await membershipsOf(db, row.id)).map((m) => ({ code: m.room_code, nickname: m.nickname, flags: flagsOf(m) }));
    const names = sharedClassNames(await sharedMembershipsOf(db, row.id));
    const siblings = row.parent_id
      ? (await db.query<{ id: string }>('SELECT id FROM accounts WHERE parent_id = $1 AND id <> $2', [row.parent_id, row.id])).map((r) => r.id)
      : [];
    const ids = [...new Set([...names.keys(), ...siblings])];
    const friends = ids.length
      ? await db.query<{ id: string; profile: Profile }>('SELECT id, profile FROM accounts WHERE id = ANY($1) ORDER BY created_at, id', [ids])
      : [];
    return {
      accountId: row.id,
      name: row.profile.name,
      classes,
      profile: row.profile,
      via: who.via,
      tokenRoom: who.tokenRoom,
      island,
      room,
      friends: friends.map((f) => {
        const shared = names.get(f.id);
        return { id: f.id, nickname: shared?.nickname ?? f.profile.name, avatar: equippedOf(f.profile), myName: shared?.myName ?? row.profile.name };
      }),
    };
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
        void joinInfoOf(msg.token, msg.island, msg.room)
          .then((info) => {
            if (ws.readyState !== ws.OPEN) return;
            if (info === 'bad') {
              ws.close(4003, 'bad token');
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
        case 'go':
          hub.goTo(conn, msg.island, msg.room);
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
