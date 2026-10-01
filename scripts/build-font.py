"""
產生注音字型子集「LG Bopomofo Round」（來源：ButTaiwan 注音粉圓 BpmfHuninn，OFL 1.1）。

做了什麼：
1. 掃描 src/（含各科內容 JSON）與 public/data/ 裡所有用到的中文字、注音、全形標點，再加上 data-src/charset-extra.txt 的備用字。
2. 用 fontTools 子集化，並保留 IVS 選擇子（U+E0100–E01EF），破音字才能用 IVS 選讀音。
   注意：pyftsubset 預設會丟掉 cmap format 14，--unicodes 一定要包含選擇子範圍。
3. 改名為 LG Bopomofo Round（OFL：修改版建議改名；原字型未宣告 Reserved Font Name），補上著作權與授權欄位。
4. 輸出 src/assets/fonts/lg-bopomofo-round.woff2，並把授權全文放到 public/licenses/。

使用方式（PowerShell 7，專案根目錄）：
    python -m venv .venv
    .\\.venv\\Scripts\\python -m pip install fonttools brotli
    .\\.venv\\Scripts\\python scripts\\build-font.py

原始字型不存在時會自動從 GitHub release 下載到 data-src/raw/（此資料夾不進版控）。
內容新增了新字之後要重跑一次，否則新字不會有注音（會退回系統字型顯示）。
"""

from __future__ import annotations

import io
import re
import sys
import urllib.request
import zipfile
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data-src" / "raw" / "BpmfHuninn"
SRC_TTF = RAW_DIR / "BpmfHuninn-Regular.ttf"
LICENSE_SRC = RAW_DIR / "LICENSE-Huninn.txt"
RELEASE_URL = "https://github.com/ButTaiwan/bpmfvs/releases/download/v1.500/BpmfHuninn.zip"
OUT_FONT = ROOT / "src" / "assets" / "fonts" / "lg-bopomofo-round.woff2"
OUT_LICENSE = ROOT / "public" / "licenses" / "OFL-LG-Bopomofo-Round.txt"
EXTRA_CHARSET = ROOT / "data-src" / "charset-extra.txt"

# 新字型名稱（不含原字型名稱，避免使用者誤以為是完整原版）
FAMILY = "LG Bopomofo Round"
PS_NAME = "LGBopomofoRound-Regular"

# 要收進子集的字元：中日韓統一表意文字、注音、全形與 CJK 標點
CJK_RE = re.compile(r"[　-〿㄀-ㄯㆠ-ㆿ㐀-䶿一-鿿豈-﫿＀-￯]")

# 固定保留的範圍：ASCII、注音、聲調符號、標點、IVS 選擇子
FIXED_UNICODES = (
    "U+0020-007E,U+00B7,U+02C7,U+02C9,U+02CA,U+02CB,U+02D9,U+2014,U+2018-201D,U+2026,"
    "U+3000-303F,U+3100-312F,U+31A0-31BF,U+FF01-FF5E,U+E0100-E01EF"
)


def ensure_source() -> None:
    """原始字型不存在時從 GitHub release 下載並解壓縮。"""
    if SRC_TTF.exists():
        return
    print(f"下載原始字型：{RELEASE_URL}")
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(RELEASE_URL) as resp:
        data = resp.read()
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        for name in zf.namelist():
            target = RAW_DIR / Path(name).name
            if name.endswith("/") or not Path(name).name:
                continue
            target.write_bytes(zf.read(name))
    if not SRC_TTF.exists():
        sys.exit(f"解壓縮後找不到 {SRC_TTF.name}，請確認 release 內容")


def collect_chars() -> set[str]:
    """掃描程式碼與內容資料，收集用到的中文字與標點。"""
    chars: set[str] = set()
    patterns = [("src", ("*.ts", "*.tsx", "*.css", "*.json")), ("public/data", ("*.json",))]
    for folder, globs in patterns:
        base = ROOT / folder
        if not base.exists():
            continue
        for g in globs:
            for f in base.rglob(g):
                chars.update(CJK_RE.findall(f.read_text(encoding="utf-8")))
    if EXTRA_CHARSET.exists():
        chars.update(CJK_RE.findall(EXTRA_CHARSET.read_text(encoding="utf-8")))
    return chars


def rename(font: TTFont) -> None:
    """改字型名稱並補上著作權、授權欄位（所有語系的名稱紀錄一律換掉）。"""
    name = font["name"]
    name.names = [n for n in name.names if n.nameID not in (0, 1, 3, 4, 5, 6, 13, 14, 16, 17)]
    records = {
        0: "Copyright 2025 But Ko (BpmfHuninn). Contains Huninn (justfont), Kosugi Maru (Motoya), Varela Round. Subset and renamed for Learning Island.",
        1: FAMILY,
        3: f"{PS_NAME};learning-island-subset",
        4: FAMILY,
        5: "Version 1.500-subset",
        6: PS_NAME,
        13: "This Font Software is licensed under the SIL Open Font License, Version 1.1. This license is available with a FAQ at: https://openfontlicense.org",
        14: "https://openfontlicense.org",
        16: FAMILY,
        17: "Regular",
    }
    for nid, text in records.items():
        name.setName(text, nid, 3, 1, 0x409)
        name.setName(text, nid, 1, 0, 0)


def main() -> None:
    ensure_source()
    chars = collect_chars()
    text = "".join(sorted(chars))
    print(f"收集到 {len(chars)} 個中文字與標點")

    options = subset.Options()
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.notdef_outline = True
    options.glyph_names = False
    options.flavor = "woff2"

    font = TTFont(SRC_TTF)
    sub = subset.Subsetter(options)
    unicodes = subset.parse_unicodes(FIXED_UNICODES)
    sub.populate(text=text, unicodes=unicodes)
    sub.subset(font)
    rename(font)

    # 確認 IVS 表還在（沒有的話破音字無法選讀音）
    cmap14 = [t for t in font["cmap"].tables if t.format == 14]
    if not cmap14:
        sys.exit("子集化後找不到 cmap format 14（IVS），請檢查 --unicodes 是否包含選擇子範圍")

    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(OUT_FONT)
    print(f"輸出 {OUT_FONT.relative_to(ROOT)}（{OUT_FONT.stat().st_size:,} bytes，IVS 選擇子 {len(cmap14[0].uvsDict)} 組）")

    OUT_LICENSE.parent.mkdir(parents=True, exist_ok=True)
    note = (
        "本檔隨「LG Bopomofo Round」字型發布。該字型是 ButTaiwan 注音粉圓（BpmfHuninn v1.500）的子集化改名版本：\n"
        "只保留本遊戲用到的字元，並把字型名稱改為 LG Bopomofo Round，其餘字形未修改。\n"
        f"原始字型：{RELEASE_URL}\n\n"
    )
    OUT_LICENSE.write_text(note + LICENSE_SRC.read_text(encoding="utf-8"), encoding="utf-8")
    print(f"輸出 {OUT_LICENSE.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
