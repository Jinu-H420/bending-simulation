// ハット曲げ 早見グラフの数字を出す（コの字の u-table-sim.mjs のハット版。計算の中身は u-curve.mjs）。
//   型ごとに、上面W（5mm刻み）ごとの立上りの範囲（下限〜上限、1mm）と、1mm ごとの上限。外フランジは型ごとに固定（u-curve.mjs の dieCtx）。
//   ハットは1回の計算が重い（コの字の約30倍）ので、型を分けて並べて計算する。上面W は 300 まで。
//   使い方: node scripts/hat-table-sim.mjs > scripts/hat-table.json   （8つ並べて 約20分）
//           node scripts/hat-table-sim.mjs --one <番号>               （1型だけ。並べるときに中で使う）
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plan, dieCtx, curve, meta } from './u-curve.mjs';

const W_TOP = 300;
const P = plan();
const i = process.argv.indexOf('--one');
if (i > 0) {
  const c = dieCtx(P[Number(process.argv[i + 1])], 'HAT');
  const cv = curve(c, undefined, { wTop: W_TOP });
  process.stdout.write(JSON.stringify({ ...meta(c), ...cv }));
} else {
  const JOBS = 8;
  const out = new Array(P.length);
  let next = 0;
  const run = () => new Promise((resolve) => {
    const k = next++;
    if (k >= P.length) return resolve();
    const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--one', String(k)]);
    let buf = '';
    ch.stdout.on('data', (d) => { buf += d; });
    ch.on('close', () => {
      out[k] = JSON.parse(buf);
      process.stderr.write(`t${out[k].t} V${out[k].V} フランジ${out[k].A} 最小 ${out[k].hLow}×${out[k].wMin}\n`);
      run().then(resolve);
    });
  });
  await Promise.all(Array.from({ length: JOBS }, run));
  process.stdout.write(JSON.stringify(out));
}
