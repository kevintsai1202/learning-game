#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build-hanzi-data.py — 國字筆順資料管線（只用台灣教育部標準筆順；只用 Python 標準函式庫）。

用法（PowerShell 7，專案根目錄）：
    python scripts\\build-hanzi-data.py            # 下載（若不存在）→ 驗證 → 產出 → 覆蓋率報告
    python scripts\\build-hanzi-data.py --check    # 只驗證與印出統計，不寫檔

流程：
 1. 下載（若 data-src/raw/ 內不存在）animCJK 繁中 graphicsZhHant.txt、makemeahanzi graphics.txt、
    全字庫 CNS11643 的 Properties.zip 與 MapingTables.zip，並解出需要的屬性檔。
 2. 讀取三家版本（康軒、南一、翰林）二上二下的 chars 與 readChars，聯集成「目標字集」。
 3. 每字取筆畫資料：animCJK 優先，animCJK 沒有的字才用 makemeahanzi；
    再以 CNS 筆順序列驗證（筆畫數、筆畫類型順序），必要時依 CNS 重排。
    驗證不過（筆畫數不同、順序無法修正、無法判定、沒有來源）的字 writable=false，不用大陸筆順充數。
 4. 輸出 public/data/strokes/hanzi/<碼位小寫十六進位>.json（{strokes, medians}，Hanzi Writer 格式，只含 writable 的字）、
    src/content/zh/chars/charinfo.json（注音、部首、筆畫數…）、docs/stroke-coverage.md（覆蓋率報告）。

驗證方法（細節見 docs/research/stroke-data.md 第 1、4、7 節）：
 * 以 medians（筆畫中線）用啟發式分類器把每筆歸成 CNS 的五類（1橫 2豎 3撇 4點 5折），與 CNS 筆順碼比對。
 * 分類器逐筆準確率約 96%，所以用「混淆機率成本＋匈牙利指派」判斷：允許重排能否大幅降低不一致成本（gain ≥ 5 才算順序不同）。
 * 順序不同的字：先查 scripts/build-hanzi-data.overrides.json 的人工複核結論（教育部筆順網原圖查證，只查證不取資料）；
   沒有複核紀錄者，只有「重排後與 CNS 完全相同、只涉及相鄰兩筆互換、gain ≥ 8」才自動重排，其餘一律不可寫。
 * 礻／衤 部首：CNS 序列比教育部多算 1 筆（教育部與 animCJK 一致），這類字比對時略過偏旁前綴，只驗證其餘筆畫。

授權：animCJK／makemeahanzi 的 graphics 檔屬 Arphic Public License，重排過的檔案以 `_notice` 欄位標示修改；
      CNS 屬性資料屬政府資料開放授權條款第 1 版（顯名聲明見 public/licenses/CNS11643-OGDL.txt）。
