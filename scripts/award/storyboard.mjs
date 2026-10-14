/**
 * 比賽展示影片的分鏡表（約 4 分鐘）：配音腳本（narration.mjs）與剪接腳本（edit.mjs）共用。
 * 每一段：
 * - kind：card（字卡，edit.mjs 用 HTML 畫）、image（整張圖，例如架構圖）、clip（錄影片段，demo.award.ts 錄的）
 * - clip 的 dev／seg：哪台裝置的哪一段（award-out/rec/<dev>/<seg>/）；可以接好幾段（segs）
 * - fast：要快轉的時間點（marks.json 的「片段:事件」起訖）與倍率，畫面右上角標「快轉」與實際等待秒數（label 可以換掉這句）
 * - lines：旁白，一句一個語音檔；text 是字幕，say 是給語音合成的唸法（數字、英文縮寫要唸得自然時才給）；
 *   at 是錄影裡的時間點（marks.json 的「片段:事件」），這句最早從畫面走到那裡時才開始唸
 * - keepSpeed：這段不加速（有遊戲朗讀的段落，加速會讓朗讀和畫面對不上）
 * 讀音修正（使用者 2026-10-14 看第一版影片後指出）：建築的築唸二聲（同音字「竹」）；識字、辨識的識唸四聲（讀音標記 shi4，
 * 同音字找不到語意自然的）；句首的「AI」唸得怪，改寫成 AI 在句中（其他句中的 AI 沒有問題）。
 */
import { phonemeTag } from '../voice/rules.mjs';

/** 識要唸四聲（台灣讀音 ㄕˋ；模型預設唸二聲） */
const SHI4 = phonemeTag('shi4');

