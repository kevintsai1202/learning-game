/**
 * 熊熊老師的對話：點老師會依序說一句提示（同時朗讀）。
 * 有角色資料時，會優先推薦「熟練度最低、最近沒練」的科目。
 */
import { useUi } from '../store/useUi';
import { useGame } from '../store/useGame';
import { speak } from '../audio/speech';

const TIPS = [
  '歡迎來到知識島！點地面就可以走過去，點建築就會走到門口喔。',
  '寫國字要注意筆順：先上後下、先左後右、先外後內。',
  '去數學城堡練習看時鐘吧！短針是時針，長針是分針。',
  '過馬路要走斑馬線，紅燈停、綠燈行，還要左右看一看。',
  'ABC 海灘可以練習英文字母，大寫和小寫都要會寫喔。',
  '答錯沒關係，錯題會放進錯題本，多練習幾次就會了！',
  '玩一段時間要讓眼睛休息，看看遠方的綠色植物。',
  '挑戰塔可以做段考模擬，看看自己學會了多少！',
];

let index = 0;

/** 老師說下一句提示 */
export function teacherTalk(): void {
  const profile = useGame.getState().profile();
  let text = TIPS[index % TIPS.length];
  index++;
  // 每三句穿插一次個人化建議
  if (profile && index % 3 === 0) {
    const wrong = Object.keys(profile.wrongBook).length;
    if (wrong > 0) text = `${profile.name}，你的錯題本裡有 ${wrong} 題，可以到各科建築裡的「錯題複習」再試一次喔！`;
  }
  useUi.getState().say(text);
  speak(text);
}
