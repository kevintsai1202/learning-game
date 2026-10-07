/**
 * 家長連結卡（L4，docs/plans/login-ux-review.md 第 7.3 節方案 A）：老師在成員表對還沒有家長的孩子按「家長連結」後顯示。
 * 卡片上有班級名稱、孩子的暱稱與動物圖（老師和家長都能核對）、QR code、連結與到期日；老師截圖或複製連結交給那位家長。
 * 代碼只在產生時看得到（伺服器只存雜湊）：關掉後要再給就重新產生，舊的會失效。元素都有 data-testid（e2e 用）。
 */
import { useEffect, useState } from 'react';
import { claimUrlOf } from '../../online/claimLink';
import type { ClaimIssueResponse } from '../../online/protocol';
import { AnimalIcon } from '../AnimalIcon';

export function ClaimCard({ issued, roomName, onClose }: { issued: ClaimIssueResponse; roomName: string; onClose: () => void }) {
  /** 連結 */
  const url = claimUrlOf(window.location.href, issued.code);
  /** QR code 圖片（data URL）；產生之前是 null */
  const [img, setImg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /** 到期日（給家長看的日期） */
  const until = new Date(issued.expiresAt).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });

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
    <div className="join-qr" data-testid="claim-card">
      <div className="join-class-head">
        <h3 style={{ margin: '6px 0' }}>👨‍👩‍👧 家長連結卡</h3>
        <button className="btn small white" onClick={onClose} data-testid="claim-card-close">
          關閉
        </button>
      </div>
      <div className="join-qr-body">
        {img ? <img src={img} width={160} height={160} alt={`「${issued.kid.nickname}」的家長連結 QR code`} data-testid="claim-qr" /> : <div className="join-qr-placeholder">產生中…</div>}
        <div className="plain" style={{ flex: '1 1 220px' }}>
          <p style={{ margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="avatar-dot" style={{ background: issued.kid.avatar.color }}>
              <AnimalIcon animal={issued.kid.avatar.animal} />
            </span>
            <strong data-testid="claim-card-kid">
              🏫 {roomName}・{issued.kid.nickname}
            </strong>
          </p>
          <p style={{ margin: '0 0 6px' }}>請交給「{issued.kid.nickname}」的家長：用手機掃描、登入家長帳號後按一下，就能把孩子的角色連到自己的帳號（班上的進度都會留著）。{until}前有效，只能用一次。</p>
          <code className="join-url" data-testid="claim-url">
            {url}
          </code>
          <div style={{ marginTop: 6 }}>
            <button className="btn small white" onClick={() => void copy()} data-testid="claim-copy">
              {copied ? '✅ 已複製' : '📋 複製連結'}
            </button>
          </div>
          <p className="notice">可以截圖或複製連結用 LINE 傳給家長。關掉後要再給就重新產生，舊的會失效。</p>
        </div>
      </div>
    </div>
  );
}
