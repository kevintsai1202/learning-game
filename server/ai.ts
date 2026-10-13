/**
 * 老師 AI 出題的出題器（docs/plans/ai-questions.md 第 3、4 節）：
 * - Muse：Meta 的 OpenAI 相容 chat completions，strict json_schema 結構化輸出，用串流收（避免非串流請求的 504）
 * - 假出題器：e2e 與伺服器測試用，依請求產生固定的合格題目，不連網
 * 用 Node 內建 fetch 寫薄的用戶端，不加 SDK 依賴。
 */
import type { AiRequest } from '../src/content/aiQuestions';

/** 出題器收到的東西：提示、給模型的 JSON Schema、原始請求（假出題器用） */
export interface GenerateInput {
  system: string;
  user: string;
  schema: Record<string, unknown>;
  req: AiRequest;
}

/** 出題器：回傳模型輸出的 JSON（已解析，格式還沒檢查） */
export interface QuestionGenerator {
  generate(input: GenerateInput): Promise<unknown>;
}

/** 出題失敗的種類：逾時、HTTP 錯誤、被截斷、模型拒答、回應不是 JSON */
export type AiFailure = 'timeout' | 'http' | 'truncated' | 'refused' | 'bad_json';

/** 出題失敗（伺服器記錄 reason 與 detail；回給老師的訊息是固定的） */
export class AiError extends Error {
  constructor(
    readonly reason: AiFailure,
    readonly detail = '',
  ) {
    super(`AI 出題失敗（${reason}）${detail ? `：${detail}` : ''}`);
  }
}

/** Muse 用戶端的設定（環境變數 LLM_ 開頭） */
export interface MuseConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 推理強度：minimal、low、medium、high、xhigh（Muse Spark 不支援 none） */
  reasoningEffort?: string;
  /** 一次請求最久幾毫秒（預設 120 秒） */
  timeoutMs?: number;
  /** 測試用：換掉 fetch */
  fetchImpl?: typeof fetch;
}

/** 輸出額度：推理也吃這個額度（實測 10 題推理 1,510 tokens），要留足 */
const MAX_COMPLETION_TOKENS = 16000;

/** 一個串流片段裡用得到的部分 */
interface StreamChunk {
  choices?: { delta?: { content?: string | null; refusal?: string | null }; finish_reason?: string | null }[];
}

/**
 * 讀完 SSE 串流：只累加 delta.content（推理模型還會送別的欄位），記下最後的 finish_reason 與拒答文字。
 * 事件以空行分隔，每行「data: …」，最後是「data: [DONE]」。
 */
async function readStream(body: ReadableStream<Uint8Array>): Promise<{ content: string; finish: string | null; refusal: string }> {
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let refusal = '';
  let finish: string | null = null;
  /** 處理一行 data */
  const handle = (line: string) => {
    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') return;
    let chunk: StreamChunk;
    try {
      chunk = JSON.parse(data) as StreamChunk;
    } catch {
      return;
    }
    const choice = chunk.choices?.[0];
    if (!choice) return;
    if (choice.delta?.content) content += choice.delta.content;
    if (choice.delta?.refusal) refusal += choice.delta.refusal;
    if (choice.finish_reason) finish = choice.finish_reason;
  };
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      handle(buffer.slice(0, nl).replace(/\r$/, ''));
      buffer = buffer.slice(nl + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer) handle(buffer.replace(/\r$/, ''));
  return { content, finish, refusal };
}

