/**
 * Google Identity Services（GIS）：載入 Google 的登入程式、畫出官方的「使用 Google 帳戶登入」按鈕，
 * 使用者登入後拿到 ID token（交給班級伺服器驗證）。不需要 client secret，靜態網站可以直接用。
 * 只有畫面要顯示 Google 按鈕時才載入 Google 的程式。
 */

/** GIS 程式的網址 */
const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** e2e 用：localStorage 有這個鍵時，Google 按鈕換成測試按鈕（不連到 Google） */
export const GOOGLE_STUB_KEY = 'learning-island-google-stub';

/** 我們用到的 GIS 介面（只宣告用到的部分） */
interface GisId {
  initialize(config: { client_id: string; callback: (res: { credential?: string }) => void; ux_mode?: 'popup'; auto_select?: boolean; itp_support?: boolean }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GisId } };
    /** e2e：測試按鈕按下去時送出的 ID token（由測試事先簽好放這裡） */
    __googleStubCredential?: string;
  }
}

/**
 * 從 Google 的 ID token 讀出 email（A4：用 Google 註冊時顯示在註冊表單）。
 * 只用來顯示，不檢查簽章；伺服器收到 token 會重新驗證。讀不到（不是 JWT、沒有 email）回傳 null
 */
export function emailOfIdToken(idToken: string): string | null {
  const part = idToken.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as { email?: unknown };
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/** 是否為 e2e 的測試按鈕模式 */
export function googleStubEnabled(): boolean {
  try {
    return localStorage.getItem(GOOGLE_STUB_KEY) === '1';
  } catch {
    return false;
  }
}

let loading: Promise<GisId> | null = null;

/** 載入 GIS 程式（只載一次）；載入失敗（沒網路、被擋）時丟出錯誤，下次可以重試 */
export function loadGis(): Promise<GisId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!loading) {
    loading = new Promise<GisId>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => (window.google?.accounts?.id ? resolve(window.google.accounts.id) : reject(new Error('Google 登入程式載入失敗')));
      script.onerror = () => reject(new Error('連不上 Google，請檢查網路'));
      document.head.appendChild(script);
    }).catch((err) => {
      loading = null;
      throw err;
    });
  }
  return loading;
}

/** 目前畫面上 Google 按鈕的處理函式（GIS 只初始化一次，登入結果轉給最新的按鈕） */
let currentHandler: ((idToken: string) => void) | null = null;
/** 已經用哪個 Client ID 初始化過 */
let initializedFor: string | null = null;

/** Google 官方按鈕上的文字：signin_with「使用 Google 帳戶登入」、continue_with（zh-TW 顯示「透過 Google 帳戶繼續操作」，2026-10-06 正式網址截圖確認；登入或註冊都用這顆） */
export type GoogleButtonText = 'signin_with' | 'continue_with';

/**
 * 在 parent 裡畫出 Google 的官方登入按鈕；使用者登入後呼叫 onCredential(ID token)。
 * 回傳取消註冊的函式（元件卸載時呼叫）。
 * 注意：登入結果的回呼只有一個（currentHandler），同一個畫面同時有兩顆按鈕時，按哪一顆都會交給後畫出來的那顆；畫面要避免同時出現兩顆。
 */
export async function renderGoogleButton(
  parent: HTMLElement,
  clientId: string,
  onCredential: (idToken: string) => void,
  width = 260,
  text: GoogleButtonText = 'signin_with',
): Promise<() => void> {
  const gis = await loadGis();
  if (initializedFor !== clientId) {
    gis.initialize({
      client_id: clientId,
      callback: (res) => {
        if (res.credential) currentHandler?.(res.credential);
      },
      ux_mode: 'popup',
      auto_select: false,
      itp_support: true,
    });
    initializedFor = clientId;
  }
  currentHandler = onCredential;
  gis.renderButton(parent, { type: 'standard', theme: 'outline', size: 'large', shape: 'pill', text, locale: 'zh-TW', width });
  return () => {
    if (currentHandler === onCredential) currentHandler = null;
  };
}
