/**
 * 「只送最新」的儲存佇列：同一時間只送一筆；送的途中又改了，只記住最新的一筆，等前一筆送完再送。
 * 用在老師頁的班級教材版本：連續改兩個下拉時，前一次儲存的回應（重新整理後的伺服器值）曾把畫面重設成舊值，
 * 下一個下拉就從舊值組出來送出、蓋掉前一次的修改。佇列忙的時候畫面不跟伺服器的值，送完（閒置）才跟。
 * 一個個依序送，最後一次重新整理一定對應最後一次儲存，也不怕回應亂序。
 * 純邏輯（不碰 React），有單元測試（tests/ui/latestSaver.test.ts）。
 */

/** 儲存佇列 */
export interface LatestSaver<T> {
  /** 存一筆：閒置時馬上送，忙的時候只留最新的一筆 */
  save(value: T): void;
  /** 有沒有還沒送完的 */
  readonly busy: boolean;
}

/**
 * 建立儲存佇列。
 * @param send 送出一筆（錯誤由它自己處理；丟出錯誤也不會卡住佇列）
 * @param onIdle 全部送完、回到閒置時呼叫
 */
export function createLatestSaver<T>(send: (value: T) => Promise<unknown>, onIdle: () => void = () => undefined): LatestSaver<T> {
  /** 正在送 */
  let running = false;
  /** 等著送的最新一筆（包一層，值本身可以是 null） */
  let queued: { value: T } | null = null;

  /** 依序送出排著的，直到沒有新的 */
  const drain = async () => {
    running = true;
    while (queued) {
      const { value } = queued;
      queued = null;
      try {
        await send(value);
      } catch {
        // 送出失敗由 send 自己顯示；佇列繼續送下一筆
      }
    }
    running = false;
    onIdle();
  };

  return {
    save(value) {
      queued = { value };
      if (!running) void drain();
    },
    get busy() {
      return running;
    },
  };
}
