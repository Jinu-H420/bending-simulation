// 曲がるか かんたん判定。
// 形と寸法（外寸）と板厚を入れると、シミュレーターと同じ干渉判定で ○/✕ を出す。
// 曲げ順・突き当て（左右）・裏返しは自動で探す。✕ のときは理由（どこに当たるか）と、
// 通る別の金型を出す。
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import {
  pickDie, resolveDie, lookupTable, NOBI_TABLE, MINOUT_TABLE, searchSequences, reachCheck,
  computeChain, toolsFor, minGap, shoulderReach, strokeState, MACHINE_DIES, MACHINE_LIB, dieLabel,
  DIE_STOCK, DIE_UNIT_LEN, PL22_MAX_LEN, smallVCheck, matDies,
} from '../bending-simulator.jsx';
import { rescuePunch, nakaPlan, recMatch, recText, METHOD_JA } from '../zu/judge.js';
import { learned, gapLimit, deviceId } from './records.js';
import { LimitChart, LimitDetail, QuickTable } from '../zu/limits.jsx';
import ZU_DATA from '../zu/data/zu-data.json';
import { folderSupported, loadFolder, pickFolder, permission, pull as folderPull, push as folderPush } from './cloud.js';
import './check.css';

const PUNCH = '904061';
// 曲げ長さ L の目安。ダイ1本（835mm）に収まる長さを最初から入れておく
const L_DEF = 800;
// Z曲げの実績と突き合わせて、シミュが実績より甘く出た型（dash/z-dashboard.html）
const LENIENT = { 12: true, 16: true, 20: true, 25: true };
const MATCHED = { 8: true, 32: true };

const SHAPES = {
  L: { name: 'L曲げ', labels: ['A', 'B'], dirs: [1], def: [50, 50] },
  U: { name: 'コの字', labels: ['H1', 'W', 'H2'], dirs: [1, 1], def: [50, 100, 50] },
  Z: { name: 'Z曲げ', labels: ['A', 'S', 'B'], dirs: [1, -1], def: [50, 40, 50] },
  HAT: { name: 'ハット', labels: ['A', 'H1', 'W', 'H2', 'B'], dirs: [1, -1, -1, 1], def: [46, 26, 100, 26, 46] },
};

