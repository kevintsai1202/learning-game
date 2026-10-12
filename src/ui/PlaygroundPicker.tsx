/**
 * 老師選班級島遊樂場的器材（docs/plans/playground.md）：4 個位置各一排，八種器材加「空地」，點了就存。
 * 班級管理頁與熊熊老師進島的面板共用；畫面先換成剛選的，存檔的回應回來後跟著伺服器的值
 * （連續點兩個位置時，不會被第一次存檔的舊回應蓋掉：src/ui/latestSaver.ts）。
 */
import { useEffect, useRef, useState } from 'react';
import { RIDES } from '../store/playground';
import { RIDE_KINDS, emptyPlayground, type Playground } from '../store/rideKinds';
import { createLatestSaver } from './latestSaver';
import { sfx } from '../audio/sfx';

/** 4 個位置的名字（src/store/playground.ts 的 PLAYGROUND_SPOTS 同一個順序） */
export const SLOT_NAMES = ['廣場西邊', '廣場東邊', '西南海灘', '東南海灘'];

export function PlaygroundPicker({ value, onSave }: { value: Playground | undefined; onSave: (pg: Playground) => Promise<void> }) {
  /** 畫面上的遊樂場：改了馬上顯示並送出，全部送完才跟著伺服器的值（舊版伺服器沒有這個欄位：全空） */
  const [local, setLocal] = useState<Playground>(value ?? emptyPlayground());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!busy) setLocal(value ?? emptyPlayground());
  }, [value, busy]);
  /** 最新的 onSave（每次畫面更新都是新的函式，佇列只建一次） */
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const [saver] = useState(() => createLatestSaver<Playground>((pg) => onSaveRef.current(pg), () => setBusy(false)));
  /** 第 slot 個位置換成 kind（null 是空地） */
  const choose = (slot: number, kind: Playground[number]) => {
    if (local[slot] === kind) return;
    sfx.tap();
    const next = local.map((k, i) => (i === slot ? kind : k));
    setLocal(next);
    setBusy(true);
    saver.save(next);
  };
  return (
    <div className="playground-picker" data-testid="playground-picker">
      <h3 style={{ margin: '6px 0' }}>🎡 遊樂場</h3>
      <p className="hint" style={{ margin: '0 0 6px' }}>
        班級島上有 4 個位置，每個位置選一種大型遊樂器材（大家可以一起玩）；在島上的孩子馬上看到。
      </p>
      {local.map((cur, slot) => (
        <div key={slot} className="playground-slot" role="group" aria-label={SLOT_NAMES[slot]}>
          <b className="playground-slot-name">{SLOT_NAMES[slot]}</b>
          <div className="playground-chips">
            {RIDE_KINDS.map((k) => (
              <button
                key={k}
                className={`btn small ${cur === k ? 'green' : 'white'}`}
                aria-pressed={cur === k}
                onClick={() => choose(slot, k)}
                data-testid={`pg-${slot}-${k}`}
              >
                {RIDES[k].emoji} {RIDES[k].name}
              </button>
            ))}
            <button className={`btn small ${cur === null ? 'green' : 'white'}`} aria-pressed={cur === null} onClick={() => choose(slot, null)} data-testid={`pg-${slot}-empty`}>
              空地
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
