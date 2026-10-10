/**
 * 別人的島的院子（自己的家）：即時連線的訊息怎麼更新、島上要畫哪一份院子。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { applyHostYard, clearHostYard, shownYard, useHostYard } from '../../src/online/useHostYard';

const BENCH = { id: 'decor.bench', gx: 0, gz: 4, rot: 1 as const };
const FLAGS = { chatOpen: true, giftsOpen: true };

beforeEach(() => clearHostYard());

describe('applyHostYard', () => {
  it('welcome 換成島主的院子；班級島（沒有 yard）變成 null', () => {
    applyHostYard({ t: 'welcome', self: 'a', island: 'own', room: FLAGS, members: [], chat: [], yard: [BENCH] });
    expect(useHostYard.getState().items).toEqual([BENCH]);
    applyHostYard({ t: 'welcome', self: 'a', island: 'class', room: FLAGS, members: [], chat: [] });
    expect(useHostYard.getState().items).toBeNull();
  });

  it('yard：島主改了院子；其他訊息不動', () => {
    applyHostYard({ t: 'yard', items: [BENCH] });
    applyHostYard({ t: 'gift' });
    expect(useHostYard.getState().items).toEqual([BENCH]);
    clearHostYard();
    expect(useHostYard.getState().items).toBeNull();
  });
});

describe('shownYard', () => {
  it('別人的島畫伺服器給的；自己的島畫本機存檔的（沒有就是空院子）；班級島沒有院子', () => {
    expect(shownYard({ ownIsland: true, visiting: true, local: [], host: [BENCH] })).toEqual([BENCH]);
    expect(shownYard({ ownIsland: true, visiting: false, local: [BENCH], host: null })).toEqual([BENCH]);
    expect(shownYard({ ownIsland: true, visiting: false, local: undefined, host: null })).toEqual([]);
    expect(shownYard({ ownIsland: false, visiting: false, local: [BENCH], host: null })).toBeNull();
  });
});
