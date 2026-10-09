/**
 * 老師看到的班上孩子「在哪裡」（班級頁的成員表與熊熊老師進島後的全班清單共用）：
 * 哪座島（這一班的班級島、別的班級島、自己的島）＋建築＋在做什麼（老師 GM 的 G3）；舊版伺服器只有 online 時顯示 🟢；離線空白。
 */
import { zoneName } from '../world/layout';
import type { ZoneId } from '../store/useUi';
import type { MemberSummary } from '../online/protocol';

/** 哪座島：這一班的班級島、別班的班級島（多班級，不寫是哪一班）、自己的島 */
const ISLAND_TEXT = { class: '班級島', otherClass: '別的班級島', own: '自己的島' } as const;

/** 成員表「在哪裡」那一欄的文字 */
export function whereText(m: Pick<MemberSummary, 'where' | 'online'>): string {
  if (m.where) {
    const zone = m.where.zone ? `・${zoneName(m.where.zone as ZoneId)}` : '';
    const doing = m.where.doing ? `・${m.where.doing}` : '';
    return `🟢 ${ISLAND_TEXT[m.where.island] ?? '班級島'}${zone}${doing}`;
  }
  return m.online ? '🟢' : '';
}
