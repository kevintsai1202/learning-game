/**
 * AI 工作的記憶體存放（老師 AI 出題、AI 學習分析共用；docs/plans/ai-questions.md、docs/plans/learning-report.md）：
 * 一次 AI 呼叫可能要一分鐘以上，經過閘道器的長請求容易逾時，所以 POST 先回工作編號，畫面再用 GET 查結果。
 * 結果只給同一個 owner、同一個 scope（例如同一班）拿；拿到結果（完成或失敗）就刪掉，太久沒人拿也刪掉。
 * 伺服器重啟工作就沒了（畫面會顯示失敗、重來）。
 */
import { randomUUID } from 'node:crypto';

/** 查工作的結果 */
export type JobPeek<R> = { status: 'running' } | { status: 'done'; result: R } | { status: 'failed' };

/** 一個工作 */
interface Job<R> {
  owner: string;
  scope: string;
  createdAt: number;
  status: 'running' | 'done' | 'failed';
  result?: R;
}

export interface JobStore<R> {
  /** 開始一個工作（背景執行 run）；回傳工作編號 */
  start: (owner: string, scope: string, run: () => Promise<R>) => string;
  /** 查結果：不存在或不是這個 owner／scope 回 null；完成或失敗就刪掉 */
  take: (id: string, owner: string, scope: string) => JobPeek<R> | null;
  /** 這個 owner 還在跑的工作數 */
  running: (owner: string) => number;
}

/** 建立一個工作存放；now 是時鐘（測試可換），ttlMs 是沒人拿多久後刪掉 */
export function createJobStore<R>(now: () => Date, ttlMs = 10 * 60 * 1000): JobStore<R> {
  const jobs = new Map<string, Job<R>>();
  /** 刪掉太舊的工作 */
  const sweep = () => {
    const t = now().getTime();
    for (const [id, j] of jobs) if (t - j.createdAt > ttlMs) jobs.delete(id);
  };
  return {
    start(owner, scope, run) {
      sweep();
      const id = randomUUID();
      const job: Job<R> = { owner, scope, createdAt: now().getTime(), status: 'running' };
      jobs.set(id, job);
      run().then(
        (result) => {
          job.result = result;
          job.status = 'done';
        },
        (err: unknown) => {
          console.warn('AI 工作失敗', (err as Error)?.message ?? err);
          job.status = 'failed';
        },
      );
      return id;
    },
    take(id, owner, scope) {
      const job = jobs.get(id);
      if (!job || job.owner !== owner || job.scope !== scope) return null;
      if (job.status === 'running') return { status: 'running' };
      jobs.delete(id);
      return job.status === 'done' ? { status: 'done', result: job.result as R } : { status: 'failed' };
    },
    running(owner) {
      sweep();
      return [...jobs.values()].filter((j) => j.owner === owner && j.status === 'running').length;
    },
  };
}
