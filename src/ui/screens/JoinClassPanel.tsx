/**
 * 加入班級面板（docs/plans/class-join.md；L2 家長自動化，docs/plans/login-ux-review.md）：家長掃老師的 QR code（?join=代碼），
 * 或在孩子清單按「🏫 加入班級」之後，帳號頁最上面出現這個面板。怎麼做由 joinPlan 決定：
 * - 只有一個家長名下、可以用的角色：自動加入、在這台裝置玩、進那一班的班級島（顯示「正在讓○○加入…」，不用按按鈕）。
 * - 沒有角色：直接出現新建角色的表單。
 * - 其他：卡片，點一下就加入並進島。
 * 暱稱預設是角色的名字，和班上的人撞名時才展開暱稱欄位。不用密碼（孩子要用班級代碼登入時，老師在管理頁幫他設）。
 * 多班級（docs/plans/multi-class.md）：已經在別班的孩子也能加入（最多 5 個班級）；已經在這一班的點了直接進島。
 * 元素都有 data-testid（e2e 與之後的家長指引會用）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount } from '../../online/useAccount';
import { cloudDeps, useCloud } from '../../online/useCloud';
import { getToken } from '../../online/storage';
import { syncProfile } from '../../online/cloudSync';
import { joinCandidates, joinPlan, type JoinCandidate } from '../../online/joinPlan';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { classesOf } from '../../store/island';
import { addProfile, createEmptySave, type AvatarConfig } from '../../store/save';
import { MAX_CLASSES, kidRooms, type ClassLookupResponse, type KidSummary, type ParentKidsResponse, type SessionResponse } from '../../online/protocol';
import { ApiFailure } from '../../online/api';
import { ANIMALS, COLORS } from './ProfilesScreen';
import { AnimalIcon } from '../AnimalIcon';
import { teleport } from '../../world/input';
import { SPAWN } from '../../world/layout';
import { speak } from '../../audio/speech';
import { enterIslandLine } from '../lines';

/**
 * 要加入（或直接進入）的角色：家長名下的（member 是已經在這一班），或這台裝置上還沒存到雲端的（先存到家長帳號）
 */
type Target = { kind: 'cloud'; kidId: string; name: string; member: boolean } | { kind: 'local'; profileId: string; name: string };

/** 錯誤訊息 */
const messageOf = (err: unknown) => (err instanceof ApiFailure || err instanceof Error ? err.message : '出了點問題，再試一次');

/** 候選角色 → 要加入的角色 */
const targetOf = (c: JoinCandidate): Target =>
  c.kind === 'cloud' ? { kind: 'cloud', kidId: c.kid.id, name: c.kid.name, member: c.member } : { kind: 'local', profileId: c.profile.id, name: c.profile.name };

/** 卡片上的說明：已經在這一班、已經滿了、老師沒開放、也在別班、還沒加入班級 */
function candidateNote(c: JoinCandidate): string {
  if (c.kind === 'local') return c.blocked === 'closed' ? '老師目前沒有開放加入' : '這台裝置上的角色（存到你的帳號並加入）';
  if (c.member) return '已經在這一班（點一下進入）';
  if (c.blocked === 'full') return `已經有 ${MAX_CLASSES} 個班級（要先退出一個）`;
  if (c.blocked === 'closed') return '老師目前沒有開放加入';
  const rooms = kidRooms(c.kid);
  return rooms.length ? `也在「${rooms.map((r) => r.name).join('、')}」` : '還沒加入班級';
}

