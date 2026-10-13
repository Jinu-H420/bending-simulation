# コの字曲げ・ハット曲げ 早見グラフの「まとめ」（2026-10-14 ユーザー「Vと板厚ごとだと印刷する枚数が多い。表をまとめたものと
# グラフをまとめたものを追加で」）。型ごとのシート（u-chart-sheet.py）と同じ数字を、少ない枚数で印刷できるようにする。
#   表まとめ  ：A3縦1枚。縦＝底W（コの字 5mm・ハット 10mm）、横＝16型。数字＝立上りの上限（ハットは下限〜上限）
#   グラフまとめ：A3横2枚。1枚に8型（4×2）の小さいグラフ（Excel のグラフ）
#   どちらも、計算し直してあれば実績合わせの値、ヤゲン904061 で当たってもほかのヤゲンで曲がれば青（番号はセルの右に小さく）。
#   どちらにも「実績の記入」シート（A3横1枚・1型2行）を付ける（2026-10-14 ユーザー「まとめたものにも実績を入力する欄が必要」）。
#     ★の幅（u_keys.py＝型ごとのシートと同じ）・いちばん小さい断面（必ず記入）・ほかの幅3つ。グラフまとめはそのシートの値をグラフに点で出す。
#     u-chart-read.py が読み、u-refit.py が型ごとのシートの実績と合わせて（同じ所が違えば新しく保存したファイルを使う）計算し直す。
#   使い方: python scripts/u-summary.py <u-table.json か 合わせた.json> <表まとめ.xlsx> <グラフまとめ.xlsx>
#           （u-refit.py が早見グラフと一緒に作り直す）
import json
import sys
from datetime import date

from openpyxl import Workbook
from openpyxl.chart import Reference, ScatterChart, Series
from openpyxl.chart.marker import Marker
from openpyxl.chart.shapes import GraphicalProperties
from openpyxl.drawing.line import LineProperties
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.page import PageMargins
from openpyxl.worksheet.properties import PageSetupProperties
from openpyxl.worksheet.datavalidation import DataValidation

from u_keys import keys_for

src, out_table, out_chart = sys.argv[1], sys.argv[2], sys.argv[3]
rows = json.load(open(src, encoding='utf-8'))
rows.sort(key=lambda r: (r['t'], r['base']))
HAT = rows[0].get('shape') == 'HAT'
NAME = 'ハット曲げ' if HAT else 'コの字曲げ'
WN = '上面W' if HAT else '底W'
FONT = 'Meiryo UI'
TODAY = date.today().isoformat()
H_TOP = 300
STEP = 10 if HAT else 5
thin = Side(style='thin', color='999999')
box = Border(left=thin, right=thin, top=thin, bottom=thin)
HEAD = PatternFill('solid', fgColor='E8EBE6')
ALTF = PatternFill('solid', fgColor='E3F1F8')
MINF = PatternFill('solid', fgColor='DDF2DD')


def num(v):
    return H_TOP if v == 'なし' else v


def pname(g, V):
    return f"{g['punch']}{'反転' if g['flip'] else ''}{'（L835まで）' if V == 8 and g['punch'] == '71606' else ''}"


def best(r, W):
    """その幅で曲げられる範囲（下限, 上限, ヤゲン or None）。実績合わせがあればそれ、ほかのヤゲンのほうが高ければそちら"""
    s0 = r.get('fit') or r
    hi = s0['hmax'].get(str(W), (s0.get('h1') or {}).get(str(W)))
    lo = (s0.get('hmin') or {}).get(str(W)) or s0.get('hLow')
    g = (r.get('altNarrow') or {}).get(str(W)) or (r.get('alt') or {}).get(str(W))
    if g and (hi is None or num(g['hi']) > num(hi)):
        return g['lo'], g['hi'], g
    return (lo if hi is not None else None), hi, None


def smallest(r):
    """いちばん小さい断面（立上り, 幅, ヤゲン or None）"""
    s0 = r.get('fit') or r
    nar = r.get('altNarrow') or {}
    if nar:
        w = min(map(int, nar))
        g = nar[str(w)]
        return g['lo'], w, g
    return s0.get('hLow'), s0.get('wMin'), None


def put(ws, r, c, v, *, bold=False, size=9, fill=None, color=None, align='center', wrap=True):
    cell = ws.cell(r, c, v)
    cell.font = Font(name=FONT, size=size, bold=bold, color=color)
    cell.alignment = Alignment(horizontal=align, vertical='center', wrap_text=wrap)
    cell.border = box
    if fill:
        cell.fill = fill
    return cell


