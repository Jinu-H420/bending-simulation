// コの字曲げ（フランジH1・溝幅W・フランジH2、2か所とも同じ向きの90°）を、
// シミュレーター（干渉判定そのもの）で計算する。
//   入力: [{row, V, mat, t, minOut}] の JSON
//   出力: 溝幅W最小・そのWでのフランジH上限・W=100でのH上限・当たる相手
//
// 形の約束（記入シートの図と同じ）: 寸法はすべて外寸。H1 と H2 は同じ高さで見る。
// 1工程目で H1 側、2工程目で H2 側を曲げる。突き当て（左右）は工程ごとに通るほうを使う。
//
// 使い方: node scripts/u-sheet-fill.mjs <rows.json>
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

const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = [];

for (const r of rows) {
  const sel = SEL[r.V];
  if (!sel) { out.push({ row: r.row, why: '金型なし' }); continue; }
  const machine = machineOf(r.V);
  const info = E.resolveDie(sel, r.V, 30, true, machine);
  const vHalf = info.vHalf;
  const nb = E.lookupTable(E.NOBI_TABLE, r.mat, r.V, r.t);
  if (!nb) { out.push({ row: r.row, why: '片伸びが表に無い' }); continue; }
  const nobi = nb.val, grow = nobi - r.t / 2;
  const openGap = Math.max(0, 170 - r.t);
  const exArc = E.shoulderReach(vHalf, r.t, 90) + r.t;
  const minOut = r.minOut || 0;
  const reachOuter = E.shoulderReach(vHalf, r.t, 90) + nobi + 2;
  const H0 = Math.max(minOut + 5, reachOuter);      // 溝幅の最小を見るときのフランジ高さ（通る最短）

  // 1工程の干渉を調べ、いちばん食い込んだ相手を返す
  const stepHit = (part, seq, si) => {
    if (!E.reachCheck(part, seq, si, vHalf).ok) return { gap: -999, name: 'V肩に届かない' };
    let worst = null;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const { bendProg, lift } = E.strokeState(p, openGap);
      const ch = E.computeChain(part, seq, si, bendProg, vHalf);
      if (!ch.activeDirOK) return { gap: -999, name: '向き不可' };
      const tools = E.toolsFor(PUNCH, false, ch.innerY - lift, 'std', info.polys);
      const g = E.minGap(ch, tools.polys, r.t, vHalf, exArc);
      if (!worst || g.gap < worst.gap) worst = { gap: g.gap, name: tools.names[g.atIdx] };
    }
    return worst;
  };
  // H・W の形が通るか。突き当ては工程ごとに左右どちらでもよい（通るほうを探す）
  const evaluate = (H, W) => {
    if (H < minOut - 1e-6) return { ok: false, name: '最小外寸未満' };
    const segs = [H - nobi, W - 2 * nobi, H - nobi];
    if (segs.some((x) => x <= 0.5)) return { ok: false, name: '寸法が短すぎる' };
    const part = { t: r.t, segs, bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: 1 }], grow: [grow, grow] };
    let best = null;
    for (let m = 0; m < 4; m++) {
      const seq = [{ bend: 0, mirror: !!(m & 1), valley: false }, { bend: 1, mirror: !!(m & 2), valley: false }];
      let worst = null;
      for (let si = 0; si < 2; si++) {
        const h = stepHit(part, seq, si);
        if (!worst || h.gap < worst.gap) worst = { ...h, step: si + 1 };
        if (h.gap < -0.05) break;
      }
      if (worst.gap >= -0.05) return { ok: true, stops: m };
      if (!best || worst.gap > best.gap) best = worst;
    }
    return { ok: false, name: best.name, step: best.step, gap: best.gap };
  };

  const res = { row: r.row, die: info.note.split('｜')[0].trim(), machine, nobi, H0: +H0.toFixed(1) };

  // --- 溝幅W 最小（フランジは通る最短の H0）
  let Wmin = null, WminWhy = '', WminHit = '';
  if (evaluate(H0, HI).ok) {
    let a = 2 * nobi + 1, b = HI;
    for (let i = 0; i < 14; i++) { const mid = (a + b) / 2; if (evaluate(H0, mid).ok) b = mid; else a = mid; }
    Wmin = +b.toFixed(1);
    const e = evaluate(H0, Math.max(2 * nobi + 1, Wmin - 1));
    WminHit = e.ok ? '' : `工程${e.step} ${e.name}`;
  } else {
    WminWhy = 'W=400でも通らない';
  }

  // --- あるWでのフランジH上限
  const hUpper = (W) => {
    if (W == null) return { v: null, why: '溝幅が決まらない' };
    const lo = Math.max(minOut, reachOuter);
    if (!evaluate(lo, W).ok) return { v: null, why: 'このWでは通らない' };
    if (evaluate(HI, W).ok) return { v: 'なし', hit: '' };
    let a = lo, b = HI;
    for (let i = 0; i < 13; i++) { const mid = (a + b) / 2; if (evaluate(mid, W).ok) a = mid; else b = mid; }
    const e = evaluate(b + 0.5, W);
    return { v: +a.toFixed(1), hit: e.ok ? '' : `工程${e.step} ${e.name}` };
  };
  // 溝幅ごとのフランジH上限（現場でよく使う幅で見る）。最小より狭い幅は「W不足」。
  const atW = {};
  for (const W of [50, 100, 200]) {
    const h = Wmin == null ? { v: null, why: '溝幅が決まらない' }
      : W < Wmin ? { v: null, why: 'W不足' } : hUpper(W);
    atW[W] = { v: h.v, why: h.why || '', hit: h.hit || '' };
  }
  out.push({ ...res, Wmin, WminWhy, WminHit, atW });
}
process.stdout.write(JSON.stringify(out));
