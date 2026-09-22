// 板厚に対して基準より小さいVを使う組み合わせを書き出す（小さいV 最長L 確認シートの行）。
// 型の一覧は zu/data/zu-data.json（実際に使う型）。本体の 2溝ダイ（30540・30640）も足す。
// 使い方: node scripts/smallv-sheet.mjs > 出力.json
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {pickDie, smallVCheck, NOBI_TABLE};'
)();
const { rows } = JSON.parse(readFileSync('zu/data/zu-data.json', 'utf8'));
const CAP = { HG2203: 220, HD3504NT: 350 };     // 機械の力（t）
const LEN = { HG2203: 3000, HD3504NT: 4000 };
const out = [];
const add = (mat, t, V, machine, die) => {
  const sv = E.smallVCheck(mat, t, V);
  if (!sv) return;
  // 力の目安（SS400・引張400N/mm²）：1.42×400×t²÷V（kN/m）→ t/m
  const P = 1.42 * 400 * t * t / V / 9.81;
  out.push({ mat, t, V, baseV: sv.baseV, machine, die, P: +P.toFixed(0),
    Lcap: Math.min(LEN[machine], Math.round(CAP[machine] / P * 1000)), maxL: sv.maxL });
};
for (const r of rows) add(r.mat, r.t, r.V, r.machine, r.die.split('＋')[0].split('（')[0]);
// 2溝ダイ（HD3504NT）：表に無い板厚でも使う（例：ハット t6 を 30540 の V20溝で曲げた実績あり）
for (const [V, die] of [[12, '30540 2溝 V12溝'], [20, '30540 2溝 V20溝'], [16, '30640 2溝 V16溝'], [25, '30640 2溝 V25溝']]) {
  // V が板厚の4倍以上のものだけ（それより細いVは普通は使わない）。V20・t6 は曲げた実績があるので入れる
  for (const t of [3.2, 4.5, 6]) if (V >= 4 * t || (V === 20 && t === 6)) add('鉄', t, V, 'HD3504NT', die);
}
const seen = new Set();
const uniq = out.filter((o) => { const k = `${o.mat}|${o.t}|${o.V}|${o.die}`; if (seen.has(k)) return false; seen.add(k); return true; })
  .sort((a, b) => (a.mat > b.mat ? -1 : a.mat < b.mat ? 1 : 0) || a.t - b.t || a.V - b.V);
process.stdout.write(JSON.stringify(uniq));
