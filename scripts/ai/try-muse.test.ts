/**
 * 老師 AI 出題的真實 API 試跑（docs/plans/ai-questions.md）：用 .env 的 LLM_ 變數呼叫 Muse，
 * 走一遍「提示 → 結構化輸出 → 轉題目與檢查」，印出草稿、提醒與被丟掉的題目，給人看出題品質。
 *
 * 執行（PowerShell 7；花費很少，Contributor 方案一次約 US$0.001）：
 *   node --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.ai.config.ts --silent=false 2>&1 | Tee-Object -FilePath logs\ai-try.log
 * 換指標或題型：設 AI_TRY_INDICATORS（逗號分隔，例如 math:N-2-7,zh:Ab-Ⅰ-5）、AI_TRY_TYPES（choice,number,order）、AI_TRY_NOTE
 */
import { describe, expect, it } from 'vitest';
import { generatorFromEnv } from '../../server/ai';
import { aiOutputSchema, aiRequestSchema, buildAiPrompt, convertAiOutput, type AiRequest } from '../../src/content/aiQuestions';
import { indicatorLabel } from '../../src/content/indicators';
import { hasZhuyin } from '../../src/content/zhuyinCharset';

describe('Muse 真實出題', () => {
  it.skipIf(!process.env.LLM_API_KEY)('出 5 題並全部通過檢查', async () => {
    const generator = generatorFromEnv(process.env)!;
    const req: AiRequest = aiRequestSchema.parse({
      indicators: (process.env.AI_TRY_INDICATORS ?? 'math:N-2-7,life:Ba-Ⅰ-1,zh:Ab-Ⅰ-5').split(','),
      count: 5,
      types: (process.env.AI_TRY_TYPES ?? 'choice,number,order').split(','),
      difficulty: 2,
      note: process.env.AI_TRY_NOTE,
    });
    const t0 = Date.now();
    const raw = await generator.generate({ ...buildAiPrompt(req, indicatorLabel), schema: aiOutputSchema(req.indicators, req.types), req });
    const r = convertAiOutput(raw, req, { seed: 1, idPrefix: 'try', hasZhuyin });
    console.log(`耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
    for (const d of r.drafts) console.log(JSON.stringify(d.question), d.warnings.length ? `\n  ⚠️ ${d.warnings.join('；')}` : '');
    for (const reason of r.dropped) console.log(`❌ ${reason}`);
    expect(r.drafts.length).toBeGreaterThan(0);
  });
});
