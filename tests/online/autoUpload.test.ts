/**
 * 新建角色自動存到家長帳號（L2，存到雲端的決定 A；使用者 2026-10-06 決定只有不是老師的家長帳號才自動）：
 * 沒有登入、不是家長、老師兼家長（教室共用電腦上學生新建的角色不能存進老師的帳號）都不存；只有家長身分的帳號才存。
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { useAccount } from '../../src/online/useAccount';
import { useCloud } from '../../src/online/useCloud';
import { autoUploadNewProfile } from '../../src/online/autoUpload';
import type { UserInfo } from '../../src/online/protocol';
import type { Profile } from '../../src/store/save';

/** 登入中的大人權杖 */
const session = { server: 'https://island.example', token: 't_1', remember: false };

/** 大人帳號資料：身分由參數決定 */
const userOf = (roles: { parent: boolean; teacher: boolean }): UserInfo => ({
  id: 'u_1',
  username: 'mom',
  email: null,
  emailVerified: false,
  hasPassword: true,
  ...roles,
});

/** 上傳到家長帳號的函式（useCloud.uploadToCloud） */
type Upload = (profileId: string, server: string, userToken: string) => Promise<Profile>;
/** 模擬的上傳（記錄被存的角色 id） */
let upload: Mock<Upload>;
const original = { account: useAccount.getState(), cloud: useCloud.getState() };

beforeEach(() => {
  upload = vi.fn<Upload>(async () => ({}) as Profile);
  useCloud.setState({ uploadToCloud: upload });
});

afterEach(() => {
  useAccount.setState(original.account, true);
  useCloud.setState(original.cloud, true);
});

describe('autoUploadNewProfile', () => {
  it('只有家長身分的帳號登入中：自動存到這個帳號', async () => {
    useAccount.setState({ session, user: userOf({ parent: true, teacher: false }) });
    expect(await autoUploadNewProfile('p_1')).toBe(true);
    expect(upload).toHaveBeenCalledWith('p_1', session.server, session.token);
  });

  it('老師兼家長的帳號：不自動存（教室共用電腦上學生新建的角色）', async () => {
    useAccount.setState({ session, user: userOf({ parent: true, teacher: true }) });
    expect(await autoUploadNewProfile('p_1')).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('只有老師身分、或沒有登入：不存', async () => {
    useAccount.setState({ session, user: userOf({ parent: false, teacher: true }) });
    expect(await autoUploadNewProfile('p_1')).toBe(false);
    useAccount.setState({ session: null, user: null });
    expect(await autoUploadNewProfile('p_1')).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it('重新整理後還沒讀回帳號資料：先讀一次再判斷身分', async () => {
    const refresh = vi.fn(async () => useAccount.setState({ user: userOf({ parent: true, teacher: true }) }));
    useAccount.setState({ session, user: null, refresh });
    expect(await autoUploadNewProfile('p_1')).toBe(false);
    expect(refresh).toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('上傳失敗不丟出例外（不擋遊戲，之後家長頁的卡片還會問）', async () => {
    upload.mockRejectedValueOnce(new Error('連不上班級伺服器'));
    useAccount.setState({ session, user: userOf({ parent: true, teacher: false }) });
    expect(await autoUploadNewProfile('p_1')).toBe(false);
  });
});
