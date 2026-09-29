// Z曲げ・ハット曲げの実績記入シート（A3）に入れる「シミュレーションの値」を計算する。
// 行は折り曲げ表（MINOUT_TABLE）と同じ並び（金型 × 材質 × 板厚）。
//
//   使い方: node scripts/a3-sheet-sim.mjs Z   > z.json
//           node scripts/a3-sheet-sim.mjs HAT > hat.json
//
// 形の約束（記入シートの図と同じ。寸法はすべて外寸）
//   Z  ：フランジA － 段差S － フランジB。1工程目でA側、2工程目は裏返してB側。
//         A と B は同じ長さで見る（短いほうに上限が掛かる）。
//   ハット：外フランジA － 立上りH1 － 上面W － 立上りH2 － 外フランジB。
//         左右同じ寸法（A=B、H1=H2）で見る。外フランジは 50mm で固定して立上りと上面を見る。
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,searchSequences,shoulderReach,lookupTable,NOBI_TABLE,MINOUT_TABLE,DIE_LIB,nakaOshi,SUTE_MIN_INNER};'
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
const HI = 400;
const R_OF = { 8: 1.3, 12: 2, 16: 2.6, 20: 3.3, 25: 4, 32: 5, 40: 6.5, 50: 8, 63: 10, 80: 13, 100: 16, 125: 20, 160: 26 };

const shape = (process.argv[2] || 'Z').toUpperCase();
//   Z=Z曲げ / HAT=ハット / UNAKA=コの字（中押しが要るかどうか）
const DIRS = shape === 'Z' ? [1, -1] : shape === 'HAT' ? [1, -1, -1, 1] : [1, 1];

// 外寸の並びから、その形が曲げられるか（曲げ順・突き当て・裏返しは自動で探す）
function ok(info, nobi, t, outer) {
  const n = outer.length;
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < n - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return false;
  const part = { t, segs: flat, bends: DIRS.map((d) => ({ angle: 90, dir: d })), grow: DIRS.map(() => nobi - t / 2) };
  return E.searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, Math.max(0, 170 - t)).sols.length > 0;
}
// 上限を二分探索（lo で通り、hi で通らないときの境目）
function upper(test, lo, hi = HI) {
  if (!test(lo)) return null;
  if (test(hi)) return Infinity;
  let a = lo, b = hi;
  for (let i = 0; i < 11; i++) { const m = (a + b) / 2; if (test(m)) a = m; else b = m; }
  return +a.toFixed(1);
}
const num = (v) => (v == null ? '曲げられない' : v === Infinity ? '上限なし' : v);

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
      if (!nb) { out.push({ mat, V, t, minOut, why: '片伸びが表にない' }); continue; }
      const nobi = nb.val;
      const lo = Math.max(minOut, E.shoulderReach(info.vHalf, t, 90) + nobi + 2);
      const row = { mat, V, t, minOut, r: R_OF[V], nobi, machine: machineOf(V, mat) === 'hg2203' ? 'HG2203' : 'HD3504NT' };

      if (shape === 'Z') {
        // 段差S 最小（短いフランジを最小にしたとき）と、段差ごとのフランジ上限
        let sMin = null;
        for (let S = Math.ceil(2 * nobi + 1); S <= 200; S += 1) {
          if (ok(info, nobi, t, [lo, S, lo])) { sMin = S; break; }
        }
        row.sMin = sMin;
        for (const S of [30, 50, 100]) {
          row[`a${S}`] = sMin == null || S < sMin ? null : num(upper((a) => ok(info, nobi, t, [a, S, a]), lo));
        }
      } else if (shape === 'UNAKA') {
        // コの字：底Wごとに「普通に曲げられる立上り上限」と「中押しなら曲げられる立上り上限」
        for (const W of [50, 100, 150, 200]) {
          const inner = +(W - 2 * t).toFixed(1);
          const normal = W < Math.max(2 * nobi + 1, 2 * minOut) ? null
            : upper((h) => ok(info, nobi, t, [h, W, h]), lo);
          // 中押し：押し切った瞬間に上型が内-内に入る高さ。への字は底の半分が最小フランジ以上いる
          const n = E.nakaOshi(PUNCH, false, 'std', inner, 0);
          const half = W / 2 >= minOut;
          const naka = !half ? null : Number.isFinite(n.maxH) ? +(n.maxH + t).toFixed(0) : Infinity;
          row[`n${W}`] = normal === null ? '曲げられない' : normal === Infinity ? '上限なし' : normal;
          row[`m${W}`] = naka === null ? '底が狭く不可' : naka === Infinity ? '上限なし' : naka;
          row[`i${W}`] = inner;
          row[`s${W}`] = inner >= E.SUTE_MIN_INNER ? 'ok' : 'せまい';
        }
      } else {
        // ハット：外フランジ50mm固定。上面Wごとに「曲げられる立上りの範囲」を5mm刻みで調べる。
        // ハットは立上りが低すぎても（上面が上型に近づいて）当たるので、上限だけでなく下限も要る。
        const A = Math.max(50, lo);
        row.outer = A;
        const span = (W) => {
          const hits = [];
          for (let h = Math.ceil(lo); h <= 250; h += 5) if (ok(info, nobi, t, [A, h, W, h, A])) hits.push(h);
          if (!hits.length) return '曲げられない';
          const segs = [];
          let st = hits[0], prev = hits[0];
          for (const h of hits.slice(1)) {
            if (h - prev > 5) { segs.push([st, prev]); st = h; }
            prev = h;
          }
          segs.push([st, prev]);
          return segs.map(([x, y]) => (y >= 250 ? `${x}〜` : x === y ? `${x}` : `${x}〜${y}`)).join('、');
        };
        let wMin = null;
        for (let W = Math.ceil(2 * nobi + 1); W <= 300; W += 5) {
          if (span(W) !== '曲げられない') { wMin = W; break; }
        }
        row.wMin = wMin;
        for (const W of [50, 100, 200]) row[`h${W}`] = W < Math.ceil(2 * nobi + 1) ? '—' : span(W);
      }
      out.push(row);
      process.stderr.write(`${mat} V${V} t${t} ok\n`);
    }
  }
}
process.stdout.write(JSON.stringify(out));
