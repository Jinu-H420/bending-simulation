# -*- coding: utf-8 -*-
# export-die-bases.mjs の JSON から、確認用の DXF と画像を作る。
#   DXF : 1:1・mm。V溝の谷を各枠の原点に置き、上が +Y（CADの向き）。
#   画像: 機械ごとに1枚。土台の上の方（深さ 300mm まで）を並べて見比べる用。
# 色分け: ダイ=水色 / 土台(実測)=緑 / 土台(代用・推測)=黄 / 土台なし=枠が赤
#
# 使い方: python scripts/die-bases-dxf.py <die-bases.json> <出力フォルダ>
import json, sys, os
import ezdxf
from ezdxf.enums import TextEntityAlignment
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon
from matplotlib import font_manager

src, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
data = json.load(open(src, encoding="utf-8"))
cells = data["cells"]

KIND_JA = {"measured": "実測", "generic": "代用（推測）", "none": "なし"}
MACH_JA = {"hg2203": "HG2203", "hd3504nt": "HD3504NT", "-": "機械不明"}

# ---------------------------------------------------------------- DXF
doc = ezdxf.new("R12")          # 実寸法師で開けた受領DXFと同じ AC1009
doc.encoding = "cp932"
for name, color in [("DIE", 4), ("BASE_MEASURED", 3), ("BASE_GENERIC", 2),
                    ("CENTER", 5), ("TEXT", 7), ("FRAME", 8), ("FRAME_NOBASE", 1)]:
    doc.layers.add(name, color=color)
msp = doc.modelspace()

CELL_W, CELL_H = 520, 1400      # 1枠の大きさ（ベッドの下端 1120mm まで入る）
COLS = 8

def place(poly, ox, oy):
    return [(ox + x, oy - y) for x, y in poly]   # y を反転（シミュは下が +）

def draw_cell(cell, ox, oy):
    base_layer = "BASE_MEASURED" if cell["baseKind"] == "measured" else "BASE_GENERIC"
    has_base = cell["baseKind"] in ("measured", "generic")
    frame = "FRAME" if has_base or cell["kind"] == "baseonly" else "FRAME_NOBASE"
    msp.add_polyline2d([(ox - CELL_W / 2, oy + 170), (ox + CELL_W / 2, oy + 170),
                        (ox + CELL_W / 2, oy - CELL_H + 170), (ox - CELL_W / 2, oy - CELL_H + 170)],
                       close=True, dxfattribs={"layer": frame})
    if has_base:
        for p in cell["base"]:
            msp.add_polyline2d(place(p, ox, oy), close=True, dxfattribs={"layer": base_layer})
    for p in cell["die"]:
        msp.add_polyline2d(place(p, ox, oy), close=True, dxfattribs={"layer": "DIE"})
    msp.add_line((ox, oy + 60), (ox, oy - 250), dxfattribs={"layer": "CENTER"})
    lines = [cell["title"], f"機械 {MACH_JA.get(cell['machine'], cell['machine'])}　土台 {KIND_JA.get(cell['baseKind'], cell['baseKind'])}"]
    if cell["kind"] == "die":
        lines.append(f"V幅 {cell['vWidth']}　深さ {cell['depth']}" + ("　特殊（V支点は手動）" if cell["manual"] else ""))
        lines.append(cell["sel"])
    for i, t in enumerate(lines):
        msp.add_text(t, height=11 if i else 13, dxfattribs={"layer": "TEXT"}).set_placement(
            (ox - CELL_W / 2 + 10, oy + 150 - i * 20), align=TextEntityAlignment.LEFT)

# 並べ方：1段目＝土台だけ、そのあと機械ごとにブロック
rows = [("土台だけ（機械ごとに共通のはずの部分）", [c for c in cells if c["kind"] == "baseonly"])]
for m in data["machines"]:
    rows.append((f"{MACH_JA[m]} に各ダイを載せた状態（シミュレーターの認識）",
                 [c for c in cells if c["kind"] == "die" and c["machine"] == m]))

