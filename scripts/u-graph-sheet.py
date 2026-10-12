# コの字曲げの実績入力シート（グラフ版）を作る。2026-10-12 ユーザーと決めた形。
#   1〜3枚目「型ごと・グラフ」：横＝底W、縦＝立上りH（左右同じ高さ・外寸）の方眼に、計算の境目（点線）を引いておき、
#                               曲げ屋さんが 曲がった寸法に○、だめだった寸法に× を打つ。A3横1枚に6面。
#                               型は 鉄 の各板厚の基準金型＋薄板の V8（t1.2・t1.6）。縞は入れない。
#   最後の1枚「品物ごと」      ：曲げた品物を1件1行で書く（u-sheet-form2.py と同じ。そのまま実績 zuRecords に登録できる項目）。
#   底Wで曲げられる高さが変わり、途中にくぼみもある（例 V25 t4.5 は底W110〜160で下がる）ので、決まった幅の数字欄ではなく、グラフに点で書いてもらう。
#   使い方: node scripts/u-graph-sim.mjs > ug.json
#           python scripts/u-graph-sheet.py ug.json <出力.xlsx> <作業フォルダ（グラフの画像を置く）>
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

# ---------------------------------------------------------------- 1〜3枚目：型ごとのグラフ（○×を打つ）
from matplotlib.ticker import MultipleLocator

def draw_graph(row, path):
    fig, ax = plt.subplots(figsize=(4.4, 4.0))
    wmax = row['wMax']
    pts = [p for p in row['curve'] if p['H'] is not None]
    top = max([p['H'] for p in pts] + [100])
    ymax = min(300, max(150, (int(top) // 50 + 1) * 50))
    ax.set_xlim(0, wmax); ax.set_ylim(0, ymax)
    ax.xaxis.set_major_locator(MultipleLocator(50)); ax.xaxis.set_minor_locator(MultipleLocator(10))
    ax.yaxis.set_major_locator(MultipleLocator(50)); ax.yaxis.set_minor_locator(MultipleLocator(10))
    ax.grid(which='major', color='#8a8a8a', lw=0.8)
    ax.grid(which='minor', color='#d8d8d8', lw=0.5)
    ax.tick_params(labelsize=10)
    # 計算の境目（つながっている所ごとに線を引く）
    seg = []
    segs = []
    for p in row['curve']:
        if p['H'] is None:
            if seg: segs.append(seg); seg = []
        else:
            seg.append(p)
    if seg: segs.append(seg)
    for sg in segs:
        xs = [p['W'] for p in sg]; ys = [p['H'] for p in sg]
        ax.fill_between(xs, 0, ys, color='#2a78d6', alpha=0.08, lw=0)
        ax.plot(xs, ys, color='#2a78d6', lw=1.6, ls='--', alpha=0.75)
    # 最小フランジ・いちばん狭い底W
    ax.axhline(row['minOut'], color='#888', lw=1, ls=':')
    ax.text(wmax * 0.985, row['minOut'] + ymax * 0.012, f"最小フランジ {row['minOut']}", color='#666', fontsize=9, ha='right', va='bottom')
    if row.get('wMin'):
        ax.axvline(row['wMin'], color='#888', lw=1, ls=':')
        ax.text(row['wMin'] + wmax * 0.008, ymax * 0.97, f"底W {row['wMin']}\nより狭いと×", color='#666', fontsize=9, va='top')
    tag = '（基準金型）' if row['base'] else '（小さいV）'
    ax.set_title(f"V{row['V']}　{row['sel'].split(':')[1]}・{row['machine']}　鉄 t{row['t']}{tag}", fontsize=11, loc='left', fontweight='bold')
    ax.set_xlabel('底W（外寸 mm）', fontsize=10.5)
    ax.set_ylabel('立上りH（外寸 mm）', fontsize=10.5)
    fig.tight_layout(pad=0.4)
    fig.savefig(path, dpi=170, facecolor='white')
    plt.close(fig)

PER_PAGE = 6
GW, GH = 500, 455          # Excel に置く大きさ（px）。図の縦横比 4.4:4.0 に合わせる
COLW = 10                  # 列幅（文字数）。1列 ≒ 75px
COLS_PER = 7               # グラフ1つ分の列
ROWS_PER = 24              # グラフ1つ分の行（1行 20px。図の高さ＋すき間）
graphs = sorted(rows, key=lambda r: (r['t'], r['base']))   # 板厚の小さい順。同じ板厚なら V8 を基準金型の前に
pages = [graphs[i:i + PER_PAGE] for i in range(0, len(graphs), PER_PAGE)]
wb = Workbook()
first_ws = True
for pi, page in enumerate(pages, start=1):
    if first_ws:
        ws = wb.active; ws.title = f'グラフ{pi}'; first_ws = False
    else:
        ws = wb.create_sheet(f'グラフ{pi}')
    span = COLS_PER * 3
    for c in range(1, span + 4):
        ws.column_dimensions[get_column_letter(c)].width = COLW
    header(ws, f'コの字曲げ 実績入力シート（型ごと・グラフ {pi}／{len(pages)}）',
           '書き方　曲げた寸法（底W・立上りH。どちらも外寸、左右同じ高さ）の所に、曲がったら ○、曲がらなかったら × を打ってください。'
           '点の横に伝票番号や「中押し」「抜けない」などを書き添えてもらえると助かります。'
           '点線＝計算の境目（この線より下は、計算では普通に曲がる）。点線より上で曲がった・下で曲がらなかった、が一番知りたい所です。'
           f'　（計算は {TODAY} 時点・ヤゲン904061・中間板標準・普通に曲げたとき。中押しは入れていません）', span)
    ws.merge_cells(start_row=3, start_column=1, end_row=3, end_column=span)
    who = ws.cell(3, 1, '確かめた人：　　　　　　　　　　　　　　　日付：　　　　年　　月　　日')
    who.font = Font(name=FONT, size=11, bold=True)
    who.alignment = Alignment(horizontal='left', vertical='center')
    ws.row_dimensions[3].height = 19
    for k, row in enumerate(page):
        png = os.path.join(work, f"u-graph-t{row['t']}-V{row['V']}.png")
        draw_graph(row, png)
        img = XLImage(png)
        img.width, img.height = GW, GH
        col = 1 + (k % 3) * COLS_PER
        r0 = 4 + (k // 3) * ROWS_PER
        ws.add_image(img, f'{get_column_letter(col)}{r0}')
    # 行の高さをはっきり決める（既定の高さは Excel の設定で変わり、図が重なることがある）
    for rr in range(4, 4 + 2 * ROWS_PER + 1):
        ws.row_dimensions[rr].height = 15   # 15pt＝20px
    a3(ws, None)
    ws.print_area = f'A1:{get_column_letter(span)}{4 + 2 * ROWS_PER}'

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