// 形の見本図（寸法の取り方）
function ShapeIcon({ kind, size = 64 }) {
  const P = {
    L: '10,12 10,52 54,52',
    U: '10,14 10,50 54,50 54,14',
    Z: '6,20 30,20 30,46 58,46',
    HAT: '4,48 18,48 18,18 46,18 46,48 60,48',
  }[kind];
  return (
    <svg width={size} height={size * 0.9} viewBox="0 0 64 58" aria-hidden="true">
      <polyline points={P} fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// 断面の図。入れた数字がどこの寸法かを図の上に出す（入力中の寸法は色を変える）。
// 形ごとに、板の折れ線（外側の線）と、寸法線の位置を持つ。数字は入力に合わせて変わる。
const FIG = {
  L: { plate: [[60, 30], [60, 150], [250, 150]],
    dims: [
      { x1: 36, y1: 26, x2: 36, y2: 154, tx: 30, ty: 92, anchor: 'end' },       // A
      { x1: 56, y1: 176, x2: 254, y2: 176, tx: 155, ty: 194, anchor: 'middle' }, // B
    ] },
  U: { plate: [[70, 30], [70, 150], [240, 150], [240, 30]],
    dims: [
      { x1: 46, y1: 26, x2: 46, y2: 154, tx: 40, ty: 92, anchor: 'end' },        // H1
      { x1: 66, y1: 176, x2: 244, y2: 176, tx: 155, ty: 194, anchor: 'middle' }, // W
      { x1: 264, y1: 26, x2: 264, y2: 154, tx: 270, ty: 92, anchor: 'start' },   // H2
    ] },
  Z: { plate: [[40, 50], [150, 50], [150, 130], [270, 130]],
    dims: [
      { x1: 36, y1: 28, x2: 154, y2: 28, tx: 95, ty: 20, anchor: 'middle' },     // A
      { x1: 176, y1: 46, x2: 176, y2: 134, tx: 182, ty: 95, anchor: 'start' },   // S
      { x1: 146, y1: 156, x2: 274, y2: 156, tx: 210, ty: 174, anchor: 'middle' },// B
    ] },
  HAT: { plate: [[20, 150], [80, 150], [80, 50], [230, 50], [230, 150], [290, 150]],
    dims: [
      { x1: 16, y1: 176, x2: 84, y2: 176, tx: 50, ty: 194, anchor: 'middle' },   // A
      { x1: 58, y1: 46, x2: 58, y2: 154, tx: 52, ty: 104, anchor: 'end' },       // H1
      { x1: 76, y1: 28, x2: 234, y2: 28, tx: 155, ty: 20, anchor: 'middle' },    // W
      { x1: 252, y1: 46, x2: 252, y2: 154, tx: 258, ty: 104, anchor: 'start' },  // H2
      { x1: 226, y1: 176, x2: 294, y2: 176, tx: 260, ty: 194, anchor: 'middle' },// B
    ] },
};
function DimFigure({ shape, labels, dims, focus }) {
  const f = FIG[shape];
  return (
    <svg className="fig" viewBox="0 0 330 206" role="img" aria-label="入れた寸法がどこか">
      <defs>
        <marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" opacity=".55" />
        </marker>
      </defs>
      <polyline className="plate" points={f.plate.map((q) => q.join(',')).join(' ')} fill="none" strokeWidth="7" strokeLinejoin="miter" />
      {f.dims.map((d, i) => (
        <g key={labels[i]} className={`dimg ${focus === i ? 'on' : ''}`}>
          <line className="dim" x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} strokeWidth="1.5" markerStart="url(#ar)" markerEnd="url(#ar)" />
          <text x={d.tx} y={d.ty} textAnchor={d.anchor}>{labels[i]} {dims[i]}</text>
        </g>
      ))}
    </svg>
  );
}

// 一度に曲げられる長さ。ダイの所有台数（1台835mm）と機械の長さの短いほう。
// 2溝ダイ（30540・30640）は台数を聞いていないので、機械の長さだけで見る。
function lenLimit(V, t, machine, sel) {
  const m = MACHINE_LIB[machine];
  const c = [{ v: m ? m.len : 3000, why: `${m ? m.name.replace('AMADA ', '') : machine}の長さ` }];
  const n = DIE_STOCK[V];
  if (n && !/^lib:30[56]40:/.test(sel)) c.push({ v: n * DIE_UNIT_LEN, why: `V${V}のダイ ${n}台×${DIE_UNIT_LEN}mm` });
  if (t >= 22) c.push({ v: PL22_MAX_LEN, why: 'PL22（金型寸法表の注記）' });
  return c.reduce((a, b) => (a.v <= b.v ? a : b));
}
// 形が通っても、曲げ長さ L で曲げられないことがある。基準より小さいVは最長Lが実績待ち
function withLength(r, { L, t, mat }) {
  if (!(L > 0) || r.skip) return r;
  const lim = lenLimit(r.V, t, r.machine, r.sel);
  const sv = smallVCheck(mat, t, r.V);
  const out = { ...r, lenLim: lim, smallV: sv || null };
  if (L > lim.v) {
    return { ...out, ok: false, why: `${r.ok ? '' : `${r.why}。さらに`}曲げ長さ L ${L}mm が長すぎます（${lim.why}で ${lim.v}mm まで）` };
  }
  if (sv && sv.maxL != null && L > sv.maxL) {
    return { ...out, ok: false, why: `${r.ok ? '' : `${r.why}。さらに`}板厚 t${t} の基準は V${sv.baseV}。小さい V${r.V} は L ${sv.maxL}mm までです（実績）` };
  }
  return out;
}

const machineOfSel = (sel) => Object.keys(MACHINE_DIES).find((m) => MACHINE_DIES[m].main.includes(sel));
const vOf = (info) => Math.round(info.vHalf * 2);

// 1つの金型で判定する
function judge({ shape, outer, t, mat, sel, nobiIn, L, recs }) {
  return withRecs(withLength(judgeShape({ shape, outer, t, mat, sel, nobiIn, L, recs }), { L, t, mat }), { shape, outer, L, recs });
}
// 曲げ屋さんに確かめて登録した実績があれば、計算より優先する（Z・コの字のみ）
function withRecs(r, { shape, outer, L, recs }) {
  if (!recs || !recs.length || r.skip || !r.V || !(shape === 'Z' || shape === 'U')) return r;
  const m = recMatch({ mat: r.mat || null, t: r.t, V: r.V, sel: r.sel }, shape, outer, L, recs);
  if (!m.same.length) return r;
  // 登録した「曲がった」実績は必ず勝たせる（反対の実績があるときは注意書きを足す）。
  // ただし「中押し・くの字で曲げた」実績は“その方法なら曲がる”という意味なので、
  // 計算で普通に曲がる寸法（いまの r.ok かつ逃げ道を使っていない）は、普通のままにする。
  if (m.ok) {
    const calcEasier = r.ok && !r.method && m.ok.method !== 'normal';
    if (calcEasier) {
      return { ...r, clash: !!m.ng, why: `${r.why || '計算で通ります'}（この型では ${recText(m.ok)} という実績もあります）` };
    }
    return { ...r, ok: true, src: '実績', rec: m.ok, clash: !!m.ng, method: m.ok.method === 'normal' ? null : m.ok.method,
      why: `実績あり：${recText(m.ok)}。いまの寸法はそれと同じか楽です`
        + (m.ng ? `（ただし ${recText(m.ng)} という実績もあります。確かめてください）` : '') };
  }
  if (m.ng && r.ok && !r.method) return { ...r, ok: false, src: '実績', rec: m.ng,
    why: `実績：${recText(m.ng)}。いまの寸法はそれと同じかきついので曲がりません` };
  return { ...r, recs: m.same };
}
function judgeShape({ shape, outer, t, mat, sel, nobiIn, L, recs }) {
  const S = SHAPES[shape];
  const machine = machineOfSel(sel);
  const info = resolveDie(sel, 20, 30, true, machine);
  const V = vOf(info);
  const nb = lookupTable(NOBI_TABLE, mat, V, t);
  // 折り曲げ表でこの板厚を扱わない型（V8 に t6 など）は、幾何で通っても現実には使わないので外す。
  // 表の板厚の範囲から少し外れる程度（V20 に t6 など、実績がある組合せ）は残す。
  const col = (NOBI_TABLE[mat] || {})[V];
  const ts = col ? Object.keys(col).map(Number) : [];
  if (nobiIn == null && (!ts.length || t > Math.max(...ts) + 1.5 || t < Math.min(...ts) - 1)) {
    return { sel, machine, V, label: dieLabel(sel), skip: true, ok: false, why: `折り曲げ表で V${V} に t${t} は使いません` };
  }
  const nobi = nobiIn != null ? nobiIn : nb ? nb.val : null;
  const res = { sel, machine, V, mat, t, label: dieLabel(sel), nobi, nobiSrc: nobiIn != null ? '手入力' : nb ? (nb.exact ? '表' : `表（t${nb.tUsed}で代用）`) : '無し' };
  if (nobi == null) return { ...res, ok: false, why: `折り曲げ表に ${mat}・V${V}・t${t} の片伸びがありません（手入力してください）` };

  // 最小フランジ（折り曲げ表）：両端のフランジがこれより短いとV溝に落ちる
  const mo = lookupTable(MINOUT_TABLE, mat, V, t);
  if (mo) {
    const n = outer.length;
    for (const k of [0, n - 1]) {
      if (outer[k] < mo.val) return { ...res, ok: false, minOut: mo.val, why: `${S.labels[k]} が ${outer[k]}mm。折り曲げ表の最小外寸 ${mo.val}mm より短く、V溝に落ちます` };
    }
  }
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < outer.length - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return { ...res, ok: false, why: '寸法が片伸びより短く、形になりません' };
  const part = { t, segs: flat, bends: S.dirs.map((d) => ({ angle: 90, dir: d })), grow: S.dirs.map(() => nobi - t / 2) };
  const openGap = Math.max(0, 170 - t);

  // その型の実績から学んだ「要る余裕」。登録が増えるほど、当たりの見方が実物に近づく
  const learn = learned(recs, sel, mat, t);
  const need = gapLimit(learn);
  const r = searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, openGap, need);
  if (r.sols.length) {
    // そのときの余裕（いちばん少ないところ）。登録すると次からの学習に使う
    const exArc0 = shoulderReach(info.vHalf, t, 90) + t;
    let worst = Infinity;
    for (let si = 0; si < r.sols[0].length; si++) {
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const { bendProg, lift } = strokeState(p, openGap);
        const ch = computeChain(part, r.sols[0], si, bendProg, info.vHalf);
        const tools = toolsFor(PUNCH, false, ch.innerY - lift, 'std', info.polys);
        const g = minGap(ch, tools.polys, t, info.vHalf, exArc0);
        if (g.gap < worst) worst = g.gap;
      }
    }
    return { ...res, ok: true, seq: r.sols[0], minOut: mo && mo.val, learn, gap: Number.isFinite(worst) ? +worst.toFixed(2) : null };
  }

  // 通らないとき：入力順・裏返しは山谷どおり・突き当ては全組合せで、いちばん惜しい所を理由にする
  const n = S.dirs.length;
  const exArc = shoulderReach(info.vHalf, t, 90) + t;
  let best = null;
  for (let m = 0; m < 1 << n; m++) {
    const seq = S.dirs.map((d, k) => ({ bend: k, mirror: !!((m >> k) & 1), valley: d < 0 }));
    let worst = null;
    for (let si = 0; si < n; si++) {
      if (!reachCheck(part, seq, si, info.vHalf).ok) { worst = { gap: -999, step: si + 1, name: 'V肩に届かない（フランジが短い）' }; break; }
      let w = null;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const { bendProg, lift } = strokeState(p, openGap);
        const ch = computeChain(part, seq, si, bendProg, info.vHalf);
        const tools = toolsFor(PUNCH, false, ch.innerY - lift, 'std', info.polys);
        const g = minGap(ch, tools.polys, t, info.vHalf, exArc);
        if (!w || g.gap < w.gap) w = { gap: g.gap, step: si + 1, name: tools.names[g.atIdx] };
      }
      if (!worst || w.gap < worst.gap) worst = w;
      if (w.gap < need) break;
    }
    if (!best || worst.gap > best.gap) best = worst;
  }
  const where = best.gap <= -999 ? best.name : `${best.name}に ${(-best.gap).toFixed(1)}mm 当たる`;
  const worstGap = best.gap > -900 ? +best.gap.toFixed(2) : null;
  const hit = `どの順番・置き方でも通りません。いちばん惜しいのは 曲げ${best.step}本目で ${where}`;

  // 普通に曲げられないときの逃げ道。現場の順番は くの字 → 中押し（最終手段）
  const row = { sel, machine: machine === 'hg2203' ? 'HG2203' : 'HD3504NT', V, mat, t, nobi, minOut: (mo && mo.val) || 0,
    two: /^lib:30[56]40:/.test(sel) };
  const alt = rescuePunch(row, outer, S.dirs, L || 0, need);
  if (alt.punch) {
    return { ...res, ok: true, method: alt.special ? 'kuno' : 'punch', punch: alt.punch, punchFlip: alt.flip,
      special: alt.special, seq: alt.seq, minOut: mo && mo.val, hit,
      learn,
      why: alt.special
        ? `普通のヤゲン 904061 では当たりますが、くの字特殊ヤゲン${alt.punch.replace('特殊 くの字', '')}なら曲がります（曲げ長さ ${alt.special.win}mm まで）`
        : `普通のヤゲン 904061 では当たりますが、ヤゲン ${alt.punch}${alt.flip ? '（反転）' : ''} なら曲がります` };
  }
  if (shape === 'U') {
    const nk = nakaPlan(row, outer[0], outer[1], outer[2], need);
    if (nk.ok) {
      return { ...res, ok: true, method: 'naka', naka: nk, minOut: mo && mo.val, hit, learn,
        why: `普通の曲げ方では${nk.where}に当たります。中押し（捨て曲げ）なら曲がります（への字 ${nk.angle}°以上、底の内-内 ${nk.inner}mm）`
          + (nk.pending ? `。ただし ${nk.inner < nk.sute ? `内-内 ${nk.inner}mm は 現場で確かめてある ${nk.sute}mm より狭い` : `立上り ${nk.tall}mm は 現場で確かめてある ${nk.maxH}mm より高い`}ので、まだ確かめていません` : '') };
    }
    if (nk.why) return { ...res, ok: false, why: `${hit}。中押しでも、${nk.why}`, kunoWin: alt.win || null, learn };
  }
  return { ...res, ok: false, why: hit, kunoWin: alt.win || null, learn, gap: worstGap };
}

