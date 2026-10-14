/**
 * 展示影片錄影的共用工具（scripts/award/demo.award.ts 用）：
 * - Recorder：用 Chrome DevTools 的畫面串流（Page.startScreencast）把每一格存成 JPEG，記下收到的時間；
 *   比 Playwright 內建錄影清楚，畫面沒變時不出格，剪接時照時間補成固定格率（scripts/award/edit.mjs）。
 * - mark：記下片段裡的時間點（award-out/rec/marks.json），例如等 AI 的起訖，剪接時快轉。
 * - 假游標：影片裡看得到滑鼠移到哪裡、按了什麼（只在錄影時注入，產品沒有）。
 * - clickOn／typeIn／scrollTo：像真人一樣慢慢移動、停頓再操作。
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import type { BrowserContext, CDPSession, Locator, Page } from '@playwright/test';

/** 錄影輸出的資料夾 */
export const REC = 'award-out/rec';

/** 一格畫面：檔名與收到的時間（毫秒） */
interface Frame {
  file: string;
  t: number;
}

/** 一台裝置的畫面串流錄影：每一段存在 award-out/rec/<裝置>/<片段>/，附每一格的時間表 index.json */
export class Recorder {
  private frames: Frame[] = [];
  private n = 0;
  private dir = '';
  private cdp: CDPSession | null = null;

  /** name：裝置名稱（資料夾名稱，例如 kid、teacher） */
  constructor(
    private page: Page,
    public name: string,
  ) {}

  /** 開始錄一段：清掉這一段舊的格子，開始錄遊戲的聲音（installAudioTap）、開畫面串流 */
  async start(segment: string): Promise<void> {
    const dir = `${REC}/${this.name}/${segment}`;
    this.dir = dir;
    this.frames = [];
    this.n = 0;
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    await this.page.evaluate(() => {
      const w = window as any;
      w.__speechLog.length = 0;
      w.__audioTap.start();
    });
    if (!this.cdp) {
      const cdp = await this.page.context().newCDPSession(this.page);
      // 只掛一次：每一格寫進目前這一段的資料夾（this.dir）
      cdp.on('Page.screencastFrame', (f) => {
        const file = `${this.dir}/${String(this.n++).padStart(6, '0')}.jpg`;
        writeFileSync(file, Buffer.from(f.data, 'base64'));
        this.frames.push({ file, t: Date.now() });
        void cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      });
      this.cdp = cdp;
    }
    await this.cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, maxWidth: 1280, maxHeight: 720, everyNthFrame: 1 });
  }

  /**
   * 停止錄這一段：寫出每一格的時間表（index.json）、遊戲的聲音（audio.webm，開始錄的時間在 audio.json）、
   * 裝置語音的紀錄（speech.json：每一句與取消的時間）
   */
  async stop(): Promise<void> {
    await this.cdp?.send('Page.stopScreencast').catch(() => {});
    writeFileSync(`${this.dir}/index.json`, JSON.stringify(this.frames));
    const sound = await this.page.evaluate(async () => {
      const w = window as any;
      return { audio: await w.__audioTap.stop(), speech: w.__speechLog.splice(0) };
    });
    if (sound.audio) {
      writeFileSync(`${this.dir}/audio.webm`, Buffer.from(sound.audio.b64, 'base64'));
      writeFileSync(`${this.dir}/audio.json`, JSON.stringify({ startedAt: sound.audio.startedAt }));
    }
    writeFileSync(`${this.dir}/speech.json`, JSON.stringify(sound.speech, null, 1));
    console.log(`錄影 ${this.dir}：${this.frames.length} 格、聲音 ${sound.audio ? '有' : '沒有'}、裝置語音 ${sound.speech.filter((s: any) => s.type === 'speak').length} 句`);
  }
}

/**
 * 錄影時接出遊戲的聲音（只在錄影注入，產品沒有）：
 * - 遊戲的音效、預錄語音、配樂都接在同一個 AudioContext 的總輸出（src/audio/sfx.ts），把 AudioContext 換成
 *   子類別，總輸出多接一份到 MediaStreamDestination，用 MediaRecorder 錄成 webm（__audioTap.start／stop）。
 *   AudioContext 第一次點擊才建立：還沒建立就先記著要錄，建立時馬上開始，開始時間記在 startedAt。
 * - 裝置語音（Web Speech API，數學題、AI 出的題目、AI 寫的建議）不經過 Web Audio，headless 也不會真的出聲：
 *   記下每一句 speak 與 cancel 的時間（__speechLog），剪接時用同一套聲音合成後放回去（scripts/award/edit.mjs）。
 */
