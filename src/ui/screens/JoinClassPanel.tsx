/**
 * 加入班級面板（docs/plans/class-join.md）：家長掃老師的 QR code（?join=代碼），或在孩子清單按「🏫 加入班級」之後，
 * 帳號頁最上面出現這個面板。選一個角色（家長名下的雲端角色、這台裝置上的角色、或新建一個），設定班上的暱稱就加入，
 * 不用密碼（孩子要用班級代碼登入時，老師在管理頁幫他設）。加入後可以直接在這台裝置玩。
 * 元素都有 data-testid（e2e 與之後的家長指引會用）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useAccount } from '../../online/useAccount';
import { useCloud } from '../../online/useCloud';
import { getToken } from '../../online/storage';
import { useGame } from '../../store/useGame';
import { useUi } from '../../store/useUi';
import { addProfile, createEmptySave, type AvatarConfig, type Profile } from '../../store/save';
import type { ClassLookupResponse, KidSummary, ParentJoinClassResponse, ParentKidsResponse, SessionResponse } from '../../online/protocol';
import { ApiFailure } from '../../online/api';
import { ANIMALS, COLORS } from './ProfilesScreen';
import { AnimalIcon } from '../AnimalIcon';
import { teleport } from '../../world/input';
import { SPAWN } from '../../world/layout';
import { speak } from '../../audio/speech';
import { enterIslandLine } from '../lines';

/** 要加入的角色：家長名下的雲端角色、這台裝置上的角色（先存到雲端）、或新建一個 */
type Choice = { kind: 'cloud'; kid: KidSummary } | { kind: 'local'; profile: Profile } | { kind: 'new' };

