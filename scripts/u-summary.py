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
n = len(rows)
Ws = list(range(STEP, H_TOP + 1, STEP))
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

def table_hat():
    # 表まとめ（ハット：全型を1枚の表＋実績の記入シート）
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




# ================================================================ 表まとめ（コの字）：型ごとのシートの表をそのまま並べる
# 2026-10-14 ユーザー「まとめた表は分かりづらい・記入しづらい。元々のもの（型ごとのシートの表）をまとめて。A3で2枚になってもよい」
#   A3縦2枚。1枚に8型（横4型×上下2段）。1型＝ 底W｜計算の立上り 下限〜上限｜実績（記入）｜見込み（自動）。底Wは10mmごと＋★＋いちばん狭い幅
#   書いた所は隠しシート「_map」に（型・幅・セル）を書いておき、u-chart-read.py がそれで読む
CALCF = PatternFill('solid', fgColor='EEF3FA')
ESTF = PatternFill('solid', fgColor='FCE9D9')
WF = PatternFill('solid', fgColor='F4F1E8')
BW4 = (6.5, 17, 9, 9)                          # 底W・計算・実績・見込み
GAPW = 1.5


def block_rows(r, keys):
    """その型の表の行（幅の並び）：いちばん狭い幅から300まで10mmごと＋★＋いちばん狭い幅"""
    h, w, g = smallest(r)
    lo = w if w else (r.get('wMin') or 300)
    Ws = {W for W in range(10, H_TOP + 1, 10) if W >= lo} | set(keys)
    if w:
        Ws.add(w)
    if r.get('wMin'):
        Ws.add(r['wMin'])
    return sorted(W for W in Ws if W <= max(H_TOP, max(keys or [0])))


