/**
 * 家長專區：PIN 保護，內容有學習報告、錯題本、教材版本、班級帳號、設定、自訂題庫匯入、備份、資料來源與授權。
 * 這區給大人看，用一般字型、資訊密度較高。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { usePacks } from '../../store/usePacks';
import { ALL_ACTIVITIES } from '../../activities/registry';
import { indicatorLabel, splitIndicatorKey } from '../../content/indicators';
import { SOURCES } from '../../content/sources';
import { dateKey, skillMastery, type Profile, type Settings } from '../../store/save';
import type { SpeakLang, SubjectId } from '../../core/types';
import { starText } from './ZoneMenu';
import { currentVoice, getVoicePref, listVoices, onlyBasicVoice, onVoicesChanged, previewVoice, setVoicePref } from '../../audio/speech';
import { voiceId, voiceTag } from '../../audio/voices';
import { CurriculumTab } from './CurriculumTab';
import { useCloud } from '../../online/useCloud';
import { onlineEnabled } from '../../online/config';
import { getToken } from '../../online/storage';
import { BADGES } from '../../store/badges';
import { GoogleButton } from '../GoogleButton';

const SUBJECT_NAME: Record<SubjectId, string> = { zh: '國語', math: '數學', en: '英語', life: '生活與健康' };

/** 下載文字檔 */
function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** PIN 輸入（設定時要輸入兩次） */
function PinGate({ onPass }: { onPass: () => void }) {
  const hasPin = useGame((s) => s.save.parent.pinHash !== null);
  const setParentPin = useGame((s) => s.setParentPin);
  const checkParentPin = useGame((s) => s.checkParentPin);
  const [pin, setPin] = useState('');
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState(hasPin ? '請輸入家長 PIN' : '第一次使用：請設定 4 位數家長 PIN');
  const press = (k: string) => {
    if (k === '⌫') return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    setTimeout(() => {
      setPin('');
      if (hasPin) {
        if (checkParentPin(next)) onPass();
        else setMsg('PIN 不正確，請再試一次');
      } else if (first === null) {
        setFirst(next);
        setMsg('請再輸入一次確認');
      } else if (first === next) {
        setParentPin(next);
        onPass();
      } else {
        setFirst(null);
        setMsg('兩次不一樣，請重新設定');
      }
    }, 150);
  };
  return (
    <div className="panel-body plain" style={{ textAlign: 'center' }}>
      <p style={{ fontSize: 20 }} data-testid="pin-msg">
        {msg}
      </p>
      <div className="pin-dots">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
      <div className="pin-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
          k ? (
            <button key={i} className="btn white" style={{ height: 60 }} onClick={() => press(k)} data-testid={`pin-${k}`}>
              {k}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
      <p className="notice">PIN 只是為了避免孩子誤入設定，不是資安防護。忘記 PIN 時可清除瀏覽器網站資料重設（會一併清除進度）。</p>
    </div>
  );
}

/** 學習報告 */
function ReportTab({ profile }: { profile: Profile }) {
  const days = useMemo(() => {
    const out: { key: string; min: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      out.push({ key, min: Math.round((profile.playLog[key] ?? 0) / 60) });
    }
    return out;
  }, [profile]);
  const indicators = Object.entries(profile.indicators).sort((a, b) => a[0].localeCompare(b[0]));
  const bySubject = (Object.keys(SUBJECT_NAME) as SubjectId[]).map((sub) => ({
    sub,
    acts: ALL_ACTIVITIES.filter((a) => a.subject === sub && a.zone !== 'tower'),
  }));
  return (
    <div className="plain">
      <p>
        金幣 {profile.coins}・完成 {profile.history.length} 回合・錯題 {Object.keys(profile.wrongBook).length} 題
      </p>
      <p data-testid="report-badges">
        獎章 {BADGES.filter((b) => profile.badges?.[b.id]).length}／{BADGES.length}：
        {BADGES.filter((b) => profile.badges?.[b.id])
          .map((b) => `${b.icon}${b.name}`)
          .join('、') || '還沒有'}
        {/* 這一版才開始計數的統計（以前的不補算） */}
        （清掉錯題 {profile.stats?.wrongCleared ?? 0} 題・描寫完成 {profile.stats?.written ?? 0} 個字）
      </p>
      <h3>最近 7 天遊玩時間（分鐘）</h3>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 110 }}>
        {days.map((d) => (
          <div key={d.key} style={{ textAlign: 'center', fontSize: 13 }}>
            <div style={{ height: Math.min(80, d.min * 2) + 2, width: 30, background: '#2bb5c8', borderRadius: 6, margin: '0 auto' }} />
            {d.min}
            <br />
            {d.key.slice(5)}
          </div>
        ))}
      </div>
      {bySubject.map(({ sub, acts }) =>
        acts.length ? (
          <div key={sub}>
            <h3>{SUBJECT_NAME[sub]}</h3>
            <table className="report-table">
              <thead>
                <tr>
                  <th>活動</th>
                  <th>最佳</th>
                  <th>熟練度</th>
                </tr>
              </thead>
              <tbody>
                {acts.map((a) => {
                  const m = skillMastery(profile.skills[a.id]);
                  return (
                    <tr key={a.id}>
                      <td>
                        {a.icon} {a.title}
                      </td>
                      <td style={{ color: '#f2a20a' }}>{starText(profile.bestStars[a.id] ?? 0)}</td>
                      <td>
                        <div className="bar" title={`${Math.round(m * 100)}%`}>
                          <i style={{ width: `${m * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null,
      )}
      <h3>課綱指標達成（一次答對率）</h3>
      {indicators.length === 0 ? (
        <p>還沒有作答紀錄。</p>
      ) : (
        <table className="report-table">
          <thead>
            <tr>
              <th>代碼</th>
              <th>內容</th>
              <th>作答</th>
              <th>一次答對率</th>
            </tr>
          </thead>
          <tbody>
            {indicators.map(([key, s]) => (
              <tr key={key}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {SUBJECT_NAME[splitIndicatorKey(key).subject ?? 'math']} {splitIndicatorKey(key).code}
                </td>
                <td>{indicatorLabel(key)}</td>
                <td>{s.attempts}</td>
                <td>
                  <div className="bar">
                    <i style={{ width: `${(s.firstTry / Math.max(1, s.attempts)) * 100}%` }} />
                  </div>
                  {Math.round((s.firstTry / Math.max(1, s.attempts)) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** 錯題本 */
function WrongTab({ profile }: { profile: Profile }) {
  const list = Object.values(profile.wrongBook).sort((a, b) => b.lastWrong.localeCompare(a.lastWrong));
  if (!list.length) return <p className="plain">目前沒有錯題 🎉</p>;
  return (
    <table className="report-table">
      <thead>
        <tr>
          <th>科目</th>
          <th>題目</th>
          <th>錯幾次</th>
          <th>最近</th>
        </tr>
      </thead>
      <tbody>
        {list.map((w) => (
          <tr key={w.question.id}>
            <td>{SUBJECT_NAME[w.question.subject] ?? w.question.subject}</td>
            <td>{w.question.prompt}</td>
            <td>{w.wrongCount}</td>
            <td>{w.lastWrong}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** 聲音清單變動時重新繪製（Chrome 系列的聲音是非同步載入，第一次畫面可能還是空的） */
function useVoicesTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => onVoicesChanged(() => setTick((n) => n + 1)), []);
  return tick;
}

/** 選擇朗讀聲音：自動（建議）或指定這台裝置上的某個聲音，並可試聽 */
function VoicePicker({ lang, label }: { lang: SpeakLang; label: string }) {
  const [pref, setPref] = useState(() => getVoicePref(lang) ?? '');
  const voices = listVoices(lang);
  const using = currentVoice(lang);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', margin: '10px 0', fontSize: 18 }}>
      <span style={{ minWidth: 170, paddingTop: 6 }}>{label}</span>
      {/* 窄螢幕時整組換到標籤下面；選單限寬，避免被很長的聲音名稱撐開 */}
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={pref}
            data-testid={`voice-${lang}`}
            onChange={(e) => {
              setPref(e.target.value);
              setVoicePref(lang, e.target.value || null);
            }}
            // 用百分比寬度：選單的最小寬度才不會由最長的聲音名稱決定，手機上不會把整個面板撐寬
            style={{ fontSize: 18, flex: '1 1 auto', width: '100%', minWidth: 0, maxWidth: 460 }}
          >
            <option value="">自動（建議）</option>
            {voices.map((v) => (
              <option key={voiceId(v)} value={voiceId(v)}>
                {v.name}（{voiceTag(v)}）
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn small white"
            data-testid={`voice-test-${lang}`}
            onClick={() => previewVoice(lang, pref || null)}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            🔊 試聽
          </button>
        </div>
        <div style={{ fontSize: 15, marginTop: 4 }} data-testid={`voice-using-${lang}`}>
          目前使用：{using ? `${using.name}（${voiceTag(using)}）` : '沒有找到這個語言的聲音'}
        </div>
      </div>
    </div>
  );
}

/** 設定 */
function SettingsTab() {
  // 聲音清單載入後重繪整頁：選單和「只有基本語音」的提示都依清單決定
  useVoicesTick();
  const settings = useGame((s) => s.save.settings);
  const update = useGame((s) => s.updateSettings);
  const row = (label: string, control: React.ReactNode) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '10px 0', fontSize: 18 }}>
      <span style={{ minWidth: 170 }}>{label}</span>
      {control}
    </label>
  );
  const toggle = (key: keyof Settings) => (
    <input
      type="checkbox"
      checked={settings[key] as boolean}
      onChange={(e) => update({ [key]: e.target.checked } as Partial<Settings>)}
      style={{ width: 26, height: 26 }}
      data-testid={`setting-${key}`}
    />
  );
  return (
    <div className="plain">
      {row('畫面文字顯示注音', toggle('zhuyin'))}
      {row('語音朗讀', toggle('voice'))}
      {row('優先使用預錄語音', toggle('voiceClips'))}
      {row(
        '朗讀速度',
        <input type="range" min={0.6} max={1.3} step={0.1} value={settings.voiceRate} onChange={(e) => update({ voiceRate: Number(e.target.value) })} />,
      )}
      <VoicePicker lang="zh-TW" label="中文聲音" />
      <VoicePicker lang="en-US" label="英文聲音" />
      {row('音效', toggle('sfx'))}
      {row('背景音樂', toggle('music'))}
      {row(
        '每日遊玩上限',
        <select value={settings.dailyLimitMin} onChange={(e) => update({ dailyLimitMin: Number(e.target.value) })} style={{ fontSize: 18 }}>
          {[0, 20, 30, 45, 60, 90].map((m) => (
            <option key={m} value={m}>
              {m === 0 ? '不限制' : `${m} 分鐘`}
            </option>
          ))}
        </select>,
      )}
      {row(
        '3D 畫質',
        <select value={settings.quality} onChange={(e) => update({ quality: e.target.value as Settings['quality'] })} style={{ fontSize: 18 }}>
          <option value="auto">自動</option>
          <option value="low">省電（舊平板）</option>
          <option value="high">高畫質</option>
        </select>,
      )}
      {onlyBasicVoice('zh-TW') && (
        <p className="notice" data-testid="voice-hint">
          這台裝置只有基本語音，聽起來比較機械。Windows 建議改用 Microsoft Edge 開啟（有免費的自然語音），Android 與電腦可以用 Chrome；iPad 的 Safari 目前只能用內建聲音。
          {!currentVoice('zh-TW') && '另外，這台裝置沒有中文語音，朗讀會沒有聲音，可在系統設定加裝「中文（台灣）」語音。'}
        </p>
      )}
      <p className="notice">
        預錄語音是事先用 AI 語音合成做好的音檔（生活與健康、英語、介面句子與注音符號），比裝置語音自然；沒有預錄的句子（例如數學題、國語題）用上面選的裝置語音。朗讀速度只影響裝置語音。聲音的選擇只記在這台裝置；換裝置或還原備份後要重新選。
      </p>
    </div>
  );
}

/** 自訂題庫匯入 */
function PacksTab() {
  const packs = usePacks((s) => s.packs);
  const importPack = usePacks((s) => s.importPack);
  const removePack = usePacks((s) => s.removePack);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [ok, setOk] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const template = {
    format: 'learning-island-pack',
    version: 1,
    title: '二年級國語第一課練習',
    author: '王老師',
    questions: [
      { id: 'my-1', subject: 'zh', skill: 'zh.custom', indicators: ['Ab-Ⅰ-1'], type: 'choice', prompt: '「山」的部首是什麼？', options: [{ text: '山' }, { text: '口' }, { text: '人' }], answer: 0 },
      { id: 'my-2', subject: 'math', skill: 'math.custom', indicators: ['N-2-2'], type: 'number', prompt: '125 + 38 = ?', answer: 163 },
      { id: 'my-3', subject: 'zh', skill: 'zh.custom', indicators: ['Ac-Ⅰ-2'], type: 'order', prompt: '把詞語排成句子', tokens: ['上學', '我', '每天', '走路'], answer: ['我', '每天', '走路', '上學'] },
    ],
  };
  return (
    <div className="plain">
      <p>可以把自己出的題目（或孩子學校公開的練習題型）整理成 JSON 匯入，會出現在「挑戰塔」的「自訂題庫」。</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => fileRef.current?.click()}>
          📂 選擇 JSON 檔匯入
        </button>
        <button className="btn small white" onClick={() => download('題庫範本.json', JSON.stringify(template, null, 2))}>
          ⬇ 下載範本
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const errs = importPack(await f.text());
          setErrors(errs);
          setOk(errs ? '' : `已匯入「${f.name}」`);
          e.target.value = '';
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
      <h3>已匯入的題庫</h3>
      {packs.length === 0 ? (
        <p>還沒有。</p>
      ) : (
        <ul>
          {packs.map((p) => (
            <li key={p.id} style={{ marginBottom: 6 }}>
              {p.title}（{p.questions.length} 題）{' '}
              <button className="btn small white" onClick={() => removePack(p.id)}>
                刪除
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="notice">格式說明見專案 docs/content-pack.md。題型：choice（單選）、number（數字）、order（排序）、clock（撥時鐘）、money（付錢）、write（描寫）。</p>
    </div>
  );
}

/** 備份與還原 */
function BackupTab() {
  const exportBackup = useGame((s) => s.exportBackup);
  const importBackup = useGame((s) => s.importBackup);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  return (
    <div className="plain">
      <p>沒有加入班級的角色，進度只存在這台裝置的瀏覽器。換裝置或清除瀏覽器資料前，請先下載備份。（加入班級的角色，進度存在班級伺服器。）</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn small" onClick={() => download(`知識島備份-${dateKey(new Date())}.json`, exportBackup())}>
          ⬇ 下載備份
        </button>
        <button className="btn small white" onClick={() => fileRef.current?.click()}>
          ⬆ 從備份還原
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (!confirm('還原會覆蓋這台裝置目前的所有進度，確定嗎？')) return;
          setMsg(importBackup(await f.text()) ? '還原完成' : '這個檔案不是知識島的備份，或已經損壞');
          e.target.value = '';
        }}
      />
      {msg && <p>{msg}</p>}
    </div>
  );
}

/**
 * 家長的 Google 快速登入（備選）：把 Google 帳號綁到這位孩子，之後任何裝置都能用 Google 一次登入綁定的孩子。
 * 只有雲端角色、而且這台裝置有登入時才能綁；伺服器沒開 Google 登入時不顯示。
 */
function GoogleLinkSection({ profile }: { profile: Profile }) {
  const clientId = useCloud((s) => s.googleClientId);
  const linkGoogle = useCloud((s) => s.linkGoogle);
  const unlinkGoogle = useCloud((s) => s.unlinkGoogle);
  const fetchGoogleLinks = useCloud((s) => s.fetchGoogleLinks);
  /** 已綁定的帳號（email 已遮罩）；null 表示讀不到（例如離線） */
  const [linked, setLinked] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  useEffect(() => {
    let alive = true;
    fetchGoogleLinks(profile.id)
      .then((g) => alive && setLinked(g))
      .catch(() => alive && setLinked(null));
    return () => {
      alive = false;
    };
  }, [profile.id, fetchGoogleLinks]);
  if (!clientId) return null;
  /** 執行綁定或解除，更新顯示 */
  const run = (job: Promise<string[]>, done: string) =>
    job
      .then((g) => {
        setLinked(g);
        setMsg(done);
        setConfirmUnlink(false);
      })
      .catch((err: unknown) => setMsg(err instanceof Error ? err.message : '發生錯誤，請再試一次'));
  return (
    <div style={{ marginTop: 18 }} data-testid="google-section">
      <h4 style={{ margin: '0 0 6px' }}>Google 快速登入（備選）</h4>
      <p data-testid="google-linked">{linked === null ? '目前讀不到綁定狀態（可能沒有網路）。' : linked.length ? `已綁定：${linked.join('、')}` : '還沒有綁定 Google 帳號。'}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <GoogleButton clientId={clientId} label="綁定 Google 帳號" testId="google-link" onCredential={(t) => void run(linkGoogle(profile.id, t), '綁定好了！之後在班級畫面按「使用 Google 帳戶登入」就能快速登入。')} />
        {!!linked?.length &&
          (confirmUnlink ? (
            <button className="btn small red" onClick={() => void run(unlinkGoogle(profile.id), '已解除 Google 綁定')} data-testid="google-unlink-confirm">
              確定解除綁定
            </button>
          ) : (
            <button className="btn small white" onClick={() => setConfirmUnlink(true)} data-testid="google-unlink">
              解除綁定
            </button>
          ))}
      </div>
      {msg && <p data-testid="google-msg">{msg}</p>}
      <p className="notice">
        綁定後，在任何裝置的班級畫面按「使用 Google 帳戶登入」，就能一次登入這個 Google 帳號綁定的所有孩子（兄弟姊妹可以綁同一個帳號），不用輸入代碼和密碼；原本的代碼登入照樣可以用。伺服器只記 Google 帳號的識別碼與 email，只用在快速登入，老師看不到。
      </p>
    </div>
  );
}

/** 班級帳號：雲端角色的同步狀態、立即同步、登出這台裝置 */
function ClassTab({ profile }: { profile: Profile }) {
  const goto = useUi((s) => s.goto);
  const activeId = useGame((s) => s.save.activeProfileId);
  const status = useCloud((s) => s.status);
  const pending = useCloud((s) => s.pending);
  const lastSyncAt = useCloud((s) => s.lastSyncAt);
  const message = useCloud((s) => s.message);
  const syncNow = useCloud((s) => s.syncNow);
  const logout = useCloud((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const cloud = profile.cloud;
  if (!cloud) {
    return (
      <div className="plain">
        <p>「{profile.name}」的進度只存在這台裝置。</p>
        <p>加入班級後，進度（成績、錯題本、金幣、帽子）會存到班級伺服器，換一台平板登入也能接著玩。請到選角畫面點「🏫 班級」→「第一次加入」，可以選擇把這個角色的進度帶過去。</p>
        <button className="btn small" onClick={() => goto('class')}>
          🏫 前往班級畫面
        </button>
      </div>
    );
  }
  const isActive = profile.id === activeId;
  const hasToken = !!getToken(cloud.accountId);
  return (
    <div className="plain" data-testid="class-tab">
      <table className="report-table">
        <tbody>
          <tr>
            <th>班級</th>
            <td data-testid="class-room">
              {cloud.room ? `${cloud.roomName ?? ''}（房間代碼 ${cloud.room}）` : '還沒加入班級（家長名下的雲端角色）'}
            </td>
          </tr>
          <tr>
            <th>暱稱</th>
            <td>{profile.name}</td>
          </tr>
          {isActive && (
            <>
              <tr>
                <th>同步狀態</th>
                <td data-testid="class-status">
                  {!hasToken ? '需要重新登入' : status === 'synced' ? '已同步' : status === 'syncing' ? '同步中' : status === 'offline' ? '離線（連上網路後自動上傳）' : status === 'needLogin' ? '需要重新登入' : status === 'error' ? `同步失敗：${message ?? ''}` : '—'}
                </td>
              </tr>
              <tr>
                <th>待上傳</th>
                <td>{pending} 筆</td>
              </tr>
              <tr>
                <th>最近同步</th>
                <td>{lastSyncAt ? new Date(lastSyncAt).toLocaleString('zh-TW') : '—'}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        {isActive && hasToken && (
          <button className="btn small" onClick={() => void syncNow()} data-testid="class-sync-now">
            🔄 立即同步
          </button>
        )}
        {!hasToken &&
          (cloud.room ? (
            <button className="btn small" onClick={() => goto('class')}>
              🔑 重新登入
            </button>
          ) : (
            // 家長名下、沒有班級的角色沒有孩子密碼：請家長登入後「在這台裝置玩」
            <button className="btn small" onClick={() => goto('teacher')}>
              🔑 家長登入找回角色
            </button>
          ))}
        {hasToken && !cloud.room && (
          <button className="btn small" onClick={() => goto('class')} data-testid="class-join-from-cloud">
            🏫 加入班級
          </button>
        )}
        {!confirmLogout ? (
          <button className="btn small white" onClick={() => setConfirmLogout(true)} data-testid="class-logout">
            登出這台裝置
          </button>
        ) : (
          <button className="btn small red" onClick={() => void logout(profile.id).then(() => goto('title'))} data-testid="class-logout-confirm">
            {isActive && pending > 0 ? `還有 ${pending} 筆進度沒上傳，登出會遺失。確定登出？` : '確定登出（進度留在班級，之後可以再登入）'}
          </button>
        )}
      </div>
      <p className="notice">
        {cloud.room
          ? `登出後，這台裝置上的「${profile.name}」會移除；進度存在班級伺服器，用房間代碼＋暱稱＋密碼就能再登入。忘記密碼請老師重設。`
          : `登出後，這台裝置上的「${profile.name}」會移除；進度存在家長帳號，家長登入後選「在這台裝置玩」就能找回。`}
      </p>
      {hasToken && cloud.room && <GoogleLinkSection profile={profile} />}
    </div>
  );
}

/** 資料來源與授權 */
function SourcesTab() {
  return (
    <div className="plain">
      <table className="report-table">
        <thead>
          <tr>
            <th>用途</th>
            <th>來源</th>
            <th>授權</th>
          </tr>
        </thead>
        <tbody>
          {SOURCES.map((s) => (
            <tr key={s.name}>
              <td>{s.use}</td>
              <td>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.name}
                </a>
                {s.note && <div className="notice">{s.note}</div>}
              </td>
              <td>{s.license}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Tab = 'report' | 'wrong' | 'curriculum' | 'class' | 'settings' | 'packs' | 'backup' | 'sources';
const TABS: { id: Tab; name: string }[] = [
  { id: 'report', name: '學習報告' },
  { id: 'wrong', name: '錯題本' },
  { id: 'curriculum', name: '教材版本' },
  { id: 'class', name: '班級帳號' },
  { id: 'settings', name: '設定' },
  { id: 'packs', name: '自訂題庫' },
  { id: 'backup', name: '備份' },
  { id: 'sources', name: '資料來源' },
];

export function ParentScreen() {
  const goto = useUi((s) => s.goto);
  const profiles = useGame((s) => s.save.profiles);
  const activeId = useGame((s) => s.save.activeProfileId);
  const [pass, setPass] = useState(false);
  const [tab, setTab] = useState<Tab>('report');
  const [pid, setPid] = useState(activeId ?? profiles[0]?.id ?? '');
  const profile = profiles.find((p) => p.id === pid) ?? null;
  const back = () => goto(activeId ? 'island' : 'title');
  // 班級帳號分頁：有設定班級伺服器、或這台裝置上有雲端角色時才顯示
  const tabs = onlineEnabled() || profiles.some((p) => p.cloud) ? TABS : TABS.filter((t) => t.id !== 'class');
  return (
    <div className="panel-screen">
      <div className="panel card" role="dialog" aria-label="家長專區">
        <div className="panel-head">
          <span className="ribbon" style={{ background: '#2b2a4c' }}>
            家長專區
          </span>
          <h2 />
          <button className="btn small white" onClick={back} data-testid="parent-back">
            返回
          </button>
        </div>
        {!pass ? (
          <PinGate onPass={() => setPass(true)} />
        ) : (
          <>
            <div className="tabs">
              {tabs.map((t) => (
                <button key={t.id} className={`btn small white ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}>
                  {t.name}
                </button>
              ))}
              {(tab === 'report' || tab === 'wrong' || tab === 'curriculum' || tab === 'class') && profiles.length > 1 && (
                <select value={pid} onChange={(e) => setPid(e.target.value)} style={{ fontSize: 18, marginLeft: 'auto' }}>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="panel-body">
              {tab === 'report' && (profile ? <ReportTab profile={profile} /> : <p className="plain">還沒有角色。</p>)}
              {tab === 'wrong' && (profile ? <WrongTab profile={profile} /> : <p className="plain">還沒有角色。</p>)}
              {tab === 'curriculum' && (profile ? <CurriculumTab profile={profile} /> : <p className="plain">請先建立角色。</p>)}
              {tab === 'class' && (profile ? <ClassTab profile={profile} /> : <p className="plain">請先建立角色。</p>)}
              {tab === 'settings' && <SettingsTab />}
              {tab === 'packs' && <PacksTab />}
              {tab === 'backup' && <BackupTab />}
              {tab === 'sources' && <SourcesTab />}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