/** 錯誤訊息 */
const messageOf = (err: unknown) => (err instanceof ApiFailure || err instanceof Error ? err.message : '出了點問題，再試一次');

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
  /** 家長名下的雲端角色 */
  const [kids, setKids] = useState<KidSummary[] | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  /** 班上的暱稱（預設是角色的名字） */
  const [nickname, setNickname] = useState('');
  /** 新建角色的名字與外觀 */
  const [newName, setNewName] = useState('');
  const [avatar, setAvatar] = useState<AvatarConfig>({ animal: 'bear', color: COLORS[0], hat: null });
  /** 加入成功的角色 */
  const [done, setDone] = useState<KidSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = joining?.code ?? '';
  const isParent = !!user?.parent;

  const load = useCallback(async () => {
    if (!code) return;
    try {
      setInfo(await call<ClassLookupResponse>('GET', `/api/parent/classes/${code}`));
      if (isParent) {
        const list = (await call<ParentKidsResponse>('GET', '/api/parent/kids')).kids;
        setKids(list);
        // 從孩子清單按「加入班級」進來的：先選好那個角色
        const pre = joining?.kidId ? list.find((k) => k.id === joining.kidId && !k.room) : undefined;
        if (pre) {
          setChoice({ kind: 'cloud', kid: pre });
          setNickname(pre.name);
        }
      }
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
  }, [call, code, isParent, joining?.kidId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!joining) return null;

  /** 選一個角色：暱稱預設是名字 */
  const pick = (c: Choice) => {
    setChoice(c);
    setNickname(c.kind === 'cloud' ? c.kid.name : c.kind === 'local' ? c.profile.name : newName);
    setError(null);
  };

  /** 加入班級：需要的話先把角色存到雲端（這台裝置上的角色、新建的角色） */
  const join = async () => {
    if (!choice || !session) return;
    setBusy(true);
    setError(null);
    try {
      let kidId: string;
      if (choice.kind === 'cloud') kidId = choice.kid.id;
      else if (choice.kind === 'local') kidId = (await useCloud.getState().uploadToCloud(choice.profile.id, session.server, session.token)).cloud!.accountId;
      else {
        // 新建的角色直接建在雲端（不放進這台裝置的存檔；要在這台玩時按「在這台裝置玩」）
        const profile = addProfile(createEmptySave(), { name: newName.trim(), avatar }, new Date()).profiles[0];
        kidId = (await call<SessionResponse>('POST', '/api/parent/kids', { profile })).account.id;
      }
      const r = await call<ParentJoinClassResponse>('POST', `/api/parent/kids/${kidId}/class`, { code, nickname: nickname.trim() });
      setDone(r.kid);
      // 這台裝置上有這個角色：同步一次，本機就知道加入了班級
      if (profiles.some((p) => p.cloud?.accountId === kidId)) void useCloud.getState().syncNow();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  /** 在這台裝置玩：這台已經有這個角色就直接選它，不然拿這台裝置的權杖；然後進島 */
  const play = async (kid: KidSummary) => {
    if (!session) return;
    setBusy(true);
    try {
      const here = profiles.find((p) => p.cloud?.accountId === kid.id && getToken(kid.id));
      if (here) useGame.getState().selectProfile(here.id);
      else await useCloud.getState().playOnThisDevice(kid.id, session.server, session.token);
      setJoining(null);
      teleport(SPAWN);
      speak(enterIslandLine(kid.name));
      goto('island');
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };

  const localOnly = profiles.filter((p) => !p.cloud && !kids?.some((k) => k.profileId === p.id));
  const nicknameOk = nickname.trim().length > 0 && [...nickname.trim()].length <= 12;
  const newOk = newName.trim().length > 0;

  return (
    <div className="panel-body plain join-class" data-testid="join-class">
      <div className="join-class-head">
        <h3 style={{ margin: 0 }} data-testid="join-class-title">
          🏫 加入班級{info ? `「${info.room.name}」` : ''}（代碼 {code}）
        </h3>
        <button className="btn small white" onClick={() => setJoining(null)} data-testid="join-cancel">
          {done ? '完成' : '取消'}
        </button>
      </div>

      {done ? (
        <div data-testid="join-done">
          <p className="notice">
            「{done.name}」已經加入「{done.room?.name}」了！孩子的平板會自動同步，下次打開就在班級裡。
          </p>
          <p>如果孩子要用學校的平板以「班級代碼＋暱稱」登入，請老師在管理頁幫他設定密碼。</p>
          <button className="btn green" disabled={busy} onClick={() => void play(done)} data-testid="join-play">
            {profiles.some((p) => p.cloud?.accountId === done.id) ? '▶ 開始玩' : '▶ 在這台裝置玩'}
          </button>
        </div>
      ) : !isParent ? (
        <p className="notice" data-testid="join-not-parent">
          這個帳號沒有家長身分。請按上面的「⚙️ 帳號設定」勾選「家長」，再回到這裡選孩子加入。
        </p>
      ) : (
        <>
          {info && !info.joinOpen && (
            <p className="notice" data-testid="join-closed">
              老師目前沒有開放加入。請老師在管理頁打開「允許新的孩子加入」，再按一次「加入」。
            </p>
          )}
          <p style={{ margin: '6px 0' }}>選要加入的孩子（不用密碼）：</p>
          <div className="join-choices">
            {(kids ?? []).map((k) => {
              const here = k.room?.code === code;
              return (
                <button
                  key={k.id}
                  className={`join-choice ${choice?.kind === 'cloud' && choice.kid.id === k.id ? 'on' : ''}`}
                  disabled={!!k.room}
                  onClick={() => pick({ kind: 'cloud', kid: k })}
                  data-testid={`join-kid-${k.name}`}
                >
                  <span className="avatar-dot" style={{ background: k.avatar.color }}>
                    <AnimalIcon animal={k.avatar.animal} />
                  </span>
                  <b>{k.name}</b>
                  <small>{here ? '已經在這一班' : k.room ? `在「${k.room.name}」（要先退出才能換班）` : '☁️ 雲端角色'}</small>
                </button>
              );
            })}
            {localOnly.map((p) => (
              <button
                key={p.id}
                className={`join-choice ${choice?.kind === 'local' && choice.profile.id === p.id ? 'on' : ''}`}
                onClick={() => pick({ kind: 'local', profile: p })}
                data-testid={`join-local-${p.name}`}
              >
                <span className="avatar-dot" style={{ background: p.avatar.color }}>
                  <AnimalIcon animal={p.avatar.animal} />
                </span>
                <b>{p.name}</b>
                <small>這台裝置上的角色（存到雲端並加入）</small>
              </button>
            ))}
            <button className={`join-choice ${choice?.kind === 'new' ? 'on' : ''}`} onClick={() => pick({ kind: 'new' })} data-testid="join-new">
              <span className="avatar-dot">➕</span>
              <b>新建角色</b>
              <small>取名字、選外觀</small>
            </button>
          </div>

          {choice?.kind === 'new' && (
            <div className="join-new" data-testid="join-new-form">
              <label>
                名字{' '}
                <input
                  className="text-input"
                  maxLength={12}
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value);
                    setNickname(e.target.value);
                  }}
                  data-testid="join-new-name"
                />
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
            </div>
          )}

          {choice && (
            <div className="join-nickname">
              <label>
                班上的暱稱{' '}
                <input className="text-input" maxLength={12} value={nickname} onChange={(e) => setNickname(e.target.value)} data-testid="join-nickname" />
              </label>
              <button
                className="btn green"
                disabled={busy || !nicknameOk || (choice.kind === 'new' && !newOk) || (info !== null && !info.joinOpen)}
                onClick={() => void join()}
                data-testid="join-submit"
              >
                加入「{info?.room.name ?? code}」
              </button>
            </div>
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