def table_block(ws, mp, r, keys, top, left, hc):
    """1型ぶんの表。top＝型名の行、left＝底Wの列、hc＝見込みの計算に使う隠れ列の始まり。返り値＝使った最後の行"""
    cW, cC, cE, cS = left, left + 1, left + 2, left + 3
    ws.merge_cells(start_row=top, start_column=cW, end_row=top, end_column=cS)
    put(ws, top, cW, f"V{r['V']} t{r['t']}{'（小さいV）' if not r['base'] else ''}  {r['sel'].split(':')[1]}・{r['machine']}"
        + ('  実績合わせ' if r.get('fit') else ''), bold=True, size=10.5, fill=HEAD)
    h, w, g = smallest(r)
    # いちばん小さい断面：上の行に見出し、下の行に計算と記入欄（必ず書いてもらう）
    ws.merge_cells(start_row=top + 1, start_column=cW, end_row=top + 1, end_column=cC)
    put(ws, top + 1, cW, '★必ず記入　いちばん小さい断面', bold=True, size=9, color='C00000', fill=KEYF)
    put(ws, top + 1, cE, '立上り', bold=True, size=8.5, fill=KEYF)
    put(ws, top + 1, cS, WN, bold=True, size=8.5, fill=KEYF)
    ws.merge_cells(start_row=top + 2, start_column=cW, end_row=top + 2, end_column=cC)
    mc = put(ws, top + 2, cW, '計算 ' + (f'{h}×{w}' + (f' ヤゲン{pname(g, r["V"])}' if g else '') if w else '×') + ' → 実績', size=8.5,
             color='0B6E99' if g else '0A7D0A', fill=MINF)
    mc.alignment = Alignment(horizontal='center', vertical='center', shrink_to_fit=True)
    mn = r.get('minAct') or {}
    for cc, v, kind in ((cE, mn.get('h'), 'minh'), (cS, mn.get('w'), 'minw')):
        e = put(ws, top + 2, cc, v, bold=True, size=11, fill=KEYF)
        e.border = KEYBOX
        mp.append([r['t'], r['V'], None, ws.title, f'{get_column_letter(cc)}{top + 2}', kind])
    ws.row_dimensions[top].height = 18
    ws.row_dimensions[top + 1].height = 16
    ws.row_dimensions[top + 2].height = 20
    hr = top + 3
    put(ws, hr, cW, WN, bold=True, size=9.5, fill=HEAD)
    put(ws, hr, cC, '計算の立上り\n下限〜上限', bold=True, size=9, fill=HEAD)
    put(ws, hr, cE, '実績\n（記入）', bold=True, size=9, fill=KEYF)
    put(ws, hr, cS, '見込み\n（自動）', bold=True, size=9, fill=ESTF)
    ws.row_dimensions[hr].height = 28
    Wl = block_rows(r, keys)
    ents = r.get('entries') or {}
    s0 = r.get('fit') or r
    n_ = len(Wl)
    L = get_column_letter
    prev_v = None
    for i, W in enumerate(Wl):
        rr = hr + 1 + i
        key = W in keys
        lo, hi, gg = best(r, W)
        first = W == w
        wc = put(ws, rr, cW, W, bold=True, size=10, fill=KEYF if key else (MINF if first else WF), color='C00000' if key else None)
        if key:
            wc.number_format = '"★"0'
        v0 = s0['hmax'].get(str(W), (s0.get('h1') or {}).get(str(W)))   # 904061 の値（赤字を決める）
        dip = gg is None and isinstance(v0, (int, float)) and isinstance(prev_v, (int, float)) and v0 < prev_v and W % 10 == 0
        if hi is None:
            put(ws, rr, cC, '×', size=9.5, color='999999', fill=CALCF)
        else:
            hv = 'なし' if hi == 'なし' else hi
            txt = (f"{hv}だけ" if hv == lo else f"{lo}〜{hv}") + (f" ヤゲン{pname(gg, r['V'])}" if gg else '')
            cc_ = put(ws, rr, cC, txt, size=9.5 if not gg else 8.5, bold=bool(gg) or dip or first,
                      color='0B6E99' if gg else ('C62F2F' if dip else ('0A7D0A' if first else None)),
                      fill=PatternFill('solid', fgColor='E3F1F8') if gg else (MINF if first else CALCF))
            cc_.alignment = Alignment(horizontal='center', vertical='center', shrink_to_fit=True)
        if W % 10 == 0 and isinstance(v0, (int, float)):
            prev_v = v0
        e = put(ws, rr, cE, ent_text(ents.get(str(W))), bold=True, size=10.5, fill=KEYF if key else None)
        if key:
            e.border = KEYBOX
        mp.append([r['t'], r['V'], W, ws.title, f'{L(cE)}{rr}', 'w'])
        # 見込み（型ごとのシートと同じ考え方：書いた行どうしの差を、計算の形に合わせて間に割り振る）
        E = f'{L(cE)}{rr}'
        R = rr
        C = lambda j: f'{L(hc + j)}{R}'
        hiN = num(hi) if isinstance(num(hi), (int, float)) else None
        ws.cell(R, hc, W)
        ws.cell(R, hc + 1, hiN)
        T_ = f'SUBSTITUTE(SUBSTITUTE({E},"~","〜"),"-","〜")'
        ws.cell(R, hc + 2, f'=IF(ISNUMBER({E}),{E},IFERROR(VALUE(MID({T_},FIND("〜",{T_})+1,9)),""))')
        isx = f'OR({E}="×",{E}="✕")'
        ws.cell(R, hc + 3, f'=IF(ISNUMBER({C(2)}),IF(ISNUMBER({C(1)}),{C(2)}-{C(1)},""),IF({isx},"x",""))')
        D_ = C(3)
        pw = f'{L(hc + 4)}{R - 1}' if i else '""'
        pd = f'{L(hc + 5)}{R - 1}' if i else '""'
        nw = f'{L(hc + 6)}{R + 1}' if i < n_ - 1 else '""'
        nd = f'{L(hc + 7)}{R + 1}' if i < n_ - 1 else '""'
        ws.cell(R, hc + 4, f'=IF({D_}="x","",IF(ISNUMBER({D_}),{C(0)},{pw}))')
        ws.cell(R, hc + 5, f'=IF({D_}="x","",IF(ISNUMBER({D_}),{D_},{pd}))')
        ws.cell(R, hc + 6, f'=IF({D_}="x","",IF(ISNUMBER({D_}),{C(0)},{nw}))')
        ws.cell(R, hc + 7, f'=IF({D_}="x","",IF(ISNUMBER({D_}),{D_},{nd}))')
        P, Q = C(4), C(6)
        ws.cell(R, hc + 8, (f'=IF(ISNUMBER({C(2)}),{C(2)},IF({isx},"×",IF(AND(ISNUMBER({C(1)}),ISNUMBER({P}),ISNUMBER({Q})),'
                            f'IF({Q}={P},{C(1)}+{C(5)},ROUND({C(1)}+{C(5)}+({C(7)}-{C(5)})*({C(0)}-{P})/({Q}-{P}),0)),"")))'))
        put(ws, rr, cS, f'=IF(ISNUMBER({C(8)}),"{lo if lo is not None else h}〜"&{C(8)},{C(8)})', size=9.5, color='B45F06', fill=ESTF)
        ws.row_dimensions[rr].height = 15
    return hr + n_



