/**
 * 出題器（server/ai.ts）：Muse 用戶端（OpenAI 相容的 chat completions、串流）、假出題器（e2e 用）、
 * 依環境變數決定用哪一個（測試模式的防線）。
 */
import { describe, expect, it } from 'vitest';
import { AiError, createFakeGenerator, createMuseGenerator, generatorFromEnv } from '../../server/ai';
import { aiOutputSchema, buildAiPrompt, convertAiOutput, type AiRequest } from '../../src/content/aiQuestions';

const req: AiRequest = { indicators: ['math:N-2-7', 'life:Ba-Ⅰ-1', 'zh:Ab-Ⅰ-5'], count: 5, types: ['choice', 'number', 'order'], difficulty: 1 };
const input = { ...buildAiPrompt(req, () => '條文'), schema: aiOutputSchema(req.indicators, req.types), req };

/** 把幾個 SSE 事件組成回應 */
function sse(events: unknown[], status = 200): Response {
  const text = events.map((e) => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  return new Response(text, { status, headers: { 'content-type': 'text/event-stream' } });
}
/** 一個串流片段 */
const chunk = (delta: Record<string, unknown>, finish: string | null = null) => ({ choices: [{ index: 0, delta, finish_reason: finish }] });

describe('Muse 出題器', () => {
  it('送出 strict json_schema 與推理強度，只累加 content，拼回完整的 JSON', async () => {
    let sent: { url: string; init: RequestInit } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return sse([chunk({ role: 'assistant' }), chunk({ reasoning_content: '想一想' }), chunk({ content: '{"questions":' }), chunk({ content: '[]}' }), chunk({}, 'stop'), '[DONE]']);
    }) as unknown as typeof fetch;
    const g = createMuseGenerator({ baseUrl: 'https://api.meta.ai/v1', apiKey: 'k', model: 'muse-spark-1.3-contributor', reasoningEffort: 'low', fetchImpl });
    expect(await g.generate(input)).toEqual({ questions: [] });
    expect(sent!.url).toBe('https://api.meta.ai/v1/chat/completions');
    expect((sent!.init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    const body = JSON.parse(sent!.init.body as string);
    expect(body).toMatchObject({ model: 'muse-spark-1.3-contributor', stream: true, reasoning_effort: 'low' });
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(8000);
    expect(body.response_format).toEqual({ type: 'json_schema', json_schema: { name: 'questions', strict: true, schema: input.schema } });
    expect(body.messages).toEqual([
      { role: 'system', content: input.system },
      { role: 'user', content: input.user },
    ]);
  });

  it('被截斷（length）、HTTP 錯誤、JSON 壞掉都丟出 AiError', async () => {
    const make = (res: () => Response) =>
      createMuseGenerator({ baseUrl: 'https://x/v1', apiKey: 'k', model: 'm', fetchImpl: (async () => res()) as unknown as typeof fetch });
    await expect(make(() => sse([chunk({ content: '{"questions":[' }, 'length')])).generate(input)).rejects.toMatchObject({ reason: 'truncated' });
    await expect(make(() => new Response('{"error":{"message":"bad"}}', { status: 400 })).generate(input)).rejects.toMatchObject({ reason: 'http' });
    await expect(make(() => sse([chunk({ content: '不是 JSON' }, 'stop')])).generate(input)).rejects.toBeInstanceOf(AiError);
  });
});

describe('假出題器', () => {
  it('依請求出題，轉換後全部合格', async () => {
    const out = await createFakeGenerator().generate(input);
    const r = convertAiOutput(out, req, { seed: 1, idPrefix: 'fake' });
    expect(r.dropped).toEqual([]);
    expect(r.drafts).toHaveLength(5);
    expect(new Set(r.drafts.map((d) => d.question.type))).toEqual(new Set(['choice', 'number', 'order']));
  });
});

describe('generatorFromEnv', () => {
  it('依環境變數決定出題器', () => {
    expect(generatorFromEnv({})).toBeNull();
    expect(generatorFromEnv({ LLM_API_KEY: 'k', LLM_BASE_URL: 'https://api.meta.ai/v1', LLM_MODEL: 'm' })).not.toBeNull();
    expect(generatorFromEnv({ TEST_AI_FAKE: '1', ALLOW_TEST_AI: '1' })).not.toBeNull();
  });

  it('測試模式只設一個、或和正式金鑰同時設，拒絕啟動', () => {
    expect(() => generatorFromEnv({ TEST_AI_FAKE: '1' })).toThrow();
    expect(() => generatorFromEnv({ ALLOW_TEST_AI: '1' })).toThrow();
    expect(() => generatorFromEnv({ TEST_AI_FAKE: '1', ALLOW_TEST_AI: '1', LLM_API_KEY: 'k' })).toThrow();
  });

  it('有金鑰但缺網址或模型，拒絕啟動', () => {
    expect(() => generatorFromEnv({ LLM_API_KEY: 'k' })).toThrow();
  });
});
