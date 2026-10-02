/**
 * 公頻：島上畫面角落的小面板，顯示線上人數、最近幾則對話、誰在哪棟建築裡。
 * 只讀：短句選單與朗讀在 P2 才做（要先把短句放進 src/ui/lines.ts 並預錄語音）。
 * 沒有其他線上的人時不顯示。
 */
import { useShallow } from 'zustand/react/shallow';
import { usePresence } from '../online/usePresence';
import { zoneById } from '../world/layout';

/** 面板上顯示最近幾則 */
export const CHAT_PANEL_LINES = 5;

export function ChatPanel() {
  const members = usePresence(useShallow((s) => Object.values(s.members)));
  const chat = usePresence((s) => s.chat);
  if (!members.length) return null;
  const inside = members.filter((m) => m.zone);
  const lines = chat.slice(-CHAT_PANEL_LINES);
  return (
    <div className="chat-panel card" data-testid="chat-panel" aria-label="公頻">
      <div className="chat-head">
        <span>💬 公頻</span>
        {/* 加上自己 */}
        <span className="online-count" data-testid="online-count">
          🟢 {members.length + 1} 人在線上
        </span>
      </div>
      <ul className="chat-lines">
        {lines.map((l) => (
          <li key={l.id} data-testid="chat-line">
            <b>{l.nickname}</b>：{l.text}
          </li>
        ))}
      </ul>
      {inside.length > 0 && (
        <div className="chat-inside" data-testid="chat-inside">
          {inside.map((m) => `${m.nickname}在${zoneById(m.zone!).name}`).join('・')}
        </div>
      )}
    </div>
  );
}
