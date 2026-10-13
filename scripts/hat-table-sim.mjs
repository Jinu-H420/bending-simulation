// ハット曲げ 早見グラフの数字を出す（コの字の u-table-sim.mjs のハット版。計算の中身は u-curve.mjs）。
//   型ごとに、上面W（5mm刻み）ごとの立上りの範囲（下限〜上限、1mm）と、1mm ごとの上限。外フランジは型ごとの基準（u-curve.mjs の dieCtx）。
//   byA＝外フランジを変えたときの範囲（20・基準・100・150。u-curve.mjs の hatFlanges）。1mm ごとは基準の長さだけ。
//   ハットは1回の計算が重い（コの字の約30倍）ので、型・長さを分けて並べて計算する。上面W は 300 まで。
//   使い方: node scripts/hat-table-sim.mjs > scripts/hat-table.json   （12並べて 約30分）
//           node scripts/hat-table-sim.mjs --add-flanges            （hat-table.json に byA だけ足す）
//           node scripts/hat-table-sim.mjs --one <番号> [<外フランジ>]   （中で使う）
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { plan, dieCtx, curve, meta, hatFlanges } from './u-curve.mjs';

const W_TOP = 300;
const JOBS = 12;
const P = plan();
const HERE = fileURLToPath(new URL('.', import.meta.url));
const i = process.argv.indexOf('--one');
if (i > 0) {
  const c = dieCtx(P[Number(process.argv[i + 1])], 'HAT');
  const A = process.argv[i + 2];
  if (A) {
    const cv = curve({ ...c, A: Number(A) }, undefined, { wTop: W_TOP, withH1: false });
    process.stdout.write(JSON.stringify({ A: Number(A), hLow: cv.hLow, wMin: cv.wMin, hmin: cv.hmin, hmax: cv.hmax }));
  } else {
    const cv = curve(c, undefined, { wTop: W_TOP });
    process.stdout.write(JSON.stringify({ ...meta(c), flanges: hatFlanges(c), ...cv }));
  }
} else {
  // 並べて走らせる（jobs = [[型の番号, 外フランジ or null], ...]）
  const runAll = async (jobs) => {
    const res = new Array(jobs.length);
    let next = 0;
    const one = () => new Promise((resolve) => {
      const k = next++;
      if (k >= jobs.length) return resolve();
      const [d, A] = jobs[k];
      const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), '--one', String(d), ...(A ? [String(A)] : [])]);
      let buf = '';
      ch.stdout.on('data', (x) => { buf += x; });
      ch.on('close', () => {
        res[k] = JSON.parse(buf);
        process.stderr.write(`t${P[d].t} V${P[d].V} ${A ? `外フランジ${A}` : '基準'} 済\n`);
        one().then(resolve);
      });
    });
    await Promise.all(Array.from({ length: JOBS }, one));
    return res;
  };
  const path = HERE + 'hat-table.json';
  let base;
  if (process.argv.includes('--add-flanges')) base = JSON.parse(readFileSync(path, 'utf8'));
  else base = await runAll(P.map((_, d) => [d, null]));
  const jobs = [];
  base.forEach((r, d) => {
    const fl = r.flanges || hatFlanges({ minOut: r.minOut, A: r.A });
    r.flanges = fl;
    for (const A of fl) if (A !== r.A) jobs.push([d, A]);
  });
  const got = await runAll(jobs);
  base.forEach((r) => { r.byA = {}; });
  jobs.forEach(([d], k) => { base[d].byA[got[k].A] = got[k]; });
  const out = JSON.stringify(base);
  if (process.argv.includes('--add-flanges')) writeFileSync(path, out);
  else process.stdout.write(out);
}
