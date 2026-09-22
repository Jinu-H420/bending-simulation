// シミュレーターが「どのダイの下にどんな土台を置いているか」を、確認用に全部書き出す。
// 形は bending-simulator.jsx の resolveDie そのもの（画面と同じ判定に使っている形）。
// 出力は JSON。DXF と確認画像は scripts/die-bases-dxf.py が作る。
//
// 使い方: node scripts/export-die-bases.mjs > die-bases.json
import { readFileSync } from 'node:fs';

const lines = readFileSync('bending-simulator.jsx', 'utf8').split(/\r?\n/);
const end = lines.findIndex((l) => l.startsWith('// 曲げ位置の丸'));
const E = new Function(
  lines.slice(0, end).filter((l) => !l.startsWith('import ')).join('\n') +
  '\nreturn {DIE_LIB,DIE_MOUNT,DIE_MOUNT_LIB,MACHINE_LIB,MACHINE_DIES,resolveDie};'
)();

const MACHINES = ['hg2203', 'hd3504nt'];

// 画面のダイ選択と同じ並び
const sels = [{ sel: 'v12stack', name: '実機 V12 段付きスタック（bending.dxf）' }];
for (const [id, d] of Object.entries(E.DIE_LIB)) {
  if (d.kind === 'v') sels.push({ sel: `lib:${id}:0`, name: `${id} ${d.name}` });
  else if (d.kind === 'v2') d.grooves.forEach((g, i) =>
    sels.push({ sel: `lib:${id}:${i}`, name: `${id} ${d.name}（V${Math.round(g[1] * 2)}溝）` }));
  else if (d.kind === 'ins') {
    sels.push({ sel: `ins:${id}:stack`, name: `${id} ${d.name}＋スタック` });
    sels.push({ sel: `ins:${id}:solo`, name: `${id} ${d.name}（単体）` });
  } else if (d.kind === 'manual') sels.push({ sel: `lib:${id}:0`, name: `${id} ${d.name}（特殊）` });
}

const round = (p) => p.map(([x, y]) => [+x.toFixed(3), +y.toFixed(3)]);
const cells = [];

// まず機械ごとの「土台だけ」。実測の取付図から、ダイ本体を除いたもの。
const baseOnly = [
  { machine: 'hg2203', from: 'ins:974061:stack', drop: [2], title: 'HG2203 土台（V8〜V25 インサート共通・V.dxf で確認）' },
  { machine: 'hd3504nt', from: 'lib:03500:0', drop: [3], title: 'HD3504NT 土台（05500ホルダ・V.dxf で確認）' },
];
for (const b of baseOnly) {
  const m = E.DIE_MOUNT[b.from];
  cells.push({
    kind: 'baseonly', machine: b.machine, title: b.title,
    base: m.parts.filter((_, i) => !b.drop.includes(i)).map(round), die: [], baseKind: 'measured',
  });
}
cells.push({
  kind: 'baseonly', machine: '-', title: 'HD3504NT 2溝ダイ（30540・30640 共通）の台（ダイV20-2.dxf 実測）',
  base: E.DIE_MOUNT_LIB['30540'].parts.map(round), die: [], baseKind: 'measured',
});

// 機械ごとに、その機械で使う型だけを載せる（V.dxf で確認した組み合わせ）
const nameOf = Object.fromEntries(sels.map((x) => [x.sel, x.name]));
for (const machine of MACHINES) {
  const md = E.MACHINE_DIES[machine];
  const list = [...md.main.map((v) => ({ sel: v, name: nameOf[v] || v })),
                ...md.extra.map((v) => ({ sel: v, name: (nameOf[v] || v) + '（取付未確認）' }))];
  for (const s of list) {
    // 2溝ダイ（30540・30640）は左右反転して置けるので、反転も出す
    const flips = /^lib:30[56]40:/.test(s.sel) ? [false, true] : [false];
    for (const flip of flips) {
      const withBase = E.resolveDie(s.sel, 20, 30, true, machine, flip);
      // ダイ本体だけの形。インサートの「＋スタック」は台なしでも一般化スタックが付いてくるので、
      // 単体（solo）の形を使ってダイ本体だけを取り出す。
      const dieSel = s.sel.endsWith(':stack') ? s.sel.replace(/:stack$/, ':solo') : s.sel;
      const dieOnly = E.resolveDie(dieSel, 20, 30, false, machine, flip);
      cells.push({
        kind: 'die', machine, sel: s.sel, flip,
        title: s.name + (flip ? '・左右反転' : ''),
        note: withBase.note,
        baseKind: withBase.baseKind || (withBase.polys.length > dieOnly.polys.length ? 'measured' : 'none'),
        vWidth: +(withBase.vHalf * 2).toFixed(2),
        depth: withBase.maxDepth ?? null,
        manual: !!withBase.manual,
        base: withBase.polys.map(round),
        die: dieOnly.polys.map(round),
      });
    }
  }
}

process.stdout.write(JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: 'bending-simulator.jsx resolveDie',
  machines: Object.fromEntries(MACHINES.map((m) => [m, E.MACHINE_LIB[m].name])),
  cells,
}));
