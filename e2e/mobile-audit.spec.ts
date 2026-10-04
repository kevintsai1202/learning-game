/**
 * 手機版面檢查：用幾種常見手機尺寸走過每個畫面，找出跑到畫面外的元素並截圖。
 * - 水平超出畫面：一律算問題，除非所在的捲動容器明確標了 .scroll-x（刻意讓使用者左右滑的區塊）
 * - 數字題的確認鍵、結算畫面另外檢查：要完整在畫面內，不用捲動就按得到
 * - 垂直超出畫面：只有「捲不到」的才算問題（在可以上下捲動、而且本身在畫面內的容器裡就沒關係）
 * 截圖與報告在 e2e/screenshots/mobile-audit/（不進版控）。有問題就讓測試失敗；只想看報告時設 AUDIT_REPORT_ONLY=1。
 * 4 種尺寸約 7 分鐘。
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { enterZone, finishQuiz, freshStart, screen } from './helpers';

const OUT = 'e2e/screenshots/mobile-audit';
mkdirSync(OUT, { recursive: true });

/** 檢查用的手機尺寸 */
const DEVICES = [
  { name: 'iphone-390x844', width: 390, height: 844 },
  { name: 'se-375x667', width: 375, height: 667 },
  { name: 'android-360x740', width: 360, height: 740 },
  { name: 'landscape-844x390', width: 844, height: 390 },
];

/** 一個超出畫面的元素 */
type Offender = { what: string; text: string; rect: [number, number, number, number]; dir: string };

