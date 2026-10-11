/**
 * 用家具時角色的包裝（自己的家第 9 節優化；自己的角色 Player 與別人的角色 RemotePlayer 共用）：
 * 抬高（坐在椅子上、躺在床上、爬梯子）、縮放（鞦韆、滑梯、床的角色縮小）、繞樞軸傾斜（盪鞦韆繞橫桿、躺下繞腳）。
 * 外層的群組照舊管位置與朝向；圓形影子要放在這個包裝外面（貼地，不跟著飛到半空）。
 */
import { useRef, type ReactNode, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';

/** 這一格的樣子（由控制器每格寫入） */
export interface PoseLift {
  y: number;
  scale: number;
  tiltX: number;
  pivotY: number;
}

/** 站著（沒有用家具） */
export const STANDING: PoseLift = { y: 0, scale: 1, tiltX: 0, pivotY: 0 };

export function PoseWrap({ lift, children }: { lift: RefObject<PoseLift>; children: ReactNode }) {
  const pivot = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  useFrame(() => {
    const f = lift.current ?? STANDING;
    if (!pivot.current || !inner.current) return;
    pivot.current.position.y = f.pivotY;
    pivot.current.rotation.x = f.tiltX;
    inner.current.position.y = f.y - f.pivotY;
    inner.current.scale.setScalar(f.scale);
  });
  return (
    <group ref={pivot}>
      <group ref={inner}>{children}</group>
    </group>
  );
}
