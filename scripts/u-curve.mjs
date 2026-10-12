// コの字曲げ・ハット曲げ：型ごとの「底W（ハットは上面W）ごとの立上りの範囲」を出す部品。
//   u-table-sim.mjs（表を作る）と u-fit.mjs（実績に合わせる）で使う。
//   形 shape：'U'＝コの字（立上り H － 底W － 立上り H。低いほうの立上りで見る）
//             'HAT'＝ハット（外フランジA － 立上りH － 上面W － 立上りH － 外フランジA。A は型ごとに固定（50mm、曲がらなければ長く））
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
const DIRS = { U: [1, 1], HAT: [1, -1, -1, 1] };

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

// 外寸の並び
const outerOf = (c, h, W) => (c.shape === 'HAT' ? [c.A, h, W, h, c.A] : [h, W, h]);

// 型ひとつ分の計算の道具。ハットは外フランジ A を決める（50mm。どの立上りでも曲がらなければ 10mm ずつ長く）
export function dieCtx(p, shape = 'U') {
  const { t, sel, V } = p;
  const machine = machineOf(sel);
  const info = E.resolveDie(sel, V, 30, true, machine);
  const nb = E.lookupTable(E.NOBI_TABLE, mat, V, t);
  const mo = E.lookupTable(E.MINOUT_TABLE, mat, V, t);
  if (!nb || !mo) return null;
  const c = { ...p, shape, machine, info, nobi: nb.val, minOut: mo.val };
  if (shape === 'HAT') {
    c.A = null;
    for (let A = Math.max(50, Math.ceil(mo.val)); A <= 150 && c.A == null; A += 10) {
      for (let h = Math.ceil(mo.val); h <= 150; h += 5) if (ok({ ...c, A }, [A, h, 200, h, A])) { c.A = A; break; }
    }
    if (c.A == null) c.A = Math.max(50, Math.ceil(mo.val));
  }
  return c;
}

export function ok(c, outer, prm = P0) {
  const { info, nobi, t } = c;
  const dirs = DIRS[c.shape || 'U'];
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < outer.length - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return false;
  const part = { t, segs: flat, bends: dirs.map((d) => ({ angle: prm.ang, dir: d })), grow: dirs.map(() => nobi - t / 2) };
  return E.searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, Math.max(0, 170 - t), prm.need).sols.length > 0;
}
const okHW = (c, h, W, prm) => ok(c, outerOf(c, h, W), prm);

// いちばん低い立上り（底W 300 で見る）。ハットの大きい型は最小フランジより 40mm 以上高いことがあるので広く探す
export function lowest(c, prm = P0) {
  const top = Math.ceil(c.minOut) + (c.shape === 'HAT' ? 120 : 40);
  for (let h = Math.ceil(c.minOut); h <= top; h += 1) if (okHW(c, h, 300, prm)) return h;
  return null;
}

// その底W でいちばん低く曲げられる立上り。コの字は hLow で決まり（通らなければ null）、
// ハットは底W で変わることがあるので hLow から上へ探す（5mm 刻みで見つけてから 1mm 戻す）
export function lower(c, W, hLow, prm = P0) {
  if (hLow == null) return null;
  if (okHW(c, hLow, W, prm)) return hLow;
  if (c.shape !== 'HAT') return null;
  for (let h = hLow + 5; h <= hLow + 60; h += 5) {
    if (okHW(c, h, W, prm)) {
      let a = h;
      while (a - 1 > hLow && okHW(c, a - 1, W, prm)) a -= 1;
      return a;
    }
  }
  return null;
}

// 底W での上限。null＝いちばん低い立上りでも曲がらない、'なし'＝300 でも通る
// （立上りは高いほど当たる一方なので二分探索。2026-10-12 に V25 t4.5 で確認。ハットも 2026-10-13 に 5mm 刻みで途切れないことを確認）
export function upper(c, W, hLow, prm = P0, lo = undefined) {
  const a0 = lo === undefined ? lower(c, W, hLow, prm) : lo;
  if (a0 == null) return null;
  if (okHW(c, H_TOP, W, prm)) return 'なし';
  let a = a0, b = H_TOP;
  while (b - a > 1) { const m = Math.floor((a + b) / 2); if (okHW(c, m, W, prm)) a = m; else b = m; }
  return a;
}

// 前の底W の答え g の近くから探す（1mm ごとの表を速く作るため）
function upperNear(c, W, lo, g, prm) {
  if (lo == null) return null;
  if (typeof g !== 'number' || g < lo) return upper(c, W, null, prm, lo);
  if (okHW(c, g, W, prm)) {
    let a = g;
    while (a < H_TOP && okHW(c, a + 1, W, prm)) { a += 1; if (a - g > 8) return upper(c, W, null, prm, lo); }
    return a >= H_TOP ? 'なし' : a;
  }
  let a = g - 1;
  while (a > lo && !okHW(c, a, W, prm)) { a -= 1; if (g - a > 8) return upper(c, W, null, prm, lo); }
  return a;
}

// 型ひとつ分の表（hLow・wMin・5mm ごとの上限 hmax（ハットは下限 hmin も）・1mm ごとの上限 h1）
export function curve(c, prm = P0, { withH1 = true, wTop = 400 } = {}) {
  const hLow = lowest(c, prm);
  let wMin = null;
  if (hLow != null) for (let W = Math.ceil(2 * c.t + 2); W <= 500; W += 1) if (okHW(c, hLow, W, prm)) { wMin = W; break; }
  const hmax = {};
  const hmin = {};
  const one = (W) => {
    const lo = wMin == null || W < wMin ? null : lower(c, W, hLow, prm);
    hmin[W] = lo;
    hmax[W] = lo == null ? null : upper(c, W, hLow, prm, lo);
  };
  for (let W = STEP; W <= wTop; W += STEP) one(W);
  // いちばん狭い底W（5mm 刻みの間）の上限も足す。表にその行を出すため
  if (wMin != null && hmax[wMin] === undefined) one(wMin);
  // 1mm ごとの上限（早見グラフの「底Wを入れると立上りが出る欄」用）。'なし' になったらその先も 'なし'
  const h1 = {};
  if (withH1 && wMin != null) {
    let free = false, g = null;
    for (let W = wMin; W <= wTop; W += 1) {
      if (free) { h1[W] = 'なし'; continue; }
      if (c.shape === 'HAT') {
        h1[W] = upperNear(c, W, lower(c, W, hLow, prm), g, prm);
        g = h1[W];
      } else h1[W] = upper(c, W, hLow, prm);
      if (h1[W] === 'なし') free = true;
    }
  }
  return c.shape === 'HAT' ? { hLow, wMin, hmax, hmin, h1 } : { hLow, wMin, hmax, h1 };
}

export function meta(c) {
  return {
    mat, t: c.t, V: c.V, sel: c.sel, base: c.base, machine: c.machine === 'hg2203' ? 'HG2203' : 'HD3504NT',
    minOut: c.minOut, nobi: c.nobi, ...(c.shape === 'HAT' ? { shape: 'HAT', A: c.A } : {}),
  };
}
