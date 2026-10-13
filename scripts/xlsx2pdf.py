# -*- coding: utf-8 -*-
# xlsx を Excel に開かせて PDF に出す（印刷の見え方を確かめるため）。
# 使い方: python scripts/xlsx2pdf.py <xlsx> <pdf>
import sys, os
import win32com.client as win32

src = os.path.abspath(sys.argv[1])
dst = os.path.abspath(sys.argv[2])
import time
for k in range(6):                      # Excel の起動がときどき「サーバーの実行に失敗しました」になるので、少し待って起動し直す
    try:
        app = win32.DispatchEx("Excel.Application")
        break
    except Exception:
        if k == 5:
            raise
        time.sleep(3)
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
