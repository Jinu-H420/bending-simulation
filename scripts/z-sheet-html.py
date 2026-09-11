# -*- coding: utf-8 -*-
# Z曲げ_実績記入シート.xlsx を、そのまま眺めるための HTML に起こす。
# xlsx が更新されたら、このスクリプトを流し直せば表示も追いつく。
import openpyxl, html, datetime, os

SRC = "docs/Z曲げ_実績記入シート.xlsx"
DST = os.environ["OUT"]
ws = openpyxl.load_workbook(SRC, data_only=True).active

def v(coord):
    x = ws[coord].value
    return "" if x is None else str(x).strip()

# 表示する列と見出し（空欄しかない J・L・M も記入欄なので残す）
COLS = [
    ("A", "下型", "k"), ("B", "V幅", "k"), ("C", "曲げ内R", "k"),
    ("D", "材質", "k"), ("E", "板厚t", "k"),
    ("F", "最小フランジ<br>外寸(表)", "ref"), ("G", "段差S<br>暫定", "ref"), ("H", "段差S<br>幾何", "ref"),
    ("I", "フランジA 上限<br>(その段差Sのとき)", "act"), ("J", "フランジA<br>最大", "act"),
    ("K", "段差S<br>最小", "act"), ("L", "フランジB<br>最小", "act"), ("M", "フランジB<br>最大", "act"),
    ("N", "備考", "act"),
    ("Q", "読み取りメモ", "memo"),
    ("R", "sim 最小<br>段差S", "sim"), ("S", "厳しい<br>ほう", "sim"), ("T", "実績−sim", "sim"),
    ("V", "sim フランジA<br>上限", "cmp"), ("W", "実績−sim", "cmp"), ("X", "判定", "cmp"),
    ("U", "計算条件", "cond"),
]
GROUPS = [("金型・材質・板厚", 5, "k"), ("参考 ── いまの計算値", 3, "ref"),
          ("記入 ── 実際の値", 6, "act"), ("読み取りメモ", 1, "memo"),
          ("シミュレーション（2026-09-11）", 3, "sim"),
          ("フランジA上限の突き合わせ", 3, "cmp"), ("計算条件", 1, "cond")]

def num(s):
    try: return float(s)
    except: return None

rows = []
for r in range(8, 52):
    a = v("A%d" % r)
    if not a: continue
    if a.startswith("材質："):
        rows.append(("head", a)); continue
    rows.append(("row", r))

def cell(r, col, kind):
    s = v("%s%d" % (col, r))
    cls = kind
    if col in ("T", "W"):
        n = num(s)
        if n is not None:
            cls += " pos" if n > 0 else (" neg" if n < 0 else "")
    if col == "X" and s:
        cls += " ng" if "甘い" in s else " ok"
    return '<td class="%s">%s</td>' % (cls, html.escape(s).replace("\n", "<br>"))

body = []
for kind, x in rows:
    if kind == "head":
        body.append('<tr class="sec"><th colspan="%d">%s</th></tr>' % (len(COLS), html.escape(x)))
        continue
    r = x
    tr = "".join(cell(r, c, k) for c, _, k in COLS)
    warn = ' class="warn"' if "甘い" in v("X%d" % r) else ""
    body.append("<tr%s>%s</tr>" % (warn, tr))

notes = []
for r in list(range(60, 65)) + list(range(68, 85)):
    s = v("A%d" % r)
    if s: notes.append(html.escape(s))

g1 = "".join('<th class="%s" colspan="%d">%s</th>' % (c, n, html.escape(t)) for t, n, c in GROUPS)
g2 = "".join('<th class="%s">%s</th>' % (k, t) for _, t, k in COLS)