/** Muse 出題器：POST {baseUrl}/chat/completions，strict json_schema，串流 */
export function createMuseGenerator(cfg: MuseConfig): QuestionGenerator {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    async generate(input) {
      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify({
            model: cfg.model,
            stream: true,
            ...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
            max_completion_tokens: MAX_COMPLETION_TOKENS,
            messages: [
              { role: 'system', content: input.system },
              { role: 'user', content: input.user },
            ],
            response_format: { type: 'json_schema', json_schema: { name: 'questions', strict: true, schema: input.schema } },
          }),
          signal: AbortSignal.timeout(cfg.timeoutMs ?? 120_000),
        });
      } catch (e) {
        const name = (e as Error).name;
        throw new AiError(name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'http', (e as Error).message);
      }
      if (!res.ok || !res.body) {
        // 上游的錯誤訊息只寫進記錄（截短），不轉給老師
        const text = (await res.text().catch(() => '')).slice(0, 300);
        throw new AiError('http', `${res.status} ${text}`);
      }
      let out: Awaited<ReturnType<typeof readStream>>;
      try {
        out = await readStream(res.body);
      } catch (e) {
        throw new AiError('timeout', (e as Error).message);
      }
      if (out.finish === 'length') throw new AiError('truncated');
      if (!out.content && out.refusal) throw new AiError('refused', out.refusal.slice(0, 200));
      try {
        return JSON.parse(out.content) as unknown;
      } catch {
        throw new AiError('bad_json', out.content.slice(0, 200));
      }
    },
  };
}

/** 假出題器的題材：依指標的科目給一題合格的題目（模型輸出的格式） */
function fakeItem(indicator: string, type: string, n: number) {
  const empty = { speak: null, options: null, answerIndex: null, answerNumber: null, unit: null, expression: null, answerOrder: null };
  if (type === 'number') {
    const a = 2 + (n % 8);
    const b = 3;
    return { ...empty, indicator, type, prompt: `測試題 ${n}：一盒有 ${a} 顆，${b} 盒有幾顆？`, answerNumber: a * b, unit: '顆', expression: `${a}×${b}`, explain: `每盒 ${a} 顆，有 ${b} 盒，${a}×${b}＝${a * b}。` };
  }
  if (type === 'order') {
    return { ...empty, indicator, type, prompt: `測試題 ${n}：把詞語排成句子`, answerOrder: ['我們', '一起', '去', '上學'], explain: '我們一起去上學。' };
  }
  return {
    ...empty,
    indicator,
    type,
    prompt: `測試題 ${n}：過馬路要走哪裡？`,
    options: [
      { text: '斑馬線', emoji: '🚸' },
      { text: '車子中間', emoji: '🚗' },
      { text: '圍牆上', emoji: '🧱' },
    ],
    answerIndex: 0,
    explain: '過馬路要走斑馬線，看紅綠燈。',
  };
}

/** 假出題器（e2e 與伺服器測試用）：指標與題型輪流用，題目內容固定、一定合格 */
export function createFakeGenerator(): QuestionGenerator {
  return {
    async generate({ req }) {
      const offset = (req.avoid?.length ?? 0) + 1;
      const questions = Array.from({ length: req.count }, (_, i) =>
        fakeItem(req.indicators[i % req.indicators.length], req.types[i % req.types.length], offset + i),
      );
      return { questions };
    },
  };
}

/**
 * 依環境變數決定出題器：
 * - TEST_AI_FAKE=1＋ALLOW_TEST_AI=1：假出題器（只給 e2e 用；只設一個、或和 LLM_API_KEY 同時設都拒絕啟動）
 * - LLM_API_KEY＋LLM_BASE_URL＋LLM_MODEL：Muse（LLM_REASONING_EFFORT 可省略）
 * - 都沒有：null（不開 AI 出題）
 */
export function generatorFromEnv(env: Record<string, string | undefined>): QuestionGenerator | null {
  const fake = env.TEST_AI_FAKE === '1';
  const allow = env.ALLOW_TEST_AI === '1';
  if (fake !== allow) throw new Error('TEST_AI_FAKE 與 ALLOW_TEST_AI 要同時設定（只給 e2e 用）');
  if (fake) {
    if (env.LLM_API_KEY) throw new Error('假出題器不能和 LLM_API_KEY 同時設定');
    return createFakeGenerator();
  }
  if (!env.LLM_API_KEY) return null;
  if (!env.LLM_BASE_URL || !env.LLM_MODEL) throw new Error('設了 LLM_API_KEY 就要一起設定 LLM_BASE_URL 與 LLM_MODEL');
  return createMuseGenerator({ baseUrl: env.LLM_BASE_URL, apiKey: env.LLM_API_KEY, model: env.LLM_MODEL, reasoningEffort: env.LLM_REASONING_EFFORT || undefined });
}