y = 0
for head, group in rows:
    msp.add_text(head, height=30, dxfattribs={"layer": "TEXT"}).set_placement(
        (-CELL_W / 2, y + 260), align=TextEntityAlignment.LEFT)
    for i, c in enumerate(group):
        r, k = divmod(i, COLS)
        draw_cell(c, k * CELL_W, y - r * CELL_H)
    nrows = (len(group) + COLS - 1) // COLS
    y -= nrows * CELL_H + 400

msp.add_text("凡例：水色=ダイ　緑=土台（取付図の実測）　黄=土台（代用・推測）　赤枠=土台なし　青=V中心　単位mm・1:1",
             height=22, dxfattribs={"layer": "TEXT"}).set_placement((-CELL_W / 2, 480), align=TextEntityAlignment.LEFT)
dxf_path = os.path.join(outdir, "ダイ土台_全種類.dxf")
doc.saveas(dxf_path)

# ---------------------------------------------------------------- 確認画像
for fp in ["C:/Windows/Fonts/YuGothM.ttc", "C:/Windows/Fonts/meiryo.ttc", "C:/Windows/Fonts/msgothic.ttc"]:
    if os.path.exists(fp):
        font_manager.fontManager.addfont(fp)
        plt.rcParams["font.family"] = font_manager.FontProperties(fname=fp).get_name()
        break

COL = {"die": "#38bdf8", "measured": "#22c55e", "generic": "#eab308"}

def render(group, title, path, cols=6, depth=300):
    n = len(group)
    rows_ = (n + cols - 1) // cols
    fig, axes = plt.subplots(rows_, cols, figsize=(cols * 3.0, rows_ * 3.2), squeeze=False)
    fig.patch.set_facecolor("#0b1220")
    for ax in axes.flat:
        ax.set_facecolor("#0b1220"); ax.axis("off")
    for i, c in enumerate(group):
        ax = axes.flat[i]
        has_base = c["baseKind"] in ("measured", "generic")
        if has_base:
            for p in c["base"]:
                ax.add_patch(Polygon([(x, -y) for x, y in p], closed=True,
                                     facecolor=COL[c["baseKind"]] + "33", edgecolor=COL[c["baseKind"]], lw=0.8))
        for p in c["die"]:
            ax.add_patch(Polygon([(x, -y) for x, y in p], closed=True,
                                 facecolor="#38bdf855", edgecolor=COL["die"], lw=1.0))
        ax.axvline(0, color="#60a5fa", lw=0.5, ls="--")
        ax.set_xlim(-140, 140); ax.set_ylim(-depth, 40); ax.set_aspect("equal")
        kind = KIND_JA.get(c["baseKind"], c["baseKind"])
        color = {"measured": "#86efac", "generic": "#fde047", "none": "#fca5a5"}.get(c["baseKind"], "#e2e8f0")
        ax.set_title(c["title"], color="#e2e8f0", fontsize=7.5, pad=2)
        ax.text(0.02, 0.02, f"土台 {kind}", transform=ax.transAxes, color=color, fontsize=8, fontweight="bold")
        if not has_base:
            for s in ax.spines.values():
                s.set_visible(True); s.set_color("#ef4444")
    fig.suptitle(title, color="#f8fafc", fontsize=13, y=0.995)
    fig.tight_layout(rect=(0, 0, 1, 0.985))
    fig.savefig(path, dpi=110, facecolor=fig.get_facecolor())
    plt.close(fig)

pngs = []
for head, group in rows:
    key = "土台だけ" if group and group[0]["kind"] == "baseonly" else MACH_JA[group[0]["machine"]]
    path = os.path.join(outdir, f"ダイ土台_{key}.png")
    render(group, head + "（深さ300mmまで表示）", path, cols=3 if key == "土台だけ" else 6)
    pngs.append(path)

print("DXF", dxf_path)
for p in pngs:
    print("PNG", p)
