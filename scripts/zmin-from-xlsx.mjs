// Z曲げ_実績記入シート.xlsx の「段差S 最小」列を読んで、
// bending-simulator.jsx の ZMIN を書き換える。
//
// 現場が実績を書き足したら、このスクリプトを走らせるだけでシミュレーターに載る。
// 手で写すと必ず取りこぼすので、xlsx を唯一の入力にしている。
//
// 使い方: npm run zmin
//   （xlsx を差し替えたあとに実行し、git diff で入った値を確認してからコミットする）
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const XLSX = 'docs/Z曲げ_実績記入シート.xlsx';
const JSX = 'bending-simulator.jsx';

// xlsx の読み取りは python（openpyxl）に任せる。列の意味は記入シートの見出しどおり。
//   E=板厚 / B=V幅 / D=材質 / K=段差S 最小（実績） / Q=読み取りメモ
const PY = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(r"${XLSX}", data_only=True)
ws = wb.worksheets[0]
out = []
for i, r in enumerate(ws.iter_rows(min_row=9, max_row=60, values_only=True), 9):
    c = (list(r) + [None] * 21)[:21]
    V, mat, t, S, memo = c[1], c[3], c[4], c[10], (c[16] or '')
    if V is None or t is None or S is None:
        continue
    try:
        V, t, S = int(float(V)), float(t), float(S)
    except (TypeError, ValueError):
        continue
    out.append({"V": V, "mat": str(mat), "t": t, "S": S, "memo": str(memo)})
json.dump(out, sys.stdout, ensure_ascii=False)
`;
// Windows の既定は cp932 で、記入メモの「ℓ」などが化けて落ちるため UTF-8 を明示する
const rows = JSON.parse(execFileSync('python', ['-c', PY], {
  encoding: 'utf8',
  env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
}));

// 段差Sそのものの読み取りが確定しない行は入れない。
// 「段差S…修正液」「段差S…要確認」のように、段差Sと不確かさが同じメモに出てくるもの。
const uncertain = (m) =>
  /段差S/.test(m) && /(要確認|修正液の上|読めない|不明)/.test(m) && !/と書き直し|と記入/.test(m);

const kept = [], dropped = [];
for (const r of rows) (uncertain(r.memo) ? dropped : kept).push(r);

const tbl = {};
for (const r of kept) (tbl[r.V] ||= {})[r.t] = r.S;

const body = Object.keys(tbl)
  .map(Number).sort((a, b) => a - b)
  .map((V) => {
    const ts = Object.keys(tbl[V]).map(Number).sort((a, b) => a - b);
    return `  ${V}: { ${ts.map((t) => `${t}: ${tbl[V][t]}`).join(', ')} },`;
  })
  .join('\n');
const block = `const ZMIN = {\n${body}\n};`;

const src = readFileSync(JSX, 'utf8');
const re = /const ZMIN = \{[\s\S]*?\n\};/;
if (!re.test(src)) throw new Error('ZMIN の定義が見つかりません');
const next = src.replace(re, block.replace(/\n/g, src.includes('\r\n') ? '\r\n' : '\n'));
writeFileSync(JSX, next);

const mats = [...new Set(kept.map((r) => r.mat))].join('・');
console.log(`ZMIN を更新: ${kept.length} 件（材質 ${mats}）`);
for (const V of Object.keys(tbl).map(Number).sort((a, b) => a - b)) {
  const ts = Object.keys(tbl[V]).map(Number).sort((a, b) => a - b);
  console.log(`  V${V}: ` + ts.map((t) => `t${t}=${tbl[V][t]}`).join(' / '));
}
if (dropped.length) {
  console.log(`\n読み取りが確定しないため除外 ${dropped.length} 件:`);
  for (const r of dropped) console.log(`  V${r.V}・t${r.t} = ${r.S}  ${r.memo.slice(0, 50)}`);
}
