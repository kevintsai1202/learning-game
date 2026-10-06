/**
 * 上線監看（scripts/deploy/watch-deploy.cjs）的判斷：從 index.html 找主程式、從 Zeabur 部署清單找這個提交的狀態、
 * 每一輪的結果（完成、失敗、繼續等）。網路與命令列工具的部分不在這裡測（上線時實跑）。
 */
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

/** 一輪檢查的結果 */
interface Snapshot {
  pages: { status: string; conclusion: string } | null;
  zeabur: string | null;
  pagesNew: string;
  zeaburNew: string;
  health: string;
}

/** 腳本是 CommonJS（和其他部署腳本相同），用 require 載入 */
const { mainScriptOf, zeaburStatusOf, verdictOf } = createRequire(import.meta.url)('../../scripts/deploy/watch-deploy.cjs') as {
  mainScriptOf: (html: string) => string | null;
  zeaburStatusOf: (table: string, sha: string) => string | null;
  verdictOf: (s: Snapshot) => { done: true } | { failed: string } | null;
};

/** `zeabur deployment list` 的輸出（帶 ANSI 顏色碼，和實際輸出相同的格式） */
const TABLE = [
  '  \x1b[1;30m           ID           \x1b[0m  \x1b[1;30m  REPONAME   \x1b[0m  \x1b[1;30mSTATUS \x1b[0m  \x1b[1;30m      REF      \x1b[0m  \x1b[1;30m COMMITSHA \x1b[0m',
  '---------------------------+---------------+---------+-----------------+--------------',
  '  \x1b[95m6ac4bc352501bae5587e4ac0\x1b[0m  \x1b[32mlearning-game\x1b[0m  \x1b[94mBUILDING\x1b[0m  \x1b[93mrefs/heads/main\x1b[0m  \x1b[96mL2：新建角色自動存到家長帳號...\x1b[0m  \x1b[94m0767763f...\x1b[0m',
  '  \x1b[95m6ac4756a2501bae5587e3a52\x1b[0m  \x1b[32mlearning-game\x1b[0m  \x1b[94mRUNNING\x1b[0m  \x1b[93mrefs/heads/main\x1b[0m  \x1b[96m隱私權政策與帳號頁說明：Google 按...\x1b[0m  \x1b[94med6b1463...\x1b[0m',
].join('\n');

/** 一切完成的一輪 */
const ALL_DONE: Snapshot = { pages: { status: 'completed', conclusion: 'success' }, zeabur: 'RUNNING', pagesNew: 'yes', zeaburNew: 'yes', health: '{"ok":true}' };

describe('上線監看', () => {
  it('從 index.html 找主程式的路徑（Vite 建置的 assets/index-雜湊.js）', () => {
    expect(mainScriptOf('<script type="module" crossorigin src="./assets/index-Dv7224yK.js"></script>')).toBe('assets/index-Dv7224yK.js');
    expect(mainScriptOf('<html><body>維護中</body></html>')).toBeNull();
  });

  it('Zeabur 部署清單：依提交找狀態（去掉顏色碼），沒有這個提交回 null', () => {
    expect(zeaburStatusOf(TABLE, '0767763')).toBe('BUILDING');
    expect(zeaburStatusOf(TABLE, 'ed6b14639697caa8')).toBe('RUNNING');
    expect(zeaburStatusOf(TABLE, '1234567')).toBeNull();
  });

  it('兩個前端都是新版、Zeabur RUNNING、healthz 正常才算完成', () => {
    expect(verdictOf(ALL_DONE)).toEqual({ done: true });
    expect(verdictOf({ ...ALL_DONE, zeaburNew: 'no' })).toBeNull();
    expect(verdictOf({ ...ALL_DONE, zeabur: 'DEPLOYING' })).toBeNull();
    expect(verdictOf({ ...ALL_DONE, health: 'error' })).toBeNull();
    // Pages 的部署紀錄還沒出現也不擋（前端已經是新版就代表部署好了）
    expect(verdictOf({ ...ALL_DONE, pages: null })).toEqual({ done: true });
  });

  it('Pages 部署失敗、Zeabur 失敗或當掉：回傳原因（腳本以非零結束）', () => {
    expect(verdictOf({ ...ALL_DONE, pages: { status: 'completed', conclusion: 'failure' }, pagesNew: 'no' })).toEqual({ failed: 'GitHub Pages 部署失敗（failure）' });
    expect(verdictOf({ ...ALL_DONE, zeabur: 'FAILED', zeaburNew: 'no' })).toEqual({ failed: 'Zeabur 部署失敗（FAILED）' });
    expect(verdictOf({ ...ALL_DONE, zeabur: 'CRASHED' })).toEqual({ failed: 'Zeabur 部署失敗（CRASHED）' });
    // 還在部署中不算失敗
    expect(verdictOf({ ...ALL_DONE, pages: { status: 'in_progress', conclusion: '' }, pagesNew: 'no' })).toBeNull();
  });
});