export const STORYBOARD = [
  {
    id: 'title',
    kind: 'card',
    card: { title: '知識島大冒險', sub: '給國小二年級的 AI 適性學習島', note: '會依課綱出題、會分析弱點，陪孩子邊玩邊學' },
    lines: [{ text: '知識島大冒險，是給國小二年級的 AI 適性學習島。' }],
  },
  {
    id: 'problem',
    kind: 'card',
    card: {
      title: '我們想解決的問題',
      bullets: ['🧒 孩子還在學注音，很多題目讀不懂', '🧑‍🏫 老師要依課綱出題，還要找出每個孩子的弱點', '👨‍👩‍👧 家長只看得到分數，不知道怎麼陪練'],
    },
    lines: [
      { text: '二年級的孩子還在學注音，很多題目讀不懂；' },
      { text: '老師要依課綱出題，還要找出每個孩子卡在哪裡；' },
      { text: '家長只看得到分數，不知道怎麼陪練。' },
    ],
  },
  {
    id: 'island',
    kind: 'clip',
    dev: 'kid',
    segs: ['island'],
    lines: [
      { text: '孩子用平板打開網頁，就能操控小動物在 3D 小島上冒險。', say: '孩子用平板打開網頁，就能操控小動物，在立體的小島上冒險。' },
      { text: '每棟建築是一個科目：國語、數學、英語、生活都有。', say: '每棟建竹是一個科目：國語、數學、英語、生活都有。' },
    ],
  },
  {
    id: 'quiz',
    kind: 'clip',
    dev: 'kid',
    segs: ['quiz'],
    keepSpeed: true,
    lines: [
      { at: 'quiz:spoken', text: '介面和大部分題目都有 AI 合成的語音朗讀，還不太識字的孩子也能自己玩。', say: `介面和大部分題目都有 AI 合成的語音朗讀，還不太${SHI4}字的孩子也能自己玩。` },
      { text: '每一題都標了 108 課綱指標，記下孩子哪個能力答對、哪個答錯。', say: '每一題都標了一零八課綱指標，記下孩子哪個能力答對、哪個答錯。' },
    ],
  },
  {
    id: 'aiSetup',
    kind: 'clip',
    dev: 'teacher',
    segs: ['login', 'aiSetup'],
    caption: '老師端｜AI 出題',
    lines: [
      { text: '老師登入班級頁，打開「AI 出題」。', at: 'login:start' },
      { text: '勾選課綱指標，可以跨科：數學的十十乘法，加上生活的常見食物，', at: 'aiSetup:start' },
      { text: '再補一句主題：中秋節。', at: 'aiSetup:note' },
    ],
  },
  {
    id: 'aiRun',
    kind: 'clip',
    dev: 'teacher',
    segs: ['aiRun'],
    fast: [{ from: 'aiRun:wait', to: 'aiRun:done', factor: 10 }],
    caption: '老師端｜AI 出題',
    lines: [
      { text: '伺服器把課綱條文和出題規則交給雲端的高階 AI 模型，用固定的結構拿回題目。', say: '伺服器把課綱條文和出題規則，交給雲端的高階 AI 模型，用固定的結構拿回題目。' },
      { text: '程式再重算每一題的算式，檢查答案、課綱範圍和注音用字，不合格的直接丟掉。' },
    ],
  },
  {
    id: 'review',
    kind: 'clip',
    dev: 'teacher',
    segs: ['review'],
    caption: '老師端｜審核與發佈',
    lines: [
      { text: 'AI 出的只是草稿：老師逐題審核，可以修改、刪除或單題重出，' },
      { text: '確認後發佈，班上孩子的平板馬上就收到。', at: 'review:save' },
    ],
  },
  {
    id: 'pack',
    kind: 'clip',
    dev: 'kid',
    segs: ['pack'],
    keepSpeed: true,
    caption: '孩子端｜班級題庫',
    lines: [{ text: '孩子走進挑戰塔，就看到老師剛出的班級題庫。' }],
  },
  {
    id: 'analysis',
    kind: 'clip',
    dev: 'teacher',
    segs: ['analysis'],
    caption: '老師端｜學習分析',
    lines: [
      { text: '作答累積起來，系統把 140 多個課綱指標整理成 9 個學習面向，畫成雷達圖；', say: '作答累積起來，系統把一百四十多個課綱指標，整理成九個學習面向，畫成雷達圖；' },
      { text: '老師一眼看出全班的弱項，也能疊上個別孩子的表現。', at: 'analysis:member' },
    ],
  },
  {
    id: 'analysisAi',
    kind: 'clip',
    dev: 'teacher',
    segs: ['analysisAi'],
    fast: [{ from: 'analysisAi:wait', to: 'analysisAi:done', factor: 8 }],
    caption: '老師端｜AI 分析',
    lines: [
      { text: '按下「AI 分析全班」，送給 AI 的只有匿名統計，沒有任何姓名。' },
      { text: 'AI 寫出全班的分析與教學建議；', at: 'analysisAi:done' },
      { text: '老師再按一下，弱項指標自動帶進 AI 出題，形成「分析、出題、作答、再分析」的閉環。', at: 'analysisAi:loop' },
    ],
  },
  {
    id: 'report',
    kind: 'clip',
    dev: 'kid',
    segs: ['report'],
    keepSpeed: true,
    fast: [{ from: 'report:wait', to: 'report:done', factor: 8 }],
    caption: '孩子端｜學習報告',
    lines: [
      { text: '孩子也有自己的學習報告：AI 寫的鼓勵和建議，按喇叭就唸給他聽。', at: 'report:done' },
      { text: '給孩子看的句子由伺服器把關，不能有比較或貼標籤的字；不合格就改用固定的建議。', at: 'report:said' },
    ],
  },
  {
    id: 'parent',
    kind: 'clip',
    dev: 'kid',
    segs: ['parent'],
    fast: [{ from: 'parent:start', to: 'parent:pin', factor: 4, label: '⏩ 快轉（設定家長密碼）' }],
    caption: '家長端｜學習分析',
    lines: [{ text: '家長在家長專區，看到寫給大人的摘要和在家陪練的方法。', at: 'parent:pin' }],
  },
  {
    id: 'loop',
    kind: 'image',
    image: 'award-out/知識島大冒險-AI閉環.png',
    lines: [{ text: '先由 AI 出題、老師把關，孩子作答後再由 AI 分析，又回到出題：整個服務的核心就是 AI。' }],
  },
  {
    id: 'arch',
    kind: 'image',
    image: 'award-out/知識島大冒險-架構圖.png',
    lines: [
      { text: '前端是免安裝的網頁，班級伺服器負責即時同步與 AI 工作；', say: '前端是免安裝的網頁；班級伺服器負責即時同步與 AI 工作；' },
      { text: '3,500 多句語音由 AI 合成，再用語音辨識抽查讀音。', say: `三千五百多句語音由 AI 合成，再用語音辨${SHI4}抽查讀音。` },
    ],
  },
  {
    id: 'end',
    kind: 'card',
    card: {
      title: '知識島大冒險',
      sub: '已上線・免費・免安裝',
      bullets: ['learning-island.zeabur.app'],
    },
    lines: [{ text: '知識島大冒險已經上線，免費使用。讓 AI 陪每個孩子，找到自己的學習節奏。' }],
  },
];
