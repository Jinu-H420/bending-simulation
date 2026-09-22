// Z・コの字 判定アプリ（zu/）が使うデータを作る。
//   ・型の一覧（その板厚で実際に使う型。Z曲げ実績記入シートの行）
//   ・Z曲げの実績（段差S最小、そのときのフランジA上限、備考の「S35の場合 A95」）
//   ・Z曲げの計算カーブ：段差Sごとの、フランジA上限（本体と同じ干渉判定）
//   ・コの字の計算カーブ：底Wごとの、立上りH上限（u_ratio.json をそのまま使う）
//   ・コの字をくの字ヤゲン（特殊 くの字165）で曲げたときの、底Wごとの立上りH上限
//
// 金型や判定の式を直したら、これを流し直して zu/data/zu-data.json を作り直す。
// 使い方: node scripts/zu-data.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {resolveDie,computeChain,minGap,shoulderReach,reachCheck,toolsFor,strokeState,lookupTable,NOBI_TABLE};'
)();

// V幅 → 実機の型（V.dxf で確認した組み合わせ）。z-sheet-fill.mjs と同じ。
const SEL = {
  8: 'ins:971561:stack', 12: 'ins:974061:stack', 16: 'ins:977061:stack', 20: 'ins:979061:stack',
  25: 'ins:982061:stack', 32: 'lib:03500:0', 40: 'lib:03600:0', 50: 'lib:03700:0', 63: 'lib:03800:0',
  80: 'lib:01360:0', 100: 'lib:01860:0', 125: 'lib:03900:0', 160: 'lib:01400:0',
};
const machineOf = (V) => (V <= 25 ? 'hg2203' : 'hd3504nt');
const PUNCH = '904061';
const HI = 400;

const zRows = JSON.parse(readFileSync('public/dash/z_dashboard_data.json', 'utf8'));
const uData = JSON.parse(readFileSync('public/dash/u_ratio.json', 'utf8'));

// 備考「S35の場合 A95」「〃 A95.5」（〃＝上の行と同じS）を読む
let lastS2 = null;
const memoPoint = (memo) => {
  if (!memo) return null;
  const s = memo.match(/S\s*(\d+(?:\.\d+)?)/), a = memo.match(/A\s*(\d+(?:\.\d+)?)/);
  if (s) lastS2 = +s[1];
  if (!a) return null;
  const S2 = s ? +s[1] : (/〃/.test(memo) ? lastS2 : null);
  return S2 != null ? { S: S2, A: +a[1] } : null;
};

// コの字（左右同じ高さ H・底 W）が、ヤゲン punch で通るか。突き当ては4通り試す（u-ratio.mjs と同じ）
function uOk(nobi, t, info, punch, H, W) {
  const vHalf = info.vHalf;
  const segs = [H - nobi, W - 2 * nobi, H - nobi];
  if (segs.some((x) => x <= 0.5)) return false;
  const grow = nobi - t / 2, openGap = Math.max(0, 170 - t);
  const exArc = E.shoulderReach(vHalf, t, 90) + t;
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
        const tools = E.toolsFor(punch, false, ch.innerY - lift, 'std', info.polys);
        if (E.minGap(ch, tools.polys, t, vHalf, exArc).gap < -0.05) { pass = false; break; }
      }
    }
    if (pass) return true;
  }
  return false;
}
const W_GRID = [];
for (let w = 20; w <= 300; w += 10) W_GRID.push(w);
const KUNO = '特殊 くの字165';

const S_GRID = [];
for (let s = 10; s <= 250; s += 5) S_GRID.push(s);

const rows = [];
for (const r of zRows) {
  const sel = SEL[r.V];
  const info = E.resolveDie(sel, r.V, 30, true, machineOf(r.V));
  const vHalf = info.vHalf;
  const nb = E.lookupTable(E.NOBI_TABLE, r.mat, r.V, r.t);
  const nobi = nb ? nb.val : null;
  const minOut = r.minOut || 0;
  const reach = nobi != null ? E.shoulderReach(vHalf, r.t, 90) + nobi + 2 : null;

  let zCurve = null;
  if (nobi != null) {
    const grow = nobi - r.t / 2;
    const openGap = Math.max(0, 170 - r.t);
    const exArc = E.shoulderReach(vHalf, r.t, 90) + r.t;
    const other = Math.max(30, minOut + 5, reach);
    // 1工程目にA側、2工程目は裏返してB側。突き当ての左右は4通り試す
    const feasible = (A, S, B) => {
      const segs = [A - nobi, S - 2 * nobi, B - nobi];
      if (segs.some((x) => x <= 0.5)) return false;
      const part = { t: r.t, segs, bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: -1 }], grow: [grow, grow] };
      for (let m = 0; m < 4; m++) {
        const seq = [{ bend: 0, mirror: !!(m & 1), valley: false }, { bend: 1, mirror: !!(m & 2), valley: true }];
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
    const loA = Math.max(minOut, reach);
    zCurve = [];
    for (const S of S_GRID) {
      if (S <= 2 * nobi + 1) continue;
      let A = null;
      if (feasible(loA, S, other)) {
        if (feasible(HI, S, other)) A = HI;
        else {
          let a = loA, b = HI;
          for (let i = 0; i < 11; i++) { const m = (a + b) / 2; if (feasible(m, S, other)) a = m; else b = m; }
          A = +a.toFixed(1);
        }
      }
      zCurve.push({ S, A });
    }
  }

  const u = uData.curves.find((c) => c.V === r.V && c.t === r.t && c.mat === r.mat);
  // くの字で曲げたときの立上り上限（底Wごと）
  let uKuno = null;
  if (nobi != null) {
    const hLo = Math.max(minOut, reach);
    uKuno = W_GRID.map((W) => {
      if (!uOk(nobi, r.t, info, KUNO, hLo, W)) return { W, H: null };
      if (uOk(nobi, r.t, info, KUNO, HI, W)) return { W, H: HI };
      let a = hLo, b = HI;
      for (let i = 0; i < 11; i++) { const m = (a + b) / 2; if (uOk(nobi, r.t, info, KUNO, m, W)) a = m; else b = m; }
      return { W, H: +a.toFixed(1) };
    });
  }
  rows.push({
    V: r.V, mat: r.mat, t: r.t, machine: r.machine, die: r.dieName || info.note.split('｜')[0].trim(),
    sel, minOut, nobi,
    // Z 実績（記入シートの「実際の値」）
    zAct: r.actK != null ? { S: r.actK, A: r.actI, far: memoPoint(r.memo) } : null,
    zSimS: r.simK,
    zCurve,
    uLo: u ? u.lo : null,
    uCurve: u ? u.pts : null,
    uKuno,
  });
  process.stderr.write(`V${r.V} ${r.mat} t${r.t}\n`);
}

mkdirSync('zu/data', { recursive: true });
writeFileSync('zu/data/zu-data.json', JSON.stringify({ made: new Date().toISOString().slice(0, 10), rows }));
process.stderr.write(`zu/data/zu-data.json ${rows.length} 行\n`);
