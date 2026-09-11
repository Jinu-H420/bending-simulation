# -*- coding: utf-8 -*-
# xlsx を Excel に開かせて PDF に出す（印刷の見え方を確かめるため）。
# 使い方: python scripts/xlsx2pdf.py <xlsx> <pdf>
import sys, os
import win32com.client as win32

src = os.path.abspath(sys.argv[1])
dst = os.path.abspath(sys.argv[2])
app = win32.DispatchEx("Excel.Application")
app.Visible = False
app.DisplayAlerts = False
try:
    wb = app.Workbooks.Open(src, ReadOnly=True)
    wb.ExportAsFixedFormat(0, dst)          # 0 = xlTypePDF
    print("pages:", wb.Worksheets(1).PageSetup.Pages.Count)
    wb.Close(False)
finally:
    app.Quit()
print("wrote", dst)
