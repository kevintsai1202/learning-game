/**
 * 英文字母（大寫 26＋小寫 26）的筆順中心線，配合四線格（glyphs.ts 的 LATIN_LINES）。
 * 座標系見 glyphs.ts 的 CHAR_BOX（x 0～1024、y −124～900，y 向上）。
 * 匯入這個模組就會把字形表註冊到 glyphs。
 *
 * 筆順與走向採 Zaner-Bloser Manuscript（docs/research/zhuyin-english.md §2.4、§2.5）：
 * 大寫 49 筆、小寫 33 筆。台灣教科書的字形各家略有不同（t 的鉤、q 的尾巴、I J 的襯線等），
 * 要以孩子實際使用的課本為準，見該文件 §2.6、§2.7。
 *
 * 寫法：每個字母用 line()、arc() 兩個小工具串出中心線，圓弧每 15° 一點。
 * 中心線比四線格內縮約 20 單位（外框粗 70，筆畫外緣剛好略過線 15 單位，像印刷體的自然超出）。
 */
import { registerGlyphs, type Centerline, type GlyphTable } from './glyphs';

/** 大寫與上伸部的頂（第 1 線 760 內縮） */
const T = 740;
/** 大寫的底、小寫 x 高度的底（基準線 240 內縮） */
const B = 260;
/** 大寫的中線（第 2 線，E F H 等橫畫的位置） */
const M = 500;
/** 小寫 x 高度的頂（第 2 線 500 內縮） */
const XT = 480;
/** 小寫 x 高度的中線（圓形小寫的圓心高度） */
const XM = 370;

/** 一串直線段：依序連接各點 */
function line(...pts: [number, number][]): Centerline {
  return pts.map(([x, y]) => [x, y] as [number, number]);
}

/**
 * 橢圓弧：圓心 (cx, cy)、半徑 rx、ry，從 a0 度走到 a1 度，每 step 度一點。
 * y 向上，所以角度遞增＝逆時針（Z-B 的 circle back），遞減＝順時針（circle forward）；0° 是 3 點鐘、90° 是 12 點鐘。
 */
function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, step = 15): Centerline {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / step));
  const out: Centerline = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return out;
}

/** 把多段接成一筆（相鄰重複的點只留一個；以四捨五入後的座標比較） */
function join(...parts: Centerline[]): Centerline {
  const out: Centerline = [];
  for (const part of parts) {
    for (const p of part) {
      const last = out[out.length - 1];
      if (last && Math.round(last[0]) === Math.round(p[0]) && Math.round(last[1]) === Math.round(p[1])) continue;
      out.push(p);
    }
  }
  return out;
}

/** 「推回」折返處的小髮夾半徑（上行與下行相距 2×HR，外框粗 70 看不出來） */
const HR = 5;

/**
 * 豎線頂端的折返（先往上、再往下）：從 (x, y−HR) 經過頂點 y 到 (x+2HR, y−HR)。
 * 小髮夾讓折返點的法向量連續，外框不會在折返處縮成尖角。
 */
function hairTop(x: number, y: number): Centerline {
  return arc(x + HR, y - HR, HR, HR, 180, 0, 45);
}

/** 豎線底端的折返（先往下、再往上）：從 (x, y+HR) 經過底點 y 到 (x+2HR, y+HR) */
function hairBottom(x: number, y: number): Centerline {
  return arc(x + HR, y + HR, HR, HR, 180, 360, 45);
}

/**
 * 磨掉直線轉角的尖點：兩側線段都夠長、轉角超過約 35° 時，把轉角點換成兩個內縮 22 單位的點。
 * 外框產生器在尖角處會出現蝴蝶結狀的瑕疵，磨成斜角就乾淨了；圓弧上的點距很短，不受影響。
 */
function soften(stroke: Centerline): Centerline {
  const out: Centerline = [stroke[0]];
  for (let i = 1; i < stroke.length - 1; i++) {
    const [px, py] = stroke[i - 1];
    const [x, y] = stroke[i];
    const [nx, ny] = stroke[i + 1];
    const l1 = Math.hypot(x - px, y - py);
    const l2 = Math.hypot(nx - x, ny - y);
    const cos = ((x - px) * (nx - x) + (y - py) * (ny - y)) / (l1 * l2);
    if (l1 > 60 && l2 > 60 && cos < 0.82) {
      out.push([x - ((x - px) / l1) * 22, y - ((y - py) / l1) * 22], [x + ((nx - x) / l2) * 22, y + ((ny - y) / l2) * 22]);
    } else out.push(stroke[i]);
  }
  out.push(stroke[stroke.length - 1]);
  return out;
}

/** 把整個字母磨掉尖角、水平移到 bbox 中心 x=512，座標取整數 */
function glyph(...raw: Centerline[]): Centerline[] {
  const strokes = raw.map(soften);
  const xs = strokes.flat().map((p) => p[0]);
  const dx = 512 - (Math.min(...xs) + Math.max(...xs)) / 2;
  return strokes.map((s) => s.map(([x, y]) => [Math.round(x + dx), Math.round(y)] as [number, number]));
}

