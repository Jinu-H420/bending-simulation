// DXF の LINE を拾って閉ループにまとめる。金型の取付図を座標として取り込むため。
// 使い方: node scripts/dxf-loops.mjs <dxf> [色番号,色番号...]
import { readFileSync } from 'node:fs';

const src = readFileSync(process.argv[2], 'latin1').split(/\r?\n/).map((s) => s.trim());
const wantColors = process.argv[3] ? process.argv[3].split(',').map(Number) : null;

// (グループコード, 値) の並びから LINE だけ取り出す
const lines = [];
for (let i = 0; i < src.length - 1; i += 2) {
  if (src[i] !== '0' || src[i + 1] !== 'LINE') continue;
  const e = {};
  let j = i + 2;
  for (; j < src.length - 1 && src[j] !== '0'; j += 2) e[src[j]] = src[j + 1];
  const c = Number(e['62'] ?? 7);
  if (wantColors && !wantColors.includes(c)) continue;
  lines.push({ c, a: [+e['10'], +e['20']], b: [+e['11'], +e['21']] });
}

const K = (p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
const used = new Array(lines.length).fill(false);
const adj = new Map();
lines.forEach((l, i) => {
  for (const p of [l.a, l.b]) {
    const k = K(p);
    if (!adj.has(k)) adj.set(k, []);
    adj.get(k).push(i);
  }
});

const loops = [];
for (let i = 0; i < lines.length; i++) {
  if (used[i]) continue;
  used[i] = true;
  const pts = [lines[i].a, lines[i].b];
  let end = lines[i].b;
  for (;;) {
    const cand = (adj.get(K(end)) || []).find((j) => !used[j]);
    if (cand == null) break;
    used[cand] = true;
    const l = lines[cand];
    end = K(l.a) === K(end) ? l.b : l.a;
    pts.push(end);
  }
  if (pts.length >= 3) loops.push(pts);
}

const info = loops.map((p, i) => {
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  return { i, n: p.length,
    x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)],
    closed: K(p[0]) === K(p[p.length - 1]), pts: p };
});
info.sort((a, b) => b.y[1] - a.y[1]);
for (const s of info) {
  console.log(`#${s.i} 点${s.n} ${s.closed ? '閉' : '開'} x ${s.x[0].toFixed(2)}..${s.x[1].toFixed(2)} ` +
    `(幅${(s.x[1] - s.x[0]).toFixed(2)}) y ${s.y[0].toFixed(2)}..${s.y[1].toFixed(2)} (高${(s.y[1] - s.y[0]).toFixed(2)})`);
}
if (process.env.DUMP) {
  const k = Number(process.env.DUMP);
  const s = info.find((z) => z.i === k);
  console.log(JSON.stringify(s.pts.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)])));
}
