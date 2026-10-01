/**
 * 氣球射擊場（射擊模式的 3D 舞台）：答案寫在飄動的氣球上，點氣球就從魔法砲射出星星。
 * - 點擊範圍是氣球的約 1.6 倍，七、八歲的孩子比較點得到
 * - 點了之後所有氣球暫停一下、星星在飛的時候不能再點；星星飛到氣球時才作答，爆破與「答對了」同時出現
 * - 用下方小籤作答時，正確的氣球也會爆開
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { KID_FONT, textTexture, toon } from './materials';
import { useStageQuiz } from '../quiz/stageBus';
import { quizDebug } from '../quiz/debug';
import { useUi } from '../store/useUi';
import { hashString } from '../core/rng';
import { isBopomofoOnly } from '../ui/KidText';
import { sfx } from '../audio/sfx';
import { needsPlainText } from '../quiz/annotation';

const BALLOON_COLORS = ['#ff6b4a', '#2f6fde', '#3fbf7f', '#c77dff'];
/** 氣球上升範圍（世界座標 y） */
const Y_MIN = 1.15;
const Y_MAX = 3.2;
/** 魔法砲的位置 */
const LAUNCHER = new THREE.Vector3(1.0, 0.45, 3.8);
/** 星星飛行時間（秒） */
const FLIGHT = 0.35;
/** 點擊後氣球暫停多久（秒） */
const FREEZE = 1.2;

/** 平面字串的一般字型（單獨注音用，避免注音字型撐寬） */
const PLAIN_FONT = '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';

interface Shot {
  target: number;
  start: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
}