"""
import argparse
import collections
import hashlib
import io
import json
import math
import re
import shutil
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'data-src' / 'raw'
OUT_STROKES = ROOT / 'public' / 'data' / 'strokes' / 'hanzi'
OUT_CHARINFO = ROOT / 'src' / 'content' / 'zh' / 'chars' / 'charinfo.json'
OUT_REPORT = ROOT / 'docs' / 'stroke-coverage.md'
EDITION_DIR = ROOT / 'src' / 'content' / 'editions' / 'zh'
OVERRIDES = Path(__file__).resolve().parent / 'build-hanzi-data.overrides.json'

# ───────────────────────── 下載來源（固定版本） ─────────────────────────
ANIMCJK_COMMIT = 'ec5e17cca76c87587790bcbce5ea0b4d4fb753d6'
MMH_COMMIT = 'bddc96d41bef78427ed0e034e9f7e31d71fd1b92'
SOURCES = {
    'animcjk/graphicsZhHant.txt': f'https://raw.githubusercontent.com/parsimonhi/animCJK/{ANIMCJK_COMMIT}/graphicsZhHant.txt',
    'mmh/graphics.txt': f'https://raw.githubusercontent.com/skishore/makemeahanzi/{MMH_COMMIT}/graphics.txt',
    'cns/Properties.zip': 'https://www.cns11643.gov.tw/opendata/Properties.zip',
    'cns/MapingTables.zip': 'https://www.cns11643.gov.tw/opendata/MapingTables.zip',
    'cns/release.txt': 'https://www.cns11643.gov.tw/opendata/release.txt',
}
# 從 zip 解出的檔案（檔名 → 目的子目錄）
CNS_NEEDED = {
    'CNS_strokes_sequence.txt': 'Properties',
    'CNS_phonetic.txt': 'Properties',
    'CNS_radical.txt': 'Properties',
    'CNS_radical_word.txt': 'Properties',
    'CNS_stroke.txt': 'Properties',
    'CNS2UNICODE_Unicode BMP.txt': 'MapingTables/Unicode',
    'CNS2UNICODE_Unicode 2.txt': 'MapingTables/Unicode',
    'CNS2UNICODE_Unicode 3.txt': 'MapingTables/Unicode',
    'CNS2UNICODE_Unicode 15.txt': 'MapingTables/Unicode',
}

# 重排自動接受門檻：gain 至少多少 nats（無人工複核紀錄時）
AUTO_REORDER_MIN_GAIN = 8.0


def say(*a):
    print(*a, flush=True)


# ───────────────────────── 1. 下載與解壓 ─────────────────────────
def download(url, dest):
    """下載 url 到 dest（已存在就略過），失敗重試 3 次。"""
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    for i in range(3):
        try:
            say(f'下載 {url}')
            req = urllib.request.Request(url, headers={'User-Agent': 'learning-island-build/1.0'})
            with urllib.request.urlopen(req, timeout=120) as r, open(dest, 'wb') as f:
                shutil.copyfileobj(r, f)
            return
        except Exception as e:  # noqa: BLE001
            say(f'  失敗（{e}），重試…')
            time.sleep(2 + i * 3)
    raise SystemExit(f'下載失敗：{url}')


def sha256(path):
    """檔案的 sha256 十六進位字串。"""
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def ensure_raw():
    """確保所有原始資料已下載並解出 CNS 需要的檔案；回傳 {相對路徑: sha256}。"""
    for rel, url in SOURCES.items():
        download(url, RAW / rel)
    for zname in ('Properties.zip', 'MapingTables.zip'):
        with zipfile.ZipFile(RAW / 'cns' / zname) as zf:
            for info in zf.infolist():
                base = info.filename.replace('\\', '/').split('/')[-1]
                if not (info.flag_bits & 0x800):
                    try:  # 沒有 UTF-8 旗標的檔名是 CP950（中文檔名），需要轉碼
                        base = info.filename.encode('cp437').decode('cp950').replace('\\', '/').split('/')[-1]
                    except UnicodeError:
                        pass
                sub = CNS_NEEDED.get(base)
                if not sub:
                    continue
                dest = RAW / 'cns' / sub / base
                if dest.exists() and dest.stat().st_size > 0:
                    continue
                dest.parent.mkdir(parents=True, exist_ok=True)
                with zf.open(info) as src, open(dest, 'wb') as out:
                    shutil.copyfileobj(src, out)
    for base, sub in CNS_NEEDED.items():
        if not (RAW / 'cns' / sub / base).exists():
            raise SystemExit(f'CNS 壓縮檔內找不到 {base}')
    return {rel: sha256(RAW / rel) for rel in SOURCES}


# ───────────────────────── 2. 載入資料 ─────────────────────────
def load_target():
    """讀三家版本，回傳 (目標字集排序 list, 各字的課本資訊, 各版本各冊資料)。
    info[ch] = {'own_words': 該字所在課的語詞（含該字者）, 'all_words': 所有版本含該字的語詞}"""
    chars = set()
    own = collections.defaultdict(set)
    allw = collections.defaultdict(set)
    editions = []
    for f in sorted(EDITION_DIR.glob('*.json')):
        ed = json.loads(f.read_text(encoding='utf-8'))
        editions.append(ed)
        for v in ed['volumes']:
            for u in v['units']:
                lesson = list(u.get('chars', [])) + list(u.get('readChars', []))
                chars.update(lesson)
                for w in u.get('words', []):
                    for c in set(w):
                        allw[c].add(w)
                        if c in lesson:
                            own[c].add(w)
    info = {c: {'own_words': sorted(own[c]), 'all_words': sorted(allw[c])} for c in chars}
    return sorted(chars, key=ord), info, editions


def load_graphics(path):
    """讀 makemeahanzi 格式的 graphics.txt（每行一個 JSON），回傳 字 → {strokes, medians}。"""
    out = {}
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                r = json.loads(line)
                out[r['character']] = {'strokes': r['strokes'], 'medians': r['medians']}
    return out


def _tsv(path):
    """逐行讀 Tab 分隔檔，去除 BOM 與換行，略過空行。"""
    with open(path, encoding='utf-8-sig') as f:
        for line in f:
            line = line.rstrip('\r\n')
            if line.strip():
                yield line.split('\t')


def load_cns():
    """合併全字庫屬性：Unicode 字 → {zhuyin[], radical(康熙部首字), strokeSeq(筆順碼), cns}。
    不含私用區；一個字有多個 CNS 碼時取字面最小者。"""
    base = RAW / 'cns'
    cns2uni = {}
    for tbl in ('BMP', '2', '3', '15'):
        for row in _tsv(base / 'MapingTables' / 'Unicode' / f'CNS2UNICODE_Unicode {tbl}.txt'):
            cns2uni[row[0]] = int(row[1], 16)
    seq = {r[0]: r[1] for r in _tsv(base / 'Properties' / 'CNS_strokes_sequence.txt')}
    rad_code = {r[0]: int(r[1]) for r in _tsv(base / 'Properties' / 'CNS_radical.txt')}
    rad_word = {int(r[0]): r[1] for r in _tsv(base / 'Properties' / 'CNS_radical_word.txt')}
    phon = collections.defaultdict(list)
    for r in _tsv(base / 'Properties' / 'CNS_phonetic.txt'):
        if r[1] not in phon[r[0]]:
            phon[r[0]].append(r[1])
    uni2cns = collections.defaultdict(list)
    for code, cp in cns2uni.items():
        uni2cns[cp].append(code)

    def key(code):
        p, h = code.split('-')
        return int(p), int(h, 16)

    out = {}
    for cp, codes in uni2cns.items():
        if 0xE000 <= cp <= 0xF8FF or cp >= 0xF0000:
            continue
        code = sorted(codes, key=key)[0]
        rw = rad_word.get(rad_code.get(code))
        out[chr(cp)] = {
            'cns': code,
            'zhuyin': phon.get(code, []),
            # 部首字串像「水（氵氺）」，取第一個字
            'radical': rw[0] if rw else None,
            'strokeSeq': seq.get(code),
        }
    return out


# ───────────────────────── 3. 筆畫分類器與順序比對 ─────────────────────────
# 把 medians 歸成 CNS 五類：1橫（含緩提） 2豎 3撇 4點（含捺） 5折（含各種鉤）。
# 參數與規則由 docs/research/stroke-data.md 第 1、4 節的研究調校；改動前先重跑研究的 eval_classifier（準確率需 ≥ 93%）。
PARAMS = {
    'rdp_eps': 28.0, 'corner_turn': 50.0, 'min_seg': 40.0,
    'cap_ratio': 0.40, 'cap_next': 1.6, 'cap_turn': 30.0, 'cap_abs': 100.0,
    'sumturn_curve': 110.0, 'h_hi': 4.5, 'h_lo': -45.0, 'v_lo': 78.0, 'v_hi': 100.0,
    'rise_thr': -40.0, 'rise_L': 355.0, 'd_hi': 60.6,
    'v1_a': 63.4, 'v1_L': 118.6, 'v2_a': 73.3, 'v2_L': 133.4, 'v3_a': 98.3, 'v3_L': 230.6,
    's1_a': 109.6, 's1_L': 232.1, 's2_a': 114.0, 's2_L': 222.5,
}


def _to_screen(med):
    """makemeahanzi 座標（y 向上）→ 螢幕座標（y 向下）。"""
    return [(x, 900 - y) for x, y in med]


def _dist_pt_seg(p, a, b):
    """點 p 到線段 ab 的距離。"""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    l2 = dx * dx + dy * dy
    if l2 == 0:
        return math.hypot(p[0] - ax, p[1] - ay)
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))


def _rdp(pts, eps):
    """Ramer–Douglas–Peucker 折線簡化。"""
    if len(pts) < 3:
        return list(pts)
    dmax, idx = 0.0, 0
    for i in range(1, len(pts) - 1):
        d = _dist_pt_seg(pts[i], pts[0], pts[-1])
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return _rdp(pts[:idx + 1], eps)[:-1] + _rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def _angdiff(a, b):
    """角度差 b-a，正規化到 (-180, 180]。"""
    return (b - a + 180.0) % 360.0 - 180.0


def _features(med, P=PARAMS):
    """一條 median 的幾何特徵：折線總長、淨方向角、是否有折點／勾曲。"""
    pts = _to_screen(med)
    clean = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - clean[-1][0], p[1] - clean[-1][1]) > 0.5:
            clean.append(p)
    pts = clean
    if len(pts) < 2:
        return {'total': 0, 'net': 0.0, 'corner': False, 'curve': False}
    simp = _rdp(pts, P['rdp_eps'])
    segs = [(math.hypot(b[0] - a[0], b[1] - a[1]), math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))) for a, b in zip(simp, simp[1:])]
    total = sum(l for l, _ in segs)
    # 起筆頓筆：第一小段很短且與下一段轉角大，視為裝飾，從折線移除
    if (len(segs) >= 2 and segs[0][0] <= P['cap_abs'] and segs[0][0] <= P['cap_ratio'] * total
            and segs[1][0] >= P['cap_next'] * segs[0][0] and abs(_angdiff(segs[0][1], segs[1][1])) >= P['cap_turn']):
        simp = simp[1:]
        segs = segs[1:]
        total = sum(l for l, _ in segs)
    turns = [_angdiff(segs[i][1], segs[i + 1][1]) for i in range(len(segs) - 1)]
    corner = any(abs(t) >= P['corner_turn'] and segs[i][0] >= P['min_seg'] and segs[i + 1][0] >= P['min_seg'] for i, t in enumerate(turns))
    ss = sum(turns)
    sa = sum(abs(t) for t in turns)
    curve = abs(ss) >= P['sumturn_curve'] and sa <= abs(ss) * 1.25 + 1
    s0, s1 = simp[0], simp[-1]
    net = math.degrees(math.atan2(s1[1] - s0[1], s1[0] - s0[0]))
    return {'total': total, 'net': net, 'corner': corner, 'curve': curve}


def classify_median(med, P=PARAMS):
    """一條 median → '1'~'5'。有折點或勾曲 → 5；否則依方向角與長度分橫、豎、撇、點。"""
    f = _features(med, P)
    if f['total'] == 0:
        return '4'
    if f['corner'] or f['curve']:
        return '5'
    a, L = f['net'], f['total']
    if a <= P['h_hi']:
        return '4' if (a < P['rise_thr'] and L <= P['rise_L']) else '1'
    if a <= P['d_hi']:
        return '4'
    if a <= 101.0:
        if a <= P['v1_a'] and L <= P['v1_L']:
            return '4'
        if a <= P['v2_a'] and L <= P['v2_L']:
            return '4'
        if a > P['v3_a'] and L <= P['v3_L']:
            return '4'
        return '2'
    if a <= P['s1_a']:
        return '4' if L <= P['s1_L'] else '3'
    if a <= P['s2_a']:
        return '4' if L <= P['s2_L'] else '3'
    return '3'


def classify_char(medians):
    """整個字的 median 列表 → 類型序列字串。"""
    return ''.join(classify_median(m) for m in medians)


def hungarian(cost):
    """匈牙利演算法（O(n^3)），輸入 n×n 成本矩陣，回傳 row → col 指派。"""
    n = len(cost)
    INF = float('inf')
    u = [0.0] * (n + 1)
    v = [0.0] * (n + 1)
    p = [0] * (n + 1)
    way = [0] * (n + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [INF] * (n + 1)
        used = [False] * (n + 1)
        while True:
            used[j0] = True
            i0 = p[j0]
            delta = INF
            j1 = 0
            for j in range(1, n + 1):
                if not used[j]:
                    cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                    if cur < minv[j]:
                        minv[j] = cur
                        way[j] = j0
                    if minv[j] < delta:
                        delta = minv[j]
                        j1 = j
            for j in range(n + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while True:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
            if j0 == 0:
                break
    ans = [0] * n
    for j in range(1, n + 1):
        ans[p[j] - 1] = j - 1
    return ans


def build_logp(pairs, alpha=0.5):
    """由「(預測序列, CNS 序列)」等長對位資料建立 log P(預測 | 真值) 表（拉普拉斯平滑）。"""
    cnt = collections.Counter()
    row = collections.Counter()
    for pred, code in pairs:
        for p, t in zip(pred, code):
            cnt[(t, p)] += 1
            row[t] += 1
    return {(p, t): math.log((cnt[(t, p)] + alpha) / (row[t] + 5 * alpha)) for t in '12345' for p in '12345'}


def analyze(pred, code, logp):
    """比對等長的預測序列與 CNS 序列。回傳 dict：
    status exact（完全相同）/ noise（差異可歸因分類雜訊）/ order（類型順序不同）、gain、assign（重排指派 來源第i筆→目標位置）。"""
    n = len(pred)
    if pred == code:
        return {'status': 'exact', 'gain': 0.0, 'assign': list(range(n))}
    cost = [[-logp[(pred[i], code[j])] + 1e-3 * abs(i - j) for j in range(n)] for i in range(n)]
    c_id = sum(cost[i][i] for i in range(n))
    assign = hungarian(cost)
    gain = c_id - sum(cost[i][assign[i]] for i in range(n))
    return {'status': 'order' if gain >= 5.0 else 'noise', 'gain': gain, 'assign': assign}


def permute(seq, assign):
    """依指派重排：來源第 i 筆放到位置 assign[i]。"""
    out = [None] * len(seq)
    for i, j in enumerate(assign):
        out[j] = seq[i]
    return out


def only_adjacent_swaps(assign):
    """指派是否只由「相鄰兩筆互換」組成（其餘位置不動）。"""
    n = len(assign)
    i = 0
    while i < n:
        if assign[i] == i:
            i += 1
        elif i + 1 < n and assign[i] == i + 1 and assign[i + 1] == i:
            i += 2
        else:
            return False
    return True


# ───────────────────────── 4. 逐字決定筆畫資料 ─────────────────────────
# 礻（示部）、衤（衣部）：CNS 序列比教育部多算 1 筆；偏旁的 CNS 前綴（筆順碼）長度
SHI_PREFIX = {'示': '4132', '衣': '41323'}

REASON_TEXT = {
    'no_source': '兩個來源都沒有這個字',
    'count_mismatch': '筆畫數與 CNS 不同（無法由重排解決，不用大陸筆畫數充數）',
    'order_unresolved': '筆畫順序與 CNS 不同且無法可靠修正',
    'unusable_review': '人工複核（教育部筆順網）判定不可用（重排後仍不同或無法判定）',
}


def decide_char(ch, cns, ani, mmh, logp, review):
    """決定一個字的筆畫資料。回傳 dict：
    writable、source（animcjk/makemeahanzi）、reorder（是否重排）、reason、reviewed（人工複核或自動重排的說明）、strokes、medians。"""
    code = (cns.get(ch) or {}).get('strokeSeq')
    rad = (cns.get(ch) or {}).get('radical')
    if ch in ani:
        name, src = 'animcjk', ani[ch]
    elif ch in mmh:
        name, src = 'makemeahanzi', mmh[ch]
    else:
        return {'writable': False, 'reason': 'no_source'}
    if not code:
        return {'writable': False, 'reason': 'no_source', 'source': name}
    strokes, medians = src['strokes'], src['medians']
    n = len(medians)
    pred = classify_char(medians)
    res = {'source': name}

    def finish(order_assign=None, note=None):
        """輸出筆畫；order_assign 不為 None 時依指派重排。"""
        if order_assign is not None:
            s = permute(strokes, order_assign)
            m = permute(medians, order_assign)
            res.update(reorder=True)
        else:
            s, m = strokes, medians
            res.update(reorder=False)
        res.update(writable=True, strokes=s, medians=m)
        if note:
            res['note'] = note
        return res

    # 礻／衤：筆畫數比 CNS 少 1，略過偏旁前綴後驗證其餘筆畫
    if n != len(code):
        pre = SHI_PREFIX.get(rad)
        if pre and code.startswith(pre) and n == len(code) - 1:
            skip = len(pre) - 1  # 來源偏旁少算 1 筆
            a = analyze(pred[skip:], code[len(pre):], logp)
            if len(pred[skip:]) == len(code[len(pre):]) and a['status'] in ('exact', 'noise'):
                return finish(note='礻／衤 偏旁：筆畫數比 CNS 少 1（教育部與 animCJK 一致），其餘筆畫已與 CNS 驗證')
            res.update(writable=False, reason='order_unresolved')
            return res
        res.update(writable=False, reason='count_mismatch', detail=f'來源 {n} 筆、CNS {len(code)} 筆')
        return res

    a = analyze(pred, code, logp)
    if a['status'] in ('exact', 'noise'):
        return finish()
    # 類型順序不同：先查人工複核
    verdict = review.get(name, {}).get(ch)
    if verdict == 'original_ok':
        return finish(note='分類器誤報；教育部筆順網原圖查證原順序正確')
    if verdict == 'reorder_ok':
        return finish(order_assign=a['assign'], note='依 CNS 重排；教育部筆順網原圖查證重排後相同')
    if verdict == 'unusable':
        res.update(writable=False, reason='unusable_review')
        return res
    # 沒有複核紀錄：只接受「重排後完全相同、只涉及相鄰互換、gain 夠大」
    if (a['gain'] >= AUTO_REORDER_MIN_GAIN and only_adjacent_swaps(a['assign'])
            and ''.join(permute(list(pred), a['assign'])) == code):
        return finish(order_assign=a['assign'], note='自動依 CNS 重排（相鄰兩筆互換），未經教育部原圖複核')
    res.update(writable=False, reason='order_unresolved', detail=f'gain={a["gain"]:.1f}')
    return res


# ───────────────────────── 5. 注音、部首、筆畫數 ─────────────────────────
def pick_radical(ch, kangxi, forms):
    """康熙部首 → 國小教學用的偏旁寫法（依 overrides 的 radicalForms，位置相依的字用 keep／only 例外）。"""
    f = forms.get(kangxi)
    if not f:
        return kangxi
    if 'only' in f:
        return f['form'] if ch in f['only'] else kangxi
    return kangxi if ch in f.get('keep', []) else f['form']


def parse_readings(spec):
    """解析讀音表一列：'ㄐㄧㄚˋ@放假,暑假 ㄐㄧㄚˇ ?' → ([(讀音, [觸發詞])…], 是否要人工確認)。"""
    out, confirm = [], False
    for tok in spec.split():
        if tok == '?':
            confirm = True
            continue
        r, _, w = tok.partition('@')
        out.append((r, [x for x in w.split(',') if x]))
    return out, confirm


def resolve_reading(ch, cns_readings, table, info):
    """決定一個字的讀音。回傳 (readings 清單, 主讀音, 狀態, 說明)。
    狀態：single（只有一個讀音）、by_words（由課本語詞判斷）、conflict（語詞出現多種讀音，需確認）、
          no_words（有多個讀音但語詞無法判斷，需確認）、uncurated（有多個 CNS 讀音又沒有人工表，需確認）。"""
    spec = table.get(ch)
    if spec is None:
        if len(cns_readings) <= 1:
            return cns_readings, (cns_readings[0] if cns_readings else None), 'single', ''
        return cns_readings, cns_readings[0], 'uncurated', 'CNS 有多個讀音，沒有人工整理，先用第一個'
    cur, confirm = parse_readings(spec)
    readings = [r for r, _ in cur]
    words = info['own_words'] or info['all_words']
    hit = []
    for r, triggers in cur:
        if any(t in w for t in triggers for w in words):
            hit.append(r)
    if len(readings) == 1:
        return readings, readings[0], 'single', ''
    if len(hit) == 1:
        return readings, hit[0], ('conflict' if confirm else 'by_words'), ('人工標記需確認' if confirm else '')
    if len(hit) > 1:
        return readings, hit[0], 'conflict', f'出現 {" ".join(hit)}；語詞：{" ".join(words)}'
    return readings, readings[0], 'no_words', f'語詞：{" ".join(words) or "課本語詞沒有含這個字的詞"}'


# ───────────────────────── 6. 主流程 ─────────────────────────
def main():
    ap = argparse.ArgumentParser(description='建置國字筆順與生字資訊')
    ap.add_argument('--check', action='store_true', help='只驗證與印統計，不寫檔')
    args = ap.parse_args()

    hashes = ensure_raw()
    ov = json.loads(OVERRIDES.read_text(encoding='utf-8'))
    review = {k: v for k, v in ov['orderReview'].items() if not k.startswith('_')}
    rforms = {k: v for k, v in ov['radicalForms'].items() if not k.startswith('_')}
    rtable = {k: v for k, v in ov['readings'].items() if not k.startswith('_')}

    chars, info, editions = load_target()
    say(f'目標字集 {len(chars)} 字')
    cns = load_cns()
    ani = load_graphics(RAW / 'animcjk' / 'graphicsZhHant.txt')
    mmh = load_graphics(RAW / 'mmh' / 'graphics.txt')
    # 混淆矩陣：以 animCJK 全部字（筆畫數與 CNS 相同者）對 CNS 的逐位置對位資料建立
    pairs = []
    for c, d in ani.items():
        e = cns.get(c)
        if e and e['strokeSeq'] and len(e['strokeSeq']) == len(d['medians']):
            pairs.append((classify_char(d['medians']), e['strokeSeq']))
    logp = build_logp(pairs)

    decisions = {ch: decide_char(ch, cns, ani, mmh, logp, review) for ch in chars}

    # ── 輸出筆順檔
    infos = []
    warnings = []
    pending = []  # 多音字待人工確認
    for ch in chars:
        d = decisions[ch]
        e = cns.get(ch) or {}
        code = e.get('strokeSeq') or ''
        # 筆畫數：可寫的字＝筆順檔筆數；不可寫的字＝CNS 筆順碼長度（礻／衤 少 1）
        if d['writable']:
            stroke_count = len(d['strokes'])
        else:
            stroke_count = len(code)
            pre = SHI_PREFIX.get(e.get('radical'))
            if pre and code.startswith(pre):
                stroke_count -= 1
        cns_readings = e.get('zhuyin', [])
        readings, main_r, status, why = resolve_reading(ch, cns_readings, rtable, info[ch])
        for r in readings:
            if r not in cns_readings:
                warnings.append(f'{ch} 的讀音 {r} 不在 CNS 讀音清單 {cns_readings}')
        if status in ('conflict', 'no_words', 'uncurated'):
            pending.append((ch, main_r, readings, status, why))
        kangxi = e.get('radical')
        src_label = None
        if d['writable']:
            src_label = d['source'] + ('+reorder' if d.get('reorder') else '')
        item = {
            'char': ch,
            'readings': readings,
            'reading': main_r,
            'radical': pick_radical(ch, kangxi, rforms),
            'radicalKangxi': kangxi,
            'strokeCount': stroke_count,
            'writable': d['writable'],
            'strokeSource': src_label,
        }
        if not d['writable']:
            item['unwritableReason'] = d['reason']
        infos.append(item)

    ok = [c for c in chars if decisions[c]['writable']]
    by_source = collections.Counter()
    for c in ok:
        d = decisions[c]
        by_source[(d['source'], bool(d.get('reorder')))] += 1
    bad_reason = collections.defaultdict(list)
    for c in chars:
        if not decisions[c]['writable']:
            bad_reason[decisions[c]['reason']].append(c)
    say(f'可寫 {len(ok)} / {len(chars)}；來源 {dict(by_source)}')
    for r, cs in bad_reason.items():
        say(f'  不可寫（{r}）{len(cs)} 字：{"".join(cs)}')
    say(f'待人工確認的多音字 {len(pending)} 個；讀音警告 {len(warnings)} 個')
    for w in warnings:
        say('  警告：' + w)

    if args.check:
        return

    # 清掉舊產物再寫（確保不會留下已改為不可寫的字）
    if OUT_STROKES.exists():
        shutil.rmtree(OUT_STROKES)
    OUT_STROKES.mkdir(parents=True)
    for c in ok:
        d = decisions[c]
        obj = {'strokes': d['strokes'], 'medians': d['medians']}
        if d.get('reorder') or d.get('note', '').startswith('礻'):
            # APL 第 2 條：修改過的檔案要有修改聲明
            what = '依台灣教育部標準筆順（CNS11643 筆順序列）重排筆畫順序' if d.get('reorder') else '筆畫資料未重排，已與 CNS 驗證'
            obj['_notice'] = f'來源 {d["source"]}（Arphic Public License）；本檔{what}；scripts/build-hanzi-data.py'
        (OUT_STROKES / f'{ord(c):x}.json').write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    OUT_CHARINFO.parent.mkdir(parents=True, exist_ok=True)
    OUT_CHARINFO.write_text('[' + chr(10) + (',' + chr(10)).join(json.dumps(i, ensure_ascii=False, separators=(',', ':')) for i in infos) + chr(10) + ']' + chr(10), encoding='utf-8')

    write_report(chars, decisions, infos, info, editions, by_source, bad_reason, pending, warnings, hashes, cns, ani, mmh)
    say(f'已寫入 {len(ok)} 個筆順檔、charinfo.json、docs/stroke-coverage.md')


# ───────────────────────── 7. 覆蓋率報告 ─────────────────────────
def write_report(chars, decisions, infos, info, editions, by_source, bad_reason, pending, warnings, hashes, cns, ani, mmh):
    """產生 docs/stroke-coverage.md。"""
    ok = [c for c in chars if decisions[c]['writable']]
    L = []
    w = L.append
    w('# 國字筆順覆蓋率報告')
    w('')
    w('> 由 `scripts/build-hanzi-data.py` 自動產生，請勿手改；重跑腳本會覆蓋。人工複核結論在 `scripts/build-hanzi-data.overrides.json`。')
    w('')
    w('## 1. 總覽')
    w('')
    w(f'- 目標字集：康軒、南一、翰林三版本二上、二下所有「習寫字（chars）」與「認讀字（readChars）」的聯集，共 **{len(chars)}** 字。')
    w(f'- 可描寫（`writable: true`）：**{len(ok)}** 字（{len(ok) * 100 / len(chars):.1f}%）。')
    w(f'- 不可描寫：**{len(chars) - len(ok)}** 字（只出認讀、注音、部首、筆畫題）。')
    w('- 筆順一律是台灣教育部標準：以 CNS11643 筆順序列驗證，驗證不過的字不用大陸筆順充數。')
    w('')
    w('### 各來源字數')
    w('')
    w('| 來源 | 字數 |')
    w('| --- | --- |')
    labels = {('animcjk', False): 'animCJK 繁中（原樣）', ('animcjk', True): 'animCJK 繁中（依 CNS 重排）',
              ('makemeahanzi', False): 'makemeahanzi（原樣，animCJK 沒有的字）', ('makemeahanzi', True): 'makemeahanzi（依 CNS 重排）'}
    for k, lab in labels.items():
        w(f'| {lab} | {by_source.get(k, 0)} |')
    notes = collections.Counter(decisions[c].get('note', '') for c in ok)
    shi = sum(1 for c in ok if decisions[c].get('note', '').startswith('礻'))
    w(f'| 其中：礻／衤 偏旁（筆畫數比 CNS 少 1，教育部查證一致）| {shi} |')
    w(f'| 不可描寫 | {len(chars) - len(ok)} |')
    w('')
    w('### 不可描寫的字與原因')
    w('')
    w('| 原因 | 字數 | 字 |')
    w('| --- | --- | --- |')
    for r in ('count_mismatch', 'order_unresolved', 'unusable_review', 'no_source'):
        cs = bad_reason.get(r, [])
        if cs:
            w(f'| {REASON_TEXT[r]} | {len(cs)} | {"".join(cs)} |')
    w('')
    w('明細（字：來源、原因細節）：')
    w('')
    for c in chars:
        d = decisions[c]
        if not d['writable']:
            w(f'- {c}（U+{ord(c):04X}）：{d.get("source", "無來源")}；{REASON_TEXT[d["reason"]]}{"；" + d["detail"] if d.get("detail") else ""}')
    w('')
    w('處理建議：筆畫數不同的字多為艹、辶、阝等部件（台灣標準比大陸多一畫），要人工拆筆才能用；'
      '請先查教育部《國字標準字體筆順學習網》確認，再決定要不要手動補（CC BY-NC-ND 不可當資料來源，僅供查證）。')
    w('')
    reordered = [c for c in ok if decisions[c].get('reorder')]
    auto = [c for c in reordered if decisions[c]['note'].startswith('自動')]
    w('### 依 CNS 重排的字')
    w('')
    w(f'共 {len(reordered)} 字：{"".join(reordered)}')
    w('')
    w(f'其中未經教育部原圖複核、由腳本自動重排（相鄰兩筆互換）的有 {len(auto)} 字：{"".join(auto) or "無"}，建議人工抽查。')
    w('')
    w('## 2. 各版本各冊可寫比例')
    w('')
    w('以每一課的習寫字（chars）計，同一冊內重複的字只算一次；括號內為習寫字加認讀字。')
    w('')
    w('| 版本 | 冊 | 習寫字 | 可寫 | 比例 | 習寫＋認讀字 | 可寫 | 比例 |')
    w('| --- | --- | --- | --- | --- | --- | --- | --- |')
    for ed in editions:
        for v in ed['volumes']:
            wr = []
            al = []
            for u in v['units']:
                wr += u.get('chars', [])
                al += u.get('chars', []) + u.get('readChars', [])
            wr, al = sorted(set(wr)), sorted(set(al))
            a = sum(1 for c in wr if decisions[c]['writable'])
            b = sum(1 for c in al if decisions[c]['writable'])
            w(f'| {ed["publisher"]} | 二{v["term"]} | {len(wr)} | {a} | {a * 100 / max(1, len(wr)):.1f}% | {len(al)} | {b} | {b * 100 / max(1, len(al)):.1f}% |')
    w('')
    w('## 3. 多音字待人工確認')
    w('')
    w('主讀音的判斷方式：`scripts/build-hanzi-data.overrides.json` 的讀音表（人工整理的教育部標準讀音）＋課本語詞比對；'
      '下列字無法由課本語詞唯一判斷，目前先用表中第一個（最常見）讀音，請老師或家長確認。'
      '`charinfo.json` 的 `readings` 列出所有可接受的讀音，出「看字選注音」題時干擾選項會排除這些讀音。')
    w('')
    w(f'共 {len(pending)} 字：')
    w('')
    w('| 字 | 目前主讀音 | 全部讀音 | 狀況 |')
    w('| --- | --- | --- | --- |')
    for ch, main_r, readings, status, why in pending:
        stext = {'conflict': '語詞出現多種讀音', 'no_words': '語詞無法判斷', 'uncurated': '未整理'}[status]
        w(f'| {ch} | {main_r} | {" ".join(readings)} | {stext}（{why}） |')
    if warnings:
        w('')
        w('### 讀音表警告')
        w('')
        for x in warnings:
            w(f'- {x}')
    w('')
    w('## 4. 資料版本與授權')
    w('')
    w('| 資料 | 版本 | sha256 |')
    w('| --- | --- | --- |')
    w(f'| animCJK graphicsZhHant.txt | commit {ANIMCJK_COMMIT[:12]} | `{hashes["animcjk/graphicsZhHant.txt"][:16]}…` |')
    w(f'| makemeahanzi graphics.txt | commit {MMH_COMMIT[:12]} | `{hashes["mmh/graphics.txt"][:16]}…` |')
    w(f'| CNS11643 Properties.zip | 20260805 | `{hashes["cns/Properties.zip"][:16]}…` |')
    w(f'| CNS11643 MapingTables.zip | 20260805 | `{hashes["cns/MapingTables.zip"][:16]}…` |')
    w('')
    w('- animCJK、makemeahanzi 的 graphics 檔：Arphic Public License（`public/licenses/ARPHIC-PL.txt`）。重排過的筆順檔在 JSON 內以 `_notice` 欄位標示修改；`radStrokes` 不收（來源為 LGPL 的 dictionary 檔）。')
    w('- CNS11643 屬性資料：政府資料開放授權條款第 1 版（`public/licenses/CNS11643-OGDL.txt`，含顯名聲明）。')
    w('- 教育部《國字標準字體筆順學習網》（CC BY-NC-ND）只用於人工查證，圖與動畫沒有放進專案。')
    w('')
    OUT_REPORT.parent.mkdir(parents=True, exist_ok=True)
    OUT_REPORT.write_text('\n'.join(L), encoding='utf-8')


if __name__ == '__main__':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    main()
