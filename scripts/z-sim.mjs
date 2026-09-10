// Z曲げ_実績記入シートの各行について、シミュレーター（干渉判定）だけで
// 段差をどこまで小さくできるかを計算し、実績と並べて書き込む。
//
// bending-simulator.jsx の先頭（React コンポーネントより前）は純粋な JS なので、
// そこだけを切り出してそのまま実行する。式を書き写すと本体と乖離するため。
//
// 使い方: node scripts/z-sim.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ExcelJS = null; // 使わない（openpyxl 側で書き込む）

const SRC = 'bending-simulator.jsx';
const XLSX_IN = 'docs/Z曲げ_実績記入シート.xlsx';

// --- エンジン部分だけを取り出して評価する ---
const lines = readFileSync(SRC, 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('function FinishedPreview'));
if (end < 0) throw new Error('コンポーネントの開始位置が見つかりません');
const engineSrc = lines.slice(1, end).join('\n'); // 1行目の import は落とす

const names = ['resolveDie', 'computeChain', 'minGap', 'shoulderReach', 'reachCheck',
  'toolsFor', 'strokeState', 'simMinStep', 'zMinStep', 'lookupTable', 'NOBI_TABLE',
  'MINOUT_TABLE', 'DIE_LIB', 'PUNCH_LIB', 'ZMIN'];
const engine = new Function(`${engineSrc}\nreturn {${names.join(',')}};`)();

// V幅 → 金型の選択値。断面の実測がある型を優先する（jsx の BASEV_SEL と同じ並び）
const SEL = {
  8: 'ins:971561:stack', 12: 'ins:974061:stack', 16: 'ins:977061:stack',
  20: 'ins:979061:stack', 25: 'ins:982061:stack', 32: 'lib:03500:0',
  40: 'lib:03600:0', 50: 'lib:03700:0', 63: 'lib:03800:0', 80: 'lib:01360:0',
  100: 'lib:01860:0', 125: 'lib:03900:0', 160: 'lib:01400:0',
};
// その金型の実測台がどの機械のものかを合わせておく（台が外れると判定が甘くなる）
const MACHINE = { 12: 'hg2203', 25: 'hg2203', 32: 'hd3504nt', 40: 'hd3504nt' };
const PUNCH = '904061';          // 実機常用のヤゲン
const OPEN_GAP_MM = 170;

// 引数は JSON で受け取る（Python 側から板厚・V幅・材質・最小外寸を渡す）
const rows = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = [];
for (const r of rows) {
  const sel = SEL[r.V];
  if (!sel) { out.push({ ...r, sim: null, why: '金型なし' }); continue; }
  const info = engine.resolveDie(sel, r.V, 30, true, MACHINE[r.V] || null);
  const vHalf = info.vHalf;
  // 片伸び（折り曲げ表）。無ければ計算できないので飛ばす
  const nb = engine.lookupTable(engine.NOBI_TABLE, r.mat, r.V, r.t);
  if (!nb) { out.push({ ...r, sim: null, why: '片伸びなし' }); continue; }
  const nobi = nb.val;
  const grow = nobi - r.t / 2;
  // 両端フランジは 80mm（シートの z4 表と同じ条件）。
  // 折り曲げ表の最小外寸がそれより大きい型では、その値＋15 を使う。
  const flangeOuter = Math.max(80, (r.minOut || 0) + 15);
  const flangeFlat = flangeOuter - nobi;
  const stepFlat0 = Math.max(5, (r.act || 40) - 2 * nobi);
  const part = { t: r.t, segs: [flangeFlat, stepFlat0, flangeFlat],
                 bends: [{ angle: 90, dir: 1 }, { angle: 90, dir: -1 }],
                 grow: [grow, grow] };
  const seq = [{ bend: 0, mirror: false, valley: false },
               { bend: 1, mirror: false, valley: true }];
  const openGap = Math.max(0, OPEN_GAP_MM - r.t);
  let flat = null;
  try {
    flat = engine.simMinStep(part, seq, 1, vHalf, info.polys, PUNCH, false, 'std', openGap);
  } catch (e) { out.push({ ...r, sim: null, why: 'err:' + e.message }); continue; }
  if (flat == null) { out.push({ ...r, sim: null, why: '段差を広げても不可' }); continue; }
  out.push({ ...r, sim: +(flat + 2 * nobi).toFixed(1), nobi, flange: flangeOuter,
             vHalf: +vHalf.toFixed(2), die: info.note.split('｜')[0].trim() });
}
process.stdout.write(JSON.stringify(out));
