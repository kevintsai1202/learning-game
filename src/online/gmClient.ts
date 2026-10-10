/**
 * 熊熊老師進島的即時連線（老師 GM 的 G2，docs/plans/teacher-gm.md 第 13 節 G2＋G3 實作設計）：
 * 老師在班級頁按「以熊熊老師進島」後，用大人帳號的權杖連到班級伺服器的 /ws（hello 帶 gm＝班級代碼），
 * 收到的訊息寫進 usePresence（島上的孩子、公頻），送出自己的位置。
 * 和孩子的連線（realtimeClient.ts）分開：老師沒有角色存檔；GM 畫面時孩子的連線不連（OFFLINE_SCREENS 有 gm）。
 *
 * - 位置有變才送（最多每秒 10 次）；靜止時每 2 秒送一次
 * - 斷線依 2、4、8…秒重連（最多 30 秒）
 * - 4003（不是這一班的老師、權杖失效，或部署途中連到還不認得老師的舊伺服器）不再重連，顯示原因
 */
import { applyHostYard, clearHostYard } from './useHostYard';
import { create } from 'zustand';
import { applyServerMessage, wsUrlOf, type SelfInfo } from './realtimeClient';
import { TEACHER_AVATAR, TEACHER_NAME, type RoomFlags, type ServerMessage } from './realtime';
import { BUBBLE_MS, expireBubbles } from './presence';
import { usePresence } from './usePresence';
import { useAccount } from './useAccount';
import { useUi } from '../store/useUi';
import { player, teleport } from '../world/input';
import { SPAWN, TEACHER_POS } from '../world/layout';

/** 熊熊老師連線的狀態（GM 畫面顯示用） */
interface GmStore {
  status: 'off' | 'connecting' | 'online' | 'error';
  /** 進不去的原因（status 是 error 時） */
  error: string | null;
  /** 這一班的聊天、送禮開關 */
  flags: RoomFlags;
  /** 給老師看的短訊息（公告送出了、公告太快等；id 每則不同，畫面用來重新計時） */
  notice: { id: number; text: string } | null;
  /** 在班上某個孩子的島上（島嶼互訪 I2）：島主 */
  visiting: { id: string; name: string } | null;
}

export const useGm = create<GmStore>(() => ({ status: 'off', error: null, flags: { chatOpen: true, giftsOpen: true }, notice: null, visiting: null }));

/** 給老師的短訊息流水號 */
let noticeSeq = 0;
/** 顯示一則給老師看的短訊息 */
const tell = (text: string) => useGm.setState({ notice: { id: ++noticeSeq, text } });

/** 全班公告（去掉前後空白；空的不送） */
export function announce(text: string): void {
  const t = text.trim();
  if (!t) return;
  sendGm({ t: 'announce', text: t });
  tell(`📢 已公告：${t}`);
}

/** 請大家集合 */
export function summon(): void {
  sendGm({ t: 'summon' });
  tell('🔔 已請大家集合');
}

/** 去班上某個孩子的島（島嶼互訪 I2；孩子在自己的島上就好，不用開放） */
export function gmVisit(id: string): void {
  sendGm({ t: 'visit', to: id });
}

/** 回班級島 */
export function gmBackToClass(): void {
  sendGm({ t: 'go', island: 'class' });
}

/** 目前的連線 */
let socket: WebSocket | null = null;

/** 送一則訊息給伺服器；沒連線時不做事 */
export function sendGm(msg: object): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

/** 熊熊老師自己（welcome 時放進成員：自己不畫在島上，由 Player 畫） */
const SELF: SelfInfo = { nickname: TEACHER_NAME, avatar: TEACHER_AVATAR };

/** 以熊熊老師進某一班的班級島；回傳離開的函式（關閉連線、清掉島上的人） */
export function startGm(code: string): () => void {
  /** 已經離開（關閉連線後不再重連） */
  let stopped = false;
  let retry = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** 上一次送出的位置與時間 */
  let last = { x: NaN, z: NaN, h: NaN, at: 0 };

  const connect = () => {
    const session = useAccount.getState().session;
    if (!session) {
      useGm.setState({ status: 'error', error: '請重新登入' });
      return;
    }
    useGm.setState({ status: 'connecting', error: null });
    const ws = new WebSocket(wsUrlOf(session.server));
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', token: session.token, gm: code }));
    ws.onmessage = (ev) => {
      if (socket !== ws) return;
      const msg = JSON.parse(String(ev.data)) as ServerMessage;
      usePresence.setState((s) => applyServerMessage(s, msg, SELF, Date.now()));
      // 孩子的島的院子（自己的家）
      applyHostYard(msg);
      switch (msg.t) {
        case 'welcome':
          retry = 0;
          last = { x: NaN, z: NaN, h: NaN, at: 0 };
          // 到孩子的島從上岸處開始；回班級島站回廣場上 NPC 的位置（和伺服器一致）
          if (msg.host) teleport(SPAWN);
          else if (useGm.getState().visiting) teleport(TEACHER_POS);
          useGm.setState({ status: 'online', error: null, flags: msg.room, visiting: msg.host ?? null });
          break;
        case 'chat':
          // 對話氣泡時間到就收起來
          setTimeout(() => usePresence.setState((s) => expireBubbles(s, Date.now())), BUBBLE_MS + 50);
          break;
        case 'room':
          useGm.setState({ flags: msg.room });
          break;
        case 'error':
          // 公告太快等：伺服器說明原因
          tell(msg.message);
          break;
      }
    };
    ws.onclose = (ev) => {
      if (socket !== ws) return;
      socket = null;
      usePresence.getState().clear();
      clearHostYard();
      if (stopped) return;
      if (ev.code === 4003) {
        useGm.setState({ status: 'error', error: '沒辦法以熊熊老師進島：請重新登入；如果班級伺服器正在更新，請稍後再試' });
        return;
      }
      // 斷線：2、4、8…秒後重連，最多 30 秒
      useGm.setState({ status: 'connecting' });
      retry += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, Math.min(30_000, 2000 * 2 ** (retry - 1)));
    };
  };

  // 位置：有變才送（最多每秒 10 次），靜止時每 2 秒送一次
  const tick = setInterval(() => {
    if (useGm.getState().status !== 'online' || useUi.getState().screen !== 'gm') return;
    const now = Date.now();
    const { x, z } = player.pos;
    const h = player.heading;
    const moved = Math.abs(x - last.x) > 0.02 || Math.abs(z - last.z) > 0.02 || Math.abs(h - last.h) > 0.05;
    if (moved || now - last.at > 2000) {
      last = { x, z, h, at: now };
      sendGm({ t: 'move', x, z, h });
    }
  }, 100);

  connect();
  return () => {
    stopped = true;
    clearInterval(tick);
    if (retryTimer) clearTimeout(retryTimer);
    const s = socket;
    socket = null;
    s?.close();
    usePresence.getState().clear();
    clearHostYard();
    useGm.setState({ status: 'off', error: null, notice: null, visiting: null });
  };
}
