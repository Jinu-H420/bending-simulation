# コの字曲げ・ハット曲げ 早見グラフ（Excel のグラフ機能で作る。A3横）。形は JSON の shape（'HAT' ならハット、なければコの字）
#   ハット：横軸＝上面W、縦軸＝立上り（下限〜上限）。外フランジは型ごとに固定（JSON の A）。元の計算は scripts/hat-table.json（hat-table-sim.mjs）
#   早見表（u-table-sheet.py）と同じ数字を、Excel のグラフにする。画像ではないので、点にマウスを当てると数字が出て、拡大もできる。
#   1枚目「全部の型」：16型の上限の線を重ねる。2枚目から 1型1枚：左に 5mm 刻みの表（計算の立上り 下限〜上限＋実績を書く欄＋見込み）、
#   右にグラフ（計算の線＋実績の線）。縦軸は低いほうの立上り（左右違うときは低いほうで見る）。
#   ★に書いた実績に計算を合わせ直す（u-fit.mjs）と、その型は「実績に合わせた計算」で見込みを出す。書いた実績も持ち越す。
#   使い方: node scripts/u-table-sim.mjs > scripts/u-table.json
#           python scripts/u-chart-sheet.py scripts/u-table.json <出力.xlsx>
#           （実績を書いた後は python scripts/u-refit.py で、読む→合わせる→作り直す までまとめてやる）
import json
import sys
from datetime import date

from openpyxl import Workbook
from openpyxl.chart import Reference, ScatterChart, Series
from openpyxl.chart.label import DataLabelList
from openpyxl.chart.layout import Layout, ManualLayout
from openpyxl.chart.marker import Marker
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.line import LineProperties
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.worksheet.page import PageMargins
from openpyxl.worksheet.properties import PageSetupProperties
from openpyxl.drawing.image import Image as XLImage
import os
import tempfile

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import rcParams

sim_path, out_path = sys.argv[1], sys.argv[2]
rows = json.load(open(sim_path, encoding='utf-8'))
rows.sort(key=lambda r: (r['t'], r['base']))
FONT = 'Meiryo UI'
TODAY = date.today().isoformat()
HAT = rows[0].get('shape') == 'HAT'
NAME = 'ハット曲げ' if HAT else 'コの字曲げ'
WN = '上面W' if HAT else '底W'                     # 横軸の寸法の呼び名
HN = '立上り' if HAT else '低いほうの立上り'
W_TOP = 300 if HAT else 400                         # 計算してある幅の上限
H_TOP = 300

thin = Side(style='thin', color='999999')
box = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD = PatternFill('solid', fgColor='E8EBE6')
MINF = PatternFill('solid', fgColor='DDF2DD')
WF = PatternFill('solid', fgColor='F4F1E8')
COLORS = ['1F77B4', 'FF7F0E', '2CA02C', 'D62728', '9467BD', '8C564B', 'E377C2', '7F7F7F',
          'BCBD22', '17BECF', '393B79', 'AD494A', '637939', '8C6D31', '843C39', '7B4173']


def put(ws, r, c, v, *, bold=False, size=11, fill=None, color=None, align='center'):
    cell = ws.cell(r, c, v)
    cell.font = Font(name=FONT, size=size, bold=bold, color=color)
    cell.alignment = Alignment(horizontal=align, vertical='center', wrap_text=True)
    cell.border = box
    if fill:
        cell.fill = fill
    return cell


def a3(ws, area):
    ws.page_setup.paperSize = 8
    ws.page_setup.orientation = 'landscape'
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_margins = PageMargins(left=0.3, right=0.3, top=0.35, bottom=0.3, header=0.2, footer=0.2)
    ws.print_area = area


def title(ws, text, note, span):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=span)
    t = ws.cell(1, 1, text)
    t.font = Font(name=FONT, size=16, bold=True)
    ws.row_dimensions[1].height = 24
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=span)
    n = ws.cell(2, 1, note)
    n.font = Font(name=FONT, size=10)
    n.alignment = Alignment(horizontal='left', vertical='center', wrap_text=True)
    ws.row_dimensions[2].height = 44


def line_props(color, width=2.25, dash=None, none=False):
    gp = GraphicalProperties()
    if none:
        gp.line.noFill = True
    else:
        gp.line.solidFill = color
        gp.line.width = int(width * 12700)
        if dash:
            gp.line.dashStyle = dash
    return gp


def axes(ch, xmin, xmax, ymax):
    ch.x_axis.title = f'{WN}（外寸 mm）'
    ch.y_axis.title = f'{HN}（外寸 mm）'
    ch.x_axis.scaling.min, ch.x_axis.scaling.max = xmin, xmax
    ch.y_axis.scaling.min, ch.y_axis.scaling.max = 0, ymax
    ch.x_axis.majorUnit = 50
    ch.y_axis.majorUnit = 50
    ch.x_axis.minorUnit = 10
    ch.y_axis.minorUnit = 10
    from openpyxl.chart.axis import ChartLines
    ch.x_axis.majorGridlines = ChartLines()
    ch.x_axis.minorGridlines = ChartLines()
    ch.y_axis.minorGridlines = ChartLines()
    ch.x_axis.minorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill='E2E2E2'))
    ch.y_axis.minorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill='E2E2E2'))
    ch.x_axis.majorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill='A6A6A6'))
    ch.y_axis.majorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill='A6A6A6'))
    ch.x_axis.delete = False
    ch.y_axis.delete = False
    ch.x_axis.number_format = '0'
    ch.y_axis.number_format = '0'