// その型・その寸法でシミュレーターを開くリンク。曲がらない型は、当たる所で止まる
function simLink(r, { shape, dims, mat, t, L }) {
  const S = SHAPES[shape];
  // 中押しのときは、計算が通った段取り（立上りの突き当ての向き）で開く
  const seq = (r.method === 'naka' && r.naka && r.naka.seq) || r.seq
    || S.dirs.map((d, k) => ({ bend: k, mirror: false, valley: d < 0 }));
  const note = [`かんたん判定から開きました：${S.name}　${mat} t${t}　${S.labels.map((lb, i) => `${lb}=${dims[i]}`).join('・')}（外寸）　L=${L}　${r.label}`];
  note.push(r.ok
    ? (r.method === 'naka' ? `判定：${r.why}。中押し（への字 → 両サイド90° → 中押し）の工程で開いています。「▶ 全工程再生」で動きが見られます。`
      : r.method ? `判定：${r.why}。このヤゲンに替えて開いています。` : `判定：曲がります（${seqText(seq)}）。`)
    : `判定：${r.why}。当たる瞬間で止めています（橙の丸が当たる所）。「▶ 全工程再生」で動きも見られます。`);
  const params = {
    t: Number(t), matType: mat, inputMode: 'outer', outerSegs: dims.map(Number), nobiOverride: null, bendLen: Number(L) || L_DEF,
    bends: S.dirs.map((d) => ({ angle: 90, dir: d })),
    dieSel: r.sel, machineSel: r.machine, dieFlip: false,
    punchType: r.punch || PUNCH, punchFlip: !!r.punchFlip, chukanSel: 'std', dieBase: true, seq,
    nakaOn: r.method === 'naka', nakaAngle: (r.naka && r.naka.angle) || 20,
  };
  return `./#open=${encodeURIComponent(JSON.stringify({ params, note: note.join('\n') }))}`;
}

