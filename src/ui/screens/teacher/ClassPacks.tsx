/**
 * 班級頁的「班級題庫」（G4，docs/plans/ai-questions.md；docs/plans/teacher-gm.md 第 7 節）：
 * 列出這個班級的題庫（名稱、題數、有沒有發佈），可以新增、AI 出題、修改、停用或發佈、刪除。
 * 發佈中的題庫出現在班上孩子的挑戰塔「班級題庫」分組（只在班級島）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '../../../online/useAccount';
import { useCloud } from '../../../online/useCloud';
import type { ClassPackDetail, ClassPackSummary } from '../../../online/protocol';
import type { ContentPack } from '../../../content/schema';
import { PackEditor } from './PackEditor';
import { usePackRequest } from './packRequest';

/** 錯誤訊息（伺服器回的中文，或通用的一句） */
const messageOf = (err: unknown) => (err instanceof Error ? err.message : '發生錯誤，請再試一次');

/** 打開的編輯器：哪一包（null 是新的）、原本的內容、要不要直接展開 AI 出題 */
interface Editing {
  id: string | null;
  pack: ContentPack | null;
  ai: boolean;
  /** AI 出題預先勾好的指標（從學習分析跳過來時） */
  indicators?: string[];
}

export function ClassPacks({ code }: { code: string }) {
  const call = useAccount((s) => s.call);
  const aiOn = useCloud((s) => s.aiQuestions);
  const [packs, setPacks] = useState<ClassPackSummary[] | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  /** 按過一次刪除、等再按一次確認的那一包 */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const base = `/api/teacher/rooms/${code}/packs`;

  const reload = useCallback(async () => {
    try {
      setPacks((await call<{ packs: ClassPackSummary[] }>('GET', base)).packs);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call, base]);

  useEffect(() => {
    void reload();
    // 伺服器有沒有開 AI 出題
    void useCloud.getState().loadConfig();
  }, [reload]);

  // 學習分析按了「針對這些指標 AI 出題」：打開新的題庫、展開 AI 出題並預先勾好
  const requested = usePackRequest((s) => s.indicators);
  useEffect(() => {
    if (!requested) return;
    setEditing({ id: null, pack: null, ai: true, indicators: requested });
    usePackRequest.getState().clear();
  }, [requested]);

  /** 做一個動作後重新整理 */
  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      setNote(done);
      setConfirmDelete(null);
      await reload();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const open = async (p: ClassPackSummary) => {
    try {
      const r = await call<{ pack: ClassPackDetail }>('GET', `${base}/${p.id}`);
      setEditing({ id: p.id, pack: r.pack.pack, ai: false });
    } catch (err) {
      setError(messageOf(err));
    }
  };

  return (
    <section className="class-packs" data-testid="class-packs">
      <h3 style={{ margin: '10px 0 4px' }}>📚 班級題庫</h3>
      <p className="plain small-note">發佈的題庫會出現在班上孩子的挑戰塔「班級題庫」（只在班級島）。可以自己出題，也可以用 AI 依課綱出草稿再修改。</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '6px 0' }}>
        <button type="button" className="btn small" onClick={() => setEditing({ id: null, pack: null, ai: false })} data-testid="pack-new">
          ＋ 新的題庫
        </button>
        {aiOn && (
          <button type="button" className="btn small purple" onClick={() => setEditing({ id: null, pack: null, ai: true })} data-testid="pack-ai">
            🤖 AI 出題
          </button>
        )}
      </div>
      {error && (
        <p className="gift-error" data-testid="packs-error">
          {error}
        </p>
      )}
      {note && (
        <p className="notice" data-testid="packs-note">
          {note}
        </p>
      )}
      {packs && packs.length === 0 && <p className="plain">還沒有班級題庫。</p>}
      {packs && packs.length > 0 && (
        <div className="scroll-x">
          <table className="report-table" data-testid="pack-table">
            <thead>
              <tr>
                <th>題庫</th>
                <th>題數</th>
                <th>發佈給孩子</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {packs.map((p, i) => (
                <tr key={p.id} data-testid={`pack-row-${i}`}>
                  <td>{p.title}</td>
                  <td>{p.count}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.enabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        // 畫面先變（不等伺服器）；存好或失敗後重新整理成伺服器的狀態
                        setPacks((list) => list?.map((x) => (x.id === p.id ? { ...x, enabled } : x)) ?? list);
                        void act(() => call('PATCH', `${base}/${p.id}`, { enabled }), enabled ? `「${p.title}」已發佈` : `「${p.title}」已停用，孩子看不到了`);
                      }}
                      aria-label="發佈給孩子"
                      data-testid={`pack-enabled-${i}`}
                    />
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button type="button" className="btn small white" onClick={() => void open(p)} data-testid={`pack-edit-${i}`}>
                      ✏️ 修改
                    </button>
                    <button
                      type="button"
                      className={`btn small ${confirmDelete === p.id ? 'red' : 'white'}`}
                      onClick={() => (confirmDelete === p.id ? void act(() => call('DELETE', `${base}/${p.id}`), `已刪除「${p.title}」`) : setConfirmDelete(p.id))}
                      data-testid={`pack-delete-${i}`}
                    >
                      {confirmDelete === p.id ? '再按一次確定刪除' : '🗑️'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <PackEditor
          code={code}
          packId={editing.id}
          initial={editing.pack}
          startWithAi={editing.ai}
          aiIndicators={editing.indicators}
          onClose={(saved) => {
            setEditing(null);
            if (saved) {
              setNote(saved);
              void reload();
            }
          }}
        />
      )}
    </section>
  );
}
