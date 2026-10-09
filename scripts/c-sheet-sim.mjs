// C形曲げ（リップ内向き）の実績入力シートに入れる「シミュレーションの値」を計算する。
// 行は折り曲げ表（MINOUT_TABLE）と同じ並び（金型 × 材質 × 板厚）。ハットのシート（a3-sheet-sim.mjs）と同じ作り。
//
//   使い方: node scripts/c-sheet-sim.mjs > c.json
//           python scripts/c-sheet-form.py c.json 出力.xlsx 図.png
//
// 形の約束（記入シートの図と同じ。寸法はすべて外寸）
//   リップA － 立上りH1 － 底W － 立上りH2 － リップB。4か所とも同じ向き（リップが内向き）。
//   左右同じ寸法（A=B、H1=H2）で見る。底W・立上りHを決めて、曲げられるリップの範囲（下限〜上限）を出す。
//   リップは長すぎても（最後の曲げでヤゲンに当たる）、短すぎても（V肩に届かない・当たる）曲がらないので、範囲で見る。
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,searchSequences,shoulderReach,lookupTable,NOBI_TABLE,MINOUT_TABLE};'
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
const DIRS = [1, 1, 1, 1];
// 記入シートの3つの見本（底W・立上りH）
export const CASES = [[100, 50], [150, 75], [200, 100]];

function ok(info, nobi, t, outer) {
  const n = outer.length;
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < n - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return false;
  const part = { t, segs: flat, bends: DIRS.map((d) => ({ angle: 90, dir: d })), grow: DIRS.map(() => nobi - t / 2) };
  return E.searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, Math.max(0, 170 - t)).sols.length > 0;
}
// lo〜hi を step mm 刻みで調べて、通る範囲を「a〜b、c〜d」の形にする（ハットのシートと同じ）
function span(test, lo, hi, step = 2) {
  const hits = [];
  for (let x = lo; x <= hi; x += step) if (test(x)) hits.push(x);
  if (!hits.length) return '不可';
  const segs = [];
  let st = hits[0], prev = hits[0];
  for (const x of hits.slice(1)) {
    if (x - prev > step) { segs.push([st, prev]); st = x; }
    prev = x;
  }
  segs.push([st, prev]);
  return segs.map(([a, b]) => (a === b ? `${a}` : `${a}〜${b}`)).join('、');
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
      // リップは端の辺なので、折り曲げ表の最小フランジから調べる（かんたん判定と同じ下限。V肩に届くかは計算が見る）
      const lo = Math.ceil(minOut);
      for (const [W, H] of CASES) {
        // 立上り・底が最小フランジより短い見本は、この板厚では使わない
        if (H < lo || W < 2 * lo) { row[`a${W}`] = '—'; continue; }
        // リップ同士がぶつかる手前（A＋B＜W）までを調べる
        const cap = Math.floor(W / 2 - t - 1);
        row[`a${W}`] = span((a) => ok(info, nobi, t, [a, H, W, H, a]), lo, cap);
      }
      out.push(row);
      process.stderr.write(`${mat} V${V} t${t} ${CASES.map(([W]) => row[`a${W}`]).join(' / ')}\n`);
    }
  }
}
process.stdout.write(JSON.stringify(out));
