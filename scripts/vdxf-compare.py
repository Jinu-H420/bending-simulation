# -*- coding: utf-8 -*-
# 利用者が描いた V.dxf（HG・HD の実機断面）と、シミュレーターが持っている形を重ねて比べる。
# 位置合わせは各型の「ダイ天面」と「V溝の中心」。シミュと同じく x右・y下向き（天面が0）。
#
# 使い方: python scripts/vdxf-compare.py <V.dxf> <sim_dies.json> <出力フォルダ>
import sys, os, json, math
from collections import defaultdict
import ezdxf
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib import font_manager

dxf_path, sim_path, outdir = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(outdir, exist_ok=True)
sim = json.load(open(sim_path, encoding="utf-8"))
doc = ezdxf.readfile(dxf_path)
msp = doc.modelspace()

segs = []
for e in msp.query("LINE"):
    a = (e.dxf.start[0], e.dxf.start[1]); b = (e.dxf.end[0], e.dxf.end[1])
    segs.append((e.dxf.get("color", 256), a, b))
texts = [(e.dxf.insert[0], e.dxf.insert[1], e.dxf.text) for e in msp.query("TEXT")]

def length(a, b): return math.hypot(b[0] - a[0], b[1] - a[1])

cols = []   # (label, cx, top, xlo, xhi, ylo, yhi)

# ---- HG：ダイ（黄=色2）の閉じた小ループ h≈60 を見つけ、その列を1型とする
def closed_loops(cands):
    K = lambda p: (round(p[0], 3), round(p[1], 3))
    adj = defaultdict(list)
    for i, (_, a, b) in enumerate(cands):
        adj[K(a)].append(i); adj[K(b)].append(i)
    used = [False] * len(cands); out = []
    for i in range(len(cands)):
        if used[i]: continue
        used[i] = True; _, a, b = cands[i]; pts = [a, b]; endp = b
        while True:
            nx = [j for j in adj[K(endp)] if not used[j]]
            if not nx: break
            j = nx[0]; used[j] = True; _, a2, b2 = cands[j]
            endp = b2 if K(a2) == K(endp) else a2; pts.append(endp)
        if K(pts[0]) == K(pts[-1]) and len(pts) > 4: out.append(pts)
    return out

hg_labels = {"V8", "V12", "V16", "V20", "V25"}
hd_labels = {"V32", "V40", "V50", "V63", "V80", "V100", "V125", "V160"}
lab_pos = [t for t in texts if t[2] in hg_labels | hd_labels]

for L in closed_loops([s for s in segs if s[0] == 2 and s[1][1] > 2800]):
    xs = [p[0] for p in L]; ys = [p[1] for p in L]
    h = max(ys) - min(ys); w = max(xs) - min(xs)
    if abs(h - 60) < 1 and w < 40:
        top = max(ys)
        vpts = [p for p in L if p[1] > top - 15]
        vb = min(vpts, key=lambda p: p[1])
        lab = min((t for t in lab_pos if t[2] in hg_labels), key=lambda t: math.hypot(t[0] - vb[0], t[1] - vb[1]))[2]
        cols.append((lab, vb[0], top, vb[0] - 260, vb[0] + 260, top - 1200, top + 250))

# ---- HD：ベッドの左右の縦線（色2・長さ≈895）の組で列を決め、ダイ（水色=色4）の天面と谷を取る
verts = sorted([s for s in segs if s[0] == 2 and abs(s[1][0] - s[2][0]) < 1e-6
                and abs(abs(s[1][1] - s[2][1]) - 895) < 1 and s[1][1] < 2800], key=lambda s: s[1][0])
xs895 = sorted({round(s[1][0], 3) for s in verts})
pairs = []
used = set()
for x in xs895:
    if x in used: continue
    mate = [y for y in xs895 if y not in used and y != x and abs((y - x) - 214) < 1]
    if mate:
        pairs.append((x, mate[0])); used |= {x, mate[0]}
for xl, xr in pairs:
    cx = (xl + xr) / 2
    base_bottom = max(max(s[1][1], s[2][1]) for s in verts if abs(s[1][0] - xl) < 1e-3)
    c4 = [s for s in segs if s[0] == 4 and xl - 30 <= min(s[1][0], s[2][0]) and max(s[1][0], s[2][0]) <= xr + 30
          and base_bottom - 10 < min(s[1][1], s[2][1]) < base_bottom + 400]
    vert4 = [s for s in c4 if abs(s[1][0] - s[2][0]) < 1e-6 and length(s[1], s[2]) >= 20]
    top = max(max(s[1][1], s[2][1]) for s in vert4)
    # HD のダイは左右対称で、V溝はベッドの中心線上にある。谷の点を拾うとホルダの面取りを
    # 掴んでずれるので、横位置はベッドの左右の縦線の真ん中で合わせる。
    lab = min((t for t in lab_pos if t[2] in hd_labels), key=lambda t: abs(t[0] - cx) + abs(t[1] - top) * 0.3)[2]
    cols.append((lab, cx, top, xl - 60, xr + 60, top - 1250, top + 250))

