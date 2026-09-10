// 記入シートの各行について、その段差Sでのフランジ上限をシミュレーションで求める。
// 「フランジA最小」列は実際にはそのSでの“最大”（超えるとVの台に当たる）なので、
// 実績と突き合わせるために同じ条件で計算する。
// 使い方: node scripts/z-flange-batch.mjs <入力json> > <出力json>
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
const BFLANGE = 30;   // 反対側のフランジは短めに固定して、A側だけを見る

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = [];
for (const r of rows) {
  if (!SEL[r.V] || r.S == null) { out.push({ ...r, simA: null, why: '条件不足' }); continue; }
  const info = engine.resolveDie(SEL[r.V], r.V, 30, true, MACHINE[r.V] || null);
  const nb = engine.lookupTable(engine.NOBI_TABLE, r.mat, r.V, r.t);
  if (!nb) { out.push({ ...r, simA: null, why: '片伸びなし' }); continue; }
  const nobi = nb.val, grow = nobi - r.t / 2;
  const openGap = Math.max(0, 170 - r.t);
  const exArc = engine.shoulderReach(info.vHalf, r.t, 90) + r.t;
  const seq = [{ bend: 0, mirror: false, valley: false }, { bend: 1, mirror: false, valley: true }];
  const feasible = (A) => {
    const part = { t: r.t, segs: [A - nobi, r.S - 2 * nobi, BFLANGE - nobi],
                   bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: -1 }], grow: [grow, grow] };
    for (let si = 0; si < seq.length; si++) {
      if (!engine.reachCheck(part, seq, si, info.vHalf).ok) return false;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const { bendProg, lift } = engine.strokeState(p, openGap);
        const ch = engine.computeChain(part, seq, si, bendProg, info.vHalf);
        if (!ch.activeDirOK) return false;
        const tools = engine.toolsFor('904061', false, ch.innerY - lift, 'std', info.polys);
        if (engine.minGap(ch, tools.polys, r.t, info.vHalf, exArc).gap < -0.05) return false;
      }
    }
    return true;
  };
  // 下限は外寸で与える。V肩に届く長さ（展開）に片伸びを足したものが外寸の下限。
  let lo = engine.shoulderReach(info.vHalf, r.t, 90) + nobi + 2;
  if (!feasible(lo)) { out.push({ ...r, simA: null, why: 'その段差では通らない' }); continue; }
  let hi = 400;
  if (feasible(hi)) { out.push({ ...r, simA: null, why: '上限なし' }); continue; }
  for (let i = 0; i < 11; i++) { const m = (lo + hi) / 2; if (feasible(m)) lo = m; else hi = m; }
  out.push({ ...r, simA: +lo.toFixed(1), nobi, die: info.note.split('｜')[0].trim() });
}
process.stdout.write(JSON.stringify(out));
