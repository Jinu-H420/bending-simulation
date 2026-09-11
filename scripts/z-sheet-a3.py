# -*- coding: utf-8 -*-
# Z曲げ_実績記入シート.xlsx を A3横1枚幅で印刷できるようにする。
# 列幅と印刷設定だけを触り、中身の数字には手を出さない。
import openpyxl
from openpyxl.worksheet.properties import PageSetupProperties
from openpyxl.styles import Alignment

P = "docs/Z曲げ_実績記入シート.xlsx"
wb = openpyxl.load_workbook(P)
ws = wb.active

# 列幅。メモと計算条件は折り返して縦に伸ばし、横幅を稼ぐ。
W = {'A':6,'B':5,'C':6.5,'D':5,'E':6,'F':9,'G':8,'H':8,'I':10,'J':8,'K':8,'L':8,
     'M':8,'N':15,'O':8,'P':8,'Q':28,'R':8.5,'S':8,'T':8,'U':24,'V':9,'W':8,'X':14}
for c, w in W.items():
    ws.column_dimensions[c].width = w

# 折り返す列（読み取りメモ・計算条件・備考）
for col in ('N', 'Q', 'U'):
    for r in range(8, 52):
        cell = ws['%s%d' % (col, r)]
        a = cell.alignment
        cell.alignment = Alignment(horizontal=a.horizontal, vertical='top', wrap_text=True)

# 印刷設定：A3横、幅は1ページに収める。高さは成り行き。
ws.page_setup.paperSize = 8           # A3
ws.page_setup.orientation = 'landscape'
ws.sheet_properties.pageSetUpPr = PageSetupProperties(fitToPage=True)
ws.page_setup.fitToWidth = 1
ws.page_setup.fitToHeight = 0
ws.page_setup.scale = None
ws.print_area = 'A1:X84'
ws.print_title_rows = '6:7'           # 見出しを各ページに繰り返す
ws.print_options.horizontalCentered = True
ws.page_margins.left = ws.page_margins.right = 0.25
ws.page_margins.top = ws.page_margins.bottom = 0.35
ws.page_margins.header = ws.page_margins.footer = 0.2

wb.save(P)
print("A3横に設定しました:", P, "／ 列幅合計", round(sum(W.values()), 1))
