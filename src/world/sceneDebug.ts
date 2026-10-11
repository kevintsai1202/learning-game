/**
 * 3D 場景的除錯狀態（e2e 透過 window.__game.scene 讀）：畫面上看不到 DOM 的 3D 物件，用這裡回報有沒有畫出來。
 */
export const sceneDebug = {
  /** 廣場上的 NPC 熊熊老師有沒有畫出來（老師以熊熊老師進島時藏起來，老師 GM 的 G2） */
  npcTeacher: true,
  /** 3D 座標換成畫面座標（e2e 點 3D 物件用，例如佈置院子的格子；島嶼場景掛上） */
  project: null as null | ((x: number, y: number, z: number) => { x: number; y: number }),
  /** 擋住角色而變半透明的建築（ZoneId 或 house；自己的家改版，第 9 節優化起是半透明，不是隱形） */
  hiddenZones: [] as string[],
  /** 屋裡擋住角色而半透明的高家具（格子 "gx,gz"；第 9 節優化） */
  fadedCells: [] as string[],
  /** 某一棟建築現在的樣子：有沒有畫、最淡的不透明度（e2e 用；島嶼場景掛上） */
  buildingLook: null as null | ((id: string) => { visible: boolean; opacity: number } | null),
  /** 自己的角色現在的姿勢、抬高、縮放、傾斜（第 10.3 節：按「起來」後要站著、原比例；角色掛上） */
  playerLift: null as null | (() => { pose: string; y: number; scale: number; tiltX: number; pivotY: number }),
};
