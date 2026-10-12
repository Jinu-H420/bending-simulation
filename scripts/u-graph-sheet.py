# コの字曲げの実績入力シート（グラフ版）を作る。2026-10-12 ユーザーと決めた形。
#   1〜16枚目「型ごと」：1型1枚（A3横）。横＝底W、縦＝低いほうの立上りH（外寸）の方眼に、計算の境目（点線）と上限の数字、
#                        右に 5mm 刻みの数字の表。曲げ屋さんが 曲がった寸法に○、だめだった寸法に× を打つ。
#                               型は 鉄 の各板厚の基準金型＋薄板の V8（t1.2・t1.6）。縞は入れない。
#   最後の1枚「品物ごと」      ：曲げた品物を1件1行で書く（u-sheet-form2.py と同じ。そのまま実績 zuRecords に登録できる項目）。
#   底Wで曲げられる高さが変わり、途中にくぼみもある（例 V25 t4.5 は底W110〜160で下がる）ので、決まった幅の数字欄ではなく、グラフに点で書いてもらう。
#   使い方: node scripts/u-table-sim.mjs > ut.json（早見表と同じ数字）
#           python scripts/u-graph-sheet.py ut.json <出力.xlsx> <作業フォルダ（グラフの画像を置く）>
import json
import sys
from datetime import date

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import rcParams
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.page import PageMargins
from openpyxl.worksheet.properties import PageSetupProperties

import os
sim_path, out_path, work = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(work, exist_ok=True)
fig_path = os.path.join(work, 'u-shape.png')
rows = json.load(open(sim_path, encoding='utf-8'))
# 材質（鉄 → 縞）・V・板厚の順に並べる（JSON は 5・6 が 3.2 より先に来ることがある）
rows.sort(key=lambda r: (['鉄', '縞'].index(r['mat']), r['V'], r['t']))
FONT = 'Meiryo UI'
TODAY = date.today().isoformat()
WS = [30, 50, 100, 200]   # u-sheet-sim.mjs と同じ（参考に出す底W）
PAIRS = 3                 # 「底W ＿ のとき 立上りH上限 ＿」を書ける組の数

# ---------------------------------------------------------------- 図（寸法の取り方）
rcParams['font.family'] = ['Meiryo', 'Yu Gothic', 'MS Gothic']


def arrow(ax, x1, y1, x2, y2):
    ax.annotate('', xy=(x1, y1), xytext=(x2, y2), arrowprops=dict(arrowstyle='<->', color='#555', lw=1.2))


fig, axs = plt.subplots(2, 1, figsize=(3.4, 4.6))
a = axs[0]
a.plot([0, 0, 110, 110], [70, 0, 0, 70], color='#111', lw=5, solid_joinstyle='miter')
arrow(a, -14, 0, -14, 70); a.text(-30, 35, '立上り\nH1', ha='center', va='center', fontsize=11, fontweight='bold')
arrow(a, 124, 0, 124, 70); a.text(141, 35, '立上り\nH2', ha='center', va='center', fontsize=11, fontweight='bold')
arrow(a, 0, -14, 110, -14); a.text(55, -27, '底W', ha='center', va='center', fontsize=11, fontweight='bold')
a.text(55, 32, 'すべて外寸', fontsize=10, color='#444', ha='center')
a.set_xlim(-48, 158); a.set_ylim(-38, 90)
b = axs[1]
b.plot([0, 0, 110, 110], [70, 0, 0, 70], color='#bbb', lw=5, solid_joinstyle='miter')
b.plot([0, 0], [0, 70], color='#c00', lw=5)
b.text(55, 84, '立上りが高いと、2か所目を曲げるとき\n先に立てた立上りが上型に当たる', color='#c00', fontsize=9.5, ha='center', fontweight='bold')
b.text(55, 30, '当たるときは\n中押し（への字→両サイド\n→真ん中を押して戻す）', color='#555', fontsize=8.5, ha='center')
b.set_xlim(-48, 158); b.set_ylim(-10, 110)
for ax in axs:
    ax.set_aspect('equal')
    ax.axis('off')
fig.tight_layout(pad=0.2)
fig.savefig(fig_path, dpi=200, facecolor='white')
plt.close(fig)

