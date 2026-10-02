/**
 * 熊熊老師的對話：點老師會依序說一句提示（同時朗讀）。
 * 有角色資料時，會優先推薦「熟練度最低、最近沒練」的科目。
 */
import { useUi } from '../store/useUi';
import { useGame } from '../store/useGame';
import { speak } from '../audio/speech';
import { TEACHER_TIPS } from './lines';

const TIPS = TEACHER_TIPS;

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
