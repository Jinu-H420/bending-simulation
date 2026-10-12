// コの字曲げの実績入力シートに入れる「シミュレーションの値」を計算する（C形の c-sheet-sim.mjs と同じ作り）。
// 行は折り曲げ表（MINOUT_TABLE）と同じ並び（金型 × 材質 × 板厚）。
//
//   使い方: node scripts/u-sheet-sim.mjs > u.json
//           python scripts/u-sheet-form2.py u.json 出力.xlsx 図.png
//
// 形の約束（記入シートの図と同じ。寸法はすべて外寸）
//   立上りH1 － 底W － 立上りH2。2か所とも同じ向き。左右同じ高さ（H1=H2）で見る。
//   ① 底W 最小：立上りを一番低く（広い底で曲がる一番低い立上り）したとき、普通に曲がる一番狭い底W
//   ② 立上りH 上限：底W を決めたとき、普通に曲がる一番高い立上り（一番低い立上りから上へ、通るところまで）
//   普通＝ヤゲン904061・2か所とも90°。中押し・くの字は入れない（中押しの決まりは別に確認済み）。
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,searchSequences,lookupTable,NOBI_TABLE,MINOUT_TABLE};'
)();

const SEL = {
  8: 'ins:971561:stack', 12: 'ins:974061:stack', 16: 'ins:977061:stack', 20: 'ins:979061:stack',
  25: 'ins:982061:stack', 32: 'lib:03500:0', 40: 'lib:03600:0', 50: 'lib:03700:0', 63: 'lib:03800:0',
  80: 'lib:01360:0', 100: 'lib:01860:0', 125: 'lib:03900:0', 160: 'lib:01400:0',
};
// 縞板は V25・V40・V80 だけ、機械は HD3504NT だけ（金型寸法表・2026-09-24 ユーザー確認）
const SHIMA_SEL = { 25: 'lib:30640:1', 40: 'lib:03600:0', 80: 'lib:01360:0' };
const machineOf = (V, mat) => (mat === '縞' ? 'hd3504nt' : V <= 25 ? 'hg2203' : 'hd3504nt');
const selOf = (V, mat) => (mat === '縞' ? SHIMA_SEL[V] : SEL[V]);
const PUNCH = '904061';
const DIRS = [1, 1];
// 記入シートの見本の底W
export const WS = [30, 50, 100, 200];   // 参考に出す底W（30 は小さいサイズの目安）
const H_TOP = 400;   // これより高くても通るなら「なし」（上限なし）

function ok(info, nobi, t, outer) {
  const n = outer.length;
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < n - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return false;
  const part = { t, segs: flat, bends: DIRS.map((d) => ({ angle: 90, dir: d })), grow: DIRS.map(() => nobi - t / 2) };
  return E.searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, Math.max(0, 170 - t)).sols.length > 0;
}

const out = [];
for (const mat of ['鉄', '縞']) {
  for (const [Vs, byT] of Object.entries(E.MINOUT_TABLE[mat])) {
    const V = Number(Vs);
    const sel = selOf(V, mat);
    if (!sel) continue;
    const info = E.resolveDie(sel, V, 30, true, machineOf(V, mat));
    for (const [ts, minOut] of Object.entries(byT)) {
      const t = Number(ts);
      const nb = E.lookupTable(E.NOBI_TABLE, mat, V, t);
      const row = { mat, V, t, minOut, machine: machineOf(V, mat) === 'hg2203' ? 'HG2203' : 'HD3504NT' };
      if (!nb) { out.push({ ...row, why: '片伸びが表にない' }); continue; }
      const nobi = nb.val;
      // 一番低い立上り：最小フランジぴったりだと V肩に届かない型があるので、広い底（W=200）で曲がる一番低い立上りを使う
      let lo = null;
      for (let h = Math.ceil(minOut); h <= Math.ceil(minOut) + 40; h += 1) {
        if (ok(info, nobi, t, [h, 200, h])) { lo = h; break; }
      }
      row.hLow = lo == null ? '不可' : lo;
      if (lo == null) { for (const W of WS) row[`h${W}`] = '不可'; row.wMin = '不可'; out.push(row); continue; }
      // ① 底W 最小（立上り＝一番低い立上り）。1mm刻み
      let wMin = null;
      for (let W = Math.max(2 * nobi + 2, Math.ceil(2 * t + 2)); W <= 400; W += 1) {
        if (ok(info, nobi, t, [lo, W, lo])) { wMin = W; break; }
      }
      row.wMin = wMin == null ? '不可' : wMin;
      // ② 立上りH 上限（底W を決めて、一番低い立上りから上へ。2mm刻みで当たる手前まで）
      for (const W of WS) {
        if (wMin == null || W < wMin) { row[`h${W}`] = '不可'; continue; }
        if (!ok(info, nobi, t, [lo, W, lo])) { row[`h${W}`] = '不可'; continue; }
        let H = lo;
        while (H + 2 <= H_TOP && ok(info, nobi, t, [H + 2, W, H + 2])) H += 2;
        row[`h${W}`] = H + 2 > H_TOP ? 'なし' : H;
      }
      out.push(row);
      process.stderr.write(`${mat} V${V} t${t} W最小 ${row.wMin} / H上限 ${WS.map((W) => row[`h${W}`]).join(' / ')}\n`);
    }
  }
}
process.stdout.write(JSON.stringify(out));