order = ["V8", "V12", "V16", "V20", "V25", "V32", "V40", "V50", "V63", "V80", "V100", "V125", "V160"]
cols.sort(key=lambda c: order.index(c[0]))

for fp in ["C:/Windows/Fonts/YuGothM.ttc", "C:/Windows/Fonts/meiryo.ttc"]:
    if os.path.exists(fp):
        font_manager.fontManager.addfont(fp)
        plt.rcParams["font.family"] = font_manager.FontProperties(fname=fp).get_name(); break

def user_segments(c):
    lab, cx, top, x0, x1, y0, y1 = c
    out = []
    for col, a, b in segs:
        if col in (134, 1, 6, 7, 5): continue          # 寸法・注記
        if not (x0 <= a[0] <= x1 and x0 <= b[0] <= x1 and y0 <= a[1] <= y1 and y0 <= b[1] <= y1): continue
        if col == 4 and lab in hg_labels: continue      # HG側の水色は寸法線
        out.append(((a[0] - cx, top - a[1]), (b[0] - cx, top - b[1]), col))
    return out

report = []
def panel(ax, c, depth):
    lab = c[0]; s = sim[lab]
    kindcol = {"measured": "#22c55e", "generic": "#eab308"}.get(s["baseKind"])
    if kindcol:
        for p in s["polys"]:
            ax.add_patch(Polygon([(x, -y) for x, y in p], closed=True, facecolor=kindcol + "22", edgecolor=kindcol, lw=1.2))
    for p in s["die"]:
        ax.add_patch(Polygon([(x, -y) for x, y in p], closed=True, facecolor="#38bdf833", edgecolor="#38bdf8", lw=1.2))
    for a, b, col in user_segments(c):
        ax.plot([a[0], b[0]], [-a[1], -b[1]], color="#f8fafc", lw=0.9)
    ax.axvline(0, color="#60a5fa", lw=0.5, ls="--")
    ax.set_xlim(-180, 180); ax.set_ylim(-depth, 30); ax.set_aspect("equal")
    ax.set_facecolor("#0b1220")
    for sp in ax.spines.values(): sp.set_color("#334155")
    ax.tick_params(colors="#64748b", labelsize=6)
    kind = {"measured": "実測", "generic": "代用", "none": "なし"}[s["baseKind"]]
    ax.set_title(f"{lab}  {s['sel']}（{'HG2203' if s['machine']=='hg2203' else 'HD3504NT'}・シミュの土台 {kind}）", color="#e2e8f0", fontsize=8)

for depth, name in [(260, "上部"), (1150, "全体")]:
    fig, axes = plt.subplots(3, 5, figsize=(20, 12.5 if depth == 260 else 22))
    fig.patch.set_facecolor("#0b1220")
    for ax in axes.flat: ax.axis("off")
    for i, c in enumerate(cols):
        ax = axes.flat[i]; ax.axis("on"); panel(ax, c, depth)
    fig.suptitle(f"V.dxf（白線＝あなたの図面） と シミュレーター（水色＝ダイ・緑＝実測土台・黄＝代用土台）の重ね合わせ ／ {name}",
                 color="#f8fafc", fontsize=13)
    fig.tight_layout(rect=(0, 0, 1, 0.97))
    p = os.path.join(outdir, f"比較_{name}.png")
    fig.savefig(p, dpi=100, facecolor=fig.get_facecolor()); plt.close(fig)
    print("PNG", p)

# 数字の突き合わせ：図面側のダイ高さ・幅（ダイ線の外形）と、土台の一番下（ベッド上の基準）
for c in cols:
    lab = c[0]; us = user_segments(c)
    diecol = 2 if lab in hg_labels else 4
    dl = [(a, b) for a, b, col in us if col == diecol and max(a[1], b[1]) <= 130 and abs(a[0]) < 90 and abs(b[0]) < 90]
    ys = [p[1] for a, b in dl for p in (a, b)]; xs = [p[0] for a, b in dl for p in (a, b)]
    report.append({"V": lab, "図面_ダイ高さ": round(max(ys), 1) if lab in hg_labels else None,
                   "図面_ダイ幅": round(max(xs) - min(xs), 1) if dl else None,
                   "シミュ_ダイ高さ": sim[lab]["h"], "シミュ_ダイ幅": sim[lab]["w"],
                   "シミュ_V幅": sim[lab]["vW"], "シミュ_土台": sim[lab]["baseKind"]})
json.dump({"cols": [c[:3] for c in cols], "report": report}, open(os.path.join(outdir, "比較.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("cols", [(c[0], round(c[1], 1), round(c[2], 1)) for c in cols])
