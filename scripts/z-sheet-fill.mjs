// Z曲げ実績記入シートの空欄を、シミュレーター（干渉判定そのもの）で埋めるための計算。
// 入力: [{row, V, t, mat, minOut, actI, actK}] の JSON ファイル
// 出力: 行ごとの sim 値（段差S最小・フランジA上限・A最大・フランジB最小／最大 ほか）
//
// 形の約束（記入シートの図と同じ）:
//   辺 = [フランジA, 段差S, フランジB]（すべて外寸）。1工程目にA側、2工程目は裏返してB側を曲げる。
//
// 使い方: node scripts/z-sheet-fill.mjs <rows.json>
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,computeChain,minGap,shoulderReach,reachCheck,toolsFor,strokeState,simMinStep,lookupTable,NOBI_TABLE};'
)();

// V幅 → 実機の型と機械（V.dxf で確認した組み合わせ）
const SEL = {
  8: 'ins:971561:stack', 12: 'ins:974061:stack', 16: 'ins:977061:stack', 20: 'ins:979061:stack',
  25: 'ins:982061:stack', 32: 'lib:03500:0', 40: 'lib:03600:0', 50: 'lib:03700:0', 63: 'lib:03800:0',
  80: 'lib:01360:0', 100: 'lib:01860:0', 125: 'lib:03900:0', 160: 'lib:01400:0',
};
const machineOf = (V) => (V <= 25 ? 'hg2203' : 'hd3504nt');
const PUNCH = '904061';
const HI = 400;            // これで通れば「なし（上限なし）」
const BIG_S = 300;         // フランジA最大を見るときの段差（台に掛からない広さ）

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
  // 相手側のフランジ（固定する側）。折り曲げ表の最小外寸を必ず満たす長さにする。
  // V肩に届く長さ（外寸）より短いと、それだけで曲げられないので、それ以上にする。
  const reachOuter = E.shoulderReach(vHalf, r.t, 90) + nobi + 2;
  const other = Math.max(30, minOut + 5, reachOuter);

  const seq = [{ bend: 0, mirror: false, valley: false }, { bend: 1, mirror: false, valley: true }];
  const feasible = (A, S, B) => {
    if (A < minOut - 1e-6 || B < minOut - 1e-6) return false;      // 折り曲げ表の最小外寸は守る
    const segs = [A - nobi, S - 2 * nobi, B - nobi];
    if (segs.some((x) => x <= 0.5)) return false;
    const part = { t: r.t, segs, bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: -1 }], grow: [grow, grow] };
    for (let si = 0; si < seq.length; si++) {
      if (!E.reachCheck(part, seq, si, vHalf).ok) return false;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const { bendProg, lift } = E.strokeState(p, openGap);
        const ch = E.computeChain(part, seq, si, bendProg, vHalf);
        if (!ch.activeDirOK) return false;
        const tools = E.toolsFor(PUNCH, false, ch.innerY - lift, 'std', info.polys);
        if (E.minGap(ch, tools.polys, r.t, vHalf, exArc).gap < -0.05) return false;
      }
    }
    return true;
  };
  // 上限を二分探索（lo で通ることが前提）
  const upper = (f, lo) => {
    if (!f(lo)) return { v: null, why: '通らない' };
    if (f(HI)) return { v: 'なし' };
    let a = lo, b = HI;
    for (let i = 0; i < 13; i++) { const m = (a + b) / 2; if (f(m)) a = m; else b = m; }
    return { v: +a.toFixed(1) };
  };
  // 下限を二分探索（hi で通ることが前提）
  const lower = (f, hi) => {
    if (!f(hi)) return { v: null, why: '通らない' };
    let a = 1, b = hi;
    if (f(a)) return { v: +a.toFixed(1) };
    for (let i = 0; i < 13; i++) { const m = (a + b) / 2; if (f(m)) b = m; else a = m; }
    return { v: +b.toFixed(1) };
  };

  // --- 段差S 最小（両端フランジ 80、表の最小外寸が大きい型はその値＋15）
  const flangeOuter = Math.max(80, minOut + 15);
  const part0 = { t: r.t, segs: [flangeOuter - nobi, Math.max(5, (r.actK || 40) - 2 * nobi), flangeOuter - nobi],
                  bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: -1 }], grow: [grow, grow] };
  let simK = null, simKwhy = '';
  try {
    const flat = E.simMinStep(part0, seq, 1, vHalf, info.polys, PUNCH, false, 'std', openGap);
    if (flat == null) simKwhy = '段差を広げても不可'; else simK = +(flat + 2 * nobi).toFixed(1);
  } catch (e) { simKwhy = 'err:' + e.message; }
  // simMinStep は探す範囲が狭く、V100 以上のように段差を大きくとる型では「不可」と返してしまう。
  // そのときは 400mm まで広げて自分で探し直す（400mm で通れば、通る最小を二分探索）。
  if (simK == null) {
    const g = (S) => feasible(flangeOuter, S, flangeOuter);
    if (g(HI)) {
      let a = 2 * nobi + 1, b = HI;
      for (let i = 0; i < 14; i++) { const m = (a + b) / 2; if (g(m)) b = m; else a = m; }
      simK = +b.toFixed(1); simKwhy = '';
    } else {
      simKwhy = '段差を400mmまで広げても不可';
    }
  }

  // 以降の欄で使う段差：実績があれば実績、無ければ sim の最小段差。
  // sim の最小段差ちょうどは境目なので、相手フランジを変えると通らないことがある。
  // そのときは 0.5mm ずつ広げて、実際に通る段差を使う。
  let S = r.actK != null ? r.actK : simK;
  const Ssrc = r.actK != null ? '実績' : 'sim';
  if (Ssrc === 'sim' && S != null) {
    const loA0 = Math.max(minOut, E.shoulderReach(vHalf, r.t, 90) + nobi + 2, other);
    let s2 = S;
    while (s2 <= S + 40 && !feasible(loA0, s2, other)) s2 = +(s2 + 0.5).toFixed(1);
    S = s2 <= S + 40 ? s2 : null;
  }
  const res = { row: r.row, die: info.note.split('｜')[0].trim(), machine, nobi, flangeOuter,
                simK, simKwhy, S, Ssrc };
  if (S == null) { out.push({ ...res, why: '段差が決まらない' }); continue; }

  const loA = Math.max(minOut, E.shoulderReach(vHalf, r.t, 90) + nobi + 2);
  const I = upper((A) => feasible(A, S, other), loA);               // その段差でのフランジA上限
  const J = upper((A) => feasible(A, BIG_S, other), loA);           // 段差を十分とったときのフランジA最大
  const L = lower((B) => feasible(other, S, B), Math.max(other, loA)); // その段差でのフランジB最小
  const M = upper((B) => feasible(other, S, B), Math.max(other, loA)); // その段差でのフランジB最大
  out.push({ ...res, other, simI: I.v, simIwhy: I.why || '', simJ: J.v, simJwhy: J.why || '',
             simL: L.v, simLwhy: L.why || '', simM: M.v, simMwhy: M.why || '' });
}
process.stdout.write(JSON.stringify(out));
