/**
 * 百寶屋的帽子：用基本幾何體做成，戴在角色頭頂（頭部座標系，頭半徑約 0.5）。
 */
import { toon } from './materials';

/** 商店物品清單（帽子） */
export const HATS = [
  { id: 'hat.party', name: '派對帽', price: 20 },
  { id: 'hat.cap', name: '棒球帽', price: 30 },
  { id: 'hat.flower', name: '花圈', price: 40 },
  { id: 'hat.straw', name: '草帽', price: 50 },
  { id: 'hat.helmet', name: '安全帽', price: 60 },
  { id: 'hat.chef', name: '廚師帽', price: 60 },
  { id: 'hat.crown', name: '皇冠', price: 120 },
  { id: 'hat.wizard', name: '魔法帽', price: 150 },
] as const;

export function Hat({ id }: { id: string }) {
  switch (id) {
    case 'hat.party':
      return (
        <group position={[0, 0.48, 0]} rotation={[0, 0, 0.15]}>
          <mesh material={toon('#ff6b4a')} position={[0, 0.22, 0]}>
            <coneGeometry args={[0.24, 0.5, 16]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.17, 0.215, 0.1, 16]} />
          </mesh>
          <mesh material={toon('#ffffff')} position={[0, 0.5, 0]}>
            <sphereGeometry args={[0.08, 10, 8]} />
          </mesh>
        </group>
      );
    case 'hat.cap':
      return (
        <group position={[0, 0.3, 0]}>
          <mesh material={toon('#2f6fde')}>
            <sphereGeometry args={[0.47, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={toon('#2f6fde')} position={[0, 0.02, 0.42]} scale={[1, 0.15, 0.8]}>
            <cylinderGeometry args={[0.3, 0.3, 0.2, 16, 1, false, -Math.PI / 2, Math.PI]} />
          </mesh>
          <mesh material={toon('#ffffff')} position={[0, 0.47, 0]}>
            <sphereGeometry args={[0.06, 8, 6]} />
          </mesh>
        </group>
      );
    case 'hat.flower':
      return (
        <group position={[0, 0.38, 0]} rotation={[-0.15, 0, 0]}>
          <mesh material={toon('#3fbf7f')} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.36, 0.04, 8, 24]} />
          </mesh>
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            const colors = ['#ff9db0', '#ffc93c', '#ffffff', '#c9a7ff'];
            return (
              <mesh key={i} material={toon(colors[i % 4])} position={[Math.cos(a) * 0.36, 0.03, Math.sin(a) * 0.36]}>
                <sphereGeometry args={[0.08, 8, 6]} />
              </mesh>
            );
          })}
        </group>
      );
    case 'hat.straw':
      return (
        <group position={[0, 0.36, 0]}>
          <mesh material={toon('#f2d27a')}>
            <cylinderGeometry args={[0.75, 0.75, 0.04, 24]} />
          </mesh>
          <mesh material={toon('#f2d27a')} position={[0, 0.16, 0]}>
            <cylinderGeometry args={[0.32, 0.38, 0.3, 20]} />
          </mesh>
          <mesh material={toon('#e8457c')} position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.385, 0.385, 0.08, 20]} />
          </mesh>
        </group>
      );
    case 'hat.helmet':
      return (
        <group position={[0, 0.25, 0]}>
          <mesh material={toon('#ffc93c')}>
            <sphereGeometry args={[0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.6, 0.6, 0.05, 24]} />
          </mesh>
          <mesh material={toon('#ffffff')} position={[0, 0.3, 0.33]} rotation={[0.9, 0, 0]}>
            <boxGeometry args={[0.18, 0.1, 0.04]} />
          </mesh>
        </group>
      );
    case 'hat.chef':
      return (
        <group position={[0, 0.38, 0]}>
          <mesh material={toon('#ffffff')}>
            <cylinderGeometry args={[0.3, 0.3, 0.3, 20]} />
          </mesh>
          {[-0.15, 0, 0.15].map((x, i) => (
            <mesh key={i} material={toon('#ffffff')} position={[x, 0.3, i === 1 ? 0.05 : 0]}>
              <sphereGeometry args={[0.22, 12, 10]} />
            </mesh>
          ))}
        </group>
      );
    case 'hat.crown':
      return (
        <group position={[0, 0.42, 0]}>
          <mesh material={toon('#ffc93c')}>
            <cylinderGeometry args={[0.3, 0.3, 0.2, 20, 1, true]} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return (
              <group key={i} position={[Math.cos(a) * 0.3, 0.15, Math.sin(a) * 0.3]}>
                <mesh material={toon('#ffc93c')}>
                  <coneGeometry args={[0.07, 0.16, 6]} />
                </mesh>
                <mesh material={toon(i % 2 ? '#e8457c' : '#2f6fde')} position={[0, -0.13, 0]}>
                  <sphereGeometry args={[0.04, 8, 6]} />
                </mesh>
              </group>
            );
          })}
        </group>
      );
    case 'hat.wizard':
      return (
        <group position={[0, 0.4, 0]} rotation={[0, 0, -0.12]}>
          <mesh material={toon('#5b3fd1')}>
            <cylinderGeometry args={[0.6, 0.6, 0.04, 24]} />
          </mesh>
          <mesh material={toon('#5b3fd1')} position={[0, 0.42, 0]}>
            <coneGeometry args={[0.32, 0.85, 20]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0.12, 0.42, 0.24]}>
            <octahedronGeometry args={[0.08]} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}
