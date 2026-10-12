/**
 * 牆上的時間與對時（docs/plans/grand-rides.md 第 4 節）：
 * 伺服器在 welcome 帶 now（毫秒），連線記下和本機時鐘的差，之後「牆上的時間」都用校正過的，
 * 班級島的遊樂器材與大型設施（雲霄飛車、摩天輪、飛船的班次）在各台裝置上才會一致。
 * 純模組：不 import 連線、畫面、3D（規則與伺服器共用的模組也能用）。
 */

/** 伺服器時鐘減本機時鐘（毫秒；沒對過時是 0） */
let offsetMs = 0;
/** e2e 撥快的秒數（window.__game.grand.warp；正式不會用到） */
let warpSec = 0;

/** 連線收到 welcome 時記下伺服器的時間（舊伺服器沒有 now 就不改） */
export function setServerNow(serverMs: number | undefined, localMs = Date.now()): void {
  if (typeof serverMs !== 'number' || !Number.isFinite(serverMs)) return;
  offsetMs = serverMs - localMs;
}

/** 現在的對時差（毫秒） */
export function wallOffsetMs(): number {
  return offsetMs;
}

/** 牆上的時間（秒；校正過，一直在動的器材與班次用） */
export function wallSec(): number {
  return (Date.now() + offsetMs) / 1000 + warpSec;
}

/** e2e 用：把牆上的時間往前撥 sec 秒（累加；reset 歸零） */
export function warpWall(sec: number): void {
  warpSec += sec;
}

/** 測試用：清掉對時與撥快 */
export function resetClockSync(): void {
  offsetMs = 0;
  warpSec = 0;
}
