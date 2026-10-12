// コの字曲げ 早見表の数字を出す（グラフ版 u-graph-sim.mjs を数字で細かく引けるようにしたもの）。
//   型ごとに、底W（5mm刻み）ごとの「低いほうの立上り」の上限（1mm）。普通に曲げたとき（ヤゲン904061）。
//
//   左右の立上りが違うとき：2026-10-12 に、縦＝底W・横＝低いほう・ます目＝高いほうの上限 の表を全16型で計算したところ、
//   高いほうは どの型・どの寸法でも「上限なし」（400mmでも通る）だった。当たるのは先に曲げる低いほうだけなので、
//   低いほうの立上りで表を引けばよい。ただし高すぎると曲げた後に機械から抜けないことがある（計算に入っていない。
//   実績 2200・900・500 t9「曲げた後に抜けられない」）。
//
//   型は u-graph-sim.mjs と同じ（鉄の各板厚の基準金型＋V8 t1.2・t1.6。縞は入れない）。
//   使い方: node scripts/u-table-sim.mjs > ut.json
//           python scripts/u-table-sheet.py ut.json 出力.xlsx
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,searchSequences,lookupTable,NOBI_TABLE,MINOUT_TABLE,pickDie};'
)();

const PUNCH = '904061';
const H_TOP = 300;   // これでも通るなら「なし」（上限なし）
const STEP = 5;      // 底Wの刻み
const machineOf = (sel) => (/^ins:/.test(sel) ? 'hg2203' : 'hd3504nt');

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
  if (t <= 1.6) plan.push({ t, sel: 'ins:971561:stack', V: 8, base: false });
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
  let hLow = null;
  for (let h = Math.ceil(minOut); h <= Math.ceil(minOut) + 40; h += 1) if (ok(info, nobi, t, [h, 300, h])) { hLow = h; break; }
  let wMin = null;
  if (hLow != null) for (let W = Math.ceil(2 * t + 2); W <= 500; W += 1) if (ok(info, nobi, t, [hLow, W, hLow])) { wMin = W; break; }
  // 底W ごとの上限（立上りは高いほど当たる一方なので二分探索。2026-10-12 に V25 t4.5 で確認）
  const hmax = {};
  for (let W = STEP; W <= 400; W += STEP) {
    if (wMin == null || W < wMin || !ok(info, nobi, t, [hLow, W, hLow])) { hmax[W] = null; continue; }
    if (ok(info, nobi, t, [H_TOP, W, H_TOP])) { hmax[W] = 'なし'; continue; }
    let a = hLow, b = H_TOP;
    while (b - a > 1) { const m = Math.floor((a + b) / 2); if (ok(info, nobi, t, [m, W, m])) a = m; else b = m; }
    hmax[W] = a;
  }
  // いちばん狭い底W（5mm 刻みの間）の上限も足す。表にその行を出すため
  if (wMin != null && hmax[wMin] === undefined) {
    let a = hLow, b = H_TOP;
    if (ok(info, nobi, t, [H_TOP, wMin, H_TOP])) hmax[wMin] = 'なし';
    else { while (b - a > 1) { const m = Math.floor((a + b) / 2); if (ok(info, nobi, t, [m, wMin, m])) a = m; else b = m; } hmax[wMin] = a; }
  }
  // 1mm ごとの上限（早見グラフの「底Wを入れると立上りが出る欄」用）。前の答えから上下を探すと速い
  const h1 = {};
  if (wMin != null) {
    let reachedFree = false;
    for (let W = wMin; W <= 400; W += 1) {
      if (reachedFree) { h1[W] = 'なし'; continue; }
      if (!ok(info, nobi, t, [hLow, W, hLow])) { h1[W] = null; continue; }
      if (ok(info, nobi, t, [H_TOP, W, H_TOP])) { h1[W] = 'なし'; reachedFree = true; continue; }
      let a = hLow, b = H_TOP;
      while (b - a > 1) { const m = Math.floor((a + b) / 2); if (ok(info, nobi, t, [m, W, m])) a = m; else b = m; }
      h1[W] = a;
    }
  }
  out.push({ mat, t, V, sel, base: p.base, machine: machine === 'hg2203' ? 'HG2203' : 'HD3504NT', minOut, nobi, hLow, wMin, hmax, h1 });
  process.stderr.write(`t${t} V${V}${p.base ? '（基準）' : ''} 最小 ${hLow}×${wMin}\n`);
}
process.stdout.write(JSON.stringify(out));
