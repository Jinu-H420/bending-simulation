// コの字曲げ 早見表の数字を出す（グラフ版 u-graph-sim.mjs を数字で細かく引けるようにしたもの）。
//   型ごとに、底W（5mm刻み）ごとの「低いほうの立上り」の上限（1mm）。普通に曲げたとき（ヤゲン904061）。
//
//   左右の立上りが違うとき：2026-10-12 に、縦＝底W・横＝低いほう・ます目＝高いほうの上限 の表を全16型で計算したところ、
//   高いほうは どの型・どの寸法でも「上限なし」（400mmでも通る）だった。当たるのは先に曲げる低いほうだけなので、
//   低いほうの立上りで表を引けばよい。ただし高すぎると曲げた後に機械から抜けないことがある（計算に入っていない。
//   実績 2200・900・500 t9「曲げた後に抜けられない」）。
//
//   型は u-graph-sim.mjs と同じ（鉄の各板厚の基準金型＋V8 t1.2・t1.6。縞は入れない）。計算の中身は u-curve.mjs。
//   使い方: node scripts/u-table-sim.mjs > scripts/u-table.json   （全部の型。約15分。早見グラフ・実績合わせの元になる）
//           node scripts/u-table-sim.mjs --add > 新.json            （足した型だけ計算して後ろに足す）
//           python scripts/u-table-sheet.py scripts/u-table.json 出力.xlsx
import { readFileSync } from 'node:fs';
import { plan, dieCtx, curve, meta } from './u-curve.mjs';

// --add：scripts/u-table.json にない型だけ計算して後ろに足す（すでにある型の数字・実績合わせはそのまま）
const add = process.argv.includes('--add');
const have = add ? JSON.parse(readFileSync(new URL('./u-table.json', import.meta.url), 'utf8')) : [];
const out = [...have];
for (const p of plan(true)) {
  if (have.some((r) => r.t === p.t && r.V === p.V && r.sel === p.sel)) continue;
  const c = dieCtx(p);
  if (!c) continue;
  const cv = curve(c);
  out.push({ ...meta(c), ...cv });
  process.stderr.write(`t${c.t} V${c.V}${p.base ? '（基準）' : ''} 最小 ${cv.hLow}×${cv.wMin}\n`);
}
process.stdout.write(JSON.stringify(out));
