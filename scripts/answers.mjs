// 答え合わせ：ユーザーに教わった答え（訂正・実績）を、直すたびに全部確かめる。
// 2026-11-05 ユーザー指示「訂正したら同じ間違いをしないように」（記憶\訂正は仕組みにして成長する.md）
//   node scripts/answers.mjs   … 合わなければ赤で出して止まる（npm run build の前にも自動で走る）
// 教わったら、下の ANSWERS に1行足す。日付と言われたことを書く。
import { readFileSync } from 'fs';

const lines = readFileSync(new URL('../bending-simulator.jsx', import.meta.url), 'utf8').split('\n');
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn { smallVCheck, nobiAtAngle, lookupNobi, resolveDie };',
)();

const sv = (t, V) => E.smallVCheck('鉄', t, V) || {};
const nobi = (mat, V, t, inner) => {
  const b = E.lookupNobi(mat, V, t);
  return +E.nobiAtAngle(mat, V, t, inner, b ? b.val : 0).val.toFixed(2);
};
const floorOf = (sel, machine) =>
  Math.round(Math.max(...E.resolveDie(sel, 20, 30, true, machine).polys.flatMap((p) => p.map((q) => q[1]))));

// [言われた日・言われたこと, 実際の値, 正しい値]
const ANSWERS = [
  ['2026-10-16 PL9 V40 は L500 まで', () => sv(9, 40).maxL, 500],
  ['2026-10-16 PL9 V50 は 835×3＝L2505 まで', () => sv(9, 50).maxL, 2505],
  ['2026-10-16 V63 は1本しかないので L835 まで', () => sv(9, 63).maxL, 835],
  ['2026-10-29 PL4.5 V20 は V型2本分の L1670 まで', () => sv(4.5, 20).maxL, 1670],
  ['2026-11-11 PL6 は V20 では NG（長さによらず）', () => sv(6, 20).ngL, 0],
  ['2026-11-11 PL6 V25 は L300 まで', () => sv(6, 25).maxL, 300],
  ['2026-10-30 伸び一覧表：鉄 t3.2 V20 内角120° の片伸び 1.4', () => nobi('鉄', 20, 3.2, 120), 1.4],
  ['2026-10-30 伸び一覧表：縞 t2.3 V25 内角172.1° は片伸び 0', () => nobi('縞', 25, 2.3, 172.1), 0],
  ['2026-11-05 床も当たり判定に入れる（HD3504NT 03500 の床 1048）', () => floorOf('lib:03500:0', 'hd3504nt'), 1048],
  ['2026-11-05 床も当たり判定に入れる（HG2203 の床 1062）', () => floorOf('ins:974061:stack', 'hg2203'), 1062],
];

let bad = 0;
for (const [what, get, want] of ANSWERS) {
  let got;
  try { got = get(); } catch (e) { got = `エラー ${e.message}`; }
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? '○' : '\x1b[31m✕'} ${what}${ok ? '' : `　→ いま ${got}（正しくは ${want}）\x1b[0m`}`);
}
console.log(bad ? `\x1b[31m答え合わせ：${bad} 件 合いません\x1b[0m` : `答え合わせ：${ANSWERS.length} 件 すべて合っています`);
process.exit(bad ? 1 : 0);