/** 字元 → 各筆中心線（依筆順排列） */
export const LATIN_STROKES: GlyphTable = {
  // ===== 大寫（49 筆） =====
  // A：頂點往左下斜、頂點往右下斜、橫線由左到右
  A: glyph(line([512, T], [312, B]), line([512, T], [712, B]), line([366, 390], [658, 390])),
  // B：豎線；再由頂端右橫、上半圓、回豎線，接著下半圓（略大）回豎線
  B: glyph(
    line([0, T], [0, B]),
    join(line([0, T], [100, T]), arc(100, 624, 115, 116, 90, -90), line([0, 512]), arc(0, 503, 9, 9, 90, 270, 45), line([120, 494]), arc(120, 377, 135, 117, 90, -90), line([0, B])),
  ),
  // C：右上起，逆時針開口圓
  C: glyph(arc(512, M, 190, 240, 40, 320)),
  // D：豎線；再由頂端右橫、大弧、回豎線底端
  D: glyph(line([0, T], [0, B]), join(line([0, T], [110, T]), arc(110, M, 200, 240, 90, -90), line([0, B]))),
  // E：豎線、上橫、中橫（較短）、下橫
  E: glyph(line([0, T], [0, B]), line([0, T], [270, T]), line([0, M], [235, M]), line([0, B], [270, B])),
  // F：豎線、上橫、中橫（較短）
  F: glyph(line([0, T], [0, B]), line([0, T], [270, T]), line([0, M], [235, M])),
  // G：同 C 逆時針繞到右側往上到中線，再往左橫
  G: glyph(join(arc(512, M, 190, 240, 40, 360), line([540, M]))),
  // H：左豎、右豎、中橫
  H: glyph(line([0, T], [0, B]), line([330, T], [330, B]), line([0, M], [330, M])),
  // I：豎線、上襯線、下襯線
  I: glyph(line([512, T], [512, B]), line([422, T], [602, T]), line([422, B], [602, B])),
  // J：豎線往下再向左彎成鉤；上橫
  J: glyph(join(line([0, T], [0, 370]), arc(-105, 370, 105, 110, 0, -175)), line([-110, T], [110, T])),
  // K：豎線；從右上往左下斜碰到豎線，不提筆再往右下斜
  K: glyph(line([0, T], [0, B]), line([300, T], [8, 490], [310, B])),
  // L：豎線往下，不提筆沿底線往右
  L: glyph(line([0, T], [0, B], [270, B])),
  // M：左豎；再由頂端斜下到底、斜上到頂、垂直往下
  M: glyph(line([0, T], [0, B]), line([0, T], [200, B], [400, T], [400, B])),
  // N：左豎；再由頂端斜下到右底，垂直往上推
  N: glyph(line([0, T], [0, B]), line([0, T], [330, B], [330, T])),
  // O：右上起，逆時針繞一圈，終點略超過起點但不重疊
  O: glyph(arc(512, M, 190, 240, 60, 380)),
  // P：豎線；再由頂端右橫、半圓、回豎線（半圓下緣在中線）
  P: glyph(line([0, T], [0, B]), join(line([0, T], [110, T]), arc(110, 620, 130, 120, 90, -90), line([0, M]))),
  // Q：同 O；再加一斜線穿過圓弧右下
  Q: glyph(arc(512, M, 190, 240, 60, 380), line([570, 370], [700, 250])),
  // R：豎線；再由頂端右橫、半圓、回豎線，接著往右下斜
  R: glyph(line([0, T], [0, B]), join(line([0, T], [110, T]), arc(110, 620, 130, 120, 90, -90), line([55, M], [300, B]))),
  // S：上半逆時針、下半順時針兩段弧在中線接合
  S: glyph(join(arc(512, 620, 150, 120, 35, 270), arc(512, 380, 165, 120, 90, -150))),
  // T：豎線；頂端橫線
  T: glyph(line([512, T], [512, B]), line([352, T], [672, T])),
  // U：左豎往下、圓底、右側往上
  U: glyph(join(line([0, T], [0, 400]), arc(165, 400, 165, 140, 180, 360), line([330, T]))),
  // V：往右下斜、往右上斜
  V: glyph(line([0, T], [190, B], [380, T])),
  // W：下上下上
  W: glyph(line([0, T], [130, B], [260, T], [390, B], [520, T])),
  // X：左上到右下、右上到左下
  X: glyph(line([0, T], [340, B]), line([340, T], [0, B])),
  // Y：左臂斜到交會點；右臂斜到交會點再垂直往下
  Y: glyph(line([0, T], [185, M]), line([370, T], [185, M], [185, B])),
  // Z：上橫、斜線、下橫
  Z: glyph(line([0, T], [320, T], [0, B], [320, B])),

  // ===== 小寫（33 筆）；「推回」的折返處用小髮夾（兩線相距 10 單位）銜接，避免外框在折返點縮成尖角 =====
  // a：逆時針繞一圈，沿右側往上推到 x 高度，再垂直往下
  a: glyph(join(arc(0, XM, 125, 110, 50, 360), line([125, XM], [125, XT - HR]), hairTop(125, XT), line([135, B]))),
  // b：豎線往下，推回到圓高度，再順時針畫圓
  b: glyph(join(line([0, T], [0, B + HR]), hairBottom(0, B), line([10, 420]), arc(135, XM, 125, 110, 150, -155))),
  // c：右上起逆時針開口圓
  c: glyph(arc(512, XM, 125, 110, 40, 320)),
  // d：逆時針繞一圈，沿右側一路推到頂，再垂直往下
  d: glyph(join(arc(0, XM, 125, 110, 50, 360), line([125, XM], [125, T - HR]), hairTop(125, T), line([135, B]))),
  // e：中間橫線往右，接著逆時針繞圈，收在右下
  e: glyph(join(line([387, XM], [512, XM], [600, XM]), arc(512, XM, 125, 110, 15, 320))),
  // f：上端向左彎、垂直往下；再在 x 高度橫穿
  f: glyph(join(arc(85, 655, 85, 85, 20, 180), line([0, 655], [0, B])), line([-90, XT], [90, XT])),
  // g：同 a，豎線往下穿過基準線，末端向左彎成鉤
  g: glyph(join(arc(0, XM, 125, 110, 50, 360), line([125, XM], [125, XT - HR]), hairTop(125, XT), line([135, 110]), arc(30, 110, 105, 110, 0, -170))),
  // h：豎線往下，推回，向右彎成拱，再往下
  h: glyph(join(line([0, T], [0, B + HR]), hairBottom(0, B), line([10, XM]), arc(115, XM, 105, 110, 180, 0), line([220, B]))),
  // i：豎線；點（短豎，在上格正中）
  i: glyph(line([512, XT], [512, B]), line([512, 655], [512, 605])),
  // j：豎線穿過基準線向左彎鉤；點
  j: glyph(join(line([0, XT], [0, 110]), arc(-105, 110, 105, 110, 0, -170)), line([0, 655], [0, 605])),
  // k：豎線；右上斜向左下碰到豎線，不提筆再往右下斜
  k: glyph(line([0, T], [0, B]), line([210, XT], [8, 360], [215, B])),
  // l：一條豎線
  l: glyph(line([512, T], [512, B])),
  // m：豎線往下，推回，拱，往下；再推回，拱，往下
  m: glyph(
    join(
      line([0, XT], [0, B + HR]),
      hairBottom(0, B),
      line([10, XM]),
      arc(105, XM, 95, 110, 180, 0),
      line([200, B + HR]),
      hairBottom(200, B),
      line([210, XM]),
      arc(305, XM, 95, 110, 180, 0),
      line([400, B]),
    ),
  ),
  // n：豎線往下，推回，拱，往下
  n: glyph(join(line([0, XT], [0, B + HR]), hairBottom(0, B), line([10, XM]), arc(115, XM, 105, 110, 180, 0), line([220, B]))),
  // o：右上起逆時針繞一圈，終點略超過起點
  o: glyph(arc(512, XM, 125, 110, 60, 380)),
  // p：豎線往下穿過基準線，推回，再順時針畫圓
  p: glyph(join(line([0, XT], [0, 5]), hairBottom(0, 0), line([10, 420]), arc(135, XM, 125, 110, 150, -155))),
  // q：同 a，豎線往下穿過基準線，末端向右彎
  q: glyph(join(arc(0, XM, 125, 110, 50, 360), line([125, XM], [125, XT - HR]), hairTop(125, XT), line([135, 60]), arc(195, 60, 60, 60, 180, 270))),
  // r：豎線往下，推回，向右彎成肩
  r: glyph(join(line([0, XT], [0, B + HR]), hairBottom(0, B), line([10, XM]), arc(95, XM, 85, 110, 180, 50))),
  // s：小的 S
  s: glyph(join(arc(512, 425, 95, 55, 30, 270), arc(512, 315, 105, 55, 90, -150))),
  // t：豎線；x 高度橫穿
  t: glyph(line([0, T], [0, B]), line([-90, XT], [90, XT])),
  // u：左豎往下、圓底往上推到右側，再垂直往下
  u: glyph(join(line([0, XT], [0, XM]), arc(110, XM, 110, 110, 180, 360), line([220, XM], [220, XT - HR]), hairTop(220, XT), line([230, B]))),
  // v：往右下斜、往右上斜
  v: glyph(line([0, XT], [110, B], [220, XT])),
  // w：下上下上
  w: glyph(line([0, XT], [85, B], [170, XT], [255, B], [340, XT])),
  // x：左上到右下、右上到左下
  x: glyph(line([0, XT], [220, B]), line([220, XT], [0, B])),
  // y：左臂斜到交會處；右臂斜下穿過交會處進入下格
  y: glyph(line([0, XT], [120, B]), line([230, XT], [125, B], [10, 20])),
  // z：上橫、斜線、下橫
  z: glyph(line([0, XT], [220, XT], [0, B], [220, B])),
};

registerGlyphs('latin', LATIN_STROKES);