export function ShooterStage() {
  const question = useStageQuiz((s) => s.question);
  const pick = useStageQuiz((s) => s.pick);
  const mode = useStageQuiz((s) => s.mode);
  const mood = useUi((s) => s.mood);
  const moodTick = useUi((s) => s.moodTick);
  const { size } = useThree();
  const groups = useRef<(THREE.Group | null)[]>([]);
  const star = useRef<THREE.Mesh>(null);
  const barrel = useRef<THREE.Group>(null);
  /** 每題的動畫狀態 */
  const st = useRef({ freezeUntil: -1, shot: null as Shot | null, popped: -1, popAt: 0, wobble: -1, wobbleAt: 0, t: 0 });
  const [, force] = useState(0);

  const options = question?.type === 'choice' ? question.options : [];
  const n = options.length;
  // 直式畫面比較窄，路線靠攏
  const portrait = size.height > size.width * 1.1;
  const halfW = portrait ? 1.3 : 2.3;
  const lanes = useMemo(() => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -halfW + (2 * halfW * i) / (n - 1))), [n, halfW]);
  /** 每顆氣球的起始相位（依題目 id 固定，看起來錯落有致） */
  const phases = useMemo(() => Array.from({ length: n }, (_, i) => ((hashString(`${question?.id}:${i}`) % 1000) / 1000) * (Y_MAX - Y_MIN)), [question?.id, n]);

  // 換題時重置
  useEffect(() => {
    st.current = { ...st.current, freezeUntil: -1, shot: null, popped: -1, wobble: -1 };
    force((x) => x + 1);
  }, [question?.id]);

  // 用下方小籤答對時，正確的氣球也爆開
  useEffect(() => {
    if (mood === 'happy' && question?.type === 'choice' && st.current.popped < 0 && !st.current.shot) {
      st.current.popped = question.answer;
      st.current.popAt = st.current.t;
    }
  }, [mood, moodTick, question]);

  useFrame((state, dt) => {
    const s = st.current;
    s.t = state.clock.elapsedTime;
    const frozen = s.t < s.freezeUntil;
    const targets: { x: number; y: number; z: number }[] = [];
    groups.current.forEach((g, i) => {
      if (!g) return;
      if (!frozen) g.userData.rise = ((g.userData.rise ?? phases[i]) + dt * 0.32) % (Y_MAX - Y_MIN);
      const y = Y_MIN + (g.userData.rise ?? phases[i]);
      const sway = Math.sin(s.t * 1.3 + i * 1.7) * 0.12;
      g.position.set(lanes[i] + sway, y, 0.6);
      // 爆破：迅速縮小；答錯：左右搖晃
      const popK = s.popped === i ? Math.min(1, (s.t - s.popAt) / 0.25) : 0;
      g.scale.setScalar(1 - popK);
      g.rotation.z = s.wobble === i && s.t - s.wobbleAt < 0.6 ? Math.sin((s.t - s.wobbleAt) * 30) * 0.18 : Math.sin(s.t * 1.1 + i) * 0.05;
      targets.push({ x: g.position.x, y: g.position.y, z: g.position.z });
    });
    quizDebug.targets = targets;

    // 星星飛行
    const shot = s.shot;
    if (star.current) {
      star.current.visible = !!shot;
      if (shot) {
        const k = Math.min(1, (s.t - shot.start) / FLIGHT);
        star.current.position.lerpVectors(shot.from, shot.to, k);
        star.current.position.y += Math.sin(k * Math.PI) * 0.4;
        star.current.rotation.z += dt * 18;
        if (k >= 1) {
          s.shot = null;
          if (question?.type === 'choice') {
            if (shot.target === question.answer) {
              s.popped = shot.target;
              s.popAt = s.t;
            } else {
              s.wobble = shot.target;
              s.wobbleAt = s.t;
            }
          }
          pick?.(shot.target);
        }
      }
    }
    // 砲管對準最近一次射擊的方向
    if (barrel.current && shot) {
      const dir = new THREE.Vector3().subVectors(shot.to, LAUNCHER);
      barrel.current.rotation.z = -Math.atan2(dir.x, dir.y);
    }
  });

  if (mode !== 'shooter' || question?.type !== 'choice') return null;

  /** 點氣球：射出星星（飛行中或暫停時不能再點） */
  const shoot = (i: number) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const s = st.current;
    if (s.shot || s.popped >= 0) return;
    const g = groups.current[i];
    if (!g) return;
    sfx.tap();
    s.freezeUntil = s.t + FREEZE;
    s.shot = { target: i, start: s.t, from: LAUNCHER.clone(), to: g.position.clone() };
  };

  return (
    <group>
      {options.map((o, i) => {
        const color = BALLOON_COLORS[i % BALLOON_COLORS.length];
        const label = [o.emoji, o.text].filter(Boolean).join(' ');
        const tex = textTexture(label, {
          width: 384,
          height: 176,
          bg: '#ffffff',
          fg: '#2b2a4c',
          size: label.length > 6 ? 52 : 76,
          border: color,
          // 圓角外面透明（材質開 transparent），不會和氣球的明暗不搭
          corner: 'rgba(0,0,0,0)',
          // 考注音的題目、單獨的注音都用一般字型（注音字型會自動加注音，等於給答案）
          font: (o.text && isBopomofoOnly(o.text)) || needsPlainText(question) ? PLAIN_FONT : KID_FONT,
        });
        return (
          <group key={`${question.id}:${i}`} ref={(g) => {
              groups.current[i] = g;
            }} onPointerDown={shoot(i)}>
            {/* 看不見但比較大的點擊範圍 */}
            <mesh>
              <sphereGeometry args={[0.95, 12, 10]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <mesh material={toon(color)} scale={[1, 1.15, 1]}>
              <sphereGeometry args={[0.58, 24, 18]} />
            </mesh>
            <mesh material={toon(color)} position={[0, -0.72, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[0.1, 0.16, 8]} />
            </mesh>
            <mesh position={[0, -1.15, 0]}>
              <cylinderGeometry args={[0.012, 0.012, 0.75, 4]} />
              <meshBasicMaterial color="#5b5a7c" />
            </mesh>
            <mesh position={[0, 0.02, 0.62]}>
              <planeGeometry args={[1.05, 0.48]} />
              <meshBasicMaterial map={tex} toneMapped={false} transparent />
            </mesh>
          </group>
        );
      })}
      {/* 魔法砲：底座＋會轉向的砲管 */}
      <group position={LAUNCHER.toArray()} scale={0.75}>
        <mesh material={toon('#ffc93c')} position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.32, 0.4, 0.3, 16]} />
        </mesh>
        <group ref={barrel}>
          <mesh material={toon('#8b5cf6')} position={[0, 0.25, 0]}>
            <cylinderGeometry args={[0.12, 0.17, 0.6, 12]} />
          </mesh>
          <mesh material={toon('#ffffff')} position={[0, 0.56, 0]}>
            <torusGeometry args={[0.13, 0.04, 6, 16]} />
          </mesh>
        </group>
      </group>
      <mesh ref={star} visible={false} material={toon('#ffd23f')}>
        <octahedronGeometry args={[0.2]} />
      </mesh>
    </group>
  );
}
