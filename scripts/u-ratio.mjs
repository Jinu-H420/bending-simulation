// コの字曲げの「底の幅W」と「立上りHの上限」の関係を、全型について計算する。
// さらに、説明図に使う形（上型の輪郭と、上限ぎりぎりのコの字）を書き出す。
//
// 使い方: node scripts/u-ratio.mjs <rows.json> > u-ratio.json
//   rows.json は scripts/u-sheet-form.py が作る [{row, V, mat, t, minOut}]
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,computeChain,minGap,shoulderReach,reachCheck,toolsFor,strokeState,lookupTable,NOBI_TABLE};'
)();

const SEL = {
  8: 'ins:971561:stack', 12: 'ins:974061:stack', 16: 'ins:977061:stack', 20: 'ins:979061:stack',
  25: 'ins:982061:stack', 32: 'lib:03500:0', 40: 'lib:03600:0', 50: 'lib:03700:0', 63: 'lib:03800:0',
  80: 'lib:01360:0', 100: 'lib:01860:0', 125: 'lib:03900:0', 160: 'lib:01400:0',
};
const machineOf = (V) => (V <= 25 ? 'hg2203' : 'hd3504nt');
const PUNCH = '904061';
const HI = 400;
const W_GRID = [];
for (let w = 20; w <= 300; w += 10) W_GRID.push(w);

function model(r) {
  const info = E.resolveDie(SEL[r.V], r.V, 30, true, machineOf(r.V));
  const vHalf = info.vHalf;
  const nb = E.lookupTable(E.NOBI_TABLE, r.mat, r.V, r.t);
  const nobi = nb.val, grow = nobi - r.t / 2;
  const openGap = Math.max(0, 170 - r.t);
  const exArc = E.shoulderReach(vHalf, r.t, 90) + r.t;
  const minOut = r.minOut || 0;
  const lo = Math.max(minOut, E.shoulderReach(vHalf, r.t, 90) + nobi + 2);
  const partOf = (H, W) => ({ t: r.t, segs: [H - nobi, W - 2 * nobi, H - nobi],
    bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: 1 }], grow: [grow, grow] });
  const ok = (H, W) => {
    const part = partOf(H, W);
    if (part.segs.some((x) => x <= 0.5)) return false;
    for (let m = 0; m < 4; m++) {
      const seq = [{ bend: 0, mirror: !!(m & 1), valley: false }, { bend: 1, mirror: !!(m & 2), valley: false }];
      let pass = true;
      for (let si = 0; si < 2 && pass; si++) {
        if (!E.reachCheck(part, seq, si, vHalf).ok) { pass = false; break; }
        for (let p = 0; p <= 1.0001; p += 0.05) {
          const { bendProg, lift } = E.strokeState(p, openGap);
          const ch = E.computeChain(part, seq, si, bendProg, vHalf);
          if (!ch.activeDirOK) { pass = false; break; }
          const tools = E.toolsFor(PUNCH, false, ch.innerY - lift, 'std', info.polys);
          if (E.minGap(ch, tools.polys, r.t, vHalf, exArc).gap < -0.05) { pass = false; break; }
        }
      }
      if (pass) return true;
    }
    return false;
  };
  const hMax = (W) => {
    if (!ok(lo, W)) return null;                   // その幅では立上りが最短でも曲げられない
    if (ok(HI, W)) return HI;
    let a = lo, b = HI;
    for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (ok(m, W)) a = m; else b = m; }
    return +a.toFixed(1);
  };
  return { info, nobi, openGap, lo, partOf, hMax };
}

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const curves = [];
for (const r of rows) {
  if (!SEL[r.V]) continue;
  const M = model(r);
  const pts = W_GRID.map((W) => ({ W, H: M.hMax(W) }));
  curves.push({ row: r.row, V: r.V, t: r.t, mat: r.mat, machine: machineOf(r.V) === 'hg2203' ? 'HG2203' : 'HD3504NT',
                die: M.info.note.split('｜')[0].trim(), lo: +M.lo.toFixed(1), pts });
}

// 説明図：鉄 V40 t6（HD）で、W=100 の上限ぎりぎりのコの字を 2工程目の曲げ終わりで描く
const demo = rows.find((r) => r.V === 40 && r.t === 6 && r.mat === '鉄') || rows[0];
const M = model(demo);
const Wd = 100, Hd = M.hMax(Wd);
const part = M.partOf(Hd, Wd);
const seq = [{ bend: 0, mirror: false, valley: false }, { bend: 1, mirror: false, valley: false }];
const ch = E.computeChain(part, seq, 1, 1, M.info.vHalf);
const tools = E.toolsFor(PUNCH, false, ch.innerY, 'std', M.info.polys);
const illus = {
  V: demo.V, t: demo.t, W: Wd, H: Hd,
  plate: ch.pts,
  tools: tools.polys.map((p, i) => ({ name: tools.names[i], pts: p })),
};

process.stdout.write(JSON.stringify({ grid: W_GRID, curves, illus }));