# ---------------------------------------------------------------- 共通の部品
thin = Side(style='thin', color='999999')
box = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD = PatternFill('solid', fgColor='E8EBE6')
ENTRY = PatternFill('solid', fgColor='FFF7E6')     # 記入欄＝うすい黄
SIMF = PatternFill('solid', fgColor='EAF1FB')      # シミュレーション＝うすい青
MATF = PatternFill('solid', fgColor='F0F0EC')
EXF = PatternFill('solid', fgColor='F4F4F4')       # 記入例＝うすい灰


def put(ws, r, c, v, *, bold=False, size=13, fill=None, wrap=True, align='center', color=None, italic=False):
    cell = ws.cell(r, c, v)
    cell.font = Font(name=FONT, size=size, bold=bold, color=color, italic=italic)
    cell.alignment = Alignment(horizontal=align, vertical='center', wrap_text=wrap)
    cell.border = box
    if fill:
        cell.fill = fill
    return cell


def widths(ws, cols, target):
    # A3横（余白込み）に収まる文字数の目安。合計が target になるよう、列幅をまとめて伸ばす
    scale = target / sum(w for _, w in cols)
    for i, (_, w) in enumerate(cols, start=1):
        ws.column_dimensions[get_column_letter(i)].width = max(4.5, w * scale)


def header(ws, title, intro, span):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)
    t = ws.cell(1, 1, f'{title}　―　株式会社高橋鉄骨')
    t.font = Font(name=FONT, size=17, bold=True)
    t.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[1].height = 23
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span)
    n = ws.cell(2, 1, intro)
    n.font = Font(name=FONT, size=9.5)
    n.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
    ws.row_dimensions[2].height = 46


def a3(ws, head_rows):
    ws.page_setup.paperSize = 8          # A3
    ws.page_setup.orientation = 'landscape'
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_margins = PageMargins(left=0.3, right=0.3, top=0.35, bottom=0.3, header=0.2, footer=0.2)
    if head_rows:
        ws.print_title_rows = head_rows


def figure(ws, col):
    img = XLImage(fig_path)
    img.width, img.height = 200, 270
    ws.column_dimensions[get_column_letter(col - 1)].width = 2
    ws.column_dimensions[get_column_letter(col)].width = 29
    ws.add_image(img, f'{get_column_letter(col)}4')


wb = Workbook()

# ---------------------------------------------------------------- 型ごとのグラフ（1面ずつ A3横・数字つき。○×を打つ）
# 2026-10-12 ユーザー「具体的な数字が分かるように。グラフをもっと大きく」→ 1型1枚にし、線の上に数字、右に 5mm 刻みの数字の表。
from matplotlib.ticker import MultipleLocator

def series(row):
    """u-table-sim.mjs の hmax（底W 5mm ごとの低いほうの上限）を、並べた点にする。'なし' は上端に張り付ける"""
    pts = []
    for k in sorted(row['hmax'], key=lambda x: int(x)):
        W, v = int(k), row['hmax'][k]
        pts.append((W, None if v is None else (H_SHOW if v == 'なし' else v), v == 'なし'))
    return pts

H_SHOW = 300

def wrange(row):
    pts = series(row)
    ok = [W for W, h, _ in pts if h is not None]
    if not ok:
        return 0, 300
    lo = max(0, min(ok) - 10)
    # 「なし」になってから先は要らない
    hi = max(ok)
    for W, h, top in pts:
        if top:
            hi = W
            break
    return lo, max(hi, 150)

