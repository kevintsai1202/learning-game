/**
 * 跟著課本：把教材版本的每一課／單元變成活動，並提供期中、期末模擬考。
 * 活動 id 格式：unit:<版本 id>:<學期>:<單元號>、exam:<版本 id>:<學期>:mid|final
 */
import { createRng } from '../core/rng';
import type { GenerateOptions, Question } from '../core/types';
import type { Edition, EditionUnit, EditionVolume } from '../content/editions/schema';
import { getMathSkill } from '../engine/math';
import { charUnitGenerator } from '../engine/zh/charsBridge';
import type { ActivityDef } from './types';

/** 把多個出題器的題目輪流合併成一回合（id 不重複） */
function interleave(groups: Question[][], count: number, seed: number): Question[] {
  const out: Question[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < count && groups.some((g) => i < g.length); i++) {
    for (const g of groups) {
      const q = g[i];
      if (q && !seen.has(q.id) && out.length < count) {
        seen.add(q.id);
        out.push(q);
      }
    }
  }
  return createRng(seed ^ 0x1234).shuffle(out);
}

/** 數學單元：依單元對應的技能各出幾題，難度不超過單元上限 */
function mathUnitMake(unit: EditionUnit) {
  return (opts: GenerateOptions): Question[] => {
    const skills = (unit.skills ?? []).map(getMathSkill);
    if (!skills.length) return [];
    const level = Math.min(opts.level, unit.maxLevel ?? 3) as 1 | 2 | 3;
    const per = Math.ceil(opts.count / skills.length) + 1;
    const rng = createRng(opts.seed);
    const groups = skills.map((s) => s.generate({ seed: rng.int(1, 1e9), count: per, level, allowFewer: true, maxNumber: unit.maxNumber }));
    return interleave(groups, opts.count, opts.seed);
  };
}

/** 國語單元：本課生字的認讀、注音、部首、造詞、描寫（由國語生字出題器提供） */
function zhUnitMake(unit: EditionUnit) {
  return (opts: GenerateOptions): Question[] => {
    const gen = charUnitGenerator();
    if (!gen || !unit.chars?.length) return [];
    return gen({ chars: unit.chars, words: unit.words ?? [], unitId: String(unit.no) }, opts);
  };
}

/** 單元活動的 id */
export const unitActivityId = (editionId: string, term: string, no: number) => `unit:${editionId}:${term}:${no}`;

/** 一冊的所有單元活動 */
export function unitActivities(edition: Edition, volume: EditionVolume): ActivityDef[] {
  const isMath = edition.subject === 'math';
  return volume.units.map((u) => ({
    id: unitActivityId(edition.id, volume.term, u.no),
    zone: edition.subject,
    subject: edition.subject,
    title: `${isMath ? `第 ${u.no} 單元` : `第 ${u.no} 課`} ${u.title}`,
    icon: isMath ? '📘' : '📗',
    group: `跟著課本（${edition.publisher} 二${volume.term}）`,
    indicators: [],
    count: isMath ? 10 : 8,
    levels: isMath,
    arcade: true,
    description: u.note,
    make: isMath ? mathUnitMake(u) : zhUnitMake(u),
    disabledReason: isMath
      ? u.skills?.length
        ? undefined
        : '單元資料待補'
      : !u.chars?.length
        ? '生字資料待補'
        : charUnitGenerator()
          ? undefined
          : '生字練習準備中',
  }));
}

/** 段考模擬：期中（前半冊）與期末（全冊），從範圍內各單元抽題 */
export function examActivities(edition: Edition, volume: EditionVolume): ActivityDef[] {
  const units = unitActivities(edition, volume);
  const half = Math.ceil(units.length / 2);
  const make =
    (range: ActivityDef[]) =>
    (opts: GenerateOptions): Question[] => {
      const rng = createRng(opts.seed);
      const per = Math.max(2, Math.ceil((opts.count * 1.5) / range.length));
      const groups = rng.shuffle(range).map((a) => a.make({ seed: rng.int(1, 1e9), count: per, level: opts.level, allowFewer: true }).filter((q) => q.type !== 'write'));
      return interleave(groups, opts.count, opts.seed);
    };
  const base = { zone: 'tower' as const, subject: edition.subject, indicators: [], count: 15, levels: true, exam: true, group: `段考模擬（${edition.publisher} 二${volume.term}）` };
  const subj = edition.subject === 'math' ? '數學' : '國語';
  return [
    { ...base, id: `exam:${edition.id}:${volume.term}:mid`, title: `${subj}期中考（第 1～${half} ${edition.subject === 'math' ? '單元' : '課'}）`, icon: '📝', make: make(units.slice(0, half)) },
    { ...base, id: `exam:${edition.id}:${volume.term}:final`, title: `${subj}期末考（全冊）`, icon: '🏅', make: make(units) },
  ];
}
