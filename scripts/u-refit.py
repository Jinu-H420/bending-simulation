# コの字曲げ 早見グラフ：★に書いた実績に計算を合わせ直して、早見グラフを作り直す（「計算し直して」と言われたらこれ）。
#   1. 早見グラフ（共有フォルダ）から書いてある実績を読む（u-chart-read.py）
#   2. 型ごとに計算を実績に合わせる（u-fit.mjs。実績のある型だけ。1型 1〜2分）
#   3. 書いた実績を持ち越して早見グラフを作り直す（u-chart-sheet.py）。元のファイルは 実績シート\履歴\ に残す
#   4. 印刷見本PDFも作り直す（xlsx2pdf.py）
#   使い方: python scripts/u-refit.py [早見グラフ.xlsx]   （省略すると共有フォルダのもの）
#   Excel で開いたままだと上書きできないので、閉じてもらってから。
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))
SHARE = r'\\srv02\共有\データフォルダ\ユーザー共有用\地主\claudecode\曲げシミュレーション\実績シート'
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(SHARE, 'コの字曲げ_早見グラフ_A3.xlsx')
tmp = tempfile.mkdtemp(prefix='urefit-')
env = {**os.environ, 'PYTHONIOENCODING': 'utf-8'}


def run(args, out=None):
    with open(out, 'w', encoding='utf-8') if out else open(os.devnull, 'w') as f:
        subprocess.run(args, check=True, stdout=f, env=env, cwd=os.path.dirname(HERE))


ent = os.path.join(tmp, 'entries.json')
run([sys.executable, os.path.join(HERE, 'u-chart-read.py'), src], ent)
n = {f"t{d['t']} V{d['V']}": len(d['entries']) for d in json.load(open(ent, encoding='utf-8')) if d['entries']}
print('実績のある型:', n or 'なし')
fitted = os.path.join(tmp, 'fit.json')
run(['node', os.path.join(HERE, 'u-fit.mjs'), os.path.join(HERE, 'u-table.json'), ent], fitted)
new = os.path.join(tmp, os.path.basename(src))
run([sys.executable, os.path.join(HERE, 'u-chart-sheet.py'), fitted, new])
pdf = os.path.join(tmp, 'print.pdf')
run([sys.executable, os.path.join(HERE, 'xlsx2pdf.py'), new, pdf])
hist = os.path.join(os.path.dirname(src), '履歴')
os.makedirs(hist, exist_ok=True)
stem = os.path.splitext(os.path.basename(src))[0]
shutil.copy2(src, os.path.join(hist, f"{stem}_{datetime.now():%Y%m%d-%H%M}.xlsx"))
shutil.copy2(new, src)
shutil.copy2(pdf, os.path.join(os.path.dirname(src), f'{stem}_印刷見本.pdf'))
print('作り直した:', src)
for d in json.load(open(fitted, encoding='utf-8')):
    f = d.get('fit')
    if f:
        bad = [k for k in f['checks'] if k['bad']]
        print(f"t{d['t']} V{d['V']}: {len(f['checks'])}か所中 {len(f['checks']) - len(bad)}か所が合う"
              + ''.join(f" 合わない 底W{k['W']}（実績{k['act']}／計算{k['fit']}）" for k in bad))