def draw_graph(row, path):
    pts = series(row)
    w_lo, w_hi = 0, wrange(row)[1]
    # 300mm より先はまっすぐ伸びるだけなので、グラフは 300 まで（小さい型）。先の数字は右の表で
    if (row.get('wMin') or 0) < 200:
        w_hi = min(w_hi, 300)
    else:
        # 大きい型は底Wが広い所しか使わないので、左を詰める
        w_lo = max(0, int((row['wMin'] - 30) // 50) * 50)
    lab = 10 if (row.get('wMin') or 0) < 150 else 20     # 線が急な大きい型は数字を間引く
    hs = [h for _, h, _ in pts if h is not None and _ <= w_hi]
    top = max(hs + [100])
    ymax = min(300, max(150, (int(top) // 50 + 1) * 50))
    fig, ax = plt.subplots(figsize=(10.0, 8.0))
    ax.set_xlim(w_lo, w_hi); ax.set_ylim(0, ymax)
    ax.xaxis.set_major_locator(MultipleLocator(50)); ax.xaxis.set_minor_locator(MultipleLocator(10))
    ax.yaxis.set_major_locator(MultipleLocator(50)); ax.yaxis.set_minor_locator(MultipleLocator(10))
    ax.grid(which='major', color='#8a8a8a', lw=0.9)
    ax.grid(which='minor', color='#d4d4d4', lw=0.5)
    ax.tick_params(labelsize=12)
    # 境目（つながっている所ごと）
    segs, cur = [], []
    for W, h, _t in pts:
        if W > w_hi:
            break
        if h is None:
            if cur: segs.append(cur); cur = []
        else:
            cur.append((W, h))
    if cur: segs.append(cur)
    for sg in segs:
        xs = [p[0] for p in sg]; ys = [p[1] for p in sg]
        ax.fill_between(xs, 0, ys, color='#2a78d6', alpha=0.08, lw=0)
        ax.plot(xs, ys, color='#2a78d6', lw=1.8, ls='--', alpha=0.8, marker='o', ms=2.6)
    # 数字：10mm ごとに線の上へ（くぼみ＝前より下がった所は赤）。混む所は交互に上下へずらす
    prev = None
    for i, (W, h, topflag) in enumerate(pts):
        if W > w_hi or h is None or topflag:
            prev = h if h is not None else None
            continue
        if W % lab == 0:
            dip = prev is not None and h < prev
            dy = ymax * (0.025 if (W // lab) % 2 == 0 else 0.055)
            ax.text(W, h + dy, f'{h}', fontsize=11, ha='center', va='bottom',
                    color='#c62f2f' if dip else '#1f4f8f', fontweight='bold' if dip else 'normal')
        prev = h
    # 最小フランジ・いちばん狭い底W
    ax.axhline(row['minOut'], color='#888', lw=1, ls=':')
    ax.text(w_hi - (w_hi - w_lo) * 0.01, row['minOut'] + ymax * 0.012, f"最小フランジ {row['minOut']}", color='#666', fontsize=10.5, ha='right', va='bottom')
    if row.get('wMin'):
        ax.axvline(row['wMin'], color='#888', lw=1, ls=':')
        ax.text(row['wMin'] + (w_hi - w_lo) * 0.006, ymax * 0.975, f"底W {row['wMin']} より狭いと ×", color='#666', fontsize=10.5, va='top')
        ax.plot([row['wMin']], [row['hLow']], marker='s', ms=7, color='#0a7d0a')
        ax.annotate(f"いちばん小さい\n立上り{row['hLow']}×底W{row['wMin']}", xy=(row['wMin'], row['hLow']),
                    xytext=(row['wMin'] + (w_hi - w_lo) * 0.09, ymax * 0.03), fontsize=10.5, color='#0a7d0a', va='bottom',
                    fontweight='bold', arrowprops=dict(arrowstyle='->', color='#0a7d0a'))
    ax.set_xlabel('底W（外寸 mm）', fontsize=13)
    ax.set_ylabel('低いほうの立上りH（外寸 mm）', fontsize=13)
    fig.tight_layout(pad=0.5)
    fig.savefig(path, dpi=150, facecolor='white')
    plt.close(fig)

GW, GH = 1000, 800         # Excel に置く大きさ（px）。図の縦横比 10:8。A3横いっぱい
COLW_G = 10                # グラフ側の列幅（1列 ≒ 75px）
G_COLS = 14                # グラフが使う列（14×75＝1050px）
T_BLOCKS = 3               # 右の表を何段に分けるか（底W・上限 の組を3つ横に）
graphs = sorted(rows, key=lambda r: (r['t'], r['base']))   # 板厚の小さい順。同じ板厚なら V8 を基準金型の前に
wb = Workbook()
for gi, row in enumerate(graphs, start=1):
    ws = wb.active if gi == 1 else wb.create_sheet()
    tag = '基準金型' if row['base'] else '小さいV'
    ws.title = f"t{row['t']} V{row['V']}"
    t0 = G_COLS + 2                       # 表の始まりの列（1列あける）
    span = t0 + 2 * T_BLOCKS - 1
    for c in range(1, G_COLS + 1):
        ws.column_dimensions[get_column_letter(c)].width = COLW_G
    ws.column_dimensions[get_column_letter(G_COLS + 1)].width = 2
    for b in range(T_BLOCKS):
        ws.column_dimensions[get_column_letter(t0 + 2 * b)].width = 7.5
        ws.column_dimensions[get_column_letter(t0 + 2 * b + 1)].width = 10   # 「62〜112」が入る幅
    header(ws, f"コの字曲げ 実績入力シート（型ごと {gi}／{len(graphs)}）　V{row['V']}　{row['sel'].split(':')[1]}・{row['machine']}　鉄 t{row['t']}（{tag}）",
           '書き方　曲げた寸法（底W・低いほうの立上りH。どちらも外寸）の所に、曲がったら ○、曲がらなかったら × を打ち、横に寸法（例 100×90）や伝票番号、「中押し」「抜けない」を書き添えてください。'
           '点線＝計算の境目（この線より下は、計算では普通に曲がる）。線の上の数字＝その底Wでの上限（10mm ごと。赤＝前より下がる所）。'
           '右の表は 5mm ごとに、その底Wで曲げられる立上り（下限〜上限）。緑＝いちばん小さい断面。'
           f'左右の立上りが違うときは低いほうで見ます（高いほうは計算では上限なし。ただし高すぎると機械から抜けないことがある）。（計算は {TODAY} 時点・ヤゲン904061・中間板標準・普通に曲げたとき）',
           span)
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=G_COLS)
    who = ws.cell(3, 1, '確かめた人：　　　　　　　　　　　　　　　日付：　　　　年　　月　　日')
    who.font = Font(name=FONT, size=11, bold=True)
    who.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[3].height = 19
    png = os.path.join(work, f"u-big-t{row['t']}-V{row['V']}.png")
    draw_graph(row, png)
    img = XLImage(png)
    img.width, img.height = GW, GH
    ws.add_image(img, 'A4')
    # 右の表：底W（5mm。いちばん狭い底Wの行も）と、曲げられる立上り（下限〜上限）
    ws.merge_cells(start_row=3, start_column=t0, end_row=3, end_column=span)
    sm = ws.cell(3, t0, f"いちばん小さい断面：立上り {row['hLow']} × 底W {row['wMin']}" if row.get('wMin') else 'この型は曲がらない')
    sm.font = Font(name=FONT, size=11, bold=True, color='0a7d0a')
    sm.alignment = Alignment(horizontal='left', vertical='center')
    w_lo, w_hi = wrange(row)
    vals = [(int(k), row['hmax'][k]) for k in sorted(row['hmax'], key=lambda x: int(x)) if w_lo <= int(k) <= w_hi]
    per = -(-len(vals) // T_BLOCKS)
    HR = 4
    for b in range(T_BLOCKS):
        put(ws, HR, t0 + 2 * b, '底W', bold=True, size=10, fill=HEAD)
        put(ws, HR, t0 + 2 * b + 1, '立上り', bold=True, size=10, fill=HEAD)
    for idx, (W, v) in enumerate(vals):
        b, k = divmod(idx, per)
        r = HR + 1 + k
        prevv = dict(vals).get(W - 5)
        dip = isinstance(v, (int, float)) and isinstance(prevv, (int, float)) and v < prevv
        first = W == row.get('wMin')            # いちばん狭い底W の行は緑で目立たせる
        WF2 = PatternFill('solid', fgColor='DDF2DD') if first else MATF
        put(ws, r, t0 + 2 * b, W, size=10.5, bold=True, fill=WF2)
        if v is None:
            put(ws, r, t0 + 2 * b + 1, '×', size=10.5, color='999999')
        elif v == 'なし':
            put(ws, r, t0 + 2 * b + 1, f"{row['hLow']}〜なし", size=10.5, color='0a7d0a')
        else:
            put(ws, r, t0 + 2 * b + 1, f"{row['hLow']}〜{v}", size=11, bold=dip or first,
                color='c62f2f' if dip else ('0a7d0a' if first else None), fill=PatternFill('solid', fgColor='DDF2DD') if first else None)
    rows_needed = max(per, 44)          # グラフ（40行分）＋下の余り。少なめだと横軸の名前が印刷で切れる
    ws.row_dimensions[HR].height = 15
    for rr in range(HR + 1, HR + 1 + rows_needed):
        ws.row_dimensions[rr].height = 15     # 15pt＝20px（グラフ 800px ＝ 40行）
    a3(ws, None)
    ws.print_area = f'A1:{get_column_letter(span)}{HR + rows_needed}'

# ---------------------------------------------------------------- 2枚目：品物ごと
ws2 = wb.create_sheet('品物ごと')
cols2 = [('No', 4), ('日付', 9), ('伝票番号', 11), ('材質', 6), ('板厚 t', 6), ('下型', 9),
         ('立上りH1', 8), ('底W', 8), ('立上りH2', 8), ('曲げ長さ L', 9),
         ('結果\n○／✕', 7), ('曲げ方', 10), ('✕のときの理由', 14), ('当たった所・ひとこと', 26), ('確かめた人', 10)]
last2 = len(cols2)
widths(ws2, cols2, 158)
header(ws2, 'コの字曲げ 実績入力シート（品物ごと）',
       '書き方　曲げた品物を1件1行で書いてください。① 寸法はすべて外寸（右の絵）。② 結果は 曲がった＝○、曲がらなかった＝✕。'
       '③ 材質・下型・結果・曲げ方・理由は、セルを選ぶと出る ▼ から選べます（手書きでもかまいません）。'
       '④ 曲がらなかったときは、理由（型に当たった／曲げた後に抜けなかった など）と当たった所を書いてください。中押しで曲げたら曲げ方を「中押し」に。'
       '1行目は記入例です（消して使ってください）。',
       last2 + 2)
figure(ws2, last2 + 2)
HR2 = 4
ws2.merge_cells(start_row=3, start_column=1, end_row=3, end_column=6)
c = ws2.cell(3, 1, '寸法はすべて外寸（mm）')
c.font = Font(name=FONT, size=11, bold=True)
ws2.row_dimensions[3].height = 19
for i, (h, _) in enumerate(cols2, start=1):
    put(ws2, HR2, i, h, bold=True, size=10.5, fill=HEAD)
ws2.row_dimensions[HR2].height = 36

example = ['例', '10/12', '12345', '鉄', 4.5, 'V25', 50, 100, 50, 800, '○', '普通', '', '記入例（消して使う）', '曲げ 田中']
NOTE_COL = 14   # 当たった所・ひとこと（左寄せ）
N_ROWS = 25
for k in range(N_ROWS + 1):
    rr = HR2 + 1 + k
    for i in range(1, last2 + 1):
        if k == 0:
            put(ws2, rr, i, example[i - 1], size=11, fill=EXF, color='777777', italic=True,
                align='left' if i == NOTE_COL else 'center')
        else:
            put(ws2, rr, i, k if i == 1 else None, size=12, fill=None if i == 1 else ENTRY,
                align='left' if i == NOTE_COL else 'center')
    ws2.row_dimensions[rr].height = 27 if k else 22

# 選べる欄（▼）。リストにない書き方でも入れられるよう、エラーにはしない
dies = ['V8', 'V12', 'V12 2溝', 'V16', 'V16 2溝', 'V20', 'V20 2溝', 'V25', 'V25 2溝',
        'V32', 'V40', 'V50', 'V63', 'V80', 'V100', 'V125', 'V160']
first, end = HR2 + 2, HR2 + 1 + N_ROWS
for col, items in [(4, ['鉄', '縞']), (6, dies), (11, ['○', '✕']), (12, ['普通', 'くの字165', 'くの字100', '中押し']),
                   (13, ['型に当たった', '曲げた後 抜けない', '長さ（力）が足りない', 'その他'])]:
    dv = DataValidation(type='list', formula1='"' + ','.join(items) + '"', allow_blank=True, showErrorMessage=False)
    ws2.add_data_validation(dv)
    L = get_column_letter(col)
    dv.add(f'{L}{first}:{L}{end}')
a3(ws2, f'{HR2}:{HR2}')
ws2.freeze_panes = ws2.cell(HR2 + 1, 1)

wb.save(out_path)
print('saved', out_path)
