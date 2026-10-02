/**
 * 選角畫面：選擇小朋友，或建立新角色（名字、動物、顏色）。
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

/** 動物選項 */
export const ANIMALS: { id: Animal; emoji: string; name: string }[] = [
  { id: 'bear', emoji: '🐻', name: '小熊' },
  { id: 'rabbit', emoji: '🐰', name: '小兔' },
  { id: 'cat', emoji: '🐱', name: '小貓' },
  { id: 'dog', emoji: '🐶', name: '小狗' },
];

/** 身體顏色選項 */
export const COLORS = ['#8b5a2b', '#f2b36b', '#ffffff', '#ff9db0', '#7fd6e0', '#9be38a', '#c9a7ff', '#5b5b6b'];

export const animalEmoji = (a: Animal) => ANIMALS.find((x) => x.id === a)?.emoji ?? '🐻';

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
                  {a.emoji}
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
                sfx.fanfare();
                enterIsland(name.trim());
              }}
              data-testid="create-profile"
            >
              ✓ 完成，出發！
            </button>
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
                <span className="face">{animalEmoji(p.avatar.animal)}</span>
                {p.name}
                <span className="meta">
                  🪙 {p.coins}　⭐ {Object.values(p.bestStars).reduce((s, v) => s + v, 0)}
                </span>
              </button>
            ))}
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
