# コの字曲げ 早見グラフ（u-chart-sheet.py で作った xlsx）から、各型の表に書いてある実績を読む。
#   出力: [{ t, V, entries: { 底W: 立上り | '×' | {lo, hi} }, min?: { h, w } }]（u-fit.mjs に渡す。min＝いちばん小さい断面の実績、
#          {lo, hi}＝ハットで「25〜75」のように範囲で書いたもの）。コの字・ハットどちらの早見グラフも読める
#   使い方: python scripts/u-chart-read.py 早見グラフ.xlsx > 実績.json
import json
import re
import sys

from openpyxl import load_workbook


def num(v):
    """書いてある値 → 数字 か '×' か 範囲 {lo, hi}（「25〜75」「〜75」「25〜」） か None（全角の数字も読む）"""
    if isinstance(v, str):
        v = v.strip().translate(str.maketrans('０１２３４５６７８９．～－', '0123456789.〜〜'))
        if v in ('×', '✕', 'x', 'X', '✖'):
            return '×'
        for sep in ('〜', '~', '-'):
            if sep in v:
                a, b = (x.strip() for x in v.split(sep, 1))
                rg = {}
                for k, x in (('lo', a), ('hi', b)):
                    try:
                        f = float(x)
                        rg[k] = int(f) if f.is_integer() else f
                    except ValueError:
                        pass
                if 'hi' in rg and 'lo' not in rg:
                    return rg['hi']
                return rg or None
        try:
            v = float(v)
        except ValueError:
            return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return v


wb = load_workbook(sys.argv[1])
out = []
if '実績の記入' in wb.sheetnames:
    # まとめ（u-summary.py）の記入シート：1型2行。下の行の印刷範囲の外（60・61列）に板厚・V、上の行の 62列〜 に★の幅
    ws = wb['実績の記入']
    hr = 4
    head = [str(ws.cell(hr, c).value or '') for c in range(1, 40)]
    for rb in range(6, 200):
        t, V = ws.cell(rb, 60).value, ws.cell(rb, 61).value
        if t is None:
            continue
        ra = rb - 1
        ents = {}
        k = 0
        while True:                            # ★：62列〜 に幅、4列〜 に書いた値
            W = ws.cell(ra, 62 + k).value
            if not isinstance(W, (int, float)):
                break
            v = num(ws.cell(rb, 4 + k).value)
            if v is not None:
                ents[str(int(W))] = v
            k += 1
        nk = max(k, 1)
        # ほかの幅：★の列の右（見出しに「ほかの」がある列から）
        fc = next((c for c in range(1, 40) if head[c - 1].startswith('ほかの')), None)
        if fc:
            for c in range(fc, fc + 6):
                W, v = num(ws.cell(ra, c).value), num(ws.cell(rb, c).value)
                if isinstance(W, (int, float)) and v is not None:
                    ents[str(int(W))] = v
        d = {'t': t, 'V': int(V), 'entries': ents}
        h, w = num(ws.cell(rb, 2).value), num(ws.cell(rb, 3).value)
        if isinstance(h, (int, float)) and isinstance(w, (int, float)):
            d['min'] = {'h': h, 'w': w}
        out.append(d)
    json.dump(out, sys.stdout, ensure_ascii=False)
    sys.exit(0)
for ws in wb.worksheets[1:]:
    m = re.fullmatch(r't([\d.]+) V(\d+)', ws.title)
    if not m:
        continue
    # 見出しの行（A列が「底W」）と、各段の「底W」の列を探す
    hr = next((r for r in range(1, 30) if ws.cell(r, 1).value in ('底W', '上面W')), None)
    if hr is None:
        continue
    cols = [c for c in range(1, 30) if ws.cell(hr, c).value in ('底W', '上面W')]
    ents = {}
    for c0 in cols:
        ce = next((c for c in range(c0 + 1, c0 + 12) if str(ws.cell(hr, c).value or '').startswith('実績')), c0 + 2)
        for r in range(hr + 1, hr + 200):
            W = ws.cell(r, c0).value
            if not isinstance(W, (int, float)):
                if W is None and ws.cell(r + 1, c0).value is None:
                    break
                continue
            v = num(ws.cell(r, ce).value)
            if v is not None:
                ents[str(int(W))] = v
    # いちばん小さい断面の実績（見出しの上の「いちばん小さい断面」の行。「立上り」「底W」の右の欄）
    mn = {}
    for r in range(1, hr):
        if 'いちばん小さい断面' in str(ws.cell(r, 1).value or ''):
            for c in range(2, 30):
                lab = ws.cell(r, c).value
                if lab in ('立上り', '底W', '上面W'):
                    v = num(ws.cell(r, c + 1).value)
                    if isinstance(v, (int, float)):
                        mn['h' if lab == '立上り' else 'w'] = v
    t = float(m.group(1))
    d = {'t': int(t) if t.is_integer() else t, 'V': int(m.group(2)), 'entries': ents}
    if 'h' in mn and 'w' in mn:
        d['min'] = mn
    out.append(d)
json.dump(out, sys.stdout, ensure_ascii=False)
