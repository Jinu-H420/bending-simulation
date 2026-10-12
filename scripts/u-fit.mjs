// コの字曲げ 早見グラフ：★に書いてもらった実績に、計算を合わせ直す（2026-10-13 ユーザー「★が分かれば他も分かるように」）。
//   型ごとに2つの値（u-curve.mjs の prm）を動かして、書いてある実績にいちばん合うものを探し、全部の行を計算し直す。
//     ang ＝曲げ角度（山と谷が左右に動く） need＝当たりとみなす境目（線が上下に動く）
//   2つで全部の★が ±3mm に入れば、間の行も信じてよい。入らない★は「合わない」として返す（計算に入っていない理由がある所）。
//   使い方: node scripts/u-fit.mjs scripts/u-table.json 実績.json > 合わせた.json
//     実績.json = [{ t, V, entries: { 底W: 立上り | '×' }, min?: { h, w } }]（u-chart-read.py が早見グラフから読む）
//     min＝いちばん小さい断面の実績（その断面が曲がるように合わせる）。立上りが最小フランジの表より低いときは
//     計算では合わせられない（表の値）ので minLow で知らせる。表を直すかはユーザーに確かめてから。
import { readFileSync } from 'node:fs';
import { plan, dieCtx, lowest, upper, curve, ok, P0 } from './u-curve.mjs';

const TOL = 3;                 // これより外れた★は「合わない」
const [basePath, entPath] = process.argv.slice(2);
const base = JSON.parse(readFileSync(basePath, 'utf8'));
const ents = JSON.parse(readFileSync(entPath, 'utf8'));
const plans = plan();
const num = (v) => (v === 'なし' ? 300 : v);

function score(c, pts, xs, mn, prm) {
  const hLow = lowest(c, prm);
  let s = 0.2 * Math.abs(prm.ang - P0.ang) + 0.2 * Math.abs(prm.need - P0.need);   // 同じくらい合うなら計算の既定に近いほう
  const got = {};
  for (const [W, act] of pts) {
    const u = upper(c, W, hLow, prm);
    got[W] = u;
    s += u == null ? 40 : Math.abs(num(u) - act);
  }
  if (mn) { got.min = ok(c, [mn.h, mn.w, mn.h], prm); if (!got.min) s += 40; }
  for (const W of xs) {
    const u = hLow == null ? null : upper(c, W, hLow, prm);
    got[W] = u;
    if (u != null) s += 30;
  }
  return { s, got };
}

const out = [];
for (const r of base) {
  const e = ents.find((x) => x.t === r.t && x.V === r.V);
  const row = { ...r, entries: e ? e.entries : {}, ...(e && e.min ? { minAct: e.min } : {}) };
  const mn = row.minAct;
  const pts = Object.entries(row.entries).filter(([, v]) => typeof v === 'number').map(([W, v]) => [Number(W), v]);
  const xs = Object.entries(row.entries).filter(([, v]) => v === '×').map(([W]) => Number(W));
  if (pts.length || mn) {
    const c = dieCtx(plans.find((p) => p.t === r.t && p.V === r.V && p.sel === r.sel));
    let best = null;
    const tryP = (prm) => { const sc = score(c, pts, xs, mn, prm); if (!best || sc.s < best.s) best = { ...sc, prm }; };
    for (let ang = 86; ang <= 96; ang += 1) for (const need of [-6, -4, -3, -2, -1, P0.need, 1, 2]) tryP({ ang, need });
    const b0 = best.prm;
    for (const da of [-0.5, 0, 0.5]) for (const dn of [-0.5, -0.25, 0, 0.25, 0.5]) {
      if (da || dn) tryP({ ang: b0.ang + da, need: Math.round((b0.need + dn) * 100) / 100 });
    }
    const cv = curve(c, best.prm);
    const checks = [...pts.map(([W, act]) => ({ W, act })), ...xs.map((W) => ({ W, act: '×' }))]
      .sort((a, b) => a.W - b.W)
      .map((k) => {
        const fit = best.got[k.W];
        const bad = k.act === '×' ? fit != null : fit == null || Math.abs(num(fit) - k.act) > TOL;
        return { ...k, calc: r.hmax[k.W] ?? null, fit, bad };
      });
    if (mn) checks.unshift({ kind: 'min', W: mn.w, act: `${mn.h}×${mn.w}`, calc: null, fit: best.got.min ? '曲がる' : null, bad: !best.got.min });
    const minLow = mn && mn.h < c.minOut ? { h: mn.h, table: c.minOut } : null;
    row.fit = { ...best.prm, checks, minLow, hLow: cv.hLow, wMin: cv.wMin, hmax: cv.hmax, h1: cv.h1 };
    process.stderr.write(`t${r.t} V${r.V}: 角度 ${best.prm.ang}° 境目 ${best.prm.need} → ` +
      checks.map((k) => `${k.W}:${k.act}/${k.fit}${k.bad ? '✕' : ''}`).join(' ') + '\n');
  }
  out.push(row);
}
process.stdout.write(JSON.stringify(out));