export function JoinClassPanel() {
  const joining = useAccount((s) => s.joining);
  const setJoining = useAccount((s) => s.setJoining);
  const call = useAccount((s) => s.call);
  const session = useAccount((s) => s.session);
  const user = useAccount((s) => s.user);
  const profiles = useGame((s) => s.save.profiles);
  const goto = useUi((s) => s.goto);
  /** 班級名稱與是否開放加入 */
  const [info, setInfo] = useState<ClassLookupResponse | null>(null);
  /** 家長名下的角色（還沒讀到是 null） */
  const [kids, setKids] = useState<KidSummary[] | null>(null);
  /** 正在加入並進島的角色名字（顯示「正在讓○○加入…」） */
  const [running, setRunning] = useState<string | null>(null);
  /** 撞名：要家長換一個暱稱的角色與目前填的暱稱 */
  const [manual, setManual] = useState<{ target: Target; nickname: string } | null>(null);
  /** 卡片模式下按了「新建角色」 */
  const [creating, setCreating] = useState(false);
  /** 新建角色的名字與外觀 */
  const [newName, setNewName] = useState('');
  const [avatar, setAvatar] = useState<AvatarConfig>({ animal: 'bear', color: COLORS[0], hat: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 已經自動跑過的班級代碼：同一個加入連結只自動一次（加上家長身分、重新讀清單時不會再跑一次） */
  const autoDone = useRef<string | null>(null);
  const code = joining?.code ?? '';
  const isParent = !!user?.parent;
  const roomName = info?.room.name ?? code;

  const load = useCallback(async () => {
    if (!code) return;
    try {
      setInfo(await call<ClassLookupResponse>('GET', `/api/parent/classes/${code}`));
      if (isParent) setKids((await call<ParentKidsResponse>('GET', '/api/parent/kids')).kids);
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call, code, isParent]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 加入面板怎麼做（資料讀到之前是 null） */
  const planInput = info && kids ? { code, joinOpen: info.joinOpen, kids, localProfiles: profiles, preferredKidId: joining?.kidId } : null;
  const plan = planInput ? joinPlan(planInput) : null;
  const candidates = planInput ? joinCandidates(planInput) : [];

  /**
   * 在這台裝置進那一班的班級島：這台已經有這個角色就選它（先同步拿到剛加入的班級），不然拿這台裝置的權杖
   */
  const enter = async (kidId: string, name: string) => {
    if (!session) return;
    const here = profiles.find((p) => p.cloud?.accountId === kidId && getToken(kidId));
    let profileId: string;
    if (here) {
      useGame.getState().selectProfile(here.id);
      profileId = here.id;
      await useCloud.getState().syncNow();
      // syncNow 在另一次同步進行中時會馬上返回：還沒拿到這一班就直接同步這個角色
      const now = useGame.getState().save.profiles.find((p) => p.id === profileId) ?? null;
      if (!classesOf(now).some((r) => r.code === code)) await syncProfile(cloudDeps, profileId).catch(() => undefined);
    } else profileId = (await useCloud.getState().playOnThisDevice(kidId, session.server, session.token)).id;
    useGame.getState().setIsland(profileId, code);
    setJoining(null);
    teleport(SPAWN);
    speak(enterIslandLine(name));
    goto('island');
  };

  /**
   * 加入並進島：這台裝置上的角色先存到家長帳號；已經在這一班的直接進島。
   * 暱稱撞名時展開暱稱欄位（剛存到雲端的角色記成雲端角色，再按一次不會重複上傳）
   */
  const go = async (start: Target, nickname?: string) => {
    if (!session) return;
    let target = start;
    setBusy(true);
    setRunning(start.name);
    setError(null);
    try {
      if (target.kind === 'local') {
        const uploaded = await useCloud.getState().uploadToCloud(target.profileId, session.server, session.token);
        target = { kind: 'cloud', kidId: uploaded.cloud!.accountId, name: target.name, member: false };
      }
      if (!target.member) await call('POST', `/api/parent/kids/${target.kidId}/class`, { code, nickname: (nickname ?? target.name).trim() });
      await enter(target.kidId, target.name);
    } catch (err) {
      if (err instanceof ApiFailure && err.code === 'nickname_taken') setManual({ target, nickname: nickname ?? target.name });
      setError(messageOf(err));
      setRunning(null);
      setBusy(false);
    }
  };

  /** 新建角色：建在家長帳號下（不放進這台裝置的存檔，加入後在這台裝置玩時才下載），再加入並進島 */
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const profile = addProfile(createEmptySave(), { name: newName.trim(), avatar }, new Date()).profiles[0];
      const kidId = (await call<SessionResponse>('POST', '/api/parent/kids', { profile })).account.id;
      setCreating(false);
      await go({ kind: 'cloud', kidId, name: newName.trim(), member: false });
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  // 只有一個家長名下、可以用的角色：自動加入並進島（同一個加入連結只跑一次）
  useEffect(() => {
    if (plan?.kind !== 'auto' || autoDone.current === code || !session) return;
    autoDone.current = code;
    void go(targetOf(plan.candidate));
    // go 每次重畫都是新的函式；只看計畫、要自動的角色與班級代碼
  }, [plan?.kind, plan?.kind === 'auto' ? plan.candidate.kid.id : null, code, session]);

  // 換了一個加入連結（家長頁的「加入班級」，不重新載入頁面）：上一次的進行狀態、撞名與錯誤都清掉
  useEffect(() => {
    setRunning(null);
    setManual(null);
    setCreating(false);
    setBusy(false);
    setError(null);
  }, [code]);

  if (!joining) return null;
  /** 自動加入還沒開始（effect 下一輪才跑）也先顯示「正在…」 */
  const autoPending = plan?.kind === 'auto' && autoDone.current !== code;
  const showCreate = !manual && (plan?.kind === 'create' || creating);
  const newOk = newName.trim().length > 0 && [...newName.trim()].length <= 12;
  const nicknameOk = !!manual && manual.nickname.trim().length > 0 && [...manual.nickname.trim()].length <= 12;

  return (
    <div className="panel-body plain join-class" data-testid="join-class">
      <div className="join-class-head">
        <h3 style={{ margin: 0 }} data-testid="join-class-title">
          🏫 加入班級{info ? `「${info.room.name}」` : ''}（代碼 {code}）
        </h3>
        <button className="btn small white" onClick={() => setJoining(null)} data-testid="join-cancel">
          取消
        </button>
      </div>

      {!isParent ? (
        <div data-testid="join-not-parent">
          <p className="notice">要讓孩子加入班級，這個帳號要有家長身分。</p>
          <button
            className="btn green"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              useAccount
                .getState()
                .update({ parent: true })
                .catch((err: unknown) => setError(messageOf(err)))
                .finally(() => setBusy(false));
            }}
            data-testid="join-add-parent"
          >
            加上家長身分並繼續
          </button>
          {/* 老師帳號已登入的學校平板掃到 QR code（L3）：改走教室密碼看名單；joining 留著讓教室密碼畫面預填代碼 */}
          <p className="notice" style={{ margin: '10px 0 0' }}>這台是學校的平板、老師在旁邊？不用家長身分，輸入教室密碼就能看到班上名單：</p>
          <button className="btn small white" disabled={busy} onClick={() => goto('classroom')} data-testid="join-classroom">
            👩‍🏫 老師輸入教室密碼
          </button>
        </div>
      ) : running || autoPending ? (
        <p className="notice" data-testid="join-auto">
          正在讓「{running ?? (plan?.kind === 'auto' ? plan.candidate.kid.name : '')}」加入「{roomName}」，馬上進入班級島…
        </p>
      ) : plan === null ? (
        <p>讀取中…</p>
      ) : manual ? (
        <div className="join-nickname">
          <label>
            「{manual.target.name}」在班上的暱稱（和班上的人重複了，換一個）{' '}
            <input
              className="text-input"
              maxLength={12}
              value={manual.nickname}
              onChange={(e) => setManual({ ...manual, nickname: e.target.value })}
              data-testid="join-nickname"
            />
          </label>
          <button className="btn green" disabled={busy || !nicknameOk} onClick={() => void go(manual.target, manual.nickname.trim())} data-testid="join-submit">
            用這個暱稱加入「{roomName}」
          </button>
        </div>
      ) : (
        <>
          {info && !info.joinOpen && (
            <p className="notice" data-testid="join-closed">
              老師目前沒有開放加入。請老師在管理頁打開「允許新的孩子加入」，再按一次「加入」。
            </p>
          )}
          {showCreate ? (
            <div className="join-new" data-testid="join-new-form">
              <p style={{ margin: 0 }}>{plan.kind === 'create' ? '還沒有孩子的角色：取名字、選外觀，就加入並進入班級島。' : '新建一個角色：'}</p>
              <label>
                名字{' '}
                <input className="text-input" maxLength={12} value={newName} onChange={(e) => setNewName(e.target.value)} data-testid="join-new-name" />
              </label>
              <div className="join-animals">
                {ANIMALS.map((a) => (
                  <button key={a.id} className={`join-animal ${avatar.animal === a.id ? 'on' : ''}`} onClick={() => setAvatar({ ...avatar, animal: a.id })} aria-label={a.name}>
                    <AnimalIcon animal={a.id} />
                  </button>
                ))}
              </div>
              <div className="join-animals">
                {COLORS.map((c) => (
                  <button key={c} className={`join-color ${avatar.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setAvatar({ ...avatar, color: c })} aria-label={`顏色 ${c}`} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn green" disabled={busy || !newOk || !info?.joinOpen} onClick={() => void create()} data-testid="join-submit">
                  建立並加入「{roomName}」
                </button>
                {plan.kind !== 'create' && (
                  <button className="btn small white" onClick={() => setCreating(false)}>
                    返回
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p style={{ margin: '6px 0' }}>點一下孩子，就加入並進入班級島（不用密碼）：</p>
              <div className="join-choices">
                {candidates.map((c) => (
                  <button
                    key={c.kind === 'cloud' ? c.kid.id : c.profile.id}
                    className="join-choice"
                    disabled={busy || c.blocked !== null}
                    onClick={() => void go(targetOf(c))}
                    data-testid={c.kind === 'cloud' ? `join-kid-${c.kid.name}` : `join-local-${c.profile.name}`}
                  >
                    <span className="avatar-dot" style={{ background: (c.kind === 'cloud' ? c.kid.avatar : c.profile.avatar).color }}>
                      <AnimalIcon animal={(c.kind === 'cloud' ? c.kid.avatar : c.profile.avatar).animal} />
                    </span>
                    <b>{c.kind === 'cloud' ? c.kid.name : c.profile.name}</b>
                    <small>{candidateNote(c)}</small>
                  </button>
                ))}
                <button className="join-choice" disabled={busy || !info?.joinOpen} onClick={() => setCreating(true)} data-testid="join-new">
                  <span className="avatar-dot">➕</span>
                  <b>新建角色</b>
                  <small>取名字、選外觀</small>
                </button>
              </div>
            </>
          )}
        </>
      )}
      {error && (
        <p className="gift-error" role="alert" data-testid="join-error">
          {error}
        </p>
      )}
    </div>
  );
}
