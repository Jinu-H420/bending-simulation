// くの字ヤゲン 実績記入シートに載せる計算値を出す（コの字をくの字ヤゲンで曲げたとき）。
//   底W最小、立上りH上限（底W=50・100・200）。曲げ長さ L は窓で決まるので別（165版200・100版70）。
// 型の一覧は zu/data/zu-data.json（Z曲げ実績シートと同じ42行）。u-sheet2-sim.mjs のヤゲン違い。
// 使い方: node scripts/kuno-sheet-sim.mjs "特殊 くの字165" > 出力.json
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,computeChain,minGap,shoulderReach,reachCheck,toolsFor,strokeState,nakaOshi};'
)();
const PUNCH = process.argv[2] || "特殊 くの字165";
const HI = 400;
const { rows } = JSON.parse(readFileSync('zu/data/zu-data.json', 'utf8'));

const out = [];
for (const r of rows) {
  const info = E.resolveDie(r.sel, r.V, 30, true, r.machine === 'HG2203' ? 'hg2203' : 'hd3504nt');
  const vHalf = info.vHalf, t = r.t, nobi = r.nobi;
  const res = { V: r.V, mat: r.mat, t, machine: r.machine, die: r.die, minOut: r.minOut, nobi };
  if (nobi == null) { out.push({ ...res, why: '片伸びが表に無い' }); continue; }
  const grow = nobi - t / 2, openGap = Math.max(0, 170 - t);
  const exArc = E.shoulderReach(vHalf, t, 90) + t;
  // 左右同じ高さ H、底 W（外寸）のコの字が通るか。突き当ては4通り試す
  const ok = (H, W) => {
    const segs = [H - nobi, W - 2 * nobi, H - nobi];
    if (segs.some((x) => x <= 0.5)) return false;
    const part = { t, segs, bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: 1 }], grow: [grow, grow] };
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
          if (E.minGap(ch, tools.polys, t, vHalf, exArc).gap < -0.05) { pass = false; break; }
        }
      }
      if (pass) return true;
    }
    return false;
  };
  // 立上りの最短（折り曲げ表の最小外寸と、V肩に届く長さの大きいほう）
  const hLo = Math.max(r.minOut, E.shoulderReach(vHalf, t, 90) + nobi + 2);
  // 底W最小：立上りを最短にしたとき、通る最小の底W（0.5mm刻み）
  let wMin = null;
  for (let W = Math.ceil(2 * nobi + 1); W <= HI; W += 0.5) if (ok(hLo, W)) { wMin = W; break; }
  const hMax = (W) => {
    if (!ok(hLo, W)) return 'W不足';
    if (ok(HI, W)) return 'なし';
    let a = hLo, b = HI;
    while (b - a > 0.5) { const m = (a + b) / 2; if (ok(m, W)) a = m; else b = m; }
    return Math.floor(a);
  };
  out.push({
    ...res, hLo: +hLo.toFixed(1), wMin,
    h50: hMax(50), h100: hMax(100), h200: hMax(200),
  });
  process.stderr.write(`V${r.V} ${r.mat} t${t}\n`);
}
process.stdout.write(JSON.stringify(out));