def a3(ws, area, landscape):
    ws.page_setup.paperSize = 8
    ws.page_setup.orientation = 'landscape' if landscape else 'portrait'
    ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 1
    ws.page_margins = PageMargins(left=0.3, right=0.3, top=0.35, bottom=0.3, header=0.2, footer=0.2)
    ws.print_area = area


def label(r):
    return f"V{r['V']}\nt{r['t']}" + ('' if r['base'] else '\n小さいV')


# ================================================================ 実績の記入（表まとめ・グラフまとめの両方に付ける）
KEYF = PatternFill('solid', fgColor='FFD24D')
RED = Side(style='thick', color='C00000')
KEYBOX = Border(left=RED, right=RED, top=RED, bottom=RED)
KEYS = [keys_for(r, HAT) for r in rows]
NK = max([len(k) for k in KEYS] + [1])
NF = 3                                   # ほかの幅の欄の数
EC0 = 4                                  # ★の最初の列
FC0 = EC0 + NK                           # ほかの幅の最初の列
HC = 60                                  # 印刷範囲の外：t・V・グラフ用の数字
ER0 = 5                                  # 1型目の上の行


def ent_text(v):
    if isinstance(v, dict):
        return f"{v.get('lo', '')}〜{v.get('hi', '')}"
    return v


