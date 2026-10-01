/**
 * 共用材質與貼圖：卡通（toon）三階明暗，讓所有模型看起來像同一組玩具。
 * 材質依顏色快取，避免每個網格各自建立材質拖慢效能。
 */
import * as THREE from 'three';

let gradient: THREE.DataTexture | null = null;

/** 三階明暗的漸層貼圖（暗、中、亮） */
function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    const data = new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
    gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
    gradient.minFilter = THREE.NearestFilter;
    gradient.magFilter = THREE.NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const toonCache = new Map<string, THREE.MeshToonMaterial>();

/** 取得指定顏色的卡通材質（同色共用同一個材質） */
export function toon(color: string): THREE.MeshToonMaterial {
  let m = toonCache.get(color);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });
    toonCache.set(color, m);
  }
  return m;
}

const textCache = new Map<string, THREE.CanvasTexture>();

/** 文字貼圖的選項 */
export interface TextTextureOptions {
  /** 畫布寬高（像素） */
  width?: number;
  height?: number;
  bg?: string;
  fg?: string;
  /** 字級（像素） */
  size?: number;
  font?: string;
  /** 圓角外框顏色，省略則不畫外框 */
  border?: string;
  /** 圓角外面的填色（貼在不透明材質上時要填，否則透明處會變黑）；省略則與 bg 相同 */
  corner?: string;
}

/** 孩子介面用的字型（與 CSS 的 --font-kid 一致） */
export const KID_FONT = '"LG Bopomofo Round", "Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif';

/**
 * 把文字畫成貼圖（招牌、字塊用）。Canvas 會用網頁已載入的字型，
 * 所以注音字型載入後重畫，招牌上也會有注音。
 */
export function textTexture(text: string, opts: TextTextureOptions = {}): THREE.CanvasTexture {
  const { width = 512, height = 192, bg = '#fff6df', fg = '#2b2a4c', size = 96, font = KID_FONT, border, corner = bg } = opts;
  const key = JSON.stringify([text, width, height, bg, fg, size, font, border, corner]);
  const cached = textCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d')!;
  const draw = () => {
    g.fillStyle = corner;
    g.fillRect(0, 0, width, height);
    g.fillStyle = bg;
    const r = Math.min(width, height) * 0.18;
    g.beginPath();
    g.roundRect(4, 4, width - 8, height - 8, r);
    g.fill();
    if (border) {
      g.lineWidth = 10;
      g.strokeStyle = border;
      g.stroke();
    }
    g.fillStyle = fg;
    g.font = `bold ${size}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, width / 2, height / 2 + size * 0.06, width - 24);
  };
  draw();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // 網頁字型載入完成後重畫一次（第一次可能還在用備用字型）
  if (typeof document !== 'undefined' && document.fonts) {
    void document.fonts.ready.then(() => {
      draw();
      tex.needsUpdate = true;
    });
  }
  textCache.set(key, tex);
  return tex;
}

let blob: THREE.CanvasTexture | null = null;

/** 角色腳下的圓形柔邊陰影貼圖（比即時陰影省效能） */
export function blobShadowTexture(): THREE.CanvasTexture {
  if (!blob) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(30,30,60,0.55)');
    grad.addColorStop(1, 'rgba(30,30,60,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    blob = new THREE.CanvasTexture(c);
  }
  return blob;
}
