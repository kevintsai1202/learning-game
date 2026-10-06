/**
 * 選角畫面：選擇小朋友，或建立新角色（名字、動物、顏色）。
 * 有設定班級伺服器時，多一張「🏫 班級」卡片（加入或登入班級）；有班級的角色卡片標示班級名稱。
 */
import { useState } from 'react';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import type { Animal, AvatarConfig } from '../../store/save';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { enterIslandLine } from '../lines';
import { teleport } from '../../world/input';
import { SPAWN } from '../../world/layout';
import { onlineEnabled } from '../../online/config';
import { autoUploadNewProfile } from '../../online/autoUpload';
import { lastClassroomCode, loadClassroom } from '../../online/classroom';
import { AnimalIcon } from '../AnimalIcon';

/** 動物選項 */
export const ANIMALS: { id: Animal; /** 沒有對應 emoji 的動物（卡皮巴拉）為 null，由 AnimalIcon 改畫 SVG */ emoji: string | null; name: string }[] = [
  { id: 'bear', emoji: '🐻', name: '小熊' },
  { id: 'rabbit', emoji: '🐰', name: '小兔' },
  { id: 'cat', emoji: '🐱', name: '小貓' },
  { id: 'dog', emoji: '🐶', name: '小狗' },
  { id: 'capybara', emoji: null, name: '卡皮巴拉' },
  { id: 'panda', emoji: '🐼', name: '熊貓' },
  { id: 'penguin', emoji: '🐧', name: '企鵝' },
  { id: 'fox', emoji: '🦊', name: '狐狸' },
  { id: 'koala', emoji: '🐨', name: '無尾熊' },
  { id: 'pig', emoji: '🐷', name: '小豬' },
  { id: 'eagle', emoji: '🦅', name: '老鷹' },
  { id: 'elephant', emoji: '🐘', name: '大象' },
];

/** 身體顏色選項 */
export const COLORS = ['#8b5a2b', '#f2b36b', '#ffffff', '#ff9db0', '#7fd6e0', '#9be38a', '#c9a7ff', '#5b5b6b'];

export function ProfilesScreen() {
  const profiles = useGame((s) => s.save.profiles);
  const selectProfile = useGame((s) => s.selectProfile);
  const createProfile = useGame((s) => s.createProfile);
  const goto = useUi((s) => s.goto);
  const [creating, setCreating] = useState(profiles.length === 0);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<AvatarConfig>({ animal: 'bear', color: COLORS[0], hat: null });

  /** 進入島嶼（角色回到出生點） */
  const enterIsland = (who: string) => {
    teleport(SPAWN);
    speak(enterIslandLine(who));
    goto('island');
  };

  if (creating) {
    return (
      <div className="panel-screen">
        <div className="panel card" role="dialog" aria-label="建立角色">
          <div className="panel-head">
            <span className="ribbon">新朋友</span>
            <h2>建立你的角色</h2>
            {profiles.length > 0 && (
              <button className="btn small white" onClick={() => setCreating(false)}>
                返回
              </button>
            )}
          </div>
          <div className="panel-body">
            <label className="label" htmlFor="kid-name">
              你的名字（可以請爸爸媽媽幫忙打字）
            </label>
            <input id="kid-name" className="text-input" value={name} maxLength={12} onChange={(e) => setName(e.target.value)} placeholder="例如：小安" data-testid="name-input" />
            <span className="label">選一個動物</span>
            <div className="choice-row">
              {ANIMALS.map((a) => (
                <button
                  key={a.id}
                  className={`animal-btn ${avatar.animal === a.id ? 'on' : ''}`}
                  onClick={() => {
                    sfx.tap();
                    speak(a.name);
                    setAvatar({ ...avatar, animal: a.id });
                  }}
                  aria-label={a.name}
                  aria-pressed={avatar.animal === a.id}
                >
                  <AnimalIcon animal={a.id} />
                </button>
              ))}
            </div>
            <span className="label">選一個顏色</span>
            <div className="choice-row">
              {COLORS.map((c) => (
                <button key={c} className={`swatch ${avatar.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setAvatar({ ...avatar, color: c })} aria-label={`顏色 ${c}`} />
              ))}
            </div>
            <button
              className="btn big green"
              disabled={!name.trim()}
              onClick={() => {
                createProfile(name, avatar);
                // 家長帳號登入中：新建的角色在背景自動存到家長帳號（L2，存到雲端的決定 A）
                const created = useGame.getState().save.activeProfileId;
                if (created) void autoUploadNewProfile(created);
                sfx.fanfare();
                enterIsland(name.trim());
              }}
              data-testid="create-profile"
            >
              ✓ 完成，出發！
            </button>
            {/* 這台裝置還沒有角色時（建立角色畫面沒有「返回」，看不到選角畫面的「🏫 班級」卡片）才顯示；有角色時用卡片，不重複 */}
            {onlineEnabled() && profiles.length === 0 && (
              <button className="btn small white" style={{ marginTop: 12 }} onClick={() => goto('class')} data-testid="create-open-class">
                🏫 已經在班級裡了？用班級登入
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label="選擇角色">
        <div className="panel-head">
          <span className="ribbon">誰要玩？</span>
          <h2>選擇角色</h2>
          <button className="btn small white" onClick={() => goto('title')}>
            返回
          </button>
        </div>
        <div className="panel-body">
          <div className="profile-grid">
            {profiles.map((p) => (
              <button
                key={p.id}
                className="profile-card"
                onClick={() => {
                  sfx.tap();
                  selectProfile(p.id);
                  enterIsland(p.name);
                }}
                data-testid="profile-card"
              >
                <span className="face">
                  <AnimalIcon animal={p.avatar.animal} />
                </span>
                {p.name}
                <span className="meta">
                  🪙 {p.coins}　⭐ {Object.values(p.bestStars).reduce((s, v) => s + v, 0)}
                </span>
                {/* 有班級才標班級名稱（L2：給大人看的地方不再出現「雲端」） */}
                {p.cloud?.rooms?.length ? <span className="cloud-badge">🏫 {p.cloud.rooms.map((r) => r.name).join('・')}</span> : null}
              </button>
            ))}
            {/* 班級卡片：學校平板解鎖過（L3 教室密碼；8 小時內直接到名單，過期也留著代碼只要再輸入密碼）到教室密碼畫面，否則到班級登入畫面 */}
            {onlineEnabled() && (
              <button className="profile-card add" onClick={() => goto(loadClassroom() || lastClassroomCode() ? 'classroom' : 'class')} data-testid="open-class">
                <span className="face">🏫</span>
                班級
                <span className="meta">登入</span>
              </button>
            )}
            <button className="profile-card add" onClick={() => setCreating(true)}>
              <span className="face">➕</span>
              新增角色
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
