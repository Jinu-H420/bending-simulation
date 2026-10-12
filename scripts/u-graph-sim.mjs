// コの字曲げ 実績入力シート（グラフ版）の「計算の境目」を出す。
//   横＝底W、縦＝立上りH（左右同じ高さ・すべて外寸）。底Wごとに、普通に曲がる一番高い立上りを求める。
//   型は 鉄 の各板厚の基準金型（折り曲げ表）と、薄板でよく使う V8（t1.2・t1.6）。縞は入れない（2026-10-12 ユーザー）。
//
//   使い方: node scripts/u-graph-sim.mjs > ug.json
//           python scripts/u-graph-sheet.py ug.json 出力.xlsx 作業フォルダ
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,searchSequences,lookupTable,NOBI_TABLE,MINOUT_TABLE,pickDie,dieLabel};'
)();

const PUNCH = '904061';
const machineOf = (sel) => (/^ins:/.test(sel) ? 'hg2203' : 'hd3504nt');
const H_TOP = 300;   // 縦の上限（これより高くても通る所は「上限なし」）

function ok(info, nobi, t, outer) {
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < outer.length - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return false;
  const part = { t, segs: flat, bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: 1 }], grow: [nobi - t / 2, nobi - t / 2] };
  return E.searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, Math.max(0, 170 - t)).sols.length > 0;
}

const mat = '鉄';
const ts = [...new Set(Object.values(E.MINOUT_TABLE[mat]).flatMap((o) => Object.keys(o).map(Number)))].sort((a, b) => a - b);
const plan = [];
for (const t of ts) {
  if (t <= 1.6) plan.push({ t, sel: 'ins:971561:stack', V: 8, base: false });   // 薄板の小さいV
  const b = E.pickDie(mat, t);
  if (b && b.sel) plan.push({ t, sel: b.sel, V: Number(String(b.v).replace('V', '')), base: true });
}

const out = [];
for (const p of plan) {
  const { t, sel, V } = p;
  const machine = machineOf(sel);
  const info = E.resolveDie(sel, V, 30, true, machine);
  const nb = E.lookupTable(E.NOBI_TABLE, mat, V, t);
  const mo = E.lookupTable(E.MINOUT_TABLE, mat, V, t);
  if (!nb || !mo) continue;
  const nobi = nb.val, minOut = mo.val;
  // 一番低い立上り（最小フランジぴったりだと V肩に届かない型があるので、広い底で曲がる一番低い立上り）
  let lo = null;
  for (let h = Math.ceil(minOut); h <= Math.ceil(minOut) + 40; h += 1) {
    if (ok(info, nobi, t, [h, 300, h])) { lo = h; break; }
  }
  let wMin = null;
  if (lo != null) {
    for (let W = Math.ceil(2 * t + 2); W <= 500; W += 1) if (ok(info, nobi, t, [lo, W, lo])) { wMin = W; break; }
  }
  const wMax = Math.max(300, (wMin || 0) + 200);
  const curve = [];
  if (wMin != null) {
    const step = wMax > 300 ? 10 : 5;
    for (let W = wMin; W <= wMax; W = (W === wMin ? Math.ceil((wMin + 0.001) / step) * step : W + step)) {
      if (!ok(info, nobi, t, [lo, W, lo])) { curve.push({ W, H: null }); continue; }
      let H = lo;
      while (H + 2 <= H_TOP && ok(info, nobi, t, [H + 2, W, H + 2])) H += 2;
      curve.push({ W, H: H + 2 > H_TOP ? H_TOP : H, top: H + 2 > H_TOP });
    }
  }
  out.push({ mat, t, V, sel, base: p.base, machine: machine === 'hg2203' ? 'HG2203' : 'HD3504NT',
    label: E.dieLabel(sel).replace(/\s+/g, ' '), minOut, nobi, hLow: lo, wMin, wMax, curve });
  process.stderr.write(`t${t} V${V}${p.base ? '（基準）' : ''} 最小 ${lo}×${wMin} 点 ${curve.length}\n`);
}
process.stdout.write(JSON.stringify(out));
