// コの字曲げ・ハット曲げ 早見グラフ：★に書いてもらった実績に、計算を合わせ直す（2026-10-13 ユーザー「★が分かれば他も分かるように」）。
//   型ごとに2つの値（u-curve.mjs の prm）を動かして、書いてある実績にいちばん合うものを探し、全部の行を計算し直す。
//     ang ＝曲げ角度（山と谷が左右に動く） need＝当たりとみなす境目（線が上下に動く）
//   2つで全部の★が ±3mm に入れば、間の行も信じてよい。入らない★は「合わない」として返す（計算に入っていない理由がある所）。
//   使い方: node scripts/u-fit.mjs scripts/u-table.json 実績.json > 合わせた.json   （ハットは scripts/hat-table.json）
//     実績.json = [{ t, V, entries: { 底W: 立上り | '×' | {lo, hi} }, min?: { h, w } }]（u-chart-read.py が早見グラフから読む）
//     {lo, hi}＝ハットで「25〜75」のように範囲で書いたもの（下限も合わせる）。
//     min＝いちばん小さい断面の実績（その断面が曲がるように合わせる）。立上りが最小フランジの表より低いときは
//     計算では合わせられない（表の値）ので minLow で知らせる。表を直すかはユーザーに確かめてから。
import { readFileSync } from 'node:fs';
import { plan, dieCtx, lowest, lower, upper, curve, ok, P0 } from './u-curve.mjs';

const TOL = 3;                 // これより外れた★は「合わない」
const [basePath, entPath] = process.argv.slice(2);
const base = JSON.parse(readFileSync(basePath, 'utf8'));
const ents = JSON.parse(readFileSync(entPath, 'utf8'));
const plans = plan(true);
const num = (v) => (v === 'なし' ? 300 : v);
const outerOf = (c, h, W) => (c.shape === 'HAT' ? [c.A, h, W, h, c.A] : [h, W, h]);

function score(c, his, los, xs, mn, prm) {
  const hLow = lowest(c, prm);
  let s = 0.2 * Math.abs(prm.ang - P0.ang) + 0.2 * Math.abs(prm.need - P0.need);   // 同じくらい合うなら計算の既定に近いほう
  const got = { hi: {}, lo: {} };
  const Ws = [...new Set([...his.map(([W]) => W), ...los.map(([W]) => W), ...xs])];
  for (const W of Ws) {
    got.lo[W] = lower(c, W, hLow, prm);
    got.hi[W] = got.lo[W] == null ? null : upper(c, W, hLow, prm, got.lo[W]);
  }
  for (const [W, act] of his) s += got.hi[W] == null ? 40 : Math.abs(num(got.hi[W]) - act);
  for (const [W, act] of los) s += got.lo[W] == null ? 40 : Math.abs(got.lo[W] - act);
  for (const W of xs) if (got.hi[W] != null) s += 30;
  if (mn) { got.min = ok(c, outerOf(c, mn.h, mn.w), prm); if (!got.min) s += 40; }
  return { s, got };
}

const out = [];
for (const r of base) {
  const e = ents.find((x) => x.t === r.t && x.V === r.V);
  const row = { ...r, entries: e ? e.entries : {}, ...(e && e.min ? { minAct: e.min } : {}) };
  const mn = row.minAct;
  const E_ = Object.entries(row.entries).map(([W, v]) => [Number(W), v]);
  const his = E_.flatMap(([W, v]) => (typeof v === 'number' ? [[W, v]] : v && typeof v.hi === 'number' ? [[W, v.hi]] : []));
  const los = E_.flatMap(([W, v]) => (v && typeof v.lo === 'number' ? [[W, v.lo]] : []));
  const xs = E_.filter(([, v]) => v === '×').map(([W]) => W);
  if (his.length || los.length || mn) {
    const hat = r.shape === 'HAT';
    const c = dieCtx(plans.find((p) => p.t === r.t && p.V === r.V && p.sel === r.sel), hat ? 'HAT' : 'U');
    let best = null;
    const tryP = (prm) => { const sc = score(c, his, los, xs, mn, prm); if (!best || sc.s < best.s) best = { ...sc, prm }; };
    // ハットは1回の計算が重いので、粗く探してから細かく
    const angs = hat ? [86, 88, 90, 92, 94, 96] : [86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96];
    const needs = hat ? [-4, -2, -1, P0.need, 1] : [-6, -4, -3, -2, -1, P0.need, 1, 2];
    for (const ang of angs) for (const need of needs) tryP({ ang, need });
    const b0 = best.prm;
    const das = hat ? [-1, 0, 1] : [-0.5, 0, 0.5];
    for (const da of das) for (const dn of [-0.5, -0.25, 0, 0.25, 0.5]) {
      if (da || dn) tryP({ ang: b0.ang + da, need: Math.round((b0.need + dn) * 100) / 100 });
    }
    const cv = curve(c, best.prm, { wTop: hat ? 300 : 400 });
    const g = best.got;
    const txt = (lo, hi) => (lo == null ? null : hat ? `${lo}〜${hi}` : hi);
    const checks = [...new Set([...his.map(([W]) => W), ...los.map(([W]) => W), ...xs])].sort((a, b) => a - b).map((W) => {
      const v = row.entries[W];
      if (v === '×') return { W, act: '×', calc: r.hmax[W] ?? null, fit: txt(g.lo[W], g.hi[W]), bad: g.hi[W] != null };
      const aHi = typeof v === 'number' ? v : v.hi, aLo = typeof v === 'object' ? v.lo : undefined;
      const bad = (aHi != null && (g.hi[W] == null || Math.abs(num(g.hi[W]) - aHi) > TOL)) ||
        (aLo != null && (g.lo[W] == null || Math.abs(g.lo[W] - aLo) > TOL));
      return { W, act: typeof v === 'number' ? v : `${aLo ?? ''}〜${aHi ?? ''}`, calc: r.hmax[W] ?? null, fit: txt(g.lo[W], g.hi[W]), bad };
    });
    if (mn) checks.unshift({ kind: 'min', W: mn.w, act: `${mn.h}×${mn.w}`, calc: null, fit: g.min ? '曲がる' : null, bad: !g.min });
    const minLow = mn && mn.h < c.minOut ? { h: mn.h, table: c.minOut } : null;
    row.fit = { ...best.prm, checks, minLow, ...cv };
    // ハット：ほかの外フランジの長さの列も、同じ値（角度・境目）で出し直す
    if (hat && r.flanges) {
      row.fit.byA = {};
      for (const A of r.flanges) {
        if (A === c.A) continue;
        const cA = curve({ ...c, A }, best.prm, { wTop: 300, withH1: false });
        row.fit.byA[A] = { A, hLow: cA.hLow, wMin: cA.wMin, hmin: cA.hmin, hmax: cA.hmax };
      }
    }
    process.stderr.write(`t${r.t} V${r.V}: 角度 ${best.prm.ang}° 境目 ${best.prm.need} → ` +
      checks.map((k) => `${k.W}:${k.act}/${k.fit}${k.bad ? '✕' : ''}`).join(' ') + '\n');
  }
  out.push(row);
}
process.stdout.write(JSON.stringify(out));
