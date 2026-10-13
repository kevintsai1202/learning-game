/**
 * 「💡 提示」按鈕（docs/decisions.md「選項的 emoji 改成提示」）：按了之後這一題有文字的選項才顯示 emoji。
 * 答題畫面與益智搶答共用；挑戰塔（考試）不顯示。
 */
import { sfx } from '../audio/sfx';

export function HintButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="btn small hint-btn pop-in"
      onClick={() => {
        sfx.tap();
        onClick();
      }}
      data-testid="hint"
    >
      💡 提示
    </button>
  );
}
