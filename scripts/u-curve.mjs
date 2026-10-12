// コの字曲げ：型ごとの「底W ごとの低いほうの立上りの上限」を出す部品（u-table-sim.mjs と u-fit.mjs で使う）。
//   実績に合わせるとき（u-fit.mjs）は型ごとに2つの値を動かす。prm = { need, ang }
//     need＝当たりとみなす境目（mm）。既定 -0.05（0.05mm 食い込んだら当たり）。マイナスほど甘く、線が上がる
//     ang ＝曲げ角度（°）。既定 90。山と谷が左右に動く（V25 t4.5：88°で山 95、90°で 100、92°で 105、95°で 110）
import { readFileSync } from 'node:fs';

const lines = readFileSync(new URL('../bending-simulator.jsx', import.meta.url), 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
export const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,searchSequences,lookupTable,NOBI_TABLE,MINOUT_TABLE,pickDie};'
)();

export const PUNCH = '904061';
export const H_TOP = 300;   // これでも通るなら「なし」（上限なし）
export const STEP = 5;      // 底Wの刻み
export const P0 = { need: -0.05, ang: 90 };
export const mat = '鉄';
const machineOf = (sel) => (/^ins:/.test(sel) ? 'hg2203' : 'hd3504nt');

// 早見表の型（鉄の各板厚の基準金型＋V8 t1.2・t1.6。縞は入れない）
export function plan() {
  const ts = [...new Set(Object.values(E.MINOUT_TABLE[mat]).flatMap((o) => Object.keys(o).map(Number)))].sort((a, b) => a - b);
  const out = [];
  for (const t of ts) {
    if (t <= 1.6) out.push({ t, sel: 'ins:971561:stack', V: 8, base: false });
    const b = E.pickDie(mat, t);
    if (b && b.sel) out.push({ t, sel: b.sel, V: Number(String(b.v).replace('V', '')), base: true });
  }
  return out;
}

// 型ひとつ分の計算の道具
export function dieCtx(p) {
  const { t, sel, V } = p;
  const machine = machineOf(sel);
  const info = E.resolveDie(sel, V, 30, true, machine);
  const nb = E.lookupTable(E.NOBI_TABLE, mat, V, t);
  const mo = E.lookupTable(E.MINOUT_TABLE, mat, V, t);
  if (!nb || !mo) return null;
  return { ...p, machine, info, nobi: nb.val, minOut: mo.val };
}

export function ok(c, outer, prm = P0) {
  const { info, nobi, t } = c;
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < outer.length - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return false;
  const part = { t, segs: flat, bends: [{ angle: prm.ang, dir: 1 }, { angle: prm.ang, dir: 1 }], grow: [nobi - t / 2, nobi - t / 2] };
  return E.searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, Math.max(0, 170 - t), prm.need).sols.length > 0;
}

export function lowest(c, prm = P0) {
  for (let h = Math.ceil(c.minOut); h <= Math.ceil(c.minOut) + 40; h += 1) if (ok(c, [h, 300, h], prm)) return h;
  return null;
}

// 底W での上限。null＝いちばん低い立上りでも曲がらない、'なし'＝300 でも通る
// （立上りは高いほど当たる一方なので二分探索。2026-10-12 に V25 t4.5 で確認）
export function upper(c, W, hLow, prm = P0) {
  if (hLow == null || !ok(c, [hLow, W, hLow], prm)) return null;
  if (ok(c, [H_TOP, W, H_TOP], prm)) return 'なし';
  let a = hLow, b = H_TOP;
  while (b - a > 1) { const m = Math.floor((a + b) / 2); if (ok(c, [m, W, m], prm)) a = m; else b = m; }
  return a;
}

// 型ひとつ分の表（hLow・wMin・5mm ごと・1mm ごと）
export function curve(c, prm = P0, { withH1 = true } = {}) {
  const hLow = lowest(c, prm);
  let wMin = null;
  if (hLow != null) for (let W = Math.ceil(2 * c.t + 2); W <= 500; W += 1) if (ok(c, [hLow, W, hLow], prm)) { wMin = W; break; }
  const hmax = {};
  for (let W = STEP; W <= 400; W += STEP) hmax[W] = wMin == null || W < wMin ? null : upper(c, W, hLow, prm);
  // いちばん狭い底W（5mm 刻みの間）の上限も足す。表にその行を出すため
  if (wMin != null && hmax[wMin] === undefined) hmax[wMin] = upper(c, wMin, hLow, prm);
  // 1mm ごとの上限（早見グラフの「底Wを入れると立上りが出る欄」用）。'なし' になったらその先も 'なし'
  const h1 = {};
  if (withH1 && wMin != null) {
    let free = false;
    for (let W = wMin; W <= 400; W += 1) {
      if (free) { h1[W] = 'なし'; continue; }
      h1[W] = upper(c, W, hLow, prm);
      if (h1[W] === 'なし') free = true;
    }
  }
  return { hLow, wMin, hmax, h1 };
}

export function meta(c) {
  return { mat, t: c.t, V: c.V, sel: c.sel, base: c.base, machine: c.machine === 'hg2203' ? 'HG2203' : 'HD3504NT', minOut: c.minOut, nobi: c.nobi };
}
