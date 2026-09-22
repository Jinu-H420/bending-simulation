# 確認資料「ダイと土台の一覧」（public/dash/dai-dodai.html）を作る。画像は1ファイルに埋め込む。
#   1) node scripts/export-die-bases.mjs > die-bases.json
#   2) python scripts/die-bases-dxf.py die-bases.json <作業フォルダ>
#   3) python scripts/dai-dodai-html.py <作業フォルダ>
#      → public/dash/dai-dodai.html と dai-dodai-all.dxf、docs/ダイ土台確認/ の画像・DXF を置き換える
import base64
import os
import shutil
import sys

src = sys.argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dash = os.path.join(root, 'public', 'dash')
docs = os.path.join(root, 'docs', 'ダイ土台確認')


def b64(name):
    with open(os.path.join(src, name), 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


html = f"""<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ダイ土台の確認</title>
<style>body{{margin:0;background:#0b1220;color:#e2e8f0;font:14px "Yu Gothic UI",sans-serif}}
.w{{padding:14px}}h1{{font-size:17px;margin:0 0 6px}}h2{{font-size:15px;margin:18px 0 6px}}
.lg span{{display:inline-block;margin-right:14px}}.sw{{display:inline-block;width:12px;height:12px;vertical-align:-1px;margin-right:4px}}
img{{width:100%;max-width:1400px;display:block;border:1px solid #1e293b}}</style>
<div class="w">
<h1>シミュレーターが認識しているダイと土台</h1>
<div class="lg"><span><i class="sw" style="background:#38bdf8"></i>ダイ</span><span><i class="sw" style="background:#22c55e"></i>土台（実測・V.dxf で確認）</span><span><i class="sw" style="background:#eab308"></i>土台（代用・推測）</span></div>
<h2>① 土台だけ（機械ごと）</h2><img src="data:image/png;base64,{b64('ダイ土台_土台だけ.png')}">
<h2>② HG2203 に各ダイを載せた状態（V8〜V25 インサート）</h2><img src="data:image/png;base64,{b64('ダイ土台_HG2203.png')}">
<h2>③ HD3504NT に各ダイを載せた状態（V32〜V160・2溝ダイ 30540・30640。2溝は同じ台で、左右反転も載せる）</h2><img src="data:image/png;base64,{b64('ダイ土台_HD3504NT.png')}">
</div>
"""
with open(os.path.join(dash, 'dai-dodai.html'), 'w', encoding='utf-8') as f:
    f.write(html)
shutil.copyfile(os.path.join(src, 'ダイ土台_全種類.dxf'), os.path.join(dash, 'dai-dodai-all.dxf'))
if os.path.isdir(docs):
    with open(os.path.join(docs, 'index.html'), 'w', encoding='utf-8') as f:   # docs 側も同じページ
        f.write(html)
    for name in ['ダイ土台_土台だけ.png', 'ダイ土台_HG2203.png', 'ダイ土台_HD3504NT.png', 'ダイ土台_全種類.dxf']:
        shutil.copyfile(os.path.join(src, name), os.path.join(docs, name))
print('wrote', os.path.join(dash, 'dai-dodai.html'))
