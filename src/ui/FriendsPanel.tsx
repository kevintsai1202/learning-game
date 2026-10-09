/**
 * 好友名單（島嶼互訪 I1，docs/plans/islands.md）：島上 HUD 的「👫 朋友」按鈕與名單面板。
 * 列出同班同學與兄弟姊妹（老師之後在 G2 加入），線上的排前面，只寫在哪座島。
 * 只有雲端角色連上即時連線時才顯示按鈕。
 */
import { useShallow } from 'zustand/react/shallow';
import { useFriends } from '../online/useFriends';
import { useRealtime } from '../online/realtimeClient';
import { canVisit, friendStatusText, onlineFriendCount, sortedFriends } from '../online/friends';
import { visitFriend } from '../online/realtimeClient';
import { AnimalIcon } from './AnimalIcon';
import { sfx } from '../audio/sfx';

/** HUD 上的按鈕：顯示線上的朋友有幾位 */
export function FriendsButton() {
  const online = useRealtime((s) => s.status === 'online');
  const count = useFriends((s) => onlineFriendCount(s.friends));
  const setOpen = useFriends((s) => s.setOpen);
  if (!online) return null;
  return (
    <button
      className="hud-chip"
      style={{ paddingLeft: 14 }}
      onClick={() => {
        sfx.tap();
        setOpen(true);
      }}
      aria-label={`朋友（${count} 位在線上）`}
      data-testid="hud-friends"
    >
      👫 {count}
    </button>
  );
}

/** 好友名單面板 */
export function FriendsPanel() {
  const open = useFriends((s) => s.open);
  const list = useFriends(useShallow((s) => sortedFriends(s.friends)));
  const setOpen = useFriends((s) => s.setOpen);
  if (!open) return null;
  return (
    <div className="panel-screen gift-layer" data-testid="friends-panel">
      <div className="panel card friends-panel" role="dialog" aria-label="朋友">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#3b8fd9' }}>
            👫 朋友
          </span>
          <button className="btn small white" onClick={() => setOpen(false)} data-testid="friends-close">
            關閉
          </button>
        </div>
        <div className="panel-body">
          {list.length === 0 ? (
            <p className="plain">還沒有朋友。加入班級後，同學就是你的朋友；同一位家長的兄弟姊妹也是。</p>
          ) : (
            <ul className="friends-list">
              {list.map((f) => (
                <li key={f.id} className={f.online ? 'online' : ''} data-testid="friend-row" data-friend={f.nickname}>
                  <span className="avatar-dot" style={{ background: f.avatar.color }}>
                    <AnimalIcon animal={f.avatar.animal} />
                  </span>
                  <b>{f.nickname}</b>
                  <span className="friend-status" data-testid="friend-status">
                    {f.online ? '🟢' : '⚪'} {friendStatusText(f)}
                  </span>
                  {canVisit(f) && (
                    <button
                      className="btn small"
                      onClick={() => {
                        sfx.tap();
                        setOpen(false);
                        visitFriend(f.id);
                      }}
                      data-testid={`friend-visit-${f.nickname}`}
                    >
                      ✈️ 去玩
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
