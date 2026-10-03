/**
 * 標題畫面：背景是環繞鏡頭的 3D 島，點「開始冒險」進入選角。
 * 第一次點擊同時解除瀏覽器的自動播放限制（音效、語音）。
 * 底部的出處說明附隱私權政策連結（public/privacy.html；Google 品牌驗證要求首頁連到隱私權政策）。
 */
import { useUi } from '../../store/useUi';
import { useGame } from '../../store/useGame';
import { unlockAudio, sfx } from '../../audio/sfx';
import { speak } from '../../audio/speech';
import { WELCOME_LINE } from '../lines';
import { onlineEnabled } from '../../online/config';

export function TitleScreen() {
  const goto = useUi((s) => s.goto);
  const hasProfiles = useGame((s) => s.save.profiles.length > 0);
  const start = () => {
    unlockAudio();
    sfx.fanfare();
    speak(WELCOME_LINE);
    goto('profiles');
  };
  return (
    <div className="title-screen">
      <div className="title-box">
        <h1 className="logo">
          知識島<span className="accent">大冒險</span>
        </h1>
        <div className="tagline">國小二年級的學習小島 🏝️ 國語・數學・英語・生活</div>
        <div className="title-actions">
          <button className="btn big" onClick={start} data-testid="start">
            ▶ {hasProfiles ? '開始冒險' : '建立角色'}
          </button>
        </div>
        {onlineEnabled() && (
          <div className="title-actions" style={{ marginTop: 14 }}>
            <button
              className="btn small white"
              onClick={() => {
                unlockAudio();
                goto('teacher');
              }}
              data-testid="teacher-link"
            >
              👩‍🏫 班級管理（老師／家長）
            </button>
          </div>
        )}
      </div>
      <button
        className="btn small white corner-link"
        onClick={() => {
          unlockAudio();
          goto('parent');
        }}
        data-testid="parent-link"
      >
        👨‍👩‍👧 家長專區
      </button>
      <div className="credit-line">
        內容依 108 課綱自編・筆順依教育部標準・詳見家長專區「資料來源」・
        <a href="./privacy.html" target="_blank" rel="noopener" style={{ color: 'inherit' }} data-testid="privacy-link">
          隱私權政策
        </a>
      </div>
    </div>
  );
}
