/**
 * 百寶屋：分頁列出帽子、眼鏡、背後、手持道具、寵物、走路特效，以及換動物和顏色（換外觀免費）。
 * 金幣道具買了就自動戴上；獎章專屬道具鎖起來並寫出需要的獎章，點一下帶孩子到獎章簿看怎麼拿。
 * 「貼紙簿」顯示同學送的貼紙（每種幾張、最近是誰送的）與最近收到的禮物。
 * 「家具」（自己的家，docs/plans/home.md）：一個一個買，同一種可以買很多個，到自己的島按「佈置」擺在院子裡。
 */
import { useState } from 'react';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { itemsOfSlot, owns, type AvatarSlot, type CatalogItem, type Slot } from '../../store/catalog';
import { DECOR_MAX_OWNED, ownedCount } from '../../store/yard';
import { badgeById } from '../../store/badges';
import { normalizeAvatar, type Profile } from '../../store/save';
import { STICKERS, giftEmoji, giftName } from '../../store/gifts';
import { ANIMALS, COLORS } from './ProfilesScreen';
import { AnimalIcon } from '../AnimalIcon';
import { sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { boughtLine } from '../lines';
import { teleport } from '../../world/input';
import { doorOf, zoneById } from '../../world/layout';

/** 分頁：六種道具格子、家具，加上貼紙簿與換造型 */
type Tab = Slot | 'stickers' | 'look';
const TABS: { id: Tab; name: string }[] = [
  { id: 'hat', name: '🎩 帽子' },
  { id: 'face', name: '👓 眼鏡' },
  { id: 'back', name: '🎒 背後' },
  { id: 'hand', name: '🎈 手持' },
  { id: 'pet', name: '🐥 寵物' },
  { id: 'trail', name: '✨ 特效' },
  { id: 'decor', name: '🏡 家具' },
  { id: 'stickers', name: '📒 貼紙簿' },
  { id: 'look', name: '🐻 換造型' },
];

/** 已擁有的道具按鈕文字：[還沒用時, 正在用時] */
const USE_LABEL: Record<AvatarSlot, [string, string]> = {
  hat: ['戴上', '脫下'],
  face: ['戴上', '脫下'],
  back: ['背上', '拿下'],
  hand: ['拿著', '放下'],
  pet: ['帶著走', '休息'],
  trail: ['打開', '關掉'],
};

export function ShopScreen() {
  const profile = useGame((s) => s.profile());
  const purchase = useGame((s) => s.purchase);
  const updateAvatar = useGame((s) => s.updateAvatar);
  const goto = useUi((s) => s.goto);
  const [tab, setTab] = useState<Tab>('hat');
  if (!profile) return null;
  const avatar = normalizeAvatar(profile.avatar);
  const leave = () => {
    teleport(doorOf(zoneById('shop')));
    goto('island');
  };

  /** 戴上或脫下某一格的道具 */
  const toggleWear = (item: CatalogItem, slot: AvatarSlot) => {
    sfx.tap();
    const wearing = avatar[slot] === item.id;
    updateAvatar({ ...avatar, [slot]: wearing ? null : item.id });
  };

  /** 買道具：成功就唸出來；穿戴的道具自動戴上（家具買了放進家具包） */
  const buy = (item: CatalogItem) => {
    if (item.price === undefined || !purchase(item.id, item.price)) return;
    sfx.coin();
    speak(boughtLine(item.name));
    if (item.slot === 'decor') return;
    const now = normalizeAvatar(useGame.getState().profile()!.avatar);
    updateAvatar({ ...now, [item.slot]: item.id });
  };

  /** 一樣家具的卡片：價格、已經有幾個（擺了幾個），每按一次買一個 */
  const decorCard = (item: CatalogItem) => {
    const count = ownedCount(profile, item.id);
    const placed = (profile.yard ?? []).filter((it) => it.id === item.id).length;
    const full = count >= DECOR_MAX_OWNED;
    return (
      <div key={item.id} className="activity-card shop-card" style={{ cursor: 'default' }} data-testid={`decor-${item.id}`}>
        <span className="icon">{item.emoji}</span>
        <span className="name">{item.name}</span>
        <small className="plain" data-testid={`decor-count-${item.id}`}>
          {count ? `已有 ${count} 個${placed ? `（擺了 ${placed} 個）` : ''}` : '還沒有'}
        </small>
        <button className="btn small" disabled={full || profile.coins < (item.price ?? 0)} onClick={() => buy(item)} data-testid={`buy-${item.id}`}>
          {full ? '滿了' : `🪙 ${item.price}`}
        </button>
      </div>
    );
  };

  /** 一項道具的卡片：擁有就能戴上／脫下；獎章專屬沒拿到就鎖住；其他用金幣買 */
  const card = (item: CatalogItem) => {
    if (item.slot === 'decor') return decorCard(item);
    const slot = item.slot;
    const has = owns(profile, item.id);
    const wearing = avatar[slot] === item.id;
    const badge = item.badge ? badgeById(item.badge) : undefined;
    return (
      <div key={item.id} className={`activity-card shop-card ${!has && badge ? 'locked' : ''}`} style={{ cursor: 'default' }}>
        <span className="icon">{item.emoji}</span>
        <span className="name">{item.name}</span>
        {has ? (
          <button className={`btn small ${wearing ? 'white' : 'green'}`} onClick={() => toggleWear(item, slot)} data-testid={`wear-${item.id}`}>
            {USE_LABEL[slot][wearing ? 1 : 0]}
          </button>
        ) : badge ? (
          <button
            className="btn small white"
            onClick={() => {
              sfx.tap();
              speak(badge.name);
              goto('badges');
            }}
            data-testid={`locked-${item.id}`}
          >
            🔒 {badge.name}
          </button>
        ) : (
          <button className="btn small" disabled={profile.coins < (item.price ?? 0)} onClick={() => buy(item)} data-testid={`buy-${item.id}`}>
            🪙 {item.price}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="panel-screen" style={{ placeItems: 'center end' }}>
      <div className="panel card" style={{ width: 'min(640px, 100%)' }} role="dialog" aria-label="百寶屋">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#e8457c' }}>
            🎁 百寶屋
          </span>
          <h2 style={{ fontSize: 24 }}>🪙 {profile.coins}</h2>
          <button className="btn small white" onClick={leave} data-testid="leave-shop">
            回島上
          </button>
        </div>
        <div className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`btn small white ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)} data-testid={`shop-tab-${t.id}`}>
              {t.name}
            </button>
          ))}
        </div>
        <div className="panel-body">
          {tab === 'look' ? (
            <>
              <span className="label">換動物</span>
              <div className="choice-row">
                {ANIMALS.map((a) => (
                  <button key={a.id} className={`animal-btn ${avatar.animal === a.id ? 'on' : ''}`} onClick={() => updateAvatar({ ...avatar, animal: a.id })} aria-label={a.name}>
                    <AnimalIcon animal={a.id} />
                  </button>
                ))}
              </div>
              <span className="label">換顏色</span>
              <div className="choice-row">
                {COLORS.map((c) => (
                  <button key={c} className={`swatch ${avatar.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => updateAvatar({ ...avatar, color: c })} aria-label={`顏色 ${c}`} />
                ))}
              </div>
            </>
          ) : tab === 'stickers' ? (
            <StickerBook profile={profile} />
          ) : (
            <div className="activity-grid">{itemsOfSlot(tab).map(card)}</div>
          )}
          {tab === 'decor' && <p className="notice">買了家具，回到自己的島按「🏡 佈置」，就能擺在小屋的院子裡。</p>}
          <p className="notice">答題可以賺金幣：一次答對 1 枚，每顆星再加 2 枚。鎖起來的道具要拿到獎章才有，點一下看怎麼拿。</p>
        </div>
      </div>
    </div>
  );
}

