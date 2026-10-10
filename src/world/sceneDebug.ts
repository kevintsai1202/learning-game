/**
 * 3D 場景的除錯狀態（e2e 透過 window.__game.scene 讀）：畫面上看不到 DOM 的 3D 物件，用這裡回報有沒有畫出來。
 */
export const sceneDebug = {
  /** 廣場上的 NPC 熊熊老師有沒有畫出來（老師以熊熊老師進島時藏起來，老師 GM 的 G2） */
  npcTeacher: true,
  /** 3D 座標換成畫面座標（e2e 點 3D 物件用，例如佈置院子的格子；島嶼場景掛上） */
  project: null as null | ((x: number, y: number, z: number) => { x: number; y: number }),
};
