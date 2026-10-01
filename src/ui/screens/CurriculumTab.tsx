/**
 * 家長專區「教材版本」：為每位小朋友選國語、數學的課本版本與學期，
 * 查看版本資料的完整度與來源，並可匯入版本包（新增其他版本或修正內建資料）。
 */
import { useRef, useState } from 'react';
import { useGame } from '../../store/useGame';
import { useEditions } from '../../store/useEditions';
import { GENERIC_EDITION, coverageOf, currentVolume, editionsFor } from '../../content/editions';
import { DEFAULT_CURRICULUM, termOf, type CurriculumChoice, type Profile } from '../../store/save';

/** 下載文字檔 */
function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const CONFIDENCE_TEXT = { verified: '多來源確認', 'single-source': '單一來源', missing: '待補' } as const;

/** 版本包範本：新增一個版本（或用相同 id 覆蓋內建版本） */
const TEMPLATE = {
  format: 'learning-island-edition',
  version: 1,
  id: 'my-zh',
  subject: 'zh',
  publisher: '自訂版本',
  grade: 2,
  volumes: [
    {
      term: '上',
      schoolYear: '115',
      units: [
        { no: 1, title: '第一課的課名', chars: ['山', '水'], confidence: 'single-source', sources: [{ name: '孩子的課本', url: 'https://example.com/' }] },
      ],
    },
  ],
};

export function CurriculumTab({ profile }: { profile: Profile }) {
  const all = useEditions((s) => s.all);
  const imported = useEditions((s) => s.imported);
  const importEdition = useEditions((s) => s.importEdition);
  const removeImported = useEditions((s) => s.removeImported);
  const updateCurriculum = useGame((s) => s.updateCurriculum);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [ok, setOk] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const cur: CurriculumChoice = profile.curriculum ?? DEFAULT_CURRICULUM;
  const set = (patch: Partial<CurriculumChoice>) => updateCurriculum(profile.id, { ...cur, ...patch });

  /** 某科的選單與目前這一冊的資料 */
  const subjectBlock = (subject: 'zh' | 'math', name: string) => {
    const list = editionsFor(all, subject);
    const chosen = list.find((e) => e.id === cur[subject]);
    const volume = chosen ? currentVolume(chosen, cur.term) : null;
    const cov = volume ? coverageOf(volume) : null;
    return (
      <div style={{ marginBottom: 18 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 18 }}>
          <b style={{ minWidth: 60 }}>{name}</b>
          <select value={cur[subject]} onChange={(e) => set({ [subject]: e.target.value } as Partial<CurriculumChoice>)} style={{ fontSize: 18 }} data-testid={`edition-${subject}`}>
            {list.map((e) => (
              <option key={e.id} value={e.id}>
                {e.publisher}
                {imported.some((x) => x.id === e.id) ? '（匯入）' : ''}
              </option>
            ))}
            <option value={GENERIC_EDITION}>依 108 課綱通用（不跟課本）</option>
          </select>
        </label>
        {cur[subject] !== GENERIC_EDITION && !chosen && <p className="notice">找不到這個版本的資料，請重新選擇。</p>}
        {chosen && !volume && <p className="notice">這個版本沒有二{cur.term === 'auto' ? termOf(new Date()) : cur.term}的資料。</p>}
        {volume && cov && (
          <details style={{ marginTop: 6 }}>
            <summary>
              二{volume.term}（依 {volume.schoolYear} 學年度資料整理）：{cov.units} {subject === 'math' ? '單元' : '課'}，有資料 {cov.withData}、多來源確認 {cov.verified}、待補 {cov.missing}
            </summary>
            <table className="report-table" style={{ marginTop: 6 }}>
              <thead>
                <tr>
                  <th>{subject === 'math' ? '單元' : '課'}</th>
                  <th>{subject === 'math' ? '對應練習' : '生字'}</th>
                  <th>可信度</th>
                  <th>來源</th>
                </tr>
              </thead>
              <tbody>
                {volume.units.map((u) => (
                  <tr key={u.no}>
                    <td>
                      {u.no}. {u.title}
                    </td>
                    <td>{subject === 'math' ? (u.skills ?? []).join('、') : (u.chars ?? []).join(' ')}</td>
                    <td>{CONFIDENCE_TEXT[u.confidence]}</td>
                    <td>
                      {u.sources.map((s, i) => (
                        <div key={i}>
                          <a href={s.url} target="_blank" rel="noreferrer">
                            {s.name}
                          </a>
                          {s.schoolYear ? `（${s.schoolYear}）` : ''}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
    );
  };

  return (
    <div className="plain">
      <p>
        幫 <b>{profile.name}</b> 選課本版本。選好後，「文字森林」與「數學城堡」最上方會出現「跟著課本」的每課／每單元練習，挑戰塔也會有期中、期末模擬考。
      </p>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 18, marginBottom: 14 }}>
        <b style={{ minWidth: 60 }}>學期</b>
        <select value={cur.term} onChange={(e) => set({ term: e.target.value as CurriculumChoice['term'] })} style={{ fontSize: 18 }} data-testid="edition-term">
          <option value="auto">自動（8～1 月為上學期，2～7 月為下學期；現在是二{termOf(new Date())}）</option>
          <option value="上">二年級上學期</option>
          <option value="下">二年級下學期</option>
        </select>
      </label>
      {subjectBlock('zh', '國語')}
      {subjectBlock('math', '數學')}

      <h3>匯入版本包（其他版本或修正生字）</h3>
      <p>版本資料整理自學校公告的課程計畫等公開資料，不同學年度可能有少數差異。若和孩子的課本不同，可以下載範本修改後匯入；版本 id 和內建相同時會覆蓋內建資料。</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          📂 匯入版本包
        </button>
        <button className="btn small white" onClick={() => download('版本包範本.json', JSON.stringify(TEMPLATE, null, 2))}>
          ⬇ 下載範本
        </button>
        {all.map((e) => (
          <button key={e.id} className="btn small white" onClick={() => download(`${e.id}.json`, JSON.stringify(e, null, 2))}>
            ⬇ 匯出 {e.publisher}
            {e.subject === 'zh' ? '國語' : '數學'}
          </button>
        ))}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const errs = importEdition(await f.text());
          setErrors(errs);
          setOk(errs ? '' : `已匯入「${f.name}」`);
          ev.target.value = '';
        }}
      />
      {ok && <p style={{ color: '#1e7f4f' }}>{ok}</p>}
      {errors && (
        <div className="explain" style={{ marginTop: 10 }}>
          匯入失敗：
          <ul>
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {imported.length > 0 && (
        <>
          <h3>已匯入</h3>
          <ul>
            {imported.map((e) => (
              <li key={e.id}>
                {e.publisher}（{e.subject === 'zh' ? '國語' : '數學'}，id：{e.id}）{' '}
                <button className="btn small white" onClick={() => removeImported(e.id)}>
                  刪除
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="notice">
        「康軒」「南一」「翰林」為各出版社名稱，僅用來標示對應的版本。本遊戲只使用課名、單元名稱與生字等事實資料，未收錄任何課文、習作或考卷內容；所有題目都是依課綱與生字自行編寫。
      </p>
    </div>
  );
}