/** 在頁面裡找出超出畫面、而且捲不到的元素（只回報最外層的那個） */
async function findOverflow(page: Page): Promise<{ pageScrollX: boolean; offenders: Offender[] }> {
  return page.evaluate(() => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const describe = (el: Element) => {
      const cls = typeof el.className === 'string' && el.className ? `.${el.className.trim().split(/\s+/).join('.')}` : '';
      const tid = el.getAttribute('data-testid');
      return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${cls}${tid ? `[${tid}]` : ''}`;
    };
    /** 有沒有可以捲動、而且本身在畫面內的祖先容器（方向 x 或 y） */
    const reachableByScroll = (el: Element, axis: 'x' | 'y') => {
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        const cs = getComputedStyle(p);
        const ov = axis === 'x' ? cs.overflowX : cs.overflowY;
        if (/(auto|scroll)/.test(ov)) {
          const r = p.getBoundingClientRect();
          // 水平方向只接受明確標了 .scroll-x 的容器：面板內容區設了 overflow-y: auto 時瀏覽器會讓它也能左右捲，被切掉的按鈕列就檢查不出來
          if (axis === 'x') return p.classList.contains('scroll-x') && r.left >= -1 && r.right <= W + 1;
          return r.top >= -1 && r.bottom <= H + 1;
        }
        // overflow: hidden 的容器（例如長條圖外框）只是裁切裝飾，繼續往上找能捲動的容器
      }
      return false;
    };
    const bad: { el: Element; dir: string }[] = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('canvas, svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const dirs: string[] = [];
      if ((r.right > W + 1 || r.left < -1) && !reachableByScroll(el, 'x')) dirs.push(r.right > W + 1 ? 'right' : 'left');
      if ((r.bottom > H + 1 || r.top < -1) && !reachableByScroll(el, 'y')) dirs.push(r.bottom > H + 1 ? 'bottom' : 'top');
      if (dirs.length) bad.push({ el, dir: dirs.join('+') });
    }
    // 只留最外層：祖先也在清單裡的就略過
    const set = new Set(bad.map((b) => b.el));
    const top = bad.filter((b) => {
      for (let p = b.el.parentElement; p; p = p.parentElement) if (set.has(p)) return false;
      return true;
    });
    return {
      pageScrollX: document.documentElement.scrollWidth > W + 1,
      offenders: top.slice(0, 15).map(({ el, dir }) => {
        const r = el.getBoundingClientRect();
        return { what: describe(el), text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], dir };
      }),
    };
  });
}

/** 開始某個活動（有難度選擇就選 1） */
async function startActivity(page: Page, zone: string, id: string): Promise<void> {
  await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
  await enterZone(page, zone);
  await page.getByTestId(`activity-${id}`).click();
  const level = page.getByTestId('level-1');
  if (await level.isVisible().catch(() => false)) await level.click();
  await expect(page.getByTestId('quiz')).toBeVisible();
  await page.waitForTimeout(700);
}

for (const d of DEVICES) {
  test.describe(d.name, () => {
    test.use({ viewport: { width: d.width, height: d.height }, hasTouch: true, isMobile: true });

    test(`手機版面檢查 ${d.name}`, async ({ page }) => {
      test.setTimeout(600_000);
      // 單一步驟最多等 15 秒，卡住時馬上失敗，不會一等就是好幾分鐘
      page.setDefaultTimeout(15_000);
      const report: Record<string, Awaited<ReturnType<typeof findOverflow>>> = {};
      /** 點不到的按鈕（跑到畫面外） */
      const unreachable: string[] = [];
      const check = async (name: string) => {
        await page.waitForTimeout(400);
        // 等有限次數的動畫（面板彈出等）播完再量，否則會量到放大 1.04 倍的那一刻
        await page
          .waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity), null, { timeout: 5000 })
          .catch(() => {});
        report[name] = await findOverflow(page);
        await page.screenshot({ path: `${OUT}/${d.name}-${name}.png` });
      };

      await freshStart(page);
      await check('01-title');
      await page.getByTestId('start').click();
      await check('02-profiles');
      // 已經在建立角色畫面（剛才按過「開始」），直接填寫
      await page.getByTestId('name-input').fill('小安');
      await page.getByRole('button', { name: '小兔' }).click();
      await page.getByTestId('create-profile').click();
      await expect.poll(() => screen(page)).toBe('island');
      await page.waitForTimeout(1500);
      await check('03-island');

      for (const z of ['math', 'zh', 'en', 'life', 'tower']) {
        await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
        await enterZone(page, z);
        await check(`04-menu-${z}`);
      }
      // 難度選擇（含氣球射擊）
      await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
      await enterZone(page, 'math');
      await page.getByTestId('activity-math.add').click();
      await check('05-level-pick');

      const quizzes: [string, string, string][] = [
        ['math', 'math.add', '06-quiz-number'],
        ['math', 'math.clock-set', '07-quiz-clock'],
        ['math', 'math.money-pay', '08-quiz-money'],
        ['math', 'math.chart', '09-quiz-chart'],
        ['math', 'math.time-units', '10-quiz-time-units'],
        ['life', 'life.traffic', '11-quiz-life'],
        ['life', 'life.recycle3d', '12-quiz-recycle'],
        ['en', 'en.word-cards', '13-quiz-en-words'],
        ['en', 'en.letter-write', '14-quiz-write'],
        ['zh', 'zh.order', '15-quiz-order'],
        ['zh', 'zh.reading', '16-quiz-reading'],
        ['zh', 'zh.zhuyin', '17-quiz-zhuyin'],
      ];
      for (const [zone, id, name] of quizzes) {
        await startActivity(page, zone, id);
        await check(name);
        // 數字題：確認鍵要完整在畫面內，不用捲動就按得到
        if (id === 'math.add') {
          const box = await page.getByTestId('key-✓').boundingBox();
          if (!box || box.y < 0 || box.y + box.height > d.height || box.x + box.width > d.width) unreachable.push(`${name}：數字鍵盤的確認鍵不在畫面內（要捲動才按得到）`);
        }
      }
      // 結算畫面（每回合都會看到）
      await startActivity(page, 'life', 'life.traffic');
      await finishQuiz(page);
      await expect(page.getByTestId('result')).toBeVisible();
      await check('21-result');

      // 氣球射擊
      await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
      await enterZone(page, 'math');
      await page.getByTestId('activity-math.add').click();
      const shoot = page.locator('[data-testid^="shoot-"]').first();
      if (await shoot.isVisible().catch(() => false)) {
        await shoot.click();
        await page.waitForTimeout(1500);
        await check('18-shooter');
      }

      // 百寶屋
      await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
      await enterZone(page, 'shop');
      await check('19-shop');

      // 家長專區各分頁
      await page.evaluate(() => (window as any).__game.ui.getState().goto('parent'));
      // 第一次設定 PIN：輸入兩次。等「請再輸入一次確認」出現再輸入第二次，避免切換畫面時漏按
      for (const k of ['1', '2', '3', '4']) await page.getByTestId(`pin-${k}`).click();
      await expect(page.getByText('請再輸入一次確認')).toBeVisible();
      for (const k of ['1', '2', '3', '4']) await page.getByTestId(`pin-${k}`).click();
      await expect(page.getByTestId('tab-report')).toBeAttached();
      for (const tab of ['report', 'wrong', 'curriculum', 'settings', 'packs', 'backup', 'sources']) {
        // 分頁按鈕跑到畫面外時點不到：記成問題，再用程式觸發點擊，繼續檢查後面的分頁
        const btn = page.getByTestId(`tab-${tab}`);
        try {
          await btn.click({ timeout: 3000 });
        } catch {
          unreachable.push(`20-parent：分頁「${tab}」的按鈕點不到（在畫面外）`);
          await btn.dispatchEvent('click');
        }
        await check(`20-parent-${tab}`);
      }

      // 班級（線上版）：沒有設定伺服器也能顯示表單，直接切過去量版面
      await page.evaluate(() => (window as any).__game.ui.getState().goto('class'));
      await check('22-class-login');
      await page.getByTestId('class-tab-join').click();
      await check('23-class-join');
      await page.evaluate(() => (window as any).__game.ui.getState().goto('teacher'));
      await check('24-teacher-create');
      await page.getByTestId('teacher-tab-login').click();
      await check('25-teacher-login');

      // 獎章簿（前面玩過幾回合，已經有獎章與稱號可以選）
      await page.evaluate(() => (window as any).__game.ui.getState().goto('badges'));
      await check('26-badges');

      // 益智遊戲館：選單、選玩法、各遊戲最擠的畫面（記憶翻牌 20 張牌、其他用和機器人的標題列）
      const openPuzzle = async () => {
        // 先回島上再進去：益智遊戲館的畫面會重新開始，停在選單
        await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));
        await page.evaluate(() => (window as any).__game.ui.getState().enterZone('puzzle'));
        await expect(page.getByTestId('puzzle-menu')).toBeVisible();
      };
      await openPuzzle();
      await check('27-puzzle-menu');
      await page.getByTestId('puzzle-memory').click();
      await check('28-puzzle-pick');
      await page.getByTestId('puzzle-solo-3').click();
      await expect(page.getByTestId('memory-game')).toBeVisible();
      await check('29-puzzle-memory');
      for (const [game, name] of [
        ['quiz', '30-puzzle-quiz'],
        ['spot', '31-puzzle-spot'],
        ['blocks', '32-puzzle-blocks'],
        ['tangram', '33-puzzle-tangram'],
      ]) {
        await openPuzzle();
        await page.getByTestId(`puzzle-${game}`).click();
        await page.getByTestId('puzzle-vs-3').click();
        await check(name);
      }
      await page.evaluate(() => (window as any).__game.ui.getState().goto('island'));

      writeFileSync(`${OUT}/${d.name}-report.json`, JSON.stringify({ unreachable, report }, null, 1));
      const problems = Object.entries(report).filter(([, r]) => r.pageScrollX || r.offenders.length);
      console.log(`${d.name}：${problems.length}／${Object.keys(report).length} 個畫面有超出`);
      for (const [name, r] of problems) console.log(`  ${name}${r.pageScrollX ? '（整頁可以左右捲）' : ''}：${r.offenders.map((o) => `${o.what}「${o.text}」${o.dir}`).join('；')}`);
      for (const u of unreachable) console.log(`  ${u}`);
      if (!process.env.AUDIT_REPORT_ONLY) {
        expect(unreachable).toEqual([]);
        expect(problems.map(([n]) => n)).toEqual([]);
      }
    });
  });
}
