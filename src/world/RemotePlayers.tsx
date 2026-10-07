/**
 * 同房間其他玩家的 3D 角色：每幀往最新收到的位置內插（看起來是走過去的），
 * 頭上用 DOM 顯示暱稱與對話氣泡（drei Html；照專案規則，文字不用 three 渲染）。
 * 在建築裡的玩家不畫在島上。資料來自 usePresence（P2 由伺服器驅動，現在可以用 presenceDemo 模擬）。
 * 連上班級而且老師開放送禮時，點名牌可以送禮物給那位同學（多人上線模擬的假同學不行）。
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { Avatar, type MotionState } from './Avatar';
import { blobShadowTexture } from './materials';
import { lerpAngle, stepToward, type Vec2 } from './movement';
import { usePresence } from '../online/usePresence';
import { onIsland } from '../online/presence';
import { Trail } from './Trail';
import { PetFollower } from './Pets';
import { useRealtime } from '../online/realtimeClient';
import { useGifts } from '../online/useGifts';
import { sfx } from '../audio/sfx';

/** 內插的走路速度（公尺／秒），比自己的角色稍慢，看起來比較從容 */
const WALK_SPEED = 4.2;
/** 和最新位置差超過這個距離就直接跳過去（剛進場、斷線很久） */
const SNAP_DIST = 8;
/**
 * 名牌與氣泡隨距離縮放的係數（drei Html 的 distanceFactor）：
 * 縮放＝係數 ÷（2·tan(視角/2)·距離）；跟拍鏡頭離角色約 25 公尺時接近原尺寸，遠處的名牌自然變小，不會疊成一團。
 */
export const LABEL_DISTANCE_FACTOR = 20;

/** 所有在島上的其他玩家（只訂閱 id 清單，位置變化不會重畫這一層；自己由 Player 畫） */
export function RemotePlayers() {
  const ids = usePresence(useShallow((s) => onIsland(s).map((m) => m.id)));
  const shadowTex = useMemo(() => blobShadowTexture(), []);
  return (
    <>
      {ids.map((id) => (
        <RemotePlayer key={id} id={id} shadowTex={shadowTex} />
      ))}
    </>
  );
}

/** 一位其他玩家 */
function RemotePlayer({ id, shadowTex }: { id: string; shadowTex: THREE.Texture }) {
  // 只在外觀、暱稱改變時重畫（移動時外觀物件沿用同一個，見 presence.ts 的 moveMember）
  const look = usePresence(useShallow((s) => ({ nickname: s.members[id]?.nickname ?? '', avatar: s.members[id]?.avatar, title: s.members[id]?.title ?? null })));
  const bubble = usePresence((s) => s.bubbles[id]?.text ?? null);
  /** 名牌點了可以送禮（真的連上班級、老師開放送禮時） */
  const giftable = useRealtime((s) => s.status === 'online' && s.flags.giftsOpen);
  const group = useRef<THREE.Group>(null);
  const motion = useRef<MotionState>({ speed: 0 });
  /** 畫面上目前的位置與朝向（往最新位置內插） */
  const pos = useRef<Vec2 | null>(null);
  const heading = useRef(0);

  useFrame((_, rawDt) => {
    const m = usePresence.getState().members[id];
    if (!m || !group.current) return;
    const dt = Math.min(rawDt, 0.05);
    const target = { x: m.x, z: m.z };
    if (!pos.current || Math.hypot(target.x - pos.current.x, target.z - pos.current.z) > SNAP_DIST) {
      pos.current = target;
      heading.current = m.heading;
    }
    const r = stepToward(pos.current, target, WALK_SPEED, dt);
    const dx = r.pos.x - pos.current.x;
    const dz = r.pos.z - pos.current.z;
    const moved = Math.hypot(dx, dz);
    motion.current.speed = moved / Math.max(dt, 1e-3);
    // 走路時面向前進方向；停下來後轉向對方送來的朝向
    heading.current = lerpAngle(heading.current, moved > 1e-4 ? Math.atan2(dx, dz) : m.heading, Math.min(1, dt * 10));
    pos.current = r.pos;
    group.current.position.set(r.pos.x, 0, r.pos.z);
    group.current.rotation.y = heading.current;
  });

  if (!look.avatar) return null;
  const getPos = () => group.current?.position;
  const getSpeed = () => motion.current.speed;
  return (
    <>
      {/* 走路特效與寵物在世界座標（不跟著角色的群組旋轉） */}
      {look.avatar.trail && <Trail kind={look.avatar.trail} getPos={getPos} getSpeed={getSpeed} />}
      {look.avatar.pet && <PetFollower pet={look.avatar.pet} getPos={getPos} getHeading={() => heading.current} getSpeed={getSpeed} />}
      <group ref={group}>
        <Avatar config={look.avatar} motion={motion} />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <planeGeometry args={[1.6, 1.6]} />
          <meshBasicMaterial map={shadowTex} transparent depthWrite={false} />
        </mesh>
        {/* 名牌與氣泡：不攔截點擊（才能點地面走路），z-index 低於畫面上的面板；可以送禮時只有名牌點得到 */}
        <Html position={[0, 2.3, 0]} distanceFactor={LABEL_DISTANCE_FACTOR} pointerEvents="none" zIndexRange={[20, 0]} wrapperClass="scene-label">
          <div className="remote-label">
            {bubble && (
              <div className="chat-bubble" data-testid="chat-bubble">
                {bubble}
              </div>
            )}
            <div
              className={`name-tag ${giftable ? 'giftable' : ''}`}
              data-testid="name-tag"
              // 攔下 pointerdown：不然同一下也會點到地面，角色走過去
              onPointerDown={giftable ? (e) => e.stopPropagation() : undefined}
              onClick={
                giftable
                  ? (e) => {
                      e.stopPropagation();
                      sfx.tap();
                      useGifts.getState().openDialog(id);
                    }
                  : undefined
              }
              title={giftable ? `送禮物給${look.nickname}` : undefined}
            >
              {look.title && <small className="name-title">{look.title}</small>}
              {look.nickname}
              {giftable && (
                <span className="gift-hint" aria-hidden>
                  🎁
                </span>
              )}
            </div>
          </div>
        </Html>
      </group>
    </>
  );
}