def pts_of(r):
    out = []
    for k in sorted(r['hmax'], key=lambda x: int(x)):
        W, v = int(k), r['hmax'][k]
        out.append((W, None if v is None else (H_TOP if v == 'なし' else v), v == 'なし'))
    return out


# ---------------------------------------------------------------- 寸法の取り方の絵（2026-10-13 ユーザー「どこの寸法か書いていない」）
rcParams['font.family'] = ['Yu Gothic', 'Meiryo', 'MS Gothic']
FIG_DIR = tempfile.mkdtemp(prefix='uchart-fig-')
_figs = {}


def dim_fig(A=None):
    """コの字・ハットの断面と寸法の取り方の絵（png のパス）。ハットは外フランジの長さ A を絵に書く"""
    if A in _figs:
        return _figs[A]
    def arrow(ax, x1, y1, x2, y2, txt, tx, ty, color='#222'):
        ax.annotate('', xy=(x1, y1), xytext=(x2, y2), arrowprops=dict(arrowstyle='<->', color='#555', lw=1.4))
        ax.text(tx, ty, txt, ha='center', va='center', fontsize=15, fontweight='bold', color=color)
    fig, ax = plt.subplots(figsize=(5.6, 2.9))
    if HAT:
        ax.plot([0, 45, 45, 125, 125, 170], [0, 0, 60, 60, 0, 0], color='#111', lw=6, solid_joinstyle='miter')
        arrow(ax, 0, -14, 45, -14, '外フランジ', 22, -28)
        arrow(ax, 125, -14, 170, -14, '外フランジ', 148, -28)
        arrow(ax, 31, 0, 31, 60, '立上りH', 8, 34)
        arrow(ax, 139, 0, 139, 60, '立上りH', 162, 34)
        arrow(ax, 45, 74, 125, 74, '上面W', 85, 88, color='#C00000')
        ax.text(85, -50, 'すべて外寸・左右同じ寸法' + (f'・外フランジ {A}mm で計算' if A else ''), fontsize=13, color='#333', ha='center')
        ax.set_xlim(-22, 192); ax.set_ylim(-60, 100)
    else:
        ax.plot([0, 0, 110, 110], [55, 0, 0, 75], color='#111', lw=6, solid_joinstyle='miter')
        arrow(ax, -14, 0, -14, 55, '立上り\n（低いほう）', -42, 28, color='#C00000')
        arrow(ax, 124, 0, 124, 75, '立上り', 146, 38)
        arrow(ax, 0, -14, 110, -14, '底W', 55, -28, color='#C00000')
        ax.text(55, -50, 'すべて外寸・左右の立上りが違うときは低いほうで見る', fontsize=13, color='#333', ha='center')
        ax.set_xlim(-70, 175); ax.set_ylim(-60, 90)
    ax.set_aspect('equal')
    ax.axis('off')
    fig.tight_layout(pad=0.1)
    path = os.path.join(FIG_DIR, f'fig_{A}.png')
    fig.savefig(path, dpi=150, facecolor='white')
    plt.close(fig)
    _figs[A] = path
    return path


def put_fig(ws, A, anchor, width_cm=11.5):
    img = XLImage(dim_fig(A))
    w = width_cm / 2.54 * 96
    img.height = img.height * w / img.width
    img.width = w
    ws.add_image(img, anchor)
    return img.height / 96 * 72          # 高さ（ポイント）


def row_after(ws, top_row, height_pt, default_pt=15):
    """top_row から height_pt ぶん下がった次の行"""
    acc, r = 0, top_row
    while acc < height_pt:
        acc += ws.row_dimensions[r].height or default_pt
        r += 1
    return r


