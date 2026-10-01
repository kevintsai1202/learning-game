/**
 * 哪些題目不能顯示注音字型的「自動注音」：考注音本身的題目（看注音選字、聲調、看字選注音），
 * 國字旁邊若帶注音就等於直接給了答案，這些題目的題幹與選項一律用一般字型。
 */
import type { Question } from '../core/types';

/** 考注音的技能 */
const NO_ANNOTATION_SKILLS = new Set(['zh.zhuyin', 'zh.tone', 'zh.chars-read']);

/** 這一題要不要關掉注音字型 */
export function needsPlainText(q: Question | null | undefined): boolean {
  return !!q && NO_ANNOTATION_SKILLS.has(q.skill);
}
