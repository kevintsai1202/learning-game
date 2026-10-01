/**
 * 挑戰塔：段考模擬。從各科的出題器／題庫各抽幾題組成一份「考卷」，以 100 分制計分。
 * 題型參考公開段考考卷的出題方式，題目依課綱自編。
 */
import { createRng } from '../core/rng';
import type { GenerateOptions, Question, SubjectId } from '../core/types';
import type { ActivityDef } from './types';

/** 從多個活動各抽 per 題，依種子決定抽哪些活動，最後打散順序 */
export function mixFrom(sources: ActivityDef[], opts: GenerateOptions, per: number): Question[] {
  const rng = createRng(opts.seed);
  const picked = rng.shuffle(sources).slice(0, Math.ceil(opts.count / per));
  const out: Question[] = [];
  const seen = new Set<string>();
  for (const a of picked) {
    const qs = a.make({ seed: rng.int(1, 1e9), count: per + 2, level: opts.level, allowFewer: true });
    for (const q of qs) {
      if (out.length >= opts.count) break;
      if (seen.has(q.id) || q.type === 'write') continue;
      seen.add(q.id);
      out.push(q);
      if (out.filter((x) => x.skill === q.skill).length >= per) break;
    }
  }
  return rng.shuffle(out).slice(0, opts.count);
}

/** 建立段考模擬活動 */
export function examActivity(id: string, subject: SubjectId, title: string, icon: string, sources: () => ActivityDef[], description: string): ActivityDef {
  return {
    id,
    zone: 'tower',
    subject,
    title,
    icon,
    group: '段考模擬',
    indicators: [],
    count: 15,
    levels: true,
    exam: true,
    description,
    make: (opts) => mixFrom(sources(), opts, 2),
  };
}
