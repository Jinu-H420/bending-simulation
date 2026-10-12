# コの字曲げ 早見グラフ（u-chart-sheet.py で作った xlsx）から、各型の表に書いてある実績を読む。
#   出力: [{ t, V, entries: { 底W: 立上り | '×' } }]（u-fit.mjs に渡す）
#   使い方: python scripts/u-chart-read.py 早見グラフ.xlsx > 実績.json
import json
import re
import sys

from openpyxl import load_workbook

wb = load_workbook(sys.argv[1])
out = []
for ws in wb.worksheets[1:]:
    m = re.fullmatch(r't([\d.]+) V(\d+)', ws.title)
    if not m:
        continue
    # 見出しの行（A列が「底W」）と、各段の「底W」の列を探す
    hr = next((r for r in range(1, 30) if ws.cell(r, 1).value == '底W'), None)
    if hr is None:
        continue
    cols = [c for c in range(1, 30) if ws.cell(hr, c).value == '底W']
    ents = {}
    for c0 in cols:
        for r in range(hr + 1, hr + 200):
            W = ws.cell(r, c0).value
            if not isinstance(W, (int, float)):
                if W is None and ws.cell(r + 1, c0).value is None:
                    break
                continue
            v = ws.cell(r, c0 + 2).value
            if isinstance(v, str):
                v = v.strip().translate(str.maketrans('０１２３４５６７８９．', '0123456789.'))
                if v in ('×', '✕', 'x', 'X', '✖'):
                    v = '×'
                else:
                    try:
                        v = float(v)
                    except ValueError:
                        v = None
            if isinstance(v, float) and v.is_integer():
                v = int(v)
            if v is not None:
                ents[str(int(W))] = v
    t = float(m.group(1))
    out.append({'t': int(t) if t.is_integer() else t, 'V': int(m.group(2)), 'entries': ents})
json.dump(out, sys.stdout, ensure_ascii=False)
