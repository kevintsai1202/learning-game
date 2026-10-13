/**
 * 學習報告 e2e 的資料準備（e2e/report.spec.ts、e2e/report-live.spec.ts 共用）：用同步 API 送作答，
 * 讓伺服器上孩子的指標統計有資料。
 */
import { expect, type APIRequestContext } from '@playwright/test';
import { SERVER, createClassViaApi } from './onlineDevice';

/** 用同步 API 送一回合作答：某個指標作答 total 題、一次答對 firstTry 題（伺服器照作答紀錄更新指標統計） */
export async function postSession(request: APIRequestContext, token: string, subject: string, code: string, total: number, firstTry: number): Promise<void> {
  const answers = Array.from({ length: total }, (_, i) => ({
    question: { id: `e2e-${code}-${i}-${Math.random().toString(36).slice(2, 6)}`, subject, skill: `${subject}.e2e`, indicators: [code], type: 'number', prompt: `${i} + 1 = ?`, answer: i + 1 },
    correct: true,
    firstTry: i < firstTry,
  }));
  const res = await request.post(`${SERVER}/api/ops`, {
    headers: { authorization: `Bearer ${token}` },
    data: { ops: [{ id: `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: new Date().toISOString(), kind: 'session', result: { activityId: `${subject}.e2e`, subject, total, correct: firstTry, stars: 1, coins: 0, seconds: 60, answers } }] },
  });
  expect(res.ok(), `送作答 ${res.status()} ${await res.text()}`).toBe(true);
}

/** 建班級、加入兩個孩子並送作答：阿寶時鐘弱、小美乘法弱 */
export async function classWithData(request: APIRequestContext) {
  const room = await createClassViaApi(request, '二年一班');
  const kids: Record<string, string> = {};
  for (const [nickname, pin] of [
    ['阿寶', '1111'],
    ['小美', '2222'],
  ]) {
    const res = await request.post(`${SERVER}/api/join`, { data: { code: room.code, nickname, pin, avatar: { animal: 'cat', color: '#ffffff', hat: null } } });
    expect(res.ok()).toBe(true);
    kids[nickname] = ((await res.json()) as { token: string }).token;
  }
  await postSession(request, kids['阿寶'], 'math', 'N-2-7', 10, 9);
  await postSession(request, kids['阿寶'], 'math', 'N-2-13', 10, 3);
  await postSession(request, kids['小美'], 'math', 'N-2-7', 10, 4);
  await postSession(request, kids['小美'], 'math', 'N-2-13', 10, 8);
  return room;
}

