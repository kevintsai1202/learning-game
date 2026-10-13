/**
 * 老師 AI 出題的呼叫流程（docs/plans/ai-questions.md 第 3 節）：送出拿工作編號，每隔一段時間查一次，
 * 完成回草稿、失敗丟出錯誤。一次出題可能要一分鐘以上，所以不用一個長請求等結果。
 */
import type { AiRequest } from '../../../content/aiQuestions';
import type { AiJobResponse, AiJobStatus, AiQuestionsResponse } from '../../../online/protocol';

/** 呼叫大人 API 的函式（useAccount 的 call） */
type Call = <T>(method: string, path: string, body?: unknown) => Promise<T>;

/** 多久查一次（毫秒） */
const POLL_MS = 1500;
/** 最多等多久（毫秒）；伺服器那邊一次請求最久 120 秒，再留一點時間 */
const WAIT_MS = 180_000;

/** 送出一批 AI 出題並等結果 */
export async function runAiJob(call: Call, code: string, req: AiRequest): Promise<AiQuestionsResponse> {
  const path = `/api/teacher/rooms/${code}/ai-questions`;
  const { job } = await call<AiJobResponse>('POST', path, req);
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    await new Promise((ok) => setTimeout(ok, POLL_MS));
    const r = await call<AiJobStatus>('GET', `${path}/${job}`);
    if (r.status === 'done') return r;
    if (r.status === 'failed') throw new Error(r.error);
    if (Date.now() > deadline) throw new Error('AI 出題太久沒有回應，請再試一次');
  }
}