def graph_range(r):
    ok = [W for W, h, _ in pts_of(r) if h is not None]
    if not ok:
        return 0, 300
    lo = 0 if (r.get('wMin') or 0) < 200 else max(0, int((r['wMin'] - 30) // 50) * 50)
    hi = 300 if (r.get('wMin') or 0) < 200 else min(max(ok), 400)
    return lo, hi


wb = Workbook()
ov = wb.active
ov.title = '全部の型'
first_data_col = 30          # 表のデータ置き場（印刷範囲の外）
HR = 8                       # 型ごとのシートの表の見出しの行

# ---------------------------------------------------------------- 1枚目：全部の型
title(ov, f'{NAME} 早見グラフ ― 型ごとの {HN}の上限（全部の型）　株式会社高橋鉄骨',
      (f'線＝その{WN}で曲げられる立上りの上限（外寸）。外フランジは型ごとに決めた長さ（各型のシートに書いてあります）。左右同じ寸法で見ます。'
       if HAT else
       '線＝その底Wで普通に曲げられる低いほうの立上りの上限（外寸）。左右の立上りが違うときは低いほうで見ます（高いほうは計算では上限なし。ただし高すぎると機械から抜けないことがある）。')
      + f'線にマウスを当てると数字が出ます。型ごとの詳しい数字は2枚目から（1型1枚）。計算は {TODAY} 時点・ヤゲン904061・中間板標準・普通に曲げたとき。',
      20)
Ws_all = list(range(5, 405, 5))
ov.cell(4, first_data_col, '底W')
for i, W in enumerate(Ws_all):
    ov.cell(5 + i, first_data_col, W)
ch = ScatterChart()
ch.style = 2
ch.width, ch.height = 40, 21
for j, r in enumerate(rows):
    c = first_data_col + 1 + j
    ov.cell(4, c, f"V{r['V']} t{r['t']}{'' if r['base'] else '（小さいV）'}{'（実績合わせ）' if r.get('fit') else ''}")
    for i, W in enumerate(Ws_all):
        v = (r['fit'] if r.get('fit') else r)['hmax'].get(str(W))
        ov.cell(5 + i, c, None if v is None else (H_TOP if v == 'なし' else v))
    xs = Reference(ov, min_col=first_data_col, min_row=5, max_row=4 + len(Ws_all))
    ys = Reference(ov, min_col=c, min_row=4, max_row=4 + len(Ws_all))
    s = Series(ys, xs, title_from_data=True)
    s.marker = Marker(symbol='none')
    s.graphicalProperties = line_props(COLORS[j % len(COLORS)], 1.75)
    s.smooth = False
    ch.series.append(s)
axes(ch, 0, W_TOP, 300)
ch.legend.position = 'r'
ov.add_chart(ch, 'A7')
# 型ごとのシートへ飛ぶ所（押すと、その型の「実績を入れる」表へ）
ov.merge_cells(start_row=3, start_column=1, end_row=3, end_column=24)
nv = ov.cell(3, 1, '実績を入れるときは、下の型を押してください（その型のシートの表へ飛びます。★の赤い枠に書きます）。各型のシートは Excel の下の見出しからも選べます。')
nv.font = Font(name=FONT, size=12, bold=True, color='9C5700')
nv.fill = PatternFill('solid', fgColor='FFF2B3')
nv.alignment = Alignment(horizontal='left', vertical='center')
for j, r in enumerate(rows):
    rr, cc = 4 + j // 8, 1 + (j % 8) * 3
    ov.merge_cells(start_row=rr, start_column=cc, end_row=rr, end_column=cc + 2)
    sname = f"t{r['t']} V{r['V']}"
    c = ov.cell(rr, cc, f"V{r['V']}  t{r['t']}{'（小さいV）' if not r['base'] else ''} の実績 →")
    c.hyperlink = f"#'{sname}'!A{HR}"
    c.font = Font(name=FONT, size=11, bold=True, color='0563C1', underline='single')
    c.alignment = Alignment(horizontal='center', vertical='center')
    c.border = box
for rr in range(3, 55):
    ov.row_dimensions[rr].height = 15
ov.row_dimensions[3].height = 22
ov.row_dimensions[4].height = 20
ov.row_dimensions[5].height = 20   # 行の高さを決めておく（既定の高さは Excel の設定で変わり、グラフが印刷で切れる）
fh = put_fig(ov, None, 'A53', 13)
a3(ov, f'A1:X{row_after(ov, 53, fh) + 1}')

# ---------------------------------------------------------------- 2枚目から：1型1枚（左に表、右にグラフ）
# 2026-10-13 ユーザー：「右の表が一部見えない」「表を実績値で埋めたい（下の10行の欄は使えない）」→ 作り直し。
#   左＝表：底W（5mm＋いちばん狭い底W）ごとに、計算の立上り（下限〜上限）と、実績の上限を書く欄（黄色）。
#   右＝グラフ：計算の線＋実績の線。表にかぶらないよう表の右に置く。
# 2026-10-13 ユーザー「入力する数が多い。間は補填できるなら」→ ★の行（6か所くらい）だけ書けば、間は「見込み」で埋まる。
#   見込み＝その底Wの計算 ＋（実績−計算）の差を、前後の書いた行から底Wで按分したもの（計算の山や谷の形はそのまま）。
#   × の行は区切り（× をまたいでは埋めない）。書いた行より外側は埋めない。ほかの行も書けば、それが優先。
ENTRY = PatternFill('solid', fgColor='FFF2B3')
KEYF = PatternFill('solid', fgColor='FFD24D')
RED = Side(style='thick', color='C00000')
KEYBOX = Border(left=RED, right=RED, top=RED, bottom=RED)
CALCF = PatternFill('solid', fgColor='EEF3FA')
BADF = PatternFill('solid', fgColor='F4B6B6')
ESTF = PatternFill('solid', fgColor='FCE9D9')
BLK = 2                       # 表を何段（横）に分けるか
BW = (7, 10, 10, 9) if HAT else (7, 10, 8.5, 9)   # 1段の列幅：底W・計算・実績・見込み（ハットは「24〜122」と書くので実績を広く）


def ent_text(v):
    """書いてある実績を表に戻す（ハットの範囲 {lo, hi} は「25〜75」に）"""
    if isinstance(v, dict):
        return f"{v.get('lo', '')}〜{v.get('hi', '')}"
    return v


def key_ws(vals):
    """書いてもらう底W（★）：いちばん狭い・いちばん広い・計算の山と谷・100mm ごと（近すぎるものは省く）"""
    calcs = [(W, v) for W, v in vals if isinstance(v, (int, float))]
    if not calcs:
        return []
    keys = [calcs[0][0], calcs[-1][0]]
    for a in range(len(calcs) - 1):
        if calcs[a + 1][1] < calcs[a][1]:
            keys.append(calcs[a][0])
            b, m = a + 1, a + 1
            while b < len(calcs) and calcs[b][1] <= calcs[a][1]:
                if calcs[b][1] < calcs[m][1]:
                    m = b
                b += 1
            keys.append(calcs[m][0])
            break
    have = {W for W, _ in calcs}
    for W in ([50] if calcs[0][0] < 40 else []) + list(range(100, calcs[-1][0], 100)):
        if W in have and all(abs(W - k) >= 20 for k in keys):
            keys.append(W)
    return sorted(set(keys))


for gi, r in enumerate(rows, start=1):
    tag = '基準金型' if r['base'] else '小さいV'
    ws = wb.create_sheet(f"t{r['t']} V{r['V']}")
    nb = len(BW)
    tcols = BLK * nb + (BLK - 1)          # 表の列（段のあいだに1列すき間）
    gcol = tcols + 2                      # グラフの始まりの列（表の右に1列あける）
    span = gcol + 15
    title(ws, f"{NAME} 早見グラフ {gi}／{len(rows)}　V{r['V']}　{r['sel'].split(':')[1]}・{r['machine']}　鉄 t{r['t']}（{tag}）"
          + (f"　外フランジ {r['A']}" if HAT and r.get('wMin') else ''),
          ('寸法の取り方はグラフの下の絵。' + (f'★の赤い枠に、実際に曲げられた立上りの範囲を「25〜75」のように書いてください（上だけなら 75、曲がらなかったら ×）。外フランジ {r["A"]}mm・左右同じ寸法で計算しています。'
            if HAT else
            '★の赤い枠に、実際に曲げられた一番高い立上り（外寸）を書いてください（曲がらなかったら ×）。')
           + f'★だけ書けば、間の行は「見込み」に自動で入ります。いちばん小さい断面が計算と違えば、7行目の赤い枠に（立上り・{WN}）。'
           '保存して Claude に「計算し直して」と言うと、★に合わせて計算そのものを直し、見込みがもっと確かになります（合わない★は赤で知らせます）。'
           + ('' if HAT else '左右の立上りが違うときは低いほうで見ます。')
           + f'計算は {TODAY} 時点・ヤゲン904061・中間板標準・普通に曲げたとき。'), span)
    for b in range(BLK):
        for k, w in enumerate(BW):
            ws.column_dimensions[get_column_letter(1 + b * (nb + 1) + k)].width = w
        if b < BLK - 1:
            ws.column_dimensions[get_column_letter(1 + b * (nb + 1) + nb)].width = 1.5
    ws.column_dimensions[get_column_letter(gcol - 1)].width = 2
    for c in range(gcol, span + 1):
        ws.column_dimensions[get_column_letter(c)].width = 9

    lo, hi = graph_range(r)
    vals = [(int(k), r['hmax'][k]) for k in sorted(r['hmax'], key=lambda x: int(x)) if lo <= int(k) <= hi]
    keys = key_ws(vals)
    n = len(vals)
    fit = r.get('fit')
    fx = fit['hmax'] if fit else r['hmax']     # 見込みの元にする計算（実績に合わせたものがあればそれ）
    ents = r.get('entries') or {}
    lows = (fit if fit and 'hmin' in fit else r).get('hmin') or {}   # ハットの下限（その幅ごと）
    clows = r.get('hmin') or {}
    dc = 40                                    # グラフ用・見込みの計算（印刷範囲の外の列）
    hc = dc + 14
    WL = get_column_letter(dc)

    def Cl(j):                                 # 0 計算 1 差 2 前の底W 3 前の差 4 次の底W 5 次の差 6 見込み 7 見込み−計算
        return get_column_letter(hc + j)

    # ---- 1mm ごとの答え（印刷範囲の外）と、底Wを入れると答えが出る欄
    lc = 70
    h1 = r.get('h1') or {}
    f1 = fit['h1'] if fit else h1
    for i, k in enumerate(sorted(h1, key=lambda x: int(x))):
        v = h1[k]
        txt = ('× 曲がらない' if v is None else f"{r['hLow']}〜なし（上限なし）" if v == 'なし'
               else f"{v} だけ" if v == r['hLow'] else f"{r['hLow']} 〜 {v}")
        ws.cell(4 + i, lc, int(k)); ws.cell(4 + i, lc + 1, txt)
        fv = f1.get(k)
        ws.cell(4 + i, lc + 2, fv if isinstance(fv, (int, float)) else None)
    nlk = max(len(h1), 1)
    L1, L2, L3 = get_column_letter(lc), get_column_letter(lc + 1), get_column_letter(lc + 2)
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=2)
    put(ws, 3, 1, f'{WN}を入れる →', bold=True, size=11, fill=HEAD)
    put(ws, 3, 3, r.get('wMin'), bold=True, size=14, fill=ENTRY)
    IN = 'C3'
    ws.merge_cells(start_row=3, start_column=4, end_row=3, end_column=tcols)
    wmin = r.get('wMin') or 0
    put(ws, 3, 4, (f'=IF({IN}="","",IFERROR("計算の立上り "&VLOOKUP(INT({IN}),${L1}$4:${L2}${3 + nlk},2,FALSE),'
                   f'IF(INT({IN})<{wmin},"× 曲がらない（{WN} {wmin} より狭い）","表は{WN} {W_TOP} まで")))'),
        bold=True, size=13, color='0A7D0A', align='left')
    # 1mm ごとの見込み：1mm の計算 ＋ 前後の表の行の（見込み−計算）を按分
    WR = f'${WL}$4:${WL}${3 + n}'
    OR_ = f'${Cl(7)}$4:${Cl(7)}${3 + n}'
    X = f'INT({IN})'
    a = f'MATCH({X},{WR},1)'
    off = (f'IF({X}=INDEX({WR},{a}),INDEX({OR_},{a}),INDEX({OR_},{a})+(INDEX({OR_},{a}+1)-INDEX({OR_},{a}))'
           f'*({X}-INDEX({WR},{a}))/(INDEX({WR},{a}+1)-INDEX({WR},{a})))')
    EC = f'{get_column_letter(lc + 4)}3'
    ws[EC] = f'=IF({IN}="","",IFERROR(ROUND(VLOOKUP({X},${L1}$4:${L3}${3 + nlk},3,FALSE)+{off},0),""))'
    ws.merge_cells(start_row=4, start_column=1, end_row=4, end_column=tcols)
    put(ws, 4, 1, (f'=IF({IN}="","",IF({EC}="","（実績からの見込みは、前後の★に実績を書くと出ます）",'
                   f'"実績からの見込み {r["hLow"]} 〜 "&{EC}))'), bold=True, size=12, color='B45F06', align='left')
    ws.merge_cells(start_row=5, start_column=1, end_row=5, end_column=tcols)
    put(ws, 5, 1, (f"★ 書く所 {len(keys)}か所：{WN} " + '・'.join(str(k) for k in keys)) if keys else
        ('この型は計算ではハットに曲がらない（外フランジ150まで試した）。曲がった実績があれば表に書いてください' if HAT else ''),
        bold=True, size=13, color='C00000', fill=KEYF, align='left')
    ws.merge_cells(start_row=6, start_column=1, end_row=6, end_column=tcols)
    bads = [k for k in fit['checks'] if k['bad']] if fit else []
    if fit:
        nchk = len(fit['checks'])
        ftxt = (f"実績に合わせて計算し直し済み：{nchk}か所中 {nchk - len(bads)}か所が合う" +
                ''.join((f"　合わない いちばん小さい{k['act']}（計算では曲がらない）" if k.get('kind') == 'min' else
                         f"　合わない {WN}{k['W']}（実績{k['act']}／計算{'×' if k['fit'] is None else k['fit']}）") for k in bads) +
                (f"　※実績の立上り {fit['minLow']['h']} は最小フランジの表（{r['minOut']}）より低い → 表を直すか確認"
                 if fit.get('minLow') else ''))
        warn = bads or fit.get('minLow')
        put(ws, 6, 1, ftxt, bold=True, size=11, color='C00000' if warn else '0A7D0A', fill=BADF if warn else MINF, align='left')
    else:
        put(ws, 6, 1, '★や「いちばん小さい」の実績を書いて保存したら、Claude に「計算し直して」と言ってください', size=10.5, color='666666', align='left')
    # いちばん小さい断面：計算と、実績を書く欄（立上り・底W）。2026-10-13 ユーザー「最小が実績と違うとき」
    mn = r.get('minAct') or {}
    ws.merge_cells(start_row=7, start_column=1, end_row=7, end_column=nb)
    mchg = bool(fit and r.get('wMin') and (fit['hLow'], fit['wMin']) != (r['hLow'], r['wMin']))
    if not r.get('wMin'):
        mtxt = 'いちばん小さい断面 計算では曲がらない 実績→'
    elif mchg:
        mtxt = f"いちばん小さい断面 計算 {r['hLow']}×{r['wMin']}／実績合わせ {fit['hLow']}×{fit['wMin']}　実績→"
    else:
        mtxt = f"いちばん小さい断面 計算 {r['hLow']}×{r['wMin']}　実績→"
    put(ws, 7, 1, mtxt, bold=True, size=10, color='0A7D0A', fill=MINF, align='left')
    put(ws, 7, nb + 2, '立上り', bold=True, size=10, fill=HEAD)
    put(ws, 7, nb + 4, WN, bold=True, size=10, fill=HEAD)
    for cc, v in ((nb + 3, mn.get('h')), (nb + 5, mn.get('w'))):
        e7 = put(ws, 7, cc, v, bold=True, size=12, fill=KEYF)
        e7.border = KEYBOX
    MH, MW = f'{get_column_letter(nb + 3)}7', f'{get_column_letter(nb + 5)}7'

    # ---- 左の表
    per = -(-n // BLK)
    # 合わない★の前後（書いてある隣の行まで）は要確認
    eW = sorted(int(k) for k in ents)
    badW = set()
    for k in bads:
        lo_ = max([w for w in eW if w < k['W']], default=k['W'])
        hi_ = min([w for w in eW if w > k['W']], default=k['W'])
        badW |= {W for W, _ in vals if lo_ < W < hi_ or W == k['W']}
    for b in range(BLK):
        c0 = 1 + b * (nb + 1)
        put(ws, HR, c0, WN, bold=True, size=10 if not HAT else 9.5, fill=HEAD)
        put(ws, HR, c0 + 1, '計算の立上り\n下限〜上限', bold=True, size=9.5, fill=HEAD)
        put(ws, HR, c0 + 2, '実績\n下限〜上限' if HAT else '実績\n（記入）', bold=True, size=9 if HAT else 10, fill=KEYF)
        put(ws, HR, c0 + 3, '見込み\n実績合わせ' if fit else '見込み\n（自動）', bold=True, size=9 if fit else 9.5, fill=ESTF)
    ws.row_dimensions[HR].height = 42
    d = dict(vals)
    for idx, (W, v) in enumerate(vals):
        b, k = divmod(idx, per)
        rr, c0 = HR + 1 + k, 1 + b * (nb + 1)
        R = 4 + idx                            # 見込みの計算の行
        first = W == r.get('wMin')
        key = W in keys
        pv = d.get(W - 5)
        dip = isinstance(v, (int, float)) and isinstance(pv, (int, float)) and v < pv
        wc = put(ws, rr, c0, W, size=11 if key else 10.5, bold=True, fill=KEYF if key else (MINF if first else WF),
                 color='C00000' if key else None)
        if key:
            wc.number_format = '"★"0'
        lw = clows.get(str(W)) or r['hLow']
        if v is None:
            put(ws, rr, c0 + 1, '×', size=10.5, color='999999', fill=CALCF)
        elif v == 'なし':
            put(ws, rr, c0 + 1, f"{lw}〜なし", size=10.5, color='0A7D0A', fill=CALCF)
        else:
            put(ws, rr, c0 + 1, (f"{v}だけ" if v == lw else f"{lw}〜{v}"), size=11, bold=dip or first,
                color='C62F2F' if dip else ('0A7D0A' if first else None), fill=MINF if first else CALCF)
        ec = put(ws, rr, c0 + 2, ent_text(ents.get(str(W))), size=11.5 if not HAT else 10.5, bold=True, fill=KEYF if key else None)
        if key:
            ec.border = KEYBOX
        E = f'{get_column_letter(c0 + 2)}{rr}'
        el = lows.get(str(W)) or (fit or r)['hLow'] or r['hLow']
        put(ws, rr, c0 + 3, f'=IF(ISNUMBER({Cl(6)}{R}),"{el}〜"&{Cl(6)}{R},{Cl(6)}{R})', size=11, color='C00000' if W in badW else 'B45F06', fill=BADF if W in badW else ESTF)
        # 見込みの計算
        isx = f'OR({E}="×",{E}="✕")'
        T_ = f'SUBSTITUTE(SUBSTITUTE({E},"~","〜"),"-","〜")'
        ws.cell(R, hc + 8, f'=IF(ISNUMBER({E}),{E},IFERROR(VALUE(MID({T_},FIND("〜",{T_})+1,9)),""))')
        U_ = f'{Cl(8)}{R}'
        D_, P, Q, Wc = f'{Cl(1)}{R}', f'{Cl(2)}{R}', f'{Cl(4)}{R}', f'{WL}{R}'
        ws.cell(R, dc, W)
        fv = fx.get(str(W))
        if fv is None and fit:                 # 実績合わせで いちばん狭い幅 がずれた行は 1mm ごとの答えから
            fv = (fit.get('h1') or {}).get(str(W))
        ws.cell(R, hc, fv if isinstance(fv, (int, float)) else None)
        ws.cell(R, hc + 1, f'=IF(ISNUMBER({U_}),IF(ISNUMBER({Cl(0)}{R}),{U_}-{Cl(0)}{R},""),IF({isx},"x",""))')
        pw, pd = (f'{Cl(2)}{R - 1}', f'{Cl(3)}{R - 1}') if idx else ('""', '""')
        nw, nd = (f'{Cl(4)}{R + 1}', f'{Cl(5)}{R + 1}') if idx < n - 1 else ('""', '""')
        ws.cell(R, hc + 2, f'=IF({D_}="x","",IF(ISNUMBER({D_}),{Wc},{pw}))')
        ws.cell(R, hc + 3, f'=IF({D_}="x","",IF(ISNUMBER({D_}),{D_},{pd}))')
        ws.cell(R, hc + 4, f'=IF({D_}="x","",IF(ISNUMBER({D_}),{Wc},{nw}))')
        ws.cell(R, hc + 5, f'=IF({D_}="x","",IF(ISNUMBER({D_}),{D_},{nd}))')
        ws.cell(R, hc + 6, (f'=IF(ISNUMBER({U_}),{U_},IF({isx},"×",IF(AND(ISNUMBER({Cl(0)}{R}),ISNUMBER({P}),ISNUMBER({Q})),'
                            f'IF({Q}={P},{Cl(0)}{R}+{Cl(3)}{R},ROUND({Cl(0)}{R}+{Cl(3)}{R}+({Cl(5)}{R}-{Cl(3)}{R})*({Wc}-{P})/({Q}-{P}),0)),"")))'))
        ws.cell(R, hc + 7, f'=IF(AND(ISNUMBER({Cl(6)}{R}),ISNUMBER({Cl(0)}{R})),{Cl(6)}{R}-{Cl(0)}{R},"")')
        # グラフ用
        h = H_TOP if v == 'なし' else v
        ws.cell(R, dc + 1, h)
        ws.cell(R, dc + 2, h if (h is not None and W % 10 == 0 and v != 'なし') else None)
        ws.cell(R, dc + 3, h if (isinstance(h, (int, float)) and isinstance(pv, (int, float)) and h < pv) else None)
        ws.cell(R, dc + 4, f'=IF(ISNUMBER({U_}),{U_},NA())')
        if HAT:
            cl = clows.get(str(W))
            ws.cell(R, dc + 13, cl if isinstance(cl, (int, float)) else None)
        ws.cell(R, dc + 5, f'=IF({isx},{r["hLow"]},NA())')
        ws.cell(R, dc + 10, f'=IF(ISNUMBER({Cl(6)}{R}),{Cl(6)}{R},NA())')
        ws.cell(R, dc + 11, h if (key and isinstance(h, (int, float))) else None)
        if fit:
            ws.cell(R, dc + 12, H_TOP if fv == 'なし' else fv)
    last_row = HR + per
    for rr in range(HR + 1, last_row + 1):
        ws.row_dimensions[rr].height = 16
    # 実績の欄は、数字か × だけ（書き間違いを防ぐ。注意を出すだけで、止めはしない）
    dv = DataValidation(type='custom', formula1=f'OR(ISNUMBER(C{HR + 1}),C{HR + 1}="×",C{HR + 1}="✕")',
                        allow_blank=True, showErrorMessage=False)
    ws.add_data_validation(dv)
    for b in range(BLK):
        L = get_column_letter(1 + b * (nb + 1) + 2)
        dv.add(f'{L}{HR + 1}:{L}{last_row}')
    for j, name in enumerate(['底W', '計算の上限', '10mmごとの数字', '下がる所', '実績の上限', '実績で曲がらない',
                              '最小フランジ x', '最小フランジ y', '小さい x', '小さい y', '見込み', '★', '実績に合わせた計算', '計算の下限']):
        ws.cell(3, dc + j, name)
    for j, name in enumerate(['計算', '差', '前の底W', '前の差', '次の底W', '次の差', '見込み', '見込み−計算', '書いた上限']):
        ws.cell(3, hc + j, name)
    pts = [(W, (H_TOP if v == 'なし' else v), v == 'なし') for W, v in vals]
    ws.cell(4, dc + 6, lo); ws.cell(4, dc + 7, r['minOut'])
    ws.cell(5, dc + 6, hi); ws.cell(5, dc + 7, r['minOut'])
    if r.get('wMin'):
        ws.cell(4, dc + 8, r['wMin']); ws.cell(4, dc + 9, r['hLow'])
    ws.cell(6, dc + 8, f'=IF(AND(ISNUMBER({MH}),ISNUMBER({MW})),{MW},NA())')
    ws.cell(6, dc + 9, f'=IF(AND(ISNUMBER({MH}),ISNUMBER({MW})),{MH},NA())')
    ymax = min(300, max(150, (int(max([h for _, h, _ in pts if h is not None] + [100])) // 50 + 1) * 50))

    # ---- 右のグラフ
    ch = ScatterChart()
    ch.style = 2
    rows_h = max(last_row, 30) - 2
    ch.height = max(16.5, rows_h * 0.565)
    ch.width = 27
    XR = Reference(ws, min_col=dc, min_row=4, max_row=3 + n)
    s1 = Series(Reference(ws, min_col=dc + 1, min_row=4, max_row=3 + n), XR, title='計算の上限（5mmごと）')
    s1.marker = Marker(symbol='circle', size=4)
    s1.marker.graphicalProperties = GraphicalProperties(solidFill='2A78D6')
    s1.marker.graphicalProperties.line.solidFill = '2A78D6'
    s1.graphicalProperties = line_props('2A78D6', 2)
    s1.smooth = False
    s2 = Series(Reference(ws, min_col=dc + 2, min_row=4, max_row=3 + n), XR, title='10mmごとの数字')
    s2.marker = Marker(symbol='none')
    s2.graphicalProperties = line_props(None, none=True)
    s2.dLbls = DataLabelList()
    s2.dLbls.showVal = True
    s2.dLbls.showSerName = False
    s2.dLbls.showCatName = False
    s2.dLbls.showLegendKey = False
    s2.dLbls.position = 't'
    s3 = Series(Reference(ws, min_col=dc + 3, min_row=4, max_row=3 + n), XR, title='計算で下がる所')
    s3.marker = Marker(symbol='circle', size=7)
    s3.marker.graphicalProperties = GraphicalProperties(solidFill='9DB8DE')
    s3.marker.graphicalProperties.line.solidFill = '9DB8DE'
    s3.graphicalProperties = line_props(None, none=True)
    s8 = Series(Reference(ws, min_col=dc + 10, min_row=4, max_row=3 + n), XR, title='実績からの見込み')
    s8.marker = Marker(symbol='none')
    s8.graphicalProperties = line_props('E07B00', 2.5)
    s8.smooth = False
    s4 = Series(Reference(ws, min_col=dc + 4, min_row=4, max_row=3 + n), XR, title='実績（書いた所）')
    s4.marker = Marker(symbol='diamond', size=10)
    s4.marker.graphicalProperties = GraphicalProperties(solidFill='E07B00')
    s4.marker.graphicalProperties.line.solidFill = '7A3E00'
    s4.graphicalProperties = line_props(None, none=True)
    s5 = Series(Reference(ws, min_col=dc + 5, min_row=4, max_row=3 + n), XR, title='実績で曲がらない（×）')
    s5.marker = Marker(symbol='x', size=10)
    s5.marker.graphicalProperties = GraphicalProperties(noFill=True)
    s5.marker.graphicalProperties.line.solidFill = 'C62F2F'
    s5.marker.graphicalProperties.line.width = 28575
    s5.graphicalProperties = line_props(None, none=True)
    s6 = Series(Reference(ws, min_col=dc + 7, min_row=4, max_row=5), Reference(ws, min_col=dc + 6, min_row=4, max_row=5), title=f"最小フランジ {r['minOut']}")
    s6.marker = Marker(symbol='none')
    s6.graphicalProperties = line_props('888888', 1.25, dash='dash')
    s9 = Series(Reference(ws, min_col=dc + 11, min_row=4, max_row=3 + n), XR, title='★ 実績を書く所（赤い丸）')
    s9.marker = Marker(symbol='circle', size=16)
    s9.marker.graphicalProperties = GraphicalProperties(noFill=True)
    s9.marker.graphicalProperties.line.solidFill = 'C00000'
    s9.marker.graphicalProperties.line.width = 28575
    s9.graphicalProperties = line_props(None, none=True)
    ch.series.extend([s1, s2, s3, s9, s8, s4, s5, s6])
    if HAT:
        s12 = Series(Reference(ws, min_col=dc + 13, min_row=4, max_row=3 + n), XR, title='計算の下限')
        s12.marker = Marker(symbol='none')
        s12.graphicalProperties = line_props('2A78D6', 1.5, dash='sysDot')
        s12.smooth = False
        ch.series.append(s12)
    if fit:
        s10 = Series(Reference(ws, min_col=dc + 12, min_row=4, max_row=3 + n), XR, title='実績に合わせた計算')
        s10.marker = Marker(symbol='none')
        s10.graphicalProperties = line_props('0A7D0A', 1.75, dash='dash')
        s10.smooth = False
        ch.series.append(s10)
    if r.get('wMin'):
        s7 = Series(Reference(ws, min_col=dc + 9, min_row=4, max_row=4), Reference(ws, min_col=dc + 8, min_row=4, max_row=4),
                    title=f"いちばん小さい 立上り{r['hLow']}×{WN}{r['wMin']}")
        s7.marker = Marker(symbol='square', size=10)
        s7.marker.graphicalProperties = GraphicalProperties(solidFill='0A7D0A')
        s7.marker.graphicalProperties.line.solidFill = '0A7D0A'
        s7.graphicalProperties = line_props(None, none=True)
        ch.series.append(s7)
    s11 = Series(Reference(ws, min_col=dc + 9, min_row=6, max_row=6), Reference(ws, min_col=dc + 8, min_row=6, max_row=6),
                 title='実績のいちばん小さい')
    s11.marker = Marker(symbol='square', size=11)
    s11.marker.graphicalProperties = GraphicalProperties(solidFill='E07B00')
    s11.marker.graphicalProperties.line.solidFill = '7A3E00'
    s11.graphicalProperties = line_props(None, none=True)
    ch.series.append(s11)
    axes(ch, lo, hi, ymax)
    ch.legend.position = 't'
    ws.add_chart(ch, f'{get_column_letter(gcol)}3')
    for rr in range(3, HR):
        ws.row_dimensions[rr].height = 22 if rr <= 5 else (32 if rr == 6 and (bads or (fit and fit.get('minLow'))) else ((32 if mchg else 21) if rr == 7 else 18))
    for rr in range(last_row + 1, last_row + 80):
        ws.row_dimensions[rr].height = 15
    fr = row_after(ws, 3, ch.height / 2.54 * 72) + 3     # グラフの下端から少しあける（行の高さの見積りが少し短く出るため）
    fh = put_fig(ws, r.get('A') if HAT and r.get('wMin') else None, f'{get_column_letter(gcol + 2)}{fr}', 15)
    end_row = max(last_row, row_after(ws, fr, fh))
    a3(ws, f'A1:{get_column_letter(span)}{end_row}')
    ws.freeze_panes = ws.cell(HR + 1, 1)

wb.save(out_path)
print('saved', out_path)