export async function installAudioTap(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as any;
    const Orig = w.AudioContext;
    /** 錄音的狀態：要不要錄、接出來的 MediaStreamDestination、MediaRecorder、資料、開始時間 */
    const tap: any = { want: false, dest: null, rec: null, chunks: [], startedAt: 0 };
    w.__audioTap = tap;
    const begin = () => {
      if (!tap.dest || tap.rec) return;
      tap.chunks = [];
      const rec = new MediaRecorder(tap.dest.stream, { mimeType: 'audio/webm;codecs=opus' });
      rec.ondataavailable = (e: any) => e.data.size && tap.chunks.push(e.data);
      rec.onstart = () => (tap.startedAt = Date.now());
      tap.rec = rec;
      rec.start(500);
    };
    tap.start = () => {
      tap.want = true;
      begin();
    };
    tap.stop = () =>
      new Promise((resolve) => {
        tap.want = false;
        const rec = tap.rec;
        tap.rec = null;
        if (!rec) return resolve(null);
        rec.onstop = async () => {
          const buf = new Uint8Array(await new Blob(tap.chunks).arrayBuffer());
          let s = '';
          for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          resolve({ startedAt: tap.startedAt, b64: btoa(s) });
        };
        rec.stop();
      });
    if (Orig) {
      const realDest = Object.getOwnPropertyDescriptor((w.BaseAudioContext ?? Orig).prototype, 'destination')!.get!;
      w.AudioContext = class extends Orig {
        constructor(...args: any[]) {
          super(...args);
          const self = this as any;
          const gain = self.createGain();
          gain.connect(realDest.call(self));
          const dest = self.createMediaStreamDestination();
          gain.connect(dest);
          self.__tapGain = gain;
          if (!tap.dest) {
            tap.dest = dest;
            if (tap.want) begin();
          }
        }
        get destination() {
          return (this as any).__tapGain ?? realDest.call(this);
        }
      };
    }
    // 裝置語音：記下每一句與取消的時間
    const log: any[] = (w.__speechLog = []);
    const S = w.SpeechSynthesis?.prototype;
    if (S) {
      const speak = S.speak;
      const cancel = S.cancel;
      S.speak = function (u: any) {
        log.push({ t: Date.now(), type: 'speak', text: u.text, lang: u.lang, rate: u.rate });
        return speak.call(this, u);
      };
      S.cancel = function () {
        log.push({ t: Date.now(), type: 'cancel' });
        return cancel.call(this);
      };
    }
  });
}

/** 時間點標記：哪台裝置、名稱（片段:事件）、時間（毫秒） */
const marks: { dev: string; name: string; t: number }[] = [];

/** 記下一個時間點（剪接時用「裝置、名稱」對到時間） */
export function mark(dev: string, name: string): void {
  marks.push({ dev, name, t: Date.now() });
  console.log(`● ${dev}:${name}`);
}

/** 把所有標記寫進 award-out/rec/marks.json */
export function saveMarks(): void {
  mkdirSync(REC, { recursive: true });
  writeFileSync(`${REC}/marks.json`, JSON.stringify(marks, null, 1));
}

/** 在這個瀏覽器環境的每個頁面注入假游標（白色圓點、藍框；按下時縮小） */
export async function installCursor(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const add = () => {
      if (document.getElementById('__demo_cursor')) return;
      const c = document.createElement('div');
      c.id = '__demo_cursor';
      c.style.cssText =
        'position:fixed;left:-50px;top:-50px;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.75);' +
        'border:4px solid #3b6fd8;box-shadow:0 2px 8px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;' +
        'transform:translate(-50%,-50%);transition:transform .1s';
      document.body.appendChild(c);
      document.addEventListener('mousemove', (e) => ((c.style.left = `${e.clientX}px`), (c.style.top = `${e.clientY}px`)), true);
      document.addEventListener('mousedown', () => (c.style.transform = 'translate(-50%,-50%) scale(.7)'), true);
      document.addEventListener('mouseup', () => (c.style.transform = 'translate(-50%,-50%) scale(1)'), true);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  });
}

/** 停一下（讓觀眾看清楚） */
export const pause = (page: Page, ms: number) => page.waitForTimeout(ms);

/** 游標慢慢移到元素中間（先捲到看得到） */
export async function moveTo(page: Page, loc: Locator): Promise<void> {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  if (!b) return;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
  await pause(page, 250);
}

/** 像真人一樣點：移過去、停一下、點、再停一下 */
export async function clickOn(page: Page, loc: Locator, after = 400): Promise<void> {
  await moveTo(page, loc);
  await loc.click();
  await pause(page, after);
}

/** 點進輸入框，一個字一個字打（每字 110 毫秒） */
export async function typeIn(page: Page, loc: Locator, text: string): Promise<void> {
  await clickOn(page, loc, 150);
  await loc.fill('');
  await loc.pressSequentially(text, { delay: 110 });
  await pause(page, 300);
}

/** 用滾輪慢慢捲到元素出現在畫面上方附近（top：元素頂端要停在離畫面頂端幾像素） */
export async function scrollTo(page: Page, loc: Locator, top = 90): Promise<void> {
  const scrolled = () => page.evaluate(() => window.scrollY);
  for (let i = 0; i < 60; i++) {
    const b = await loc.boundingBox();
    if (!b) return;
    const dy = b.y - top;
    if (Math.abs(dy) < 30) break;
    const before = await scrolled();
    await page.mouse.wheel(0, Math.max(-120, Math.min(120, dy)));
    await pause(page, 60);
    // 視窗本身捲不動（內容在可捲動的面板裡）：改用元素自己的 scrollIntoView（平滑捲動）
    if ((await scrolled()) === before) {
      await loc.evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'smooth' }));
      await pause(page, 800);
      break;
    }
  }
  await pause(page, 300);
}