const seqText = (seq) => seq.map((s) => `曲げ${s.bend + 1}${s.mirror ? '（突き当て反対側）' : ''}${s.valley ? '（裏返し）' : ''}`).join(' → ');

// 曲げ方ごとの見出しと色（Z・コの字判定と同じ：普通＝緑、くの字＝オレンジ、ほかのヤゲン＝青、中押し＝紫）
const WORD = {
  kuno: (r) => (r.special ? `くの字特殊ヤゲン（L ${r.special.win}mm以内）なら曲がります` : 'くの字特殊ヤゲンなら曲がります'),
  punch: (r) => (r.punch ? `ヤゲン ${r.punch} なら曲がります` : 'ヤゲンを替えれば曲がります'),
  naka: () => '中押しでしか曲がりません',
};
function Result({ r, big, now }) {
  const warn = LENIENT[r.V], good = MATCHED[r.V];
  const m = r.ok && r.method ? r.method : null;
  const href = r.sel ? simLink(r, now) : null;
  const Box = href ? 'a' : 'div';
  const boxProps = href ? { href, target: '_blank', rel: 'noreferrer' } : {};
  return (
    <Box {...boxProps} className={`res ${r.ok ? 'ok' : 'ng'} ${m || ''} ${big ? 'big' : ''} ${href ? 'link' : ''}`}>
      <div className="res-head">
        <span className="mark">{r.ok ? '○' : '✕'}</span>
        <span className="verdict">{m ? WORD[m](r) : r.ok ? '曲がります' : '曲がりません'}</span>
        <span className="die">{r.label}（{MACHINE_LIB[r.machine] ? MACHINE_LIB[r.machine].name.replace('AMADA ', '') : r.machine}）</span>
        {r.src === '実績' && <span className="tag-act">実績あり</span>}
        {r.clash && <span className="tag-clash">⚠ 反対の実績あり</span>}
      </div>
      {r.ok && !m && r.src !== '実績' ? (
        <div className="res-body">曲げ順：<b>{seqText(r.seq)}</b></div>
      ) : (
        <div className="res-body">{r.why}{r.ok && r.src === '実績' && r.seq && <span className="sub">　曲げ順：{seqText(r.seq)}</span>}</div>
      )}
      <div className="res-foot">
        片伸び {r.nobi != null ? r.nobi : '—'}（{r.nobiSrc}）
        {r.lenLim && <span className="len">曲げ長さは {r.lenLim.v}mm まで（{r.lenLim.why}）</span>}
        {r.learn && (
          <span className="learn">
            実績から学習（この型の記録 {r.learn.n}件）：
            {r.learn.need != null ? `余裕 ${r.learn.need}mm 以上ないと曲がらなかったので、その線で見ています` : ''}
            {r.learn.allow != null ? `${r.learn.need != null ? '／' : ''}絵で ${r.learn.allow}mm 当たっても曲がった実績があるので、その分は当たりとみなしていません` : ''}
          </span>
        )}
        {r.ok && r.smallV && r.smallV.maxL == null && (
          <span className="caution">⚠ 板厚 t{r.t || ''} の基準は V{r.smallV.baseV}。小さい V{r.V} は長いものが曲げられません（最長Lは確認中）</span>
        )}
        {m === 'naka' && r.naka && r.naka.angle != null && (
          <span className="naka-a">◇ 最初に底を <b>への字 {r.naka.angle}°</b> に曲げる（これより浅いと曲げ戻すときに当たります）
            {r.naka.open != null && <>　山の開き <b>{r.naka.open}°</b>・山の高さ <b>約{r.naka.rise}mm</b>（底の片側 {r.naka.half}mm）</>}
            {r.naka.seq && r.naka.seq.some((q) => q.mirror) ? `／立上り${r.naka.seq.findIndex((q) => q.mirror) + 1}は突き当て反対側` : ''}</span>
        )}
        {m === 'naka' && r.naka && r.naka.pending && (
          <span className="caution">⚠ {r.naka.inner < r.naka.sute
            ? `内-内 ${r.naka.inner}mm は、現場で確かめてある ${r.naka.sute}mm より狭い`
            : `立上り ${r.naka.tall}mm は、現場で確かめてある ${r.naka.maxH}mm より高い`}ので、曲げ屋さんに確かめてください</span>
        )}
        {!r.ok && r.kunoWin && <span className="caution">くの字特殊ヤゲンなら形は通ります。曲げ長さ L を {r.kunoWin.win}mm 以下にできれば曲げられます</span>}
        {r.ok && warn && <span className="caution">⚠ V{r.V}は、Z曲げの実績でシミュが甘く出た型です。最初の1本で確かめてください</span>}
        {r.ok && good && <span className="trust">● V{r.V}は、Z曲げの実績と合っている型です</span>}
        {href && <span className="see">▶ この型でシミュレーションを見る</span>}
      </div>
    </Box>
  );
}

