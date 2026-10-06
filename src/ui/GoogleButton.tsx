/**
 * Google 登入按鈕：顯示 Google 的官方按鈕，使用者登入後把 ID token 交給 onCredential。
 * e2e 測試模式（localStorage learning-island-google-stub）改顯示測試按鈕，按下去送出測試事先簽好的 token；
 * 之後的流程與正式環境相同（伺服器只認 Google 簽的 token，測試按鈕在正式環境沒有作用）。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { googleStubEnabled, renderGoogleButton, type GoogleButtonText } from '../online/google';

interface GoogleButtonProps {
  clientId: string;
  /** 拿到 ID token 之後要做的事（登入或綁定）；丟出的錯誤由呼叫端顯示 */
  onCredential: (idToken: string) => void;
  /** 測試按鈕的文字與 data-testid */
  label: string;
  testId: string;
  /** Google 官方按鈕上的文字（預設「使用 Google 帳戶登入」；登入表單用「使用 Google 帳戶繼續」） */
  text?: GoogleButtonText;
}

export function GoogleButton({ clientId, onCredential, label, testId, text = 'signin_with' }: GoogleButtonProps) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  // 讓 GIS 的回呼永遠呼叫最新的 onCredential（避免抓到舊的 props）
  const handler = useRef(onCredential);
  useLayoutEffect(() => {
    handler.current = onCredential;
  });
  const stub = googleStubEnabled();

  useEffect(() => {
    if (stub || !box.current) return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    renderGoogleButton(box.current, clientId, (token) => handler.current(token), 260, text)
      .then((fn) => {
        if (cancelled) fn();
        else dispose = fn;
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Google 登入程式載入失敗'));
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [clientId, stub, text]);

  if (stub) {
    return (
      <button type="button" className="btn small white" onClick={() => window.__googleStubCredential && handler.current(window.__googleStubCredential)} data-testid={testId}>
        {label}（測試）
      </button>
    );
  }
  return (
    <div>
      <div ref={box} data-testid={testId} />
      {error && <p className="notice">{error}</p>}
    </div>
  );
}
