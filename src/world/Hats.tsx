/**
 * 百寶屋的帽子：用基本幾何體做成，戴在角色頭頂（頭部座標系，頭半徑約 0.5）。
 */
import { toon } from './materials';

/** 商店物品清單（帽子）；資料在 src/store/catalog.ts，伺服器也用同一份查價 */
export { HATS } from '../store/catalog';

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
    case 'hat.bunny':
      // 兔耳髮箍：一圈髮箍從左耳根跨過頭頂到右耳根，上面立著兩隻粉色內裡的長耳朵
      return (
        <group position={[0, 0.02, -0.03]}>
          <mesh material={toon('#ff9db0')}>
            <torusGeometry args={[0.52, 0.035, 8, 28, Math.PI]} />
          </mesh>
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.17, 0.57, 0]} rotation={[0, 0, -s * 0.18]}>
              <mesh material={toon('#ffffff')}>
                <capsuleGeometry args={[0.09, 0.42, 4, 10]} />
              </mesh>
              <mesh material={toon('#ffb3c6')} position={[0, 0, 0.05]} scale={[0.55, 0.85, 0.4]}>
                <capsuleGeometry args={[0.09, 0.42, 4, 10]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case 'hat.dino':
      // 恐龍帽：綠色帽殼蓋住頭頂（往後靠，額頭和眼睛露出來），背上三根尖刺、頭頂兩顆大眼睛
      return (
        <group position={[0, 0.02, 0]}>
          <mesh material={toon('#5fbf6a')} position={[0, 0, -0.08]}>
            <sphereGeometry args={[0.56, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          {[0.1, -0.1, -0.3].map((z, i) => (
            <mesh key={i} material={toon('#f2a33a')} position={[0, 0.56 - i * 0.05, z]} rotation={[-0.25 - i * 0.2, 0, 0]}>
              <coneGeometry args={[0.07, 0.17, 6]} />
            </mesh>
          ))}
          {[-1, 1].map((s) => (
            <group key={s} position={[s * 0.19, 0.5, 0.22]}>
              <mesh material={toon('#ffffff')}>
                <sphereGeometry args={[0.09, 12, 10]} />
              </mesh>
              <mesh material={toon('#2b2a4c')} position={[0, 0.005, 0.07]}>
                <sphereGeometry args={[0.045, 8, 6]} />
              </mesh>
            </group>
          ))}
        </group>
      );
    case 'hat.pirate':
      // 海盜帽：黑色寬帽沿加低帽身、金色帽帶，正面有白色骷髏與交叉骨頭
      return (
        <group position={[0, 0.36, 0]} rotation={[0.06, 0, 0.1]}>
          <mesh material={toon('#1f1f2e')} scale={[1.28, 0.2, 1]}>
            <sphereGeometry args={[0.5, 22, 12]} />
          </mesh>
          <mesh material={toon('#1f1f2e')} position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.3, 0.4, 0.26, 20]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.41, 0.41, 0.05, 20]} />
          </mesh>
          <mesh material={toon('#ffffff')} position={[0, 0.2, 0.37]} scale={[1, 1, 0.35]}>
            <sphereGeometry args={[0.07, 10, 8]} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} material={toon('#ffffff')} position={[0, 0.1, 0.4]} rotation={[0, 0, s * 0.6]}>
              <boxGeometry args={[0.22, 0.035, 0.025]} />
            </mesh>
          ))}
        </group>
      );
    case 'hat.explorer':
      // 探險家帽：卡其色圓頂寬帽沿，咖啡色帽帶，側邊插一根紅羽毛
      return (
        <group position={[0, 0.37, 0]}>
          <mesh material={toon('#d9b86c')}>
            <sphereGeometry args={[0.49, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={toon('#d9b86c')} position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.72, 0.72, 0.04, 26]} />
          </mesh>
          <mesh material={toon('#7a4a24')} position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.495, 0.5, 0.1, 22]} />
          </mesh>
          <mesh material={toon('#e63946')} position={[0.36, 0.2, 0.1]} rotation={[0.3, 0, -0.9]} scale={[0.35, 1.5, 0.2]}>
            <sphereGeometry args={[0.1, 8, 6]} />
          </mesh>
        </group>
      );
    case 'hat.hero-helmet':
      // 勇者頭盔：銀色圓頂（額頭以上）加金色邊條，頭頂一道紅色羽冠
      return (
        <group position={[0, 0.14, 0]}>
          <mesh material={toon('#b9c3d4')} position={[0, 0, -0.1]}>
            <sphereGeometry args={[0.56, 22, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0, 0.0, -0.1]}>
            <cylinderGeometry args={[0.565, 0.565, 0.06, 24, 1, true]} />
          </mesh>
          <mesh material={toon('#e63946')} position={[0, 0.58, -0.1]} scale={[0.22, 0.7, 2.1]}>
            <sphereGeometry args={[0.2, 12, 10]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0, 0.3, 0.42]} scale={[1, 1.4, 0.4]}>
            <sphereGeometry args={[0.04, 8, 6]} />
          </mesh>
        </group>
      );
    case 'hat.scholar':
      // 學士帽：黑色方形帽板斜放在圓帽身上，中央金色扣子，金色流蘇垂向一側
      return (
        <group position={[0, 0.38, 0]} rotation={[0, 0, 0.05]}>
          <mesh material={toon('#1f1f2e')}>
            <cylinderGeometry args={[0.32, 0.36, 0.22, 20]} />
          </mesh>
          <mesh material={toon('#2b2b3e')} position={[0, 0.14, 0]} rotation={[0, Math.PI / 4, 0]}>
            <boxGeometry args={[0.8, 0.05, 0.8]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0, 0.18, 0]}>
            <sphereGeometry args={[0.045, 8, 6]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0.2, 0.16, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.012, 0.4, 6]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0.4, 0.04, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.25, 6]} />
          </mesh>
          <mesh material={toon('#ffc93c')} position={[0.4, -0.12, 0]}>
            <coneGeometry args={[0.04, 0.1, 8]} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}
