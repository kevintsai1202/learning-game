/**
 * 比賽用的示範班級資料（docs/award/apcea-2026/README.md）：錄影腳本（demo.award.ts）與正式站的示範帳號（seed-demo.mjs）共用。
 * 建一位老師、一個班級、6 個示範孩子，並用同步 API 送作答紀錄，讓學習分析的雷達圖與弱項指標有內容。
 * 作答是程式產生的示範資料（不是真的孩子），全班最弱的是「鐘面的時刻」（math:N-2-13），閱讀次之。
 * 只用 Node 內建的 fetch，不依賴測試框架。
 */

/** 示範孩子：暱稱、4 位數密碼、角色外觀、各指標的「作答題數、一次答對題數」 */
export const DEMO_KIDS = [
  {
    nickname: '阿寶',
    pin: '1111',
    avatar: { animal: 'cat', color: '#ffb347', hat: null },
    scores: { 'math:N-2-7': [12, 11], 'math:N-2-13': [10, 3], 'math:N-2-2': [10, 9], 'math:S-2-2': [8, 7], 'zh:Aa-Ⅰ-1': [10, 8], 'zh:4-Ⅰ-1': [10, 7], 'zh:Ab-Ⅰ-6': [8, 4], 'en:Aa-Ⅱ-1': [10, 9], 'life:Ea-Ⅰ-1': [8, 7] },
  },
  {
    nickname: '小美',
    pin: '2222',
    avatar: { animal: 'rabbit', color: '#f7c6d9', hat: null },
    scores: { 'math:N-2-7': [10, 5], 'math:N-2-13': [10, 6], 'math:N-2-2': [10, 8], 'zh:Aa-Ⅰ-1': [10, 10], 'zh:4-Ⅰ-1': [10, 9], 'zh:Ab-Ⅰ-6': [10, 8], 'en:Aa-Ⅱ-1': [8, 8], 'life:Ba-Ⅰ-1': [8, 8] },
  },
  {
    nickname: '小翔',
    pin: '3333',
    avatar: { animal: 'fox', color: '#f2b36b', hat: null },
    scores: { 'math:N-2-7': [10, 9], 'math:N-2-13': [10, 4], 'math:N-2-2': [12, 11], 'math:S-2-2': [6, 5], 'zh:Aa-Ⅰ-1': [8, 6], 'zh:Ab-Ⅰ-6': [8, 3], 'life:Ea-Ⅰ-1': [6, 5] },
  },
  {
    nickname: '小晴',
    pin: '4444',
    avatar: { animal: 'panda', color: '#5b5b6b', hat: null },
    scores: { 'math:N-2-7': [10, 8], 'math:N-2-13': [10, 5], 'zh:Aa-Ⅰ-1': [10, 9], 'zh:4-Ⅰ-1': [10, 8], 'zh:Ab-Ⅰ-6': [10, 6], 'en:Aa-Ⅱ-1': [10, 7], 'life:Ba-Ⅰ-1': [6, 6] },
  },
  {
    nickname: '阿哲',
    pin: '5555',
    avatar: { animal: 'dog', color: '#c28b55', hat: null },
    scores: { 'math:N-2-7': [8, 6], 'math:N-2-13': [8, 4], 'math:N-2-2': [10, 7], 'zh:Aa-Ⅰ-1': [10, 7], 'zh:4-Ⅰ-1': [8, 5], 'en:Aa-Ⅱ-1': [6, 5], 'life:Ea-Ⅰ-1': [6, 6] },
  },
  {
    nickname: '小芸',
    pin: '6666',
    avatar: { animal: 'penguin', color: '#9aa4b2', hat: null },
    scores: { 'math:N-2-7': [10, 10], 'math:N-2-13': [10, 7], 'math:N-2-2': [10, 10], 'math:S-2-2': [8, 8], 'zh:Aa-Ⅰ-1': [10, 9], 'zh:Ab-Ⅰ-6': [10, 7], 'en:Aa-Ⅱ-1': [10, 10], 'life:Ba-Ⅰ-1': [8, 7] },
  },
];

/** 科目 → 寫進作答紀錄的活動代碼（遊戲裡真的有的活動） */
const ACTIVITY = { math: 'math.times', zh: 'zh.reading', en: 'en.letter-write', life: 'life.recycle3d' };

/** 呼叫班級伺服器的 API，失敗就丟錯（帶回應內容） */
async function api(server, path, { token, body, method = 'POST' } = {}) {
  const res = await fetch(`${server}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

/** 一個孩子的全部作答：每個指標一回合（題目是示範用的數字題，答對與否照 scores） */
function sessionsOf(kid) {
  const now = Date.now();
  return Object.entries(kid.scores).map(([key, [total, firstTry]], i) => {
    const [subject, code] = key.split(':');
    const answers = Array.from({ length: total }, (_, j) => ({
      question: { id: `demo-${code}-${j}-${Math.random().toString(36).slice(2, 6)}`, subject, skill: `${subject}.demo`, indicators: [code], type: 'number', prompt: `${j} + 1 = ?`, answer: j + 1 },
      correct: true,
      firstTry: j < firstTry,
    }));
    return {
      id: `demo-${now}-${i}-${Math.random().toString(36).slice(2, 8)}`,
      // 作答時間往前錯開，報告裡看起來是這幾天陸續練習的
      at: new Date(now - (Object.keys(kid.scores).length - i) * 3_600_000 * 7).toISOString(),
      kind: 'session',
      result: { activityId: ACTIVITY[subject], subject, total, correct: firstTry, stars: 1, coins: 0, seconds: 30 * total, answers },
    };
  });
}

/**
 * 建老師、班級、示範孩子與作答。回傳班級代碼、老師權杖與每個孩子的權杖。
 * opts：server（班級伺服器網址）、username、password、email、className。
 */
export async function seedClass({ server, username, password, email, className }) {
  const reg = await api(server, '/api/users', { body: { username, password, email, parent: false, teacher: true } });
  const room = await api(server, '/api/teacher/rooms', { token: reg.token, body: { name: className } });
  const code = room.room.code;
  const kids = {};
  for (const kid of DEMO_KIDS) {
    const joined = await api(server, '/api/join', { body: { code, nickname: kid.nickname, pin: kid.pin, avatar: kid.avatar } });
    kids[kid.nickname] = joined.token;
    await api(server, '/api/ops', { token: joined.token, body: { ops: sessionsOf(kid) } });
  }
  return { code, token: reg.token, username, kids };
}
