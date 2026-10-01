/**
 * 孩子介面的文字：把字串裡的「注音符號片段」（ㄅ～ㄩ、聲調）包成 .bpmf，改用一般字型顯示。
 * 注音字型會把每個注音符號畫成 1.5 倍寬（右側預留注音欄），單獨出現的注音會被撐得很開。
 */
import { Fragment } from 'react';

/** 注音符號與聲調符號（含輕聲點） */
const BPMF_RUN = /([ㄅ-ㄩㆠ-ㆿˊˇˋ˙]+)/;

/** 判斷字串是不是只有注音（題目選項常見） */
export function isBopomofoOnly(text: string): boolean {
  return /^[ㄅ-ㄩㆠ-ㆿˊˇˋ˙\s]+$/.test(text);
}

/**
 * 注音字串：聲調符號（ˊ ˇ ˋ）縮小放在右上方，輕聲點（˙）縮小放在前面，
 * 不然在標楷體等字型裡聲調會畫得跟注音符號一樣大，看起來像多了一個符號。
 */
export function ZhuyinText({ text }: { text: string }) {
  return (
    <span className="bpmf">
      {Array.from(text).map((ch, i) =>
        'ˊˇˋ˙'.includes(ch) ? (
          <span key={i} className={ch === '˙' ? 'tone light' : 'tone'}>
            {ch}
          </span>
        ) : (
          <Fragment key={i}>{ch}</Fragment>
        ),
      )}
    </span>
  );
}

export function KidText({ text }: { text: string }) {
  const parts = text.split(BPMF_RUN);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <ZhuyinText key={i} text={p} />
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
