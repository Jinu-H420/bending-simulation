// コの字・ハット曲げ 早見グラフ：「ほかのヤゲンなら」の範囲を出して scripts/u-table.json・hat-table.json に足す。
//   2026-10-13 ユーザー「PL1.2 上面12 はシミュレーションで曲がるのにシートは×」→ シミュレーター（かんたん判定）は 904061 で当たると
//   ほかの普通のヤゲン（反転も）を試す（zu/judge.js の altPunch）。シートも同じヤゲンで計算する（ハットは基準の外フランジの長さだけ）。
//   2026-10-13 ユーザー「コの字 V12 1.2t 最小のWが14 だが W10 でもヤゲン71606 なら曲がると出る」→ コの字も同じように。
//   くの字特殊ヤゲンは曲げ長さで決まるので入れない。
//   出すもの（型ごと）：
//     alt[W]      ＝表の行（ハット 10mm・コの字 5mm ごと）で、904061 より高くまで曲がるヤゲン { punch, flip, lo, hi }（いちばん上限が高いもの）
//     altNarrow[W]＝904061 では狭すぎて曲がらない上面W（1mm ごと）で曲がるヤゲン
//   使い方: node scripts/alt-sim.mjs HAT   （12並べて 約30分。hat-table.json を書き換える）
//           node scripts/alt-sim.mjs U     （約5分。u-table.json を書き換える）
//           node scripts/alt-sim.mjs <U|HAT> --one <型の番号> <ヤゲン> <0|1>   （中で使う）
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { plan, dieCtx, lowest, lower, upper, E, PUNCH } from './u-curve.mjs';

const JOBS = 12;
const P = plan();
const SHAPE = process.argv[2] === 'U' ? 'U' : 'HAT';
const path = fileURLToPath(new URL(SHAPE === 'U' ? './u-table.json' : './hat-table.json', import.meta.url));
const base = JSON.parse(readFileSync(path, 'utf8'));
const rowsOf = (r) => Object.keys(r.hmax).map(Number).filter((W) => W % (SHAPE === 'U' ? 5 : 10) === 0 || W === r.wMin);

const i = process.argv.indexOf('--one');
if (i > 0) {
  const d = Number(process.argv[i + 1]);
  const r = base[d];
  const c = { ...dieCtx(P[d], SHAPE), ...(SHAPE === 'HAT' ? { A: r.A } : {}), punch: process.argv[i + 2], flip: process.argv[i + 3] === '1' };
  const hLow = lowest(c);
  const out = { punch: c.punch, flip: c.flip, rows: {}, narrow: {} };
  if (hLow != null) {
    for (const W of rowsOf(r)) {
      const lo = lower(c, W, hLow);
      if (lo != null) out.rows[W] = { lo, hi: upper(c, W, hLow, undefined, lo) };
    }
    // 904061 のいちばん狭い幅より狭いところ（1mm ごと）
    const wTop = r.wMin ?? (SHAPE === 'U' ? 400 : 300);
    for (let W = Math.ceil(2 * c.t + 2); W < wTop; W += 1) {
      const lo = lower(c, W, hLow);
      if (lo != null) out.narrow[W] = { lo, hi: upper(c, W, hLow, undefined, lo) };
    }
  }
  process.stdout.write(JSON.stringify(out));
} else {
  const punches = Object.keys(E.PUNCH_LIB).filter((k) => !E.PUNCH_LIB[k].special);
  // 10400 は 10300 と同じ形なので省く
  const combos = [[PUNCH, true], ...punches.filter((k) => k !== PUNCH && k !== '10400').flatMap((k) => [[k, false], [k, true]])];
  const jobs = base.flatMap((r, d) => combos.map(([k, f]) => [d, k, f]));
  const res = new Array(jobs.length);
  let next = 0, done = 0;
  const one = () => new Promise((resolve) => {
    const k = next++;
    if (k >= jobs.length) return resolve();
    const [d, pid, f] = jobs[k];
    const ch = spawn(process.execPath, [fileURLToPath(import.meta.url), SHAPE, '--one', String(d), pid, f ? '1' : '0']);
    let buf = '';
    ch.stdout.on('data', (x) => { buf += x; });
    ch.on('close', () => {
      res[k] = JSON.parse(buf);
      if (++done % 20 === 0) process.stderr.write(`${done}/${jobs.length}\n`);
      one().then(resolve);
    });
  });
  await Promise.all(Array.from({ length: JOBS }, one));
  const num = (v) => (v === 'なし' ? 300 : v);
  const better = (a, b) => !b || num(a.hi) > num(b.hi) || (num(a.hi) === num(b.hi) && a.lo < b.lo);
  base.forEach((r, d) => {
    r.alt = {};
    r.altNarrow = {};
    jobs.forEach(([dd], k) => {
      if (dd !== d) return;
      const x = res[k];
      for (const [W, g] of Object.entries(x.rows)) {
        const h0 = r.hmax[W];
        if (h0 != null && num(g.hi) <= num(h0)) continue;           // 904061 で同じ・それ以上なら要らない
        const cand = { punch: x.punch, flip: x.flip, ...g };
        if (better(cand, r.alt[W])) r.alt[W] = cand;
      }
      for (const [W, g] of Object.entries(x.narrow)) {
        const cand = { punch: x.punch, flip: x.flip, ...g };
        if (better(cand, r.altNarrow[W])) r.altNarrow[W] = cand;
      }
    });
    process.stderr.write(`t${r.t} V${r.V}: ほかのヤゲンで上がる行 ${Object.keys(r.alt).length}・狭いほう ${Object.keys(r.altNarrow).join(',') || 'なし'}\n`);
  });
  writeFileSync(path, JSON.stringify(base));
}
