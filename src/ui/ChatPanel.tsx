/**
 * 公頻：島上畫面角落的小面板，顯示線上人數、最近幾則對話、誰在哪棟建築裡；
 * 連上班級時有「💬 說話」短句盤（只能選短句，不能自由打字），點了先唸出來再送出；
 * 旁邊的「🎁 送禮」打開送禮視窗（老師關閉送禮時不顯示）。兩個按鈕同一列，面板不會變高。
 * 沒有其他人、也沒連上班級時不顯示。
 */
import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { usePresence } from '../online/usePresence';
import { sayPhrase, useRealtime } from '../online/realtimeClient';
import { useGifts } from '../online/useGifts';
import { zoneName } from '../world/layout';
import { CHAT_PHRASES, type ChatGroup } from './lines';
import { speak } from '../audio/speech';
import { sfx } from '../audio/sfx';

/** 面板上顯示最近幾則 */
export const CHAT_PANEL_LINES = 5;
/** 短句盤的分組順序 */
const GROUPS: ChatGroup[] = ['打招呼', '稱讚', '邀約', '學習', '心情'];

export function ChatPanel() {
  const members = usePresence(useShallow((s) => Object.values(s.members)));
  const selfId = usePresence((s) => s.selfId);
  const chat = usePresence((s) => s.chat);
  const status = useRealtime((s) => s.status);
  const chatOpen = useRealtime((s) => s.flags.chatOpen);
  const giftsOpen = useRealtime((s) => s.flags.giftsOpen);
  const openGift = useGifts((s) => s.openDialog);
  const notice = useRealtime((s) => s.notice);
  const [picking, setPicking] = useState(false);
  const online = status === 'online';
  if (!members.length && !online && status !== 'kicked') return null;

  const others = members.filter((m) => m.id !== selfId);
  // 線上人數含自己（真的連線時自己在成員裡；模擬時不在，要加一）
  const count = selfId ? members.length : members.length + 1;
  const inside = others.filter((m) => m.zone);
  const lines = chat.slice(-CHAT_PANEL_LINES);

  /** 選了一句短句：先唸出來（孩子知道自己選了什麼），再送出 */
  const say = (id: string, text: string) => {
    sfx.tap();
    speak(text);
    sayPhrase(id);
    setPicking(false);
  };

  return (
    <div className="chat-panel card" data-testid="chat-panel" aria-label="公頻">
      <div className="chat-head">
        <span>💬 公頻</span>
        <span className="online-count" data-testid="online-count">
          🟢 {count} 人在線上
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
          {inside.map((m) => `${m.nickname}在${zoneName(m.zone!)}`).join('・')}
        </div>
      )}
      {notice && (
        <div className="chat-notice" role="status" data-testid="chat-notice">
          {notice}
        </div>
      )}
      {online && (
        <div className="chat-actions">
          {chatOpen ? (
            <button className="btn small white chat-say" onClick={() => setPicking((v) => !v)} aria-expanded={picking} data-testid="chat-say">
              {picking ? '收起' : '💬 說話'}
            </button>
          ) : (
            <div className="chat-notice">老師把聊天關起來了</div>
          )}
          {giftsOpen && (
            <button
              className="btn small white chat-gift"
              onClick={() => {
                sfx.tap();
                setPicking(false);
                openGift();
              }}
              data-testid="chat-gift"
            >
              🎁 送禮
            </button>
          )}
        </div>
      )}
      {online && chatOpen && picking && (
        <div className="phrase-picker" data-testid="phrase-picker">
          {GROUPS.map((g) => (
            <div key={g} className="phrase-group">
              {CHAT_PHRASES.filter((p) => p.group === g).map((p) => (
                <button key={p.id} className="phrase-btn" onClick={() => say(p.id, p.text)} data-testid={`phrase-${p.id}`}>
                  {p.text}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