/** 貼紙簿：每種貼紙收到幾張、最近是誰送的；下面列最近收到的 10 份禮物。點貼紙唸出名稱 */
function StickerBook({ profile }: { profile: Profile }) {
  const log = profile.giftLog ?? [];
  return (
    <>
      <div className="activity-grid">
        {STICKERS.map((st) => {
          const count = profile.stickers?.[st.id] ?? 0;
          const from = log.find((g) => g.itemId === st.id)?.from;
          return (
            <button
              key={st.id}
              className={`activity-card sticker-card ${count ? '' : 'empty'}`}
              onClick={() => {
                sfx.tap();
                speak(giftName(st.id));
              }}
              data-testid={`sticker-${st.id}`}
            >
              <span className="icon">{st.emoji}</span>
              <span className="name">{st.name}</span>
              <span className="sticker-count" data-testid={`sticker-count-${st.id}`}>
                {count ? `× ${count}` : '還沒有'}
              </span>
              {from && <small className="sticker-from">{from}送的</small>}
            </button>
          );
        })}
      </div>
      <span className="label">最近收到的禮物</span>
      {log.length ? (
        <ul className="gift-log" data-testid="gift-log">
          {log.slice(0, 10).map((g, i) => (
            <li key={`${g.date}-${i}`}>
              {g.date.slice(5).replace('-', '/')} {g.from}送你 {giftEmoji(g.itemId)} {giftName(g.itemId)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="plain">{profile.cloud ? '還沒有收到禮物。同學可以在島上送你貼紙！' : '加入班級後，同學可以送你貼紙。'}</p>
      )}
    </>
  );
}