def entry_sheet(wb):
    """実績の記入シート。1型2行（上＝幅と計算、下＝実績を書く欄）。返り値：型ごとの上の行"""
    ws = wb.create_sheet('実績の記入')
    last = get_column_letter(FC0 + NF - 1)
    ws.merge_cells(f'A1:{last}1')
    c = ws.cell(1, 1, f'{NAME}　実績の記入（全部の型）　株式会社高橋鉄骨')
    c.font = Font(name=FONT, size=15, bold=True)
    ws.merge_cells(f'A2:{last}2')
    c = ws.cell(2, 1, ('★の赤い枠に、その' + WN + 'で実際に曲げられた'
                       + ('立上りの範囲を「24〜75」のように（上だけなら 75）' if HAT else '一番高い立上り（外寸）を')
                       + '書いてください。曲がらなかったら ×。上の小さい字は計算の値。いちばん小さい断面は必ず書いてください。'
                       + 'ほかの' + WN + 'で確かめたときは、右の欄の上に' + WN + '、下に立上りを。'
                       + '書いたら保存して Claude に「計算し直して」。型ごとのシート（' + NAME + '_早見グラフ_A3.xlsx）に書いても同じです。'))
    c.font = Font(name=FONT, size=10)
    c.alignment = Alignment(wrap_text=True, vertical='top')
    ws.row_dimensions[2].height = 30
    put(ws, 4, 1, '型', bold=True, fill=HEAD)
    ws.merge_cells(start_row=4, start_column=2, end_row=4, end_column=3)
    put(ws, 4, 2, '★必ず記入\nいちばん小さい断面（立上り｜' + WN + '）', bold=True, size=8.5, fill=KEYF, color='C00000')
    ws.merge_cells(start_row=4, start_column=EC0, end_row=4, end_column=FC0 - 1)
    put(ws, 4, EC0, f'★の{WN}で実際に曲げられた' + ('立上り（下限〜上限）' if HAT else '一番高い立上り'), bold=True, size=10, fill=KEYF)
    ws.merge_cells(start_row=4, start_column=FC0, end_row=4, end_column=FC0 + NF - 1)
    put(ws, 4, FC0, f'ほかの{WN}（上に{WN}、下に立上り）', bold=True, size=9, fill=HEAD)
    ws.row_dimensions[4].height = 44
    dv = DataValidation(type='custom', formula1='TRUE', allow_blank=True, showErrorMessage=False)
    tops = []
    for j, r in enumerate(rows):
        ra, rb = ER0 + 2 * j, ER0 + 2 * j + 1
        tops.append(ra)
        ws.merge_cells(start_row=ra, start_column=1, end_row=rb, end_column=1)
        put(ws, ra, 1, label(r).replace('\n', ' ', 1), bold=True, size=10, fill=HEAD)
        ws.cell(rb, 1).border = box
        ents = r.get('entries') or {}
        mn = r.get('minAct') or {}
        h, w, g = smallest(r)
        ws.merge_cells(start_row=ra, start_column=2, end_row=ra, end_column=3)
        put(ws, ra, 2, (f'計算 {h}×{w}' + (f' {pname(g, r["V"])}' if g else '')) if w else '計算では×', size=8, color='555555', fill=MINF)
        for cc, v in ((2, mn.get('h')), (3, mn.get('w'))):
            e = put(ws, rb, cc, v, bold=True, size=11, fill=KEYF)
            e.border = KEYBOX
        keys = KEYS[j]
        for k in range(NK):
            cc = EC0 + k
            if k < len(keys):
                W = keys[k]
                lo, hi, gg = best(r, W)
                ct = '×' if hi is None else (f"{lo}〜{'なし' if hi == 'なし' else hi}" if HAT else f"{'なし' if hi == 'なし' else hi}")
                put(ws, ra, cc, f'★{W}　計算 {ct}' + (f' {gg["punch"]}' if gg else ''), size=8, bold=True,
                    color='0B6E99' if gg else 'C00000', fill=PatternFill('solid', fgColor='FFF6D6'))
                e = put(ws, rb, cc, ent_text(ents.get(str(W))), bold=True, size=11, fill=KEYF)
                e.border = KEYBOX
                ws.cell(ra, HC + 2 + k, W)                                      # グラフ用：幅
            else:
                put(ws, ra, cc, None, fill=PatternFill('solid', fgColor='F2F2F2'))
                put(ws, rb, cc, None, fill=PatternFill('solid', fgColor='F2F2F2'))
            E = f'{get_column_letter(cc)}{rb}'
            T_ = f'SUBSTITUTE(SUBSTITUTE({E},"~","〜"),"-","〜")'
            ws.cell(rb, HC + 2 + k, f'=IF(ISNUMBER({E}),{E},IFERROR(VALUE(MID({T_},FIND("〜",{T_})+1,9)),NA()))')
            ws.cell(rb, HC + 20 + k, f'=IF(OR({E}="×",{E}="✕"),{(r.get("fit") or r).get("hLow") or 0},NA())')
        # 型ごとのシートで ★以外の幅に書いた実績は、ほかの幅の欄へ
        others = [(int(W), v) for W, v in ents.items() if int(W) not in keys][:NF]
        for i in range(NF):
            cc = FC0 + i
            Wv, Hv = others[i] if i < len(others) else (None, None)
            put(ws, ra, cc, Wv, bold=True, size=10, fill=ENTRYF)
            put(ws, rb, cc, ent_text(Hv), bold=True, size=11, fill=ENTRYF)
            A_, E = f'{get_column_letter(cc)}{ra}', f'{get_column_letter(cc)}{rb}'
            T_ = f'SUBSTITUTE(SUBSTITUTE({E},"~","〜"),"-","〜")'
            ws.cell(ra, HC + 2 + NK + i, f'=IF(ISNUMBER({A_}),{A_},NA())')
            ws.cell(rb, HC + 2 + NK + i, f'=IF(ISNUMBER({E}),{E},IFERROR(VALUE(MID({T_},FIND("〜",{T_})+1,9)),NA()))')
            ws.cell(rb, HC + 20 + NK + i, f'=IF(OR({E}="×",{E}="✕"),{(r.get("fit") or r).get("hLow") or 0},NA())')
        # いちばん小さい断面の実績もグラフへ
        ws.cell(ra, HC + 2 + NK + NF, f'=IF(AND(ISNUMBER(B{rb}),ISNUMBER(C{rb})),C{rb},NA())')
        ws.cell(rb, HC + 2 + NK + NF, f'=IF(AND(ISNUMBER(B{rb}),ISNUMBER(C{rb})),B{rb},NA())')
        ws.cell(rb, HC + 20 + NK + NF, '=NA()')
        ws.cell(rb, HC, r['t']); ws.cell(rb, HC + 1, r['V'])                    # 読むとき用：板厚・V
        ws.row_dimensions[ra].height = 28
        ws.row_dimensions[rb].height = 24
    ws.cell(4, HC, '板厚'); ws.cell(4, HC + 1, 'V'); ws.cell(4, HC + 2, '上＝幅・下＝実績（グラフ用）')
    ws.column_dimensions['A'].width = 13
    ws.column_dimensions['B'].width = 8
    ws.column_dimensions['C'].width = 8
    for k in range(NK):
        ws.column_dimensions[get_column_letter(EC0 + k)].width = 16 if HAT else 14
    for i in range(NF):
        ws.column_dimensions[get_column_letter(FC0 + i)].width = 10
    ws.freeze_panes = ws.cell(ER0, 2)
    a3(ws, f'A1:{last}{ER0 + 2 * len(rows) - 1}', landscape=True)
    return ws, tops