def table_u():
    wb = Workbook()
    mp = [['板厚', 'V', '幅', 'シート', 'セル', '種類']]
    PER = 8
    pages = [list(range(i, min(i + PER, n))) for i in range(0, n, PER)]
    for pi, idxs in enumerate(pages, start=1):
        ws = wb.active if pi == 1 else wb.create_sheet()
        ws.title = f'表まとめ{pi}'
        ncols = 4 * (len(BW4) + 1) - 1
        last = get_column_letter(ncols)
        ws.merge_cells(f'A1:{last}1')
        c = ws.cell(1, 1, f'{NAME} 早見表（まとめ {pi}／{len(pages)}）　立上り（外寸mm）　株式会社高橋鉄骨')
        c.font = Font(name=FONT, size=15, bold=True)
        ws.merge_cells(f'A2:{last}2')
        c = ws.cell(2, 1, ('型ごとのシート（' + NAME + '_早見グラフ_A3.xlsx）の表を並べたもの。★の赤い枠に、実際に曲げられた一番高い立上り（外寸）を書いてください'
                           '（曲がらなかったら ×）。いちばん小さい断面は必ず。★だけ書けば、間の行は「見込み」に入ります。書いたら保存して Claude に「計算し直して」。'
                           '青＝ヤゲン904061 では当たるが、ほかのヤゲンで曲がる（番号つき）。赤＝底Wを広げたのに下がる所。L835まで＝V8でヤゲン71606 は曲げ長さ835mm（金型1本分）まで。'
                           f'左右の立上りが違うときは低いほうで見る。計算は {TODAY} 時点。'))
        c.font = Font(name=FONT, size=9.5)
        c.alignment = Alignment(wrap_text=True, vertical='top')
        ws.row_dimensions[2].height = 40
        for b in range(4):
            for k, wdt in enumerate(BW4):
                ws.column_dimensions[get_column_letter(1 + b * (len(BW4) + 1) + k)].width = wdt
            if b < 3:
                ws.column_dimensions[get_column_letter(1 + b * (len(BW4) + 1) + len(BW4))].width = GAPW
        top = 4
        end = top
        for band in range(2):
            bidx = idxs[band * 4:(band + 1) * 4]
            if not bidx:
                break
            bottom = top
            for slot, j in enumerate(bidx):
                left = 1 + slot * (len(BW4) + 1)
                bottom = max(bottom, table_block(ws, mp, rows[j], KEYS[j], top, left, 100 + slot * 10 + band * 40))
            end = bottom
            top = bottom + 2
        a3(ws, f'A1:{last}{end}', landscape=False)
    hid = wb.create_sheet('_map')
    for row_ in mp:
        hid.append(row_)
    hid.sheet_state = 'hidden'
    wb.save(out_table)
    print('saved', out_table)


if HAT:
    table_hat()
else:
    table_u()


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
wb.move_sheet('実績の記入', offset=len(wb.sheetnames) - 1 - wb.sheetnames.index('実績の記入'))   # 記入はいちばん後ろ
wb.save(out_chart)
print('saved', out_chart)
