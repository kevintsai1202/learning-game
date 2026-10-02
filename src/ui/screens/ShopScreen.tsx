/**
 * 百寶屋：用金幣買帽子、換動物和顏色（換外觀免費，帽子要用金幣買）。
 */
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { HATS } from '../../world/Hats';
import { ANIMALS, COLORS } from './ProfilesScreen';
import { AnimalIcon } from '../AnimalIcon';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { boughtLine } from '../lines';
import { teleport } from '../../world/input';
import { doorOf, zoneById } from '../../world/layout';

/** 帽子在選單上的圖示 */
const HAT_EMOJI: Record<string, string> = {
  'hat.party': '🎉',
  'hat.cap': '🧢',
  'hat.flower': '🌸',
  'hat.straw': '👒',
  'hat.helmet': '⛑️',
  'hat.chef': '👨‍🍳',
  'hat.crown': '👑',
  'hat.wizard': '🧙',
};

export function ShopScreen() {
  const profile = useGame((s) => s.profile());
  const purchase = useGame((s) => s.purchase);
  const updateAvatar = useGame((s) => s.updateAvatar);
  const goto = useUi((s) => s.goto);
  if (!profile) return null;
  const leave = () => {
    teleport(doorOf(zoneById('shop')));
    goto('island');
  };
  return (
    <div className="panel-screen" style={{ placeItems: 'center end' }}>
      <div className="panel card" style={{ width: 'min(620px, 100%)' }} role="dialog" aria-label="百寶屋">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#e8457c' }}>
            🎁 百寶屋
          </span>
          <h2 style={{ fontSize: 24 }}>🪙 {profile.coins}</h2>
          <button className="btn small white" onClick={leave} data-testid="leave-shop">
            回島上
          </button>
        </div>
        <div className="panel-body">
          <span className="label">帽子</span>
          <div className="activity-grid">
            {HATS.map((h) => {
              const owned = profile.inventory.includes(h.id);
              const wearing = profile.avatar.hat === h.id;
              return (
                <div key={h.id} className="activity-card" style={{ cursor: 'default' }}>
                  <span className="icon">{HAT_EMOJI[h.id]}</span>
                  <span className="name">{h.name}</span>
                  {owned ? (
                    <button
                      className={`btn small ${wearing ? 'white' : 'green'}`}
                      onClick={() => {
                        sfx.tap();
                        updateAvatar({ ...profile.avatar, hat: wearing ? null : h.id });
                      }}
                    >
                      {wearing ? '脫下' : '戴上'}
                    </button>
                  ) : (
                    <button
                      className="btn small"
                      disabled={profile.coins < h.price}
                      onClick={() => {
                        if (purchase(h.id, h.price)) {
                          sfx.coin();
                          speak(boughtLine(h.name));
                          updateAvatar({ ...useGame.getState().profile()!.avatar, hat: h.id });
                        }
                      }}
                      data-testid={`buy-${h.id}`}
                    >
                      🪙 {h.price}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <span className="label">換動物</span>
          <div className="choice-row">
            {ANIMALS.map((a) => (
              <button key={a.id} className={`animal-btn ${profile.avatar.animal === a.id ? 'on' : ''}`} onClick={() => updateAvatar({ ...profile.avatar, animal: a.id })} aria-label={a.name}>
                <AnimalIcon animal={a.id} />
              </button>
            ))}
          </div>
          <span className="label">換顏色</span>
          <div className="choice-row">
            {COLORS.map((c) => (
              <button key={c} className={`swatch ${profile.avatar.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => updateAvatar({ ...profile.avatar, color: c })} aria-label={`顏色 ${c}`} />
            ))}
          </div>
          <p className="notice">答題可以賺金幣：一次答對 1 枚，每顆星再加 2 枚。</p>
        </div>
      </div>
    </div>
  );
}