ENTRYF = PatternFill('solid', fgColor='FFF2B3')

# ================================================================ 表まとめ（A3縦1枚）
wb = Workbook()
ws = wb.active
ws.title = '表まとめ'
n = len(rows)
ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=n + 1)
c = ws.cell(1, 1, f'{NAME} 早見表（全部の型）　立上りの{"範囲（下限〜上限）" if HAT else "上限"}　株式会社高橋鉄骨')
c.font = Font(name=FONT, size=15, bold=True)
ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=n + 1)
note = ws.cell(2, 1, (f'数字＝その{WN}で曲げられる立上り（外寸mm）。' +
                      ('外フランジは型ごとの基準の長さ（見出しの下）。' if HAT else '左右の立上りが違うときは低いほうで見る。下限は見出しの「いちばん低い立上り」。') +
                      '×＝曲がらない。青＝ヤゲン904061 では当たるが、ほかのヤゲンで曲がる（番号は右に小さく）。'
                      'L835まで＝V8でヤゲン71606 は曲げ長さ835mm（金型1本分）まで、それより長いものは要確認。'
                      f'実績合わせ＝★の実績に合わせて計算し直した型。型ごとの詳しい数字・実績の記入は「{NAME}_早見グラフ_A3.xlsx」。計算は {TODAY} 時点。'))
note.font = Font(name=FONT, size=9)
note.alignment = Alignment(wrap_text=True, vertical='top')
ws.row_dimensions[2].height = 42
HR = 3
put(ws, HR, 1, '型', bold=True, fill=HEAD)
put(ws, HR + 1, 1, '金型・機械', bold=True, size=8, fill=HEAD)
put(ws, HR + 2, 1, '外フランジ' if HAT else 'いちばん低い\n立上り', bold=True, size=8, fill=HEAD)
put(ws, HR + 3, 1, 'いちばん小さい\n断面', bold=True, size=8, fill=MINF)
for j, r in enumerate(rows):
    cc = 2 + j
    put(ws, HR, cc, label(r) + ('\n実績合わせ' if r.get('fit') else ''), bold=True, size=9, fill=HEAD)
    put(ws, HR + 1, cc, f"{r['sel'].split(':')[1]}\n{r['machine']}", size=7.5, fill=HEAD)
    put(ws, HR + 2, cc, r.get('A') if HAT else ((r.get('fit') or r).get('hLow') or '×'), size=9, fill=HEAD)
    h, w, g = smallest(r)
    put(ws, HR + 3, cc, (f"{h}×{w}" + (f"\n{pname(g, r['V'])}" if g else '')) if w else '×', bold=True, size=8,
        color='0B6E99' if g else '0A7D0A', fill=MINF)
ws.row_dimensions[HR].height = 40
ws.row_dimensions[HR + 1].height = 26
ws.row_dimensions[HR + 2].height = 22
ws.row_dimensions[HR + 3].height = 40
put(ws, HR + 4, 1, WN, bold=True, fill=HEAD)
for j in range(n):
    put(ws, HR + 4, 2 + j, '下限〜上限' if HAT else '上限', bold=True, size=8, fill=HEAD)
Ws = list(range(STEP, H_TOP + 1, STEP))
for i, W in enumerate(Ws):
    rr = HR + 5 + i
    put(ws, rr, 1, W, bold=True, size=9.5, fill=PatternFill('solid', fgColor='F4F1E8'))
    prev = {}
    for j, r in enumerate(rows):
        lo, hi, g = best(r, W)
        if hi is None:
            put(ws, rr, 2 + j, '×', size=8.5, color='AAAAAA')
            continue
        hv = 'なし' if hi == 'なし' else hi
        pv = best(r, W - STEP)[1] if W > STEP else None
        dip = g is None and isinstance(hi, (int, float)) and isinstance(pv, (int, float)) and hi < pv
        txt = (f"{lo}〜{hv}" if HAT else f"{hv}") + (f" {pname(g, r['V'])}" if g else '')
        cell = put(ws, rr, 2 + j, txt, size=9 if not g else 7.5, bold=dip or bool(g),
                   color='0B6E99' if g else ('C62F2F' if dip else None), fill=ALTF if g else None)
        cell.alignment = Alignment(horizontal='center', vertical='center', shrink_to_fit=True)
    ws.row_dimensions[rr].height = 15 if not HAT else 21