mt = datetime.datetime.fromtimestamp(os.path.getmtime(SRC)).strftime("%Y-%m-%d %H:%M")
doc = """<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Z曲げ 実績記入シート</title><style>
:root{color-scheme:dark}
body{margin:0;background:#0b1220;color:#e2e8f0;font:13px/1.5 "Yu Gothic UI","Meiryo",system-ui,sans-serif}
header{padding:14px 16px;border-bottom:1px solid #1e293b}
h1{margin:0 0 4px;font-size:17px}
.sub{color:#94a3b8;font-size:12px}
.wrap{overflow:auto;max-height:72vh;border-bottom:1px solid #1e293b}
table{border-collapse:collapse;white-space:nowrap;font-size:12px}
th,td{border:1px solid #1e293b;padding:3px 7px;text-align:center;vertical-align:middle}
thead th{position:sticky;top:0;background:#0f172a;z-index:2;font-weight:600;font-size:11px}
thead tr:first-child th{top:0}thead tr:last-child th{top:32px}
td.k,th.k{background:#0f172a}
td.ref,th.ref{background:#0e2338}
td.act,th.act{background:#2a2410}
td.memo,th.memo{background:#141b2b;white-space:normal;min-width:230px;max-width:230px;text-align:left;font-size:11px;line-height:1.35;color:#cbd5e1}
td.sim,th.sim{background:#0d2620}
td.cmp,th.cmp{background:#241428}
td.cond,th.cond{background:#111827;white-space:normal;min-width:270px;max-width:270px;text-align:left;font-size:10.5px;line-height:1.35;color:#94a3b8}
td.act{color:#fde68a}
td.pos{color:#fca5a5}td.neg{color:#7dd3fc}
td.ok{color:#86efac}td.ng{color:#fca5a5;font-weight:700}
tr.warn td.k:first-child{box-shadow:inset 3px 0 0 #ef4444}
tr.sec th{background:#1e293b;text-align:left;padding:5px 10px;font-size:12px;position:sticky;left:0}
tbody tr:hover td{filter:brightness(1.25)}
.notes{padding:14px 16px;color:#cbd5e1;font-size:12px;max-width:900px}
.notes p{margin:0 0 5px}
.notes p.imp{color:#fca5a5}
.legend{padding:8px 16px;color:#94a3b8;font-size:11.5px}
.legend span{display:inline-block;margin-right:14px}
.sw{display:inline-block;width:11px;height:11px;border:1px solid #334155;vertical-align:-1px;margin-right:4px}
.pbtn{margin-left:8px;padding:3px 12px;font:12px inherit;border:1px solid #475569;border-radius:4px;
background:#1e293b;color:#e2e8f0;cursor:pointer}
.pbtn:hover{background:#334155}
@media print{
  @page{size:A3 landscape;margin:5mm}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{background:#fff;color:#000;font-size:9px}
  header{padding:0 0 4px;border-bottom:1px solid #999}
  h1{font-size:13px}.sub{color:#444;font-size:8.5px}
  .legend{padding:3px 0;color:#444;font-size:8.5px}
  .pbtn{display:none}
  .wrap{overflow:visible;max-height:none;border:0;width:406mm}
  table{font-size:8.5px;width:100%%;table-layout:auto}
  thead{display:table-header-group}
  th,td{border:1px solid #aaa;padding:0 3px;line-height:1.25;color:#000}
  thead th{position:static;background:#eee}
  td.k,th.k{background:#f1f5f9}
  td.ref,th.ref{background:#e3f0fb}
  td.act,th.act{background:#fdf3d0}td.act{color:#7a5a00}
  td.memo,th.memo{background:#f4f5f8;min-width:0;max-width:132px;font-size:7.5px;color:#333}
  td.sim,th.sim{background:#e2f4ec}
  td.cmp,th.cmp{background:#f6e9f8}
  td.cond,th.cond{background:#f6f7f9;min-width:0;max-width:150px;font-size:7px;color:#444}
  td.pos{color:#b91c1c}td.neg{color:#0369a1}
  td.ok{color:#15803d}td.ng{color:#b91c1c}
  tr.warn td.k:first-child{box-shadow:inset 3px 0 0 #b91c1c}
  tr.sec th{background:#ddd;color:#000;position:static}
  tbody tr{break-inside:avoid}
  .notes{padding:5px 0 0;color:#222;font-size:7.5px;line-height:1.35;max-width:none;column-count:3;column-gap:12px}
  .notes p{margin:0 0 2px;break-inside:avoid}
  .notes p.imp{color:#b91c1c}
}
</style></head><body>
<header><h1>%s</h1>
<div class="sub">%s</div>
<div class="sub">出典 docs/Z曲げ_実績記入シート.xlsx（更新 %s）</div></header>
<div class="legend">
<span><i class="sw" style="background:#0e2338"></i>参考（計算値）</span>
<span><i class="sw" style="background:#2a2410"></i>実績（手書きから）</span>
<span><i class="sw" style="background:#0d2620"></i>シミュレーション</span>
<span><i class="sw" style="background:#241428"></i>突き合わせ</span>
<span style="color:#fca5a5">赤い縦線の行＝シミュレーションが甘い</span>
<button class="pbtn" onclick="window.print()">A3横で印刷</button>
</div>
<div class="wrap"><table><thead><tr>%s</tr><tr>%s</tr></thead><tbody>%s</tbody></table></div>
<div class="notes">%s</div></body></html>""" % (
    html.escape(v("A1")), html.escape(v("A2")), mt, g1, g2, "".join(body),
    "".join('<p class="%s">%s</p>' % ("imp" if n.startswith("※【重要") or "要調査" in n else "", n) for n in notes))

open(DST, "w", encoding="utf-8").write(doc)
print("wrote", DST, len(doc), "bytes /", len([r for r in rows if r[0] == "row"]), "rows")
