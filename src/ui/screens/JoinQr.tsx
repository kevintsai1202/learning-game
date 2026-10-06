/**
 * 老師班級頁的「📱 讓家長掃描加入」（docs/plans/class-join.md）：班級的加入連結（目前網頁的網址＋?join=代碼）、
 * 連結的 QR code（瀏覽器裡產生，qrcode 套件只在這裡動態載入）與「複製連結」。
 * 不開放加入時提醒老師。元素都有 data-testid（e2e 與之後的教師指引會用）。
 */
import { useEffect, useState } from 'react';
import { joinUrlOf } from '../../online/joinLink';

export function JoinQr({ code, name, joinOpen }: { code: string; name: string; joinOpen: boolean }) {
  /** 加入連結 */
  const url = joinUrlOf(window.location.href, code);
  /** QR code 圖片（data URL）；產生之前是 null */
  const [img, setImg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    void import('qrcode')
      .then((QR) => QR.toDataURL(url, { width: 240, margin: 1 }))
      .then((data) => alive && setImg(data))
      .catch(() => alive && setImg(null));
    return () => {
      alive = false;
    };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 不能用剪貼簿（例如不是 https）：老師可以自己選取連結文字複製
    }
  };

  return (
    <div className="join-qr" data-testid="join-qr-block">
      <h3 style={{ margin: '6px 0' }}>📱 讓家長掃描加入</h3>
      <div className="join-qr-body">
        {img ? <img src={img} width={160} height={160} alt={`加入「${name}」的 QR code（班級代碼 ${code}）`} data-testid="join-qr" /> : <div className="join-qr-placeholder">產生中…</div>}
        <div className="plain" style={{ flex: '1 1 220px' }}>
          <p style={{ margin: '0 0 6px' }}>家長用手機掃描，登入家長帳號後選孩子就能加入，不用輸入密碼。學校平板掃同一個 QR code，由老師輸入教室密碼就能看到名單。也可以把連結傳給家長：</p>
          <code className="join-url" data-testid="join-url">
            {url}
          </code>
          <div style={{ marginTop: 6 }}>
            <button className="btn small white" onClick={() => void copy()} data-testid="join-copy">
              {copied ? '✅ 已複製' : '📋 複製連結'}
            </button>
          </div>
          {!joinOpen && (
            <p className="notice" data-testid="join-qr-closed">
              現在沒有開放加入，家長掃了也加不進來；要讓孩子加入時，先勾選上面的「允許新的孩子加入」。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