ws.column_dimensions['A'].width = 7
for j, r in enumerate(rows):
    # V8 で71606（L835まで）が出る列は広く
    wide = r['V'] == 8 and any(g['punch'] == '71606' for g in list((r.get('alt') or {}).values()) + list((r.get('altNarrow') or {}).values()))
    ws.column_dimensions[get_column_letter(2 + j)].width = (17 if wide else 11.5) if HAT else (14 if wide else 8.5)
ws.freeze_panes = ws.cell(HR + 5, 2)
a3(ws, f'A1:{get_column_letter(n + 1)}{HR + 4 + len(Ws)}', landscape=HAT)   # ハットは行が少ないので横で大きく
entry_sheet(wb)
wb.save(out_table)
print('saved', out_table)


# ================================================================ グラフまとめ（A3横・1枚に8型）
def line_props(color, width=2.0, dash=None, none=False):
    gp = GraphicalProperties()
    if none:
        gp.line.noFill = True
        return gp
    gp.line.solidFill = color
    gp.line.width = int(width * 12700)
    if dash:
        gp.line.prstDash = dash
    return gp


wb = Workbook()
ews, ETOPS = None, None
PER = 8
pages = [rows[i:i + PER] for i in range(0, n, PER)]
dc = 40
for pi, page in enumerate(pages, start=1):
    ws = wb.active if pi == 1 else wb.create_sheet()
    ws.title = f'グラフまとめ{pi}'
    if ews is None:
        ews, ETOPS = entry_sheet(wb)          # 書いた実績をグラフに点で出すため、同じブックに記入シート
    ws.merge_cells('A1:AB1')
    c = ws.cell(1, 1, f'{NAME} 早見グラフ（まとめ {pi}／{len(pages)}）　横＝{WN}、縦＝{"立上り" if HAT else "低いほうの立上り"}（外寸mm）　株式会社高橋鉄骨')
    c.font = Font(name=FONT, size=15, bold=True)
    ws.merge_cells('A2:AB2')
    c = ws.cell(2, 1, ('青の線＝曲げられる上限（ヤゲン904061、計算し直してあれば実績合わせ）。▲＝ほかのヤゲンなら曲がる上限。'
                       + ('点線＝下限（これより低いと上面が上型に近づいて当たる）。外フランジは型ごとの基準の長さ。' if HAT else '')
                       + '●＝いちばん小さい断面。◆＝書いた実績（「実績の記入」シートに書くとすぐ出る）、×＝曲がらなかった実績。数字は型ごとのシート・表まとめを見てください。'
                       f'計算は {TODAY} 時点。'))
    c.font = Font(name=FONT, size=10)
    for k, r in enumerate(page):
        base = dc + k * 6
        ws.cell(3, base, '幅'); ws.cell(3, base + 1, '上限'); ws.cell(3, base + 2, 'ほかのヤゲン'); ws.cell(3, base + 3, '下限')
        Wn = sorted({W for W in Ws} | {int(x) for x in (r.get('altNarrow') or {})})
        for i, W in enumerate(Wn):
            s0 = r.get('fit') or r
            hi = s0['hmax'].get(str(W), (s0.get('h1') or {}).get(str(W)))
            g = (r.get('altNarrow') or {}).get(str(W)) or (r.get('alt') or {}).get(str(W))
            ws.cell(4 + i, base, W)
            ws.cell(4 + i, base + 1, num(hi) if hi is not None else None)
            ws.cell(4 + i, base + 2, num(g['hi']) if g else None)
            lo = (s0.get('hmin') or {}).get(str(W))
            ws.cell(4 + i, base + 3, lo if (HAT and hi is not None) else None)
        h, w, g = smallest(r)
        ws.cell(4, base + 4, w); ws.cell(4, base + 5, h)
        m = len(Wn)
        ch = ScatterChart()
        ch.style = 2
        ch.width, ch.height = 12.0, 12.6
        ch.title = (f"V{r['V']} t{r['t']}{'（小さいV）' if not r['base'] else ''}{'・実績合わせ' if r.get('fit') else ''}"
                    + (f"　いちばん小さい {h}×{w}" if w else '　曲がらない'))
        X = Reference(ws, min_col=base, min_row=4, max_row=3 + m)
        s1 = Series(Reference(ws, min_col=base + 1, min_row=4, max_row=3 + m), X, title='上限')
        s1.marker = Marker(symbol='none'); s1.graphicalProperties = line_props('2A78D6', 2); s1.smooth = False
        s2 = Series(Reference(ws, min_col=base + 2, min_row=4, max_row=3 + m), X, title='ほかのヤゲン')
        s2.marker = Marker(symbol='triangle', size=5)
        s2.marker.graphicalProperties = GraphicalProperties(solidFill='0B6E99')
        s2.marker.graphicalProperties.line.solidFill = '0B6E99'
        s2.graphicalProperties = line_props(None, none=True)
        ch.series.extend([s1, s2])
        if HAT:
            s3 = Series(Reference(ws, min_col=base + 3, min_row=4, max_row=3 + m), X, title='下限')
            s3.marker = Marker(symbol='none'); s3.graphicalProperties = line_props('2A78D6', 1.25, dash='sysDot'); s3.smooth = False
            ch.series.append(s3)
        if w:
            s4 = Series(Reference(ws, min_col=base + 5, min_row=4, max_row=4), Reference(ws, min_col=base + 4, min_row=4, max_row=4), title='いちばん小さい')
            s4.marker = Marker(symbol='circle', size=8)
            s4.marker.graphicalProperties = GraphicalProperties(solidFill='0A7D0A')
            s4.marker.graphicalProperties.line.solidFill = '0A7D0A'
            s4.graphicalProperties = line_props(None, none=True)
            ch.series.append(s4)
        # 書いた実績（「実績の記入」シートの値。書くとすぐ点が出る）
        jj = rows.index(r)
        ra, rb = ETOPS[jj], ETOPS[jj] + 1
        XE = Reference(ews, min_col=HC + 2, max_col=HC + 2 + NK + NF, min_row=ra)
        s5 = Series(Reference(ews, min_col=HC + 2, max_col=HC + 2 + NK + NF, min_row=rb), XE, title='実績')
        s5.marker = Marker(symbol='diamond', size=8)
        s5.marker.graphicalProperties = GraphicalProperties(solidFill='E07B00')
        s5.marker.graphicalProperties.line.solidFill = '7A3E00'
        s5.graphicalProperties = line_props(None, none=True)
        s6 = Series(Reference(ews, min_col=HC + 20, max_col=HC + 20 + NK + NF, min_row=rb), XE, title='曲がらなかった')
        s6.marker = Marker(symbol='x', size=9)
        s6.marker.graphicalProperties = GraphicalProperties(noFill=True)
        s6.marker.graphicalProperties.line.solidFill = 'C62F2F'
        s6.graphicalProperties = line_props(None, none=True)
        ch.series.extend([s5, s6])
        ch.x_axis.title = f'{WN}（mm）'
        ch.y_axis.title = '立上り（mm）'
        ch.x_axis.scaling.min, ch.x_axis.scaling.max = 0, H_TOP
        ch.y_axis.scaling.min, ch.y_axis.scaling.max = 0, 250
        ch.x_axis.majorUnit, ch.y_axis.majorUnit = 50, 50
        ch.x_axis.minorUnit, ch.y_axis.minorUnit = 10, 10
        from openpyxl.chart.axis import ChartLines
        ch.x_axis.majorGridlines = ChartLines(); ch.y_axis.majorGridlines = ChartLines()
        ch.x_axis.minorGridlines = ChartLines(); ch.y_axis.minorGridlines = ChartLines()
        for ax in (ch.x_axis, ch.y_axis):
            ax.minorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill='E3E3E3'))
            ax.majorGridlines.spPr = GraphicalProperties(ln=LineProperties(solidFill='A6A6A6'))
            ax.delete = False
            ax.number_format = '0'
        ch.legend = None
        col = 1 + (k % 4) * 7
        row = 4 + (k // 4) * 27
        ws.add_chart(ch, f'{get_column_letter(col)}{row}')
    for c_ in range(1, 29):
        ws.column_dimensions[get_column_letter(c_)].width = 9
    for r_ in range(3, 60):
        ws.row_dimensions[r_].height = 15
    a3(ws, "A1:AB58", landscape=True)
wb.save(out_chart)
print('saved', out_chart)
