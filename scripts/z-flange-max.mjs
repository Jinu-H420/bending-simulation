// Z曲げで、段差Sを決めたときにフランジAを何mmまで伸ばせるかを求める。
// 記入シートの「フランジA最小」列は、実際にはそのSでの“最大”（それを超えると
// Vの台に当たる）だったため、実績と突き合わせるために作った。
//
// 使い方: node scripts/z-flange-max.mjs <V幅> <板厚> <材質> <段差S外寸> [フランジB外寸]
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const engine = new Function(
  lines.slice(1, end).join('\n') +
  '\nreturn {resolveDie,computeChain,minGap,shoulderReach,reachCheck,toolsFor,strokeState,lookupTable,NOBI_TABLE};'
)();

const SEL = { 8: 'ins:971561:stack', 12: 'ins:974061:stack', 16: 'ins:977061:stack',
  20: 'ins:979061:stack', 25: 'ins:982061:stack', 32: 'lib:03500:0', 40: 'lib:03600:0',
  50: 'lib:03700:0', 63: 'lib:03800:0', 80: 'lib:01360:0' };
const MACHINE = { 12: 'hg2203', 25: 'hg2203', 32: 'hd3504nt', 40: 'hd3504nt' };

const [V, t, mat, Souter, Bouter = 30] =
  [+process.argv[2], +process.argv[3], process.argv[4] || '鉄', +process.argv[5], +process.argv[6]];

const info = engine.resolveDie(SEL[V], V, 30, true, MACHINE[V] || null);
const nb = engine.lookupTable(engine.NOBI_TABLE, mat, V, t);
if (!nb) { console.log('片伸びが表にありません'); process.exit(1); }
const nobi = nb.val, grow = nobi - t / 2;
const openGap = Math.max(0, 170 - t);
const exArc = engine.shoulderReach(info.vHalf, t, 90) + t;
const seq = [{ bend: 0, mirror: false, valley: false }, { bend: 1, mirror: false, valley: true }];

// A（外寸）を与えて、その形が全工程通るか
function feasible(Aouter) {
  const part = { t, segs: [Aouter - nobi, Souter - 2 * nobi, Bouter - nobi],
                 bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: -1 }], grow: [grow, grow] };
  for (let si = 0; si < seq.length; si++) {
    if (!engine.reachCheck(part, seq, si, info.vHalf).ok) return false;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const { bendProg, lift } = engine.strokeState(p, openGap);
      const ch = engine.computeChain(part, seq, si, bendProg, info.vHalf);
      if (!ch.activeDirOK) return false;
      const tools = engine.toolsFor('904061', false, ch.innerY - lift, 'std', info.polys);
      const g = engine.minGap(ch, tools.polys, t, info.vHalf, exArc);
      if (g.gap < -0.05) return false;
    }
  }
  return true;
}

// 下限が通ることを確かめてから、通らなくなる境目を探す
let lo = Math.max(5, engine.shoulderReach(info.vHalf, t, 90) + 1);
if (!feasible(lo)) { console.log(`V${V}・t${t}・S${Souter}: 最小フランジでも通りません`); process.exit(0); }
let hi = 400;
if (feasible(hi)) { console.log(`V${V}・t${t}・S${Souter}: ${hi}mm でも通ります（上限なし）`); process.exit(0); }
for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (feasible(m)) lo = m; else hi = m; }
console.log(`V${V}・t${t}・${mat}・段差S ${Souter}mm（外寸）・フランジB ${Bouter}mm`);
console.log(`  ダイ: ${info.note}`);
console.log(`  片伸び ${nobi} ／ V半幅 ${info.vHalf.toFixed(2)}`);
console.log(`  → フランジA の上限 ${lo.toFixed(1)}mm（${hi.toFixed(1)}mm で不可）`);
