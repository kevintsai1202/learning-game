# 班級島大型設施的音效：授權與來源（CREDITS）

由 `scripts/audio/build-ride-sfx.mjs` 產生（docs/plans/grand-rides.md 第 11 節）。使用者要求「聲音要自然，不要電子罐頭音」，所以設施的聲音都是真實錄音。

- **真實錄音**：來自 Freesound.org，作者在作品頁把授權標為 **CC0 1.0（公眾領域貢獻宣告）**。下載時以程式逐頁讀取作品頁的授權欄（`scripts/audio/freesound.mjs`），只接受「只有 CC0 一項」的作品；查證日期記在下表。CC0 不要求署名，這裡仍列出作者與原頁，以示尊重、方便查證。CC0 1.0 說明：https://creativecommons.org/publicdomain/zero/1.0/
- **孩子的喊聲**：Fish Audio 語音合成（官方聲音「詩涵」「承翰」，和遊戲的預錄語音同一個服務與帳號），再以 ffmpeg rubberband 升調；使用者 2026-10-13 試聽後同意使用。
- 共同處理：剪段、轉單聲道 44.1 kHz、`loudnorm` 統一響度、一次的音效加淡入淡出、循環的音效把尾巴 0.6 秒交叉淡化疊到開頭（無縫循環），以 libmp3lame 96 kbps 編碼並移除中繼資料。

| 成品檔 | 用途 | 來源 | 作者 | 授權 | 剪的段落 | 查證日期 |
| --- | --- | --- | --- | --- | --- | --- |
| `coaster-chain.mp3` | 雲霄飛車爬坡的鏈條喀喀聲（循環） | [Rollercoaster ratchet.wav](https://freesound.org/people/esperar/sounds/171510/) | esperar | CC0 1.0 | 2～14.0 秒 | 2026-10-13 |
| `coaster-roll.mp3` | 雲霄飛車在軌道上跑的滾動聲（循環，越快越大聲） | [Roller Loop.wav](https://freesound.org/people/BaDoink/sounds/538758/) | BaDoink | CC0 1.0 | 0.2～4.6 秒 | 2026-10-13 |
| `coaster-wind.mp3` | 雲霄飛車高速時的風聲（循環） | [Strong wind](https://freesound.org/people/lextrack/sounds/344887/) | lextrack | CC0 1.0 | 2～16.0 秒 | 2026-10-13 |
| `coaster-brake.mp3` | 雲霄飛車進站的煞車 | [Air (or steam) pressure release](https://freesound.org/people/brunoboselli/sounds/457294/) | brunoboselli | CC0 1.0 | 0～3.6 秒 | 2026-10-13 |
| `coaster-pass.mp3` | 站在島上聽列車經過（含車上孩子的尖叫） | [S33-28 Roller coaster by with kids screaming; in boarding area.wav](https://freesound.org/people/craigsmith/sounds/675529/) | craigsmith | CC0 1.0 | 49.5～59.0 秒 | 2026-10-13 |
| `scream-1.mp3` | 雲霄飛車上大家的尖叫（俯衝、迴圈；含設施聲） | [Girls Scream on a Carnival Ride](https://freesound.org/people/PostProdDog/sounds/580724/) | PostProdDog | CC0 1.0 | 12～17.0 秒 | 2026-10-13 |
| `scream-2.mp3` | 女孩的尖叫「啊——」 | [Girl_Scream.wav](https://freesound.org/people/tcrocker68/sounds/235592/) | tcrocker68 | CC0 1.0 | 0～2.5 秒 | 2026-10-13 |
| `scream-3.mp3` | 女孩的尖叫「啊！」 | [Girl_Scream_FollowingScreams.wav](https://freesound.org/people/tcrocker68/sounds/235591/) | tcrocker68 | CC0 1.0 | 0～3.4 秒 | 2026-10-13 |
| `scream-4.mp3` | 長長的尖叫「啊——」 | [scream.mp3](https://freesound.org/people/rivercold/sounds/421832/) | rivercold | CC0 1.0 | 0～4.3 秒 | 2026-10-13 |
| `bell.mp3` | 出發鈴（雲霄飛車、飛船、摩天輪上車） | [11-3 Tram bell](https://freesound.org/people/16HPanskaWillheimova_Sara/sounds/497561/) | 16HPanskaWillheimova_Sara | CC0 1.0 | 0～2.4 秒 | 2026-10-13 |
| `wheel-wind.mp3` | 摩天輪高空的風（循環，越高越大） | [Wind blowing in the bush on the top of Kitt Peak mountain. (USA, Arizona)](https://freesound.org/people/felix.blume/sounds/135193/) | felix.blume | CC0 1.0 | 10～34.0 秒 | 2026-10-13 |
| `ship-propeller.mp3` | 飛船的螺旋槳（循環） | [Propeller plane](https://freesound.org/people/Breviceps/sounds/515293/) | Breviceps | CC0 1.0 | 5～21.0 秒 | 2026-10-13 |
| `ship-burner.mp3` | 飛船的熱氣球噴火（飛行中隔一陣子一次） | [Hot air balloon burner](https://freesound.org/people/YannSauvin/sounds/778358/) | YannSauvin | CC0 1.0 | 0.3～6.3 秒 | 2026-10-13 |
| `ship-horn.mp3` | 飛船起飛與降落的汽笛 | [Boat Horn.aif](https://freesound.org/people/devy32/sounds/441223/) | devy32 | CC0 1.0 | 2.3～7.7 秒 | 2026-10-13 |
| `sea-waves.mp3` | 海浪（循環；在飛船上與海邊） | [Beach Waves 04.wav](https://freesound.org/people/DylanTheFish/sounds/463250/) | DylanTheFish | CC0 1.0 | 30～60.0 秒 | 2026-10-13 |
| `seagull-1.mp3` | 海鷗（偶爾） | [sea gulls.wav](https://freesound.org/people/Snapper4298/sounds/166703/) | Snapper4298 | CC0 1.0 | 0～7.0 秒 | 2026-10-13 |
| `seagull-2.mp3` | 海鷗（偶爾） | [Seagulls_short.wav](https://freesound.org/people/Lydmakeren/sounds/510917/) | Lydmakeren | CC0 1.0 | 3.5～11.5 秒 | 2026-10-13 |
| `yell-ya.mp3` | 孩子的喊聲「呀啊啊——」（語音合成） | Fish Audio 語音合成（14-chenghan-ya.mp3） | — | 本專案產生 | 全段 | 2026-10-13 |
| `yell-high-1.mp3` | 「哇——好高喔！」（語音合成；爬到最高、摩天輪頂端） | Fish Audio 語音合成（07-shihan-high-tag.mp3） | — | 本專案產生 | 全段 | 2026-10-13 |
| `yell-high-2.mp3` | 「哇——好高喔！」（語音合成） | Fish Audio 語音合成（17-chenghan-high-tag.mp3） | — | 本專案產生 | 全段 | 2026-10-13 |
| `yell-fun-1.mp3` | 「耶——！好好玩！」（語音合成；下車時） | Fish Audio 語音合成（09-shihan-fun-tag.mp3） | — | 本專案產生 | 全段 | 2026-10-13 |
| `yell-fun-2.mp3` | 「耶——！好好玩！」（語音合成） | Fish Audio 語音合成（19-chenghan-fun-tag.mp3） | — | 本專案產生 | 全段 | 2026-10-13 |