// 実績の登録。曲がると分かっているものはボタン1つで登録できる（型・曲げ方は判定の答えから入れる）。
function RecordPanel({ shape, mat, t, dims, L, dies, best, recs, dir, pendingDir, connect, saveRec, dropRec, msg }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(best ? best.sel : dies[0] && dies[0].sel);
  const [method, setMethod] = useState('normal');
  const [note, setNote] = useState('');
  const [who, setWho] = useState(() => { try { return localStorage.getItem('zu.who') || ''; } catch { return ''; } });
  const [slip, setSlip] = useState('');   // 伝票番号（任意）
  const autoMethod = best && best.method === 'naka' ? 'naka' : best && best.method === 'kuno' ? 'kuno' : 'normal';
  useEffect(() => { if (best) { setSel(best.sel); setMethod(autoMethod); } }, [best && best.sel, autoMethod]);
  const die = dies.find((d) => d.sel === sel) || dies[0];
  const done = die && (shape === 'Z' || shape === 'U')
    ? recMatch({ mat, t: Number(t), V: die.V, sel: die.sel }, shape, dims.map(Number), Number(L) || 0, recs).ok : null;
  const mine = recs.filter((r) => r.shape === shape && r.mat === mat && r.t === Number(t));
  const S = SHAPES[shape];
  const save = (ok) => {
    if (!die) return;
    try { localStorage.setItem('zu.who', who.trim()); } catch { /* 無視 */ }
    const m = open ? method : autoMethod;
    saveRec({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), who: who.trim(), slip: slip.trim(), dev: deviceId(),
      shape, mat, t: Number(t), V: die.V, machine: die.machine === 'hg2203' ? 'HG2203' : 'HD3504NT', sel: die.sel,
      dims: dims.map(Number), L: Number(L) > 0 ? Number(L) : null,
      method: m.startsWith('kuno') ? 'kuno' : m,
      punch: m === 'kuno' ? '特殊 くの字165' : m === 'kuno100' ? '特殊 くの字100' : '904061',
      ok, lenFail: false, note: note.trim(),
      // そのときの計算（○✕と余裕）も残す。次からの「要る余裕」の学習に使う
      case: { key: null, sim: !!(best && best.ok), gap: best && typeof best.gap === 'number' ? best.gap : null },
    });
    setNote('');
  };
  return (
    <section className="card rec">
      <div className="step">実績を登録</div>
      {!folderSupported() ? (
        <div className="hint">登録は会社PCの Chrome・Edge でできます（共有フォルダに保存するため）。</div>
      ) : !dir ? (
        <div>
          <button className="more" onClick={connect}>{pendingDir ? '共有フォルダにつなぐ' : '共有フォルダを選ぶ'}</button>
          <div className="hint">シミュレーターと同じ「曲げシミュレーション」フォルダを選んでください。</div>
        </div>
      ) : (
        <>
          {done ? (
            <div className="rec-done"><b>登録済みです</b><div>{recText(done)}</div></div>
          ) : (
            <div className="hint" style={{ marginTop: 0 }}>
              {S.labels.map((lb, i) => `${lb} ${dims[i]}`).join('・')}　{mat} t{t}　L{L || '—'}　／　{die ? die.label : ''}
            </div>
          )}
          <div className="rec-ask">実際はどうでしたか</div>
          <div className="rec-btns">
            <button className="big ok" onClick={() => save(true)}>○ 曲がった（登録）</button>
            <button className="big ng" onClick={() => save(false)}>✕ 曲がらなかった</button>
          </div>
          <button className="linkish" onClick={() => setOpen(!open)}>{open ? '閉じる' : '型・曲げ方・名前・伝票番号を入れる'}</button>
          {open && (
            <div className="row">
              <label className="inl" style={{ width: 210 }}><span>型</span>
                <select value={sel} onChange={(e) => setSel(e.target.value)}>
                  {dies.map((d) => <option key={d.sel} value={d.sel}>{d.label}</option>)}
                </select>
              </label>
              <label className="inl" style={{ width: 150 }}><span>曲げ方</span>
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  <option value="normal">普通（904061）</option>
                  <option value="kuno">くの字165</option>
                  <option value="kuno100">くの字100</option>
                  <option value="naka">中押し</option>
                </select>
              </label>
              <label className="inl" style={{ width: 160 }}><span>確かめた人（任意）</span>
                <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="例：曲げ 田中" />
              </label>
              <label className="inl" style={{ width: 150 }}><span>伝票番号（任意）</span>
                <input value={slip} onChange={(e) => setSlip(e.target.value)} placeholder="空でも登録できます" />
              </label>
            </div>
          )}
          {open && <input className="rec-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ひとこと（当たった所 など）" />}
          {msg && <div className="hint">{msg}</div>}
          <div className="hint">登録には、このPCの番号 <b>{deviceId() || '—'}</b> が自動で付きます（どのPCから登録したか分かるように）。</div>
          {mine.length > 0 && (
            <table className="rec-list">
              <thead><tr><th>日付</th><th>型</th><th>寸法</th><th>L</th><th>曲げ方</th><th>結果</th><th /></tr></thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id}>
                    <td>{String(r.at).slice(5, 10)}</td>
                    <td>V{r.V}{/^lib:30[56]40:/.test(r.sel || '') ? ' 2溝' : ''}</td>
                    <td>{(r.dims || []).join('・')}</td>
                    <td>{r.L || '—'}</td>
                    <td>{(METHOD_JA[r.method] || '').replace(/で$|に$/, '')}</td>
                    <td className={r.ok ? 'g-ok' : 'g-ng'}>{r.ok ? '○' : '✕'}</td>
                    <td><button className="del" onClick={() => { if (confirm('この実績を消しますか？')) dropRec(r.id); }}>消す</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

function App() {
  const [shape, setShape] = useState('U');
  const [dims, setDims] = useState(SHAPES.U.def);
  const [dimMode, setDimMode] = useState('outer');   // 'outer'=外寸 / 'inner'=内寸
  const [focus, setFocus] = useState(null);   // いま入力している寸法（図で色を変える）
  const [mat, setMat] = useState('鉄');
  const [t, setT] = useState(4.5);
  const [nobiText, setNobiText] = useState('');
  const [Ltext, setLtext] = useState(String(L_DEF));   // 曲げ長さ（奥行き）。ダイ1本835mmに収まる長さを既定に
  const [result, setResult] = useState(null);
  const [others, setOthers] = useState(null);
  const [busy, setBusy] = useState('');
  // 共有フォルダ（bendsim.json の zuRecords）。シミュレーター・Z・コの字判定と同じファイル
  const [dir, setDir] = useState(null);
  const [pendingDir, setPendingDir] = useState(null);
  const [recs, setRecs] = useState([]);
  const [recMsg, setRecMsg] = useState('');
  const openDir = async (d) => {
    try {
      const { data } = await folderPull(d);
      setRecs(data.zuRecords || []); setDir(d); setPendingDir(null);
      setRecMsg(`共有フォルダの実績 ${(data.zuRecords || []).length} 件を読みました`);
    } catch (e) { setRecMsg(`共有フォルダを読めませんでした：${e.message}`); }
  };
  useEffect(() => {
    if (!folderSupported()) return;
    (async () => {
      const d = await loadFolder();
      if (!d) return;
      if (await permission(d, false) === 'granted') openDir(d); else setPendingDir(d);
    })();
  }, []);
  const connect = async () => {
    try {
      const d = pendingDir || await pickFolder();
      if (await permission(d, true) === 'granted') await openDir(d);
    } catch (e) { if (!(e && e.name === 'AbortError')) setRecMsg(`つながりませんでした：${e.message || e}`); }
  };
  const saveRec = async (rec) => {
    if (!dir) return;
    try {
      const d = await folderPush(dir, { zuRecords: [rec] }, rec.who);
      setRecs(d.zuRecords || []); setRecMsg('実績を登録しました。次の判定から使います');
    } catch (e) { setRecMsg(`登録できませんでした：${e.message}`); }
  };
  const dropRec = async (id) => {
    if (!dir) return;
    try { const d = await folderPush(dir, { removeZu: [id] }); setRecs(d.zuRecords || []); } catch (e) { setRecMsg(`消せませんでした：${e.message}`); }
  };

  const S = SHAPES[shape];
  // 判定・グラフ・実績はすべて外寸で動く。内寸で入れたときは外寸に直して渡す。
  // 外寸 ＝ 内寸 ＋ 板厚 × その辺についている曲げの数（端の辺は1つ、間の辺は2つ）
  const bendsAt = (i, n) => (i > 0 ? 1 : 0) + (i < n - 1 ? 1 : 0);
  const outerDims = dims.map((d, i) =>
    (dimMode === 'inner' ? +(Number(d) + Number(t) * bendsAt(i, dims.length)).toFixed(1) : Number(d)));
  // 切替えたときは、品物の形が変わらないように数字のほうを直す
  const switchMode = (m) => {
    if (m === dimMode) return;
    const tt = Number(t) || 0;
    setDims(dims.map((d, i) => {
      const v = Number(d); if (!Number.isFinite(v)) return d;
      const k = tt * bendsAt(i, dims.length);
      return String(+(m === 'inner' ? v - k : v + k).toFixed(1));
    }));
    setDimMode(m);
  };
  const base = useMemo(() => pickDie(mat, t), [mat, t]);
  // 表から自動で引いている片伸び（いくつ引いているか画面に出す）
  const autoNobi = useMemo(() => {
    if (!base || !base.sel) return null;
    const info = resolveDie(base.sel, 20, 30, true, machineOfSel(base.sel));
    return lookupTable(NOBI_TABLE, mat, vOf(info), Number(t)) || null;
  }, [base && base.sel, mat, t]);
  const nobiIn = nobiText.trim() === '' ? null : Number(nobiText);

  const pickShape = (k) => {
    // 形を変えたときの初期値は外寸なので、内寸で入れているときは内寸に直して入れる
    const tt = Number(t) || 0;
    const def = SHAPES[k].def;
    setShape(k);
    setDims(dimMode === 'inner' ? def.map((v, i) => String(+(Number(v) - tt * bendsAt(i, def.length)).toFixed(1))) : def);
    setFocus(null);
  };
  const Lnum = Number(Ltext);
  const input = () => ({ shape, outer: outerDims, t: Number(t), mat, L: Number.isFinite(Lnum) ? Lnum : 0,
    nobiIn: Number.isFinite(nobiIn) ? nobiIn : null, recs });
  // 判定した時の条件。下のグラフ・実績・シミュレーターへのリンクは、この条件で出す
  // （入力を打っている途中に重い計算を走らせない）
  const snap = result && result.snap;
  const now = snap || { shape, dims: outerDims, mat, t, L: Ltext };

  // いま画面に入っている条件。判定の答えがこの条件のものかを見分けるのに使う
  const inKey = `${shape}|${dims.join('|')}|${dimMode}|${t}|${mat}|${Ltext}|${nobiText}`;

  // 判定は「判定する」を押したときだけ行う。入力のたびに判定すると重くてカクカクするため
  // （2026-10-06 ユーザー指示。前は入力が止まって0.3秒で自動判定していた）。
  // 入力を変えたあとは、前の答えを薄くして「判定する」を押すよう出す（答えは消さない）。
  const run = () => {
    if (scanId.current != null) scanId.current += 1;   // 前の金型探しを止める
    setOthers(null);
    if (dims.some((d) => !(Number(d) > 0)) || !(Number(t) > 0)) {
      setResult({ note: '寸法と板厚を数字で入れてください', key: inKey }); return;
    }
    if (!base || !base.sel) {
      setResult({ note: `折り曲げ表に ${mat}・t${t} の基準金型がありません（板厚を見直してください）`, key: inKey }); return;
    }
    const inp = input();
    const sn = { shape, dims: outerDims, mat, t, L: Ltext };
    const sel = base.sel, key = inKey;
    setBusy('判定しています…');
    setTimeout(() => {
      try { setResult({ ...judge({ ...inp, sel }), key, snap: sn, inp }); } catch (e) {
        setResult({ note: `判定でつまずきました（${e && e.message ? e.message : e}）。寸法を見直すか、この文面を知らせてください`, key });
      }
      setBusy('');
    }, 20);
  };
  // 開いたときは、最初の見本で1回だけ判定しておく（空の画面にしない）
  useEffect(() => { run(); }, []);
  // 共有フォルダの実績を読み込んだら、いまの答えに実績を当てはめ直す（入力が変わっていないときだけ）
  useEffect(() => {
    if (recs.length && result && result.key === inKey && !result.note) run();
  }, [recs]);
  // 入力が判定した時から変わったか
  const stale = !!(result && result.key && result.key !== inKey);

  // 使えるほかの金型を全部試す（1型ずつ画面に出す）
  const scanId = useRef(0);
  const runOthers = () => {
    // 縞板は V25・V40・V80（HD3504NT）だけ（金型寸法表・2026-09-24 ユーザー確認）
    const inp = (result && result.inp) || input();   // 判定した時の条件で探す
    const b0 = pickDie(inp.mat, inp.t);
    const allow = matDies(inp.mat);
    const all = [...MACHINE_DIES.hg2203.main, ...MACHINE_DIES.hd3504nt.main]
      .filter((s) => (!allow || allow.includes(s)) && s !== (b0 && b0.sel));
    const my = ++scanId.current;
    const out = [];
    setOthers([]);
    const step = (i) => {
      if (my !== scanId.current) return;
      if (i >= all.length) { setBusy(''); return; }
      setBusy(`ほかの金型を調べています… ${i + 1}/${all.length}`);
      setTimeout(() => {
        if (my !== scanId.current) return;
        const r = judge({ ...inp, sel: all[i], nobiIn: null });
        out.push(r);
        const rank = (x) => (!x.ok ? 9 : x.method === 'kuno' ? 1 : x.method === 'punch' ? 2 : x.method === 'naka' ? 3 : 0);
        setOthers([...out].sort((a, b) => (rank(a) - rank(b)) || (a.V - b.V)));
        step(i + 1);
      }, 10);
    };
    step(0);
  };

  // 基準金型で曲がらない（または中押し・くの字が要る）ときは、押さなくても自動でほかの金型を探す。
  // （V12 では当たるが V8 なら普通に曲がる、のような段取りを見落とさないため）
  const needScan = !!(result && !result.note && !result.skip && (!result.ok || result.method));
  useEffect(() => {
    if (needScan && result && result.inp) runOthers();
  }, [result]);
  // ほかの金型で見つかった、いまより良い段取り（曲がらない→曲がる／中押し→普通に曲がる）
  const rescue = !needScan ? null
    : ((others || []).find((o) => o.ok && (!result.ok ? true : !o.method)) || null);
  // 画面の主役になる答え（基準金型で曲がらないときは、見つかった型の答え）
  const shown = rescue || result;
  // Z・コの字のときは「どこまで曲げられるか」を出す（Z曲げ・コの字判定と同じグラフ）。
  // カーブは型ごとに作りだめしてある（zu/data/zu-data.json）ので、いま使う型の行を探す。
  const limitRow = useMemo(() => {
    if (!snap || !(snap.shape === 'Z' || snap.shape === 'U') || !shown || shown.note || shown.skip || !shown.sel) return null;
    if (snap.dims.some((d) => !(Number(d) > 0))) return null;
    return ZU_DATA.rows.find((r) => r.sel === shown.sel && r.mat === snap.mat && Number(r.t) === Number(snap.t)) || null;
  }, [result, shown && shown.sel]);
  const sd = snap ? snap.dims : outerDims;   // 判定した時の外寸

  return (
    <div className="wrap">
      <header>
        <h1>曲がるか かんたん判定</h1>
        <p>形と寸法を入れて「判定する」を押すだけ。曲げ順と突き当ての向きは自動で探します。</p>
      </header>

      <div className="cols">
      <div className="colL">
      <section className="card">
        <div className="step">① 形</div>
        <div className="shapes">
          {Object.entries(SHAPES).map(([k, s]) => (
            <button key={k} className={`shape ${shape === k ? 'on' : ''}`} onClick={() => pickShape(k)}>
              <ShapeIcon kind={k} /><span>{s.name}</span>
            </button>
          ))}
        </div>

        <div className="step step-row">
          <span>② 寸法（{dimMode === 'inner' ? '内寸' : '外寸'} mm）</span>
          <span className="seg small">
            {[['outer', '外寸'], ['inner', '内寸']].map(([k, w]) => (
              <button key={k} className={dimMode === k ? 'on' : ''} onClick={() => switchMode(k)}>{w}</button>
            ))}
          </span>
        </div>
        <div className="fig-row">
        <DimFigure shape={shape} labels={S.labels} dims={dims} focus={focus} />
        <div className="dims">
          {S.labels.map((lb, i) => (
            <label key={lb} className={focus === i ? 'on' : ''}
              onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus((k) => (k === i ? null : k))}>
              <span>{lb}</span>
              <input inputMode="decimal" value={dims[i]}
                onFocus={() => setFocus(i)} onBlur={() => setFocus((k) => (k === i ? null : k))}
                onChange={(e) => { const d = [...dims]; d[i] = e.target.value; setDims(d); }} />
            </label>
          ))}
        </div>
        </div>
        <div className="hint">図の寸法線が、いま入れている数字の場所です。
          {dimMode === 'inner'
            ? <>いまは<b>内寸</b>（板の内側で測った寸法）。判定は外寸 {outerDims.join('・')} で見ています。</>
            : <>いまは<b>外寸</b>（板の外側で測った寸法）。</>}
        </div>

        <div className="step">③ 曲げ長さ L・材質・板厚</div>
        <div className="row">
          <label className="inl" style={{ width: 104 }}><span>曲げ長さ L</span>
            <input inputMode="decimal" value={Ltext}
              onChange={(e) => { setLtext(e.target.value); }} />
          </label>
          <div className="seg">
            {['鉄', '縞'].map((m) => (
              <button key={m} className={mat === m ? 'on' : ''} onClick={() => { setMat(m); }}>{m}</button>
            ))}
          </div>
          <label className="inl" style={{ width: 84 }}><span>板厚 t</span>
            <input inputMode="decimal" value={t} onChange={(e) => { setT(e.target.value); }} />
          </label>
          <label className="inl" style={{ width: 104 }}><span>片伸び</span>
            <input inputMode="decimal" placeholder={autoNobi ? `自動 ${autoNobi.val}` : '表から自動'}
              value={nobiText} onChange={(e) => { setNobiText(e.target.value); }} />
          </label>
        </div>

        <button className={`go ${stale ? 'need' : ''}`} onClick={run} disabled={!!busy && !stale}>判定する</button>
        {stale && <div className="stale-hint">入力が変わりました。「判定する」を押すと判定し直します</div>}
        {busy && <div className="busy">{busy}</div>}
        <div className="hint">
          {mat === '縞' && <><b>縞板は V25・V40・V80（HD3504NT）だけ</b>使えます。<br /></>}
          金型：<b>{base && base.sel ? dieLabel(base.sel) : '該当なし'}</b>（折り曲げ表の基準金型{base && !base.exact ? `・t${base.tUsed}の行で代用` : ''}）
          。L はダイ1本 {DIE_UNIT_LEN}mm。<br />
          片伸び：{nobiText.trim() !== '' ? <>手入力の <b>{nobiText}mm</b> を辺ごとに引いています</>
            : autoNobi ? <>表から <b>{autoNobi.val}mm</b> を辺ごとに引いています（{mat} V{base && base.v ? base.v.replace('V', '') : ''}・t{autoNobi.tUsed}{autoNobi.exact ? '' : ' で代用'} の表）</>
              : <>表に無いので、自分で入れてください</>}。ほかの金型で判定したときは、その型の片伸びを使います。
        </div>
      </section>

      </div>
      <div className={`colR ${stale ? 'is-stale' : ''}`}>
      {stale && <div className="stale-bar">入力が変わりました。<b>「判定する」</b>を押すと判定し直します（下は前の入力の答え）</div>}
      {result && result.note && <section><div className="card">{result.note}</div></section>}
      {result && !result.note && (
        <section>
          <Result r={result} big={!rescue} now={now} />
          {needScan && !rescue && busy && <div className="hint">ほかの金型を自動で調べています…</div>}
          {needScan && !rescue && !busy && others && (
            <div className="hint">
              {result.ok ? 'ほかの金型でも、普通に曲がる型はありませんでした。'
                : `ほかの金型（${others.filter((r) => !r.skip).length}型）でも曲がりませんでした。`}
            </div>
          )}
          {rescue && (
            <div className="rescue">
              <div className="rescue-head">
                {result.ok ? <>ほかの金型なら、<b>普通に曲がります</b>（自動で探しました）</>
                  : <>この金型では曲がりませんが、<b>ほかの金型なら曲がります</b>（自動で探しました）</>}
              </div>
              <Result r={rescue} big now={now} />
            </div>
          )}
          {!others && !busy && (
            <button className="more" onClick={runOthers}>
              {needScan ? '曲がる金型を探す' : 'ほかの金型でも曲がるか調べる'}
            </button>
          )}
        </section>
      )}
      {limitRow && (
        <section className="card">
          <div className="step">どこまで曲げられるか（{limitRow.die}・{snap.mat} t{snap.t}）</div>
          <div className="limits">
            <LimitDetail shape={snap.shape} row={limitRow} x={sd[1]} y={Math.min(sd[0], sd[2])}
              other={Math.max(sd[0], sd[2])} punch={shown.punch} punchFlip={shown.punchFlip} />
            <LimitChart shape={snap.shape} row={limitRow} x={sd[1]} y={Math.min(sd[0], sd[2])}
              grade={shown && shown.ok ? 'ok-sim' : 'ng'} />
            <QuickTable shape={snap.shape} row={limitRow} x={sd[1]} />
          </div>
          <div className="hint">
            {shown.punch && shown.punch !== '904061' && <><b>グラフと早見表は、普通のヤゲン 904061 の値です</b>（上の2つは {shown.punch} の値）。<br /></>}
            {snap.shape === 'Z' ? '短いほうのフランジを先に曲げる想定。長いほうのフランジは上限なし（最小フランジ以上）。'
              : '低いほうの立上りを先に曲げる想定。オレンジ＝くの字ヤゲン（曲げ長さ L が窓以内のときだけ）、紫の点線＝中押し。現場の順番は 普通 → くの字 → 中押し。'}
          </div>
        </section>
      )}

      {others && (
        <section>
          <h2>ほかの金型（{others.filter((o) => o.ok).length} 型で曲がります）</h2>
          <div className="list">
            {others.filter((r) => !r.skip).map((r) => <Result key={r.sel} r={r} now={now} />)}
          </div>
          {others.some((r) => r.skip) && (
            <div className="hint">この板厚を折り曲げ表で使わない型は外しました：{[...new Set(others.filter((r) => r.skip).map((r) => r.V))].map((v) => `V${v}`).join('・')}</div>
          )}
        </section>
      )}

      {result && snap && !result.skip && !result.note && (
        <RecordPanel shape={snap.shape} mat={snap.mat} t={snap.t} dims={snap.dims} L={snap.L} best={rescue || result}
          dies={[result, ...(others || [])].filter((r) => r && r.sel && !r.skip)
            .filter((r, i, a) => a.findIndex((x) => x.sel === r.sel) === i)
            .map((r) => ({ sel: r.sel, V: r.V, machine: r.machine, label: `${r.label}（${MACHINE_LIB[r.machine] ? MACHINE_LIB[r.machine].name.replace('AMADA ', '') : r.machine}）` }))}
          recs={recs} dir={dir} pendingDir={pendingDir} connect={connect} saveRec={saveRec} dropRec={dropRec} msg={recMsg} />
      )}

      </div>
      </div>

      <footer>
        判定はシミュレーター（ヤゲン904061・中間板標準・V.dxf で確認した土台）と同じ計算です。曲げ角度は90°で見ています。
        どの型も押すと、その型でシミュレーターが開きます（曲がらない型は当たる所で止まります）。
        実測ではないので、初めての形は最初の1本で確かめてください。
        <div className="links">
          <a href="./">シミュレーターで詳しく見る</a>
          <a href="./dash/">確認資料の一覧</a>
        </div>
      </footer>
    </div>
  );
}

// どこかで落ちても画面を真っ白にしない
class Boundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="wrap">
        <div className="card">
          <b>表示でつまずきました。</b>
          <div className="hint">ページを読み直してください（Ctrl＋F5）。直らないときは、この文面を知らせてください：{String(this.state.err && this.state.err.message || this.state.err)}</div>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(<Boundary><App /></Boundary>);
