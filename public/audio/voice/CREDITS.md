# 預錄語音出處

這個資料夾的 mp3 都是 **AI 語音合成**，不是真人錄音，由 `scripts/voice/generate.mjs` 依 `data-src/voice/inventory.json` 產生；`manifest.json` 是「語言|句子 → 檔名」的對照表，遊戲執行時由 `src/audio/clipPlayer.ts` 讀取。

| 用途 | 服務 | 聲音 | 模型 | 語速 |
| --- | --- | --- | --- | --- |
| 介面句子、生活與健康（中文） | Fish Audio | 詩涵 Shihan（台灣），作者 Fish Official，`91ec588cf8ef443a9c0d5b21d0c1fa36` | `s2.1-pro-free` | 0.9 |
| 英語 | Fish Audio | 同上 | `s2.1-pro-free` | 0.85 |
| 37 個注音符號 | Microsoft Azure AI Speech | 曉臻 `zh-TW-HsiaoChenNeural` | 神經語音 | 0.7 |

後製：轉單聲道、去頭尾靜音、音量調整到 −16 LUFS 並限幅，輸出 24 kHz、48 kbps mp3。

授權：兩者都用免費方案產生。Fish Audio 服務條款寫明免費使用者限個人、非商業使用；Microsoft 產品條款的語音產出使用權只列付費方案。是否沿用免費方案由專案維護者決定（2026-10-02），詳見 `docs/plans/voice-clips.md` 第 8 節。
