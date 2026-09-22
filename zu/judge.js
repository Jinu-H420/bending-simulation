// Z曲げ・コの字の判定。
//
// 1つの型について、次の順で決める。
//   ① 折り曲げ表の最小フランジ（短いとV溝に落ちる）
//   ② 干渉判定（本体シミュレーターと同じ計算。曲げ順・突き当て・裏返しは自動で探す）
//   ③ Z曲げで実績がある型は、実績を優先する（V12〜V25 は計算が実績より甘いため）
//
// 結果の等級：
//   ok-act  ○ 曲がる（実績の範囲内）
//   ok-sim  ○ 曲がる（計算のみ・実績なし）
//   check   △ 確かめが必要（実績の範囲外で、計算では通る など）
//   ng      ✕ 曲がらない
import {
  resolveDie, searchSequences, pickDie, MACHINE_LIB, DIE_STOCK, DIE_UNIT_LEN, PL22_MAX_LEN,
  SUTE_MIN_INNER, nakaOshi, computeChain, toolsFor, minGap, shoulderReach, strokeState, reachCheck, PUNCH_LIB, Z_ACT_ON, smallVCheck,
} from '../bending-simulator.jsx';
export { Z_ACT_ON };

const PUNCH = '904061';
// naka＝普通の曲げ方では上型に当たるが、中押し（捨て曲げ）なら曲がる
// alt＝904061 では当たるが、ほかのヤゲン（くの字など）に替えれば曲がる
export const RANK = { 'ok-act': 3, 'ok-sim': 2, alt: 1.8, naka: 1.5, check: 1, ng: 0 };
const UPPER = ['ヤゲン', '中間板', 'ホルダ', '柱（機械上部）', 'ヤゲン（中低）'];

// 普通の曲げ順（入力どおり・突き当てそのまま）で、最初に何に当たるか。
// 中押しが効くのは上型に当たるときだけなので、それを見分けるのに使う。
function firstHitWhere(row, outer, dirs) {
  const info = resolveDie(row.sel, 20, 30, true, row.machine === 'HG2203' ? 'hg2203' : 'hd3504nt');
  const nobi = row.nobi, t = row.t;
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < outer.length - 1 ? nobi : 0));
  const part = { t, segs: flat, bends: dirs.map((d) => ({ angle: 90, dir: d })), grow: dirs.map(() => nobi - t / 2) };
  const seq = dirs.map((d, k) => ({ bend: k, mirror: false, valley: d < 0 }));
  const openGap = Math.max(0, 170 - t);
  const exArc = shoulderReach(info.vHalf, t, 90) + t;
  for (let si = 0; si < seq.length; si++) {
    if (!reachCheck(part, seq, si, info.vHalf).ok) return 'フランジ不足';
    for (let p = 0; p <= 1.0001; p += 0.04) {
      const { bendProg, lift } = strokeState(p, openGap);
      const ch = computeChain(part, seq, si, bendProg, info.vHalf);
      const tools = toolsFor(PUNCH, false, ch.innerY - lift, 'std', info.polys);
      const g = minGap(ch, tools.polys, t, info.vHalf, exArc);
      if (g.gap < -0.05) return tools.names[g.atIdx] || '工具';
    }
  }
  return null;
}

// カーブの補間。点が無い・上限なし（400）は null/Infinity で返す
// 両隣のどちらかが「曲げられない」(null) なら null
function interp(p, x, kx, ky) {
  if (!p.length) return null;
  const top = (y) => (y >= 399 ? Infinity : y);
  if (x <= p[0][kx]) return p[0][ky] == null ? null : top(p[0][ky]);
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i][kx]) {
      const a = p[i - 1], b = p[i];
      if (a[ky] == null || b[ky] == null) return x === b[kx] && b[ky] != null ? top(b[ky]) : null;
      return top(a[ky] + (b[ky] - a[ky]) * (x - a[kx]) / (b[kx] - a[kx]));
    }
  }
  const y = p[p.length - 1][ky];
  return y == null ? null : top(y);
}
// コの字をくの字ヤゲンで曲げたときの立上り上限（底Wごとの計算カーブ）
export const uKunoH = (row, W) => (row.uKuno ? interp(row.uKuno, W, 'W', 'H') : null);
// 中押しで押し切ったとき上型が入る立上り（外寸）の上限。底の半分が最小フランジ未満なら null（への字が曲がらない）
export function uNakaH(row, W) {
  if (W / 2 < row.minOut) return null;
  const n = nakaOshi(PUNCH, false, 'std', W - 2 * row.t, 0);
  return Number.isFinite(n.maxH) ? n.maxH + row.t : Infinity;
}
export const zLimitA = (row, S) => (row.zCurve ? interp(row.zCurve, S, 'S', 'A') : null);
export const uLimitH = (row, W) => (row.uCurve ? interp(row.uCurve, W, 'W', 'H') : null);
// 計算上の段差S最小：カーブで A が出始める S
export const zSimMinS = (row) => {
  const p = (row.zCurve || []).find((q) => q.A != null);
  return p ? p.S : null;
};
export const uSimMinW = (row) => {
  const p = (row.uCurve || []).find((q) => q.H != null);
  return p ? p.W : null;
};

const machineName = (row) => row.machine;

// 干渉判定（曲げ順・突き当て・裏返しを自動で探す）
function geoCheck(row, outer, dirs) {
  const info = resolveDie(row.sel, 20, 30, true, row.machine === 'HG2203' ? 'hg2203' : 'hd3504nt');
  const nobi = row.nobi;
  const flat = outer.map((L, i) => L - (i > 0 ? nobi : 0) - (i < outer.length - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return { ok: false, why: '寸法が短すぎて形になりません' };
  const part = { t: row.t, segs: flat, bends: dirs.map((d) => ({ angle: 90, dir: d })), grow: dirs.map(() => nobi - row.t / 2) };
  const r = searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, Math.max(0, 170 - row.t));
  return r.sols.length ? { ok: true, seq: r.sols[0] } : { ok: false };
}

const f1 = (x) => (Math.round(x * 10) / 10).toString();

// 904061 で当たるとき、ほかのヤゲンを試す。普通のヤゲン → 特殊（くの字）の順。
// 特殊 くの字は中央の窓（165版＝200mm、100版＝70mm）に曲げ長さ L が収まるときだけ使える。
// 返り値 { ok:{punch, flip, seq, special}, win:{punch, win}（窓さえ収まれば通るもの） }
function altPunch(row, outer, dirs, L) {
  const info = resolveDie(row.sel, 20, 30, true, row.machine === 'HG2203' ? 'hg2203' : 'hd3504nt');
  const nobi = row.nobi;
  const flat = outer.map((x, i) => x - (i > 0 ? nobi : 0) - (i < outer.length - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return {};
  const part = { t: row.t, segs: flat, bends: dirs.map((d) => ({ angle: 90, dir: d })), grow: dirs.map(() => nobi - row.t / 2) };
  const ids = Object.keys(PUNCH_LIB);
  const order = [...ids.filter((k) => !PUNCH_LIB[k].special && k !== PUNCH), ...ids.filter((k) => PUNCH_LIB[k].special)];
  const cands = [[PUNCH, true], ...order.flatMap((k) => [[k, false], [k, true]])];
  let win = null;
  for (const [pid, flip] of cands) {
    const sp = PUNCH_LIB[pid].special;
    if (sp && win && win.punch === pid) continue;
    const r = searchSequences(part, info.vHalf, info.polys, pid, flip, 'std', 1, Math.max(0, 170 - row.t));
    if (!r.sols.length) continue;
    if (sp && L > sp.win) { if (!win || sp.win > win.win) win = { punch: pid, win: sp.win }; continue; }
    return { ok: { punch: pid, flip, seq: r.sols[0], special: sp || null }, win };
  }
  return { win };
}
const punchName = (p, flip) => `ヤゲン ${p}${flip ? '（反転）' : ''}`;

// 特殊 くの字ヤゲンで曲がるか（曲げ長さを別にして、形として通るか）と、使える曲げ長さ L の上限。
// くの字は中央の窓の中でしか使えないので、L が窓（165版＝200mm・100版＝70mm）以内のときだけ曲がる。
export function kunoLimits(row, outer, dirs) {
  const info = resolveDie(row.sel, 20, 30, true, row.machine === 'HG2203' ? 'hg2203' : 'hd3504nt');
  const nobi = row.nobi;
  if (nobi == null) return [];
  const flat = outer.map((x, i) => x - (i > 0 ? nobi : 0) - (i < outer.length - 1 ? nobi : 0));
  if (flat.some((x) => x <= 0.5)) return [];
  const part = { t: row.t, segs: flat, bends: dirs.map((d) => ({ angle: 90, dir: d })), grow: dirs.map(() => nobi - row.t / 2) };
  return Object.keys(PUNCH_LIB).filter((k) => PUNCH_LIB[k].special).map((pid) => {
    const sp = PUNCH_LIB[pid].special;
    const ok = [false, true].some((flip) =>
      searchSequences(part, info.vHalf, info.polys, pid, flip, 'std', 1, Math.max(0, 170 - row.t)).sols.length > 0);
    return { punch: pid, win: sp.win, ok };
  }).sort((a, b) => b.win - a.win);
}

// Z曲げ：outer = [A, S, B]（外寸）
export function judgeZ(row, A, S, B, L) {
  const base = { row, die: `V${row.V}`, machine: machineName(row) };
  if (row.nobi == null) return { ...base, grade: 'ng', why: '片伸びが折り曲げ表にありません' };
  const short = Math.min(A, B), long = Math.max(A, B);
  if (short < row.minOut) {
    return { ...base, grade: 'ng', why: `フランジ ${short}mm が短く、V溝に落ちます（最小 ${row.minOut}mm）`,
      fix: `フランジを ${row.minOut}mm 以上に` };
  }
  const geo = geoCheck(row, [A, S, B], [1, -1]);
  // 実績は確認中（Z_ACT_ON=false）のあいだ使わない。シミュレーションで決める
  const act = Z_ACT_ON ? row.zAct : null;

  if (act) {
    // 実績：段差S最小と、そのSでのフランジ上限。備考に「S35なら A95」があれば広いSでの上限
    const far = act.far;
    if (S < act.S) {
      return { ...base, grade: 'ng', src: '実績', why: `段差S ${S}mm が狭すぎます（実績で ${act.S}mm 以上）`, fix: `段差Sを ${act.S}mm 以上に`, geo };
    }
    const lim = far && S >= far.S ? far.A : act.A;
    if (short <= lim) {
      return { ...base, grade: 'ok-act', src: '実績', why: `実績の範囲内（段差S ${act.S}mm 以上・フランジ ${lim}mm まで）`, geo };
    }
    if (far && S < far.S && short <= far.A) {
      return { ...base, grade: 'check', src: '実績', why: `実績は S${act.S} でフランジ${act.A}まで、S${far.S} で${far.A}まで。S${S} は間なので未確認です`,
        fix: `段差Sを ${far.S}mm 以上に`, geo };
    }
    return { ...base, grade: 'ng', src: '実績', why: `短いほうのフランジ ${short}mm が長すぎて、下の台に当たります（実績 ${lim}mm まで）`,
      fix: far && S < far.S ? `段差Sを ${far.S}mm 以上に` : `短いほうのフランジを ${lim}mm 以下に`, geo };
  }

  // 実績なし：計算で決める
  // 計算の段差S最小（フランジを長くとったとき）より狭いのに通るのは、フランジが短くて逃げている場合。
  // 実績のある V32 では、この範囲は実績で確かめられていないので △ にする。
  if (geo.ok && row.zSimS != null && S < row.zSimS) {
    return { ...base, grade: 'check', src: '計算', why: `フランジが短いので計算では通りますが、段差S ${Math.ceil(row.zSimS)}mm 未満は実績の無い範囲です`,
      fix: `段差Sを ${Math.ceil(row.zSimS)}mm 以上に`, geo };
  }
  if (geo.ok) return { ...base, grade: 'ok-sim', src: '計算', why: Z_ACT_ON || !row.zAct ? '計算で通ります（この型の実績はまだありません）' : '計算で通ります（段差の実績は確認中のため計算で判定）', geo };
  const alt = altPunch(row, [A, S, B], [1, -1], L);
  if (alt.ok) {
    return { ...base, grade: 'alt', src: '計算', punch: alt.ok.punch, punchFlip: alt.ok.flip, geo: { ok: true, seq: alt.ok.seq },
      why: `904061 では当たりますが、${punchName(alt.ok.punch, alt.ok.flip)}なら曲がります${alt.ok.special ? `（曲げ長さ ${alt.ok.special.win}mm まで）` : ''}` };
  }
  const sMin = zSimMinS(row);
  if (sMin != null && S < sMin) return { ...base, grade: 'ng', src: '計算', why: `段差S ${S}mm が狭すぎます（計算で約 ${sMin}mm 以上）`, fix: `段差Sを ${sMin}mm 以上に`, geo };
  const lim = zLimitA(row, S);
  if (lim != null && Number.isFinite(lim) && short > lim) {
    return { ...base, grade: 'ng', src: '計算', why: `短いほうのフランジ ${short}mm が長すぎて、型に当たります（計算で約 ${f1(lim)}mm まで）`, fix: `短いほうのフランジを ${Math.floor(lim)}mm 以下に`, geo };
  }
  return { ...base, grade: 'ng', src: '計算', why: 'どの曲げ順・置き方でも型に当たります', geo };
}

// コの字：outer = [H1, W, H2]（外寸）
export function judgeU(row, H1, W, H2, L) {
  const base = { row, die: `V${row.V}`, machine: machineName(row) };
  if (row.nobi == null) return { ...base, grade: 'ng', why: '片伸びが折り曲げ表にありません' };
  const short = Math.min(H1, H2);
  if (short < row.minOut) {
    return { ...base, grade: 'ng', why: `立上り ${short}mm が短く、V溝に落ちます（最小 ${row.minOut}mm）`, fix: `立上りを ${row.minOut}mm 以上に` };
  }
  const geo = geoCheck(row, [H1, W, H2], [1, 1]);
  if (geo.ok) return { ...base, grade: 'ok-sim', src: '計算', why: '計算で通ります（コの字の実績はまだありません）', geo };
  const alt = altPunch(row, [H1, W, H2], [1, 1], L);
  if (alt.ok) {
    return { ...base, grade: 'alt', src: '計算', punch: alt.ok.punch, punchFlip: alt.ok.flip, geo: { ok: true, seq: alt.ok.seq },
      why: `904061 では当たりますが、${punchName(alt.ok.punch, alt.ok.flip)}なら曲がります${alt.ok.special ? `（くの字の窓に入るので、曲げ長さ ${alt.ok.special.win}mm まで）` : ''}` };
  }
  // 特殊 くの字なら通るのに、曲げ長さが窓を超えている
  const winFix = alt.win ? `${alt.win.punch}を使い、曲げ長さ L を ${alt.win.win}mm 以下に` : null;

  // 中押し（捨て曲げ）：底をへの字に曲げ → 両サイドを90° → 底を中押しで戻す。上型に当たるときだけ効く。
  // 押し切った瞬間に上型がコの字の内側に入るかを計算で見る。現場の決まりは内-内120mm以上
  // （経緯まとめ第17章）なので、それより狭くて計算では入るものは △ にする。
  const where = firstHitWhere(row, [H1, W, H2], [1, 1]);
  if (where && UPPER.includes(where)) {
    // 押し切った瞬間に、上型（904061・中間板・ホルダ・柱）がコの字の内側に入るか（本体の nakaOshi）
    const inner = +(W - 2 * row.t).toFixed(1);
    // への字は底の真ん中をV溝で曲げるので、底の半分ずつが最小フランジ以上いる
    if (W / 2 < row.minOut) {
      return { ...base, grade: 'ng', src: '計算', geo,
        why: `${where}に当たります。中押しも、底の半分 ${W / 2}mm が最小フランジ ${row.minOut}mm より短く、への字に曲げられません`,
        fix: [winFix, `底Wを ${Math.ceil(2 * row.minOut)}mm 以上に（中押し）`].filter(Boolean).join('、または') };
    }
    const n = nakaOshi(PUNCH, false, 'std', inner, Math.max(H1, H2) - row.t);
    const naka = { inner, clear: +n.clear.toFixed(1), at: n.at, maxH: n.maxH };
    if (n.ok) {
      // 押し切った瞬間は入る。への字 → 両サイド → 中押し を工程ごとに動かして、通る への字の角度を探す
      const a = nakaMinAngle(row, H1, W, H2);
      if (a.angle == null) {
        const f = a.fail || {};
        return { ...base, grade: 'ng', src: '計算', geo, naka,
          why: `${where}に当たります。中押しでも、への字を${NAKA_ANGLES[NAKA_ANGLES.length - 1]}°にしても ${STEP_NAME[f.step] || ''}で${f.where || '工具'}に当たります`,
          fix: [winFix, `底Wを広くするか、立上りを低く`].filter(Boolean).join('、または') };
      }
      naka.angle = a.angle;
      if (inner >= SUTE_MIN_INNER) {
        return { ...base, grade: 'naka', src: '中押し', geo, naka,
          why: `普通の曲げ方では${where}に当たります。中押しなら曲げられます（への字 ${a.angle}°以上、内-内 ${inner}mm）` };
      }
      // 計算では通るが、現場の決まり（内-内120mm）より狭い。確かめてから
      return { ...base, grade: 'check', src: '中押し', geo, naka,
        why: `普通の曲げ方では${where}に当たります。中押しは計算では通ります（への字 ${a.angle}°以上）が、内-内 ${inner}mm は現場の決まり ${SUTE_MIN_INNER}mm より狭く、まだ確かめていません`,
        fix: [winFix, `底Wを ${Math.ceil(SUTE_MIN_INNER + 2 * row.t)}mm 以上に`].filter(Boolean).join('、または') };
    }
    const lim = uLimitH(row, W);
    const hFix = lim != null && Number.isFinite(lim) && short > lim ? `低いほうの立上りを ${Math.floor(lim)}mm 以下に（普通に曲げる）` : null;
    const mFix = Number.isFinite(n.maxH) ? `高いほうの立上りを ${Math.floor(n.maxH + row.t)}mm 以下に（中押し）` : null;
    return { ...base, grade: 'ng', src: '計算', geo, naka,
      why: `${where}に当たります。中押しでも、押し切ったとき刃先から ${n.at}mm の高さで上型が立上りに当たります（そこには内-内 ${n.needW}mm 要る。いま ${inner}mm）`,
      fix: [winFix, hFix, mFix, `底Wを ${Math.ceil(n.needW + 2 * row.t)}mm 以上に（中押し）`].filter(Boolean).join('、または') };
  }
  const wMin = uSimMinW(row);
  if (wMin != null && W < wMin) return { ...base, grade: 'ng', src: '計算', why: `底 ${W}mm が狭すぎます（計算で約 ${wMin}mm 以上）`, fix: `底を ${wMin}mm 以上に`, geo };
  const lim = uLimitH(row, W);
  if (lim != null && Number.isFinite(lim) && short > lim) {
    return { ...base, grade: 'ng', src: '計算', why: `低いほうの立上り ${short}mm でも高すぎて、上型に当たります（底 ${W}mm なら約 ${f1(lim)}mm まで）`, fix: `低いほうの立上りを ${Math.floor(lim)}mm 以下に`, geo };
  }
  return { ...base, grade: 'ng', src: '計算', why: 'どの曲げ順・置き方でも型に当たります', geo };
}

// いまの寸法での上限を、干渉の計算で1mm単位まで求める（グラフは10mm刻みなので目安）。
//   Z  ：段差S＝x、長いほうのフランジ＝other のとき、短いほうのフランジの上限
//   コ ：底W＝x のとき、立上りの上限（左右同じ高さで見る。グラフと同じ条件）
// 返り値：数値／Infinity（上限なし）／null（その x では最短でも曲げられない）
export function exactLimit(row, shape, x, other) {
  if (row.nobi == null) return null;
  const lo = Math.max(row.minOut, 5);
  const ok = shape === 'Z'
    ? (a) => geoCheck(row, [a, x, Math.max(other, a)], [1, -1]).ok
    : (h) => geoCheck(row, [h, x, h], [1, 1]).ok;
  if (!ok(lo)) return null;
  if (ok(400)) return Infinity;
  let a = lo, b = 400;
  while (b - a > 0.5) { const m = (a + b) / 2; if (ok(m)) a = m; else b = m; }
  return Math.floor(a);
}

// 実績の上限（Z）。段差Sで決まる。実績が無ければ null
export function actLimit(row, S) {
  const act = Z_ACT_ON ? row.zAct : null;
  if (!act) return null;
  if (S < act.S) return { A: null, why: `段差S ${act.S}mm 未満は実績なし` };
  if (act.far && S >= act.far.S) return { A: act.far.A };
  return { A: act.A };
}

// 中押しを工程ごとに動かして当たりを見る（本体の「中押しで曲げる」と同じ組み立て）。
//   ① 底の真ん中を への字（angle°）→ ② 両サイド90°（突き当ては4通り試す）→ ③ 中押しで平らに戻す
// 返り値 { ok, step（当たった工程 1〜4）, where（当たった部品） }
function nakaSimulate(row, H1, W, H2, angle) {
  const info = resolveDie(row.sel, 20, 30, true, row.machine === 'HG2203' ? 'hg2203' : 'hd3504nt');
  const { nobi, t } = row;
  const vHalf = info.vHalf, openGap = Math.max(0, 170 - t);
  const g = nobi - t / 2;
  const part = { t, segs: [H1 - nobi, (W - 2 * nobi) / 2, (W - 2 * nobi) / 2, H2 - nobi],
    bends: [{ angle: 90, dir: 1 }, { angle, dir: -1 }, { angle: 90, dir: 1 }], grow: [g, 0, g] };
  // への字の底が載るダイ上面の端
  const top = info.polys.flat().filter((q) => Math.abs(q[1]) < 0.6);
  const pressHalf = Math.min(Math.max(vHalf, ...top.filter((q) => q[0] > 0).map((q) => q[0])),
    Math.max(vHalf, ...top.filter((q) => q[0] < 0).map((q) => -q[0])));
  let best = null;
  for (let m = 0; m < 4; m++) {
    const seq = [
      { bend: 1, mirror: false, valley: true },
      { bend: 0, mirror: !!(m & 1), valley: false },
      { bend: 2, mirror: !!(m & 2), valley: false },
      { bend: 1, mirror: false, valley: false, press: true },
    ];
    let fail = null;
    for (let si = 0; si < seq.length && !fail; si++) {
      const press = !!seq[si].press;
      if (!press && !reachCheck(part, seq, si, vHalf).ok) { fail = { step: si + 1, where: 'フランジ不足' }; break; }
      const exArc = press ? pressHalf + t : shoulderReach(vHalf, t, 90) + t;
      for (let p = 0; p <= 1.0001; p += 0.05) {
        const { bendProg, lift } = strokeState(p, openGap);
        const ch = computeChain(part, seq, si, bendProg, press ? pressHalf : vHalf);
        if (!ch.activeDirOK) { fail = { step: si + 1, where: '向き' }; break; }
        const tools = toolsFor(PUNCH, false, ch.innerY - lift, 'std', info.polys);
        const gg = minGap(ch, tools.polys, t, vHalf, exArc);
        if (gg.gap < -0.05) { fail = { step: si + 1, where: tools.names[gg.atIdx] || '工具' }; break; }
      }
    }
    if (!fail) return { ok: true };
    if (!best || fail.step > best.step) best = fail;
  }
  return { ok: false, ...best };
}
// への字の角度を小さい順に試し、全工程が通る最小の角度を返す（無ければ null と、いちばん先まで行けた失敗）
export const NAKA_ANGLES = [5, 10, 15, 20, 25, 30, 40, 50];
function nakaMinAngle(row, H1, W, H2) {
  let last = null;
  for (const a of NAKA_ANGLES) {
    const r = nakaSimulate(row, H1, W, H2, a);
    if (r.ok) return { angle: a };
    last = r;
  }
  return { angle: null, fail: last };
}
const STEP_NAME = ['', 'への字', '1か所目の立上り', '2か所目の立上り', '中押し'];

// 中押しで押し切った瞬間の絵に使う形。刃先＝底の内面の中央＝(0,0)、y は負が上。
export function nakaPose(t, W, H1, H2) {
  const T = toolsFor(PUNCH, false, 0, 'std', []);
  const hw = W / 2;   // 外寸の半分
  const plate = [[-hw, -(H1 - t)], [-hw, t], [hw, t], [hw, -(H2 - t)], [hw - t, -(H2 - t)], [hw - t, 0], [-hw + t, 0], [-hw + t, -(H1 - t)]];
  return { tools: T.polys.map((p, i) => ({ name: T.names[i], pts: p })), plate };
}
export { nakaOshi, PUNCH };

// 一度に曲げられる長さ。ダイの所有台数（1台835mm）と機械の長さの短いほう
export function lenLimit(row) {
  const m = row.machine === 'HG2203' ? MACHINE_LIB.hg2203 : MACHINE_LIB.hd3504nt;
  const n = DIE_STOCK[row.V];
  const c = [{ v: m.len, why: `${row.machine}の長さ` }];
  if (n) c.push({ v: n * DIE_UNIT_LEN, why: `V${row.V}のダイ ${n}台×${DIE_UNIT_LEN}mm` });
  if (row.t >= 22) c.push({ v: PL22_MAX_LEN, why: 'PL22（金型寸法表の注記）' });
  return c.reduce((a, b) => (a.v <= b.v ? a : b));
}
// ---------------------------------------------------------------- 登録した実績（使うたびに良くなる）
// 曲げ屋さんに聞いて確かな結果を1件ずつ登録したもの（共有フォルダ bendsim.json の zuRecords）。
//   { id, at, who, shape:'Z'|'U', mat, t, V, machine, dims:[a,b,c], L, method:'normal'|'kuno'|'naka', punch, ok, note }
// 同じ形・材質・板厚・V の実績があれば、計算より実績を優先する。当てはめ方（楽なほう・きついほうの向き）：
//   Z ：段差Sが広いほど、短いほうのフランジが短いほど楽。曲がった実績より楽なら ○、曲がらなかった実績よりきつければ ✕
//   コ：底Wがほぼ同じ（±5mm）で、立上りが低いほど楽
//   L ：基準より小さいVのときだけ見る。曲がった実績の L 以下なら ○、曲がらなかった L 以上なら ✕
export const METHOD_JA = { normal: '普通に', kuno: 'くの字ヤゲンで', naka: '中押しで' };
const recKey = (s, r) => [s, r.mat, r.t, r.V].join('|');
function easierOrSame(shape, dims, L, rec, smallV) {
  if (smallV && rec.L > 0 && !(L <= rec.L)) return false;
  if (shape === 'Z') return dims[1] >= rec.dims[1] && Math.min(dims[0], dims[2]) <= Math.min(rec.dims[0], rec.dims[2]);
  return Math.abs(dims[1] - rec.dims[1]) <= 5 && Math.max(dims[0], dims[2]) <= Math.max(rec.dims[0], rec.dims[2]);
}
function harderOrSame(shape, dims, L, rec, smallV) {
  if (smallV && rec.L > 0 && rec.lenFail) return L >= rec.L;   // 長さで曲がらなかった記録
  if (shape === 'Z') return dims[1] <= rec.dims[1] && Math.min(dims[0], dims[2]) >= Math.min(rec.dims[0], rec.dims[2]);
  return Math.abs(dims[1] - rec.dims[1]) <= 5 && Math.min(dims[0], dims[2]) >= Math.min(rec.dims[0], rec.dims[2]);
}
const recText = (r) => `${String(r.at).slice(0, 10)} ${r.shape === 'Z' ? `A${r.dims[0]}・S${r.dims[1]}・B${r.dims[2]}` : `H${r.dims[0]}・W${r.dims[1]}・H${r.dims[2]}`}${r.L ? `・L${r.L}` : ''} を${METHOD_JA[r.method] || ''}${r.ok ? '曲げた' : '曲げられなかった'}${r.who ? `（${r.who}）` : ''}`;
// 小さいVの最長L：曲がった実績の一番長い L
function recMaxL(recs, shape, row) {
  const ls = (recs || []).filter((r) => r.ok && r.mat === row.mat && r.t === row.t && r.V === row.V && r.L > 0).map((r) => r.L);
  return ls.length ? Math.max(...ls) : null;
}
function withRecords(res, shape, dims, L, recs) {
  if (!recs || !recs.length) return res;
  const k = recKey(shape, res.row);
  const same = recs.filter((r) => recKey(r.shape, r) === k);
  if (!same.length) return res;
  const smallV = !!smallVCheck(res.row.mat, res.row.t, res.row.V);
  const okR = same.filter((r) => r.ok && easierOrSame(shape, dims, L, r, smallV));
  if (okR.length) {
    // 曲げ方の順番（普通 → くの字 → 中押し）で一番楽なもの
    const pick = ['normal', 'kuno', 'naka'].map((m) => okR.find((r) => r.method === m)).find(Boolean) || okR[0];
    const grade = pick.method === 'kuno' ? 'alt' : pick.method === 'naka' ? 'naka' : 'ok-act';
    return { ...res, grade, src: '実績', recs: same, punch: pick.method === 'kuno' ? (pick.punch || res.punch) : res.punch,
      why: `実績あり：${recText(pick)}。いまの寸法はそれと同じか楽です`, fix: undefined };
  }
  const ngR = same.filter((r) => !r.ok && r.method === 'normal' && harderOrSame(shape, dims, L, r, smallV));
  if (ngR.length && res.grade !== 'ng' && !res.punch && res.src !== '中押し') {
    return { ...res, grade: 'ng', src: '実績', recs: same, why: `実績：${recText(ngR[0])}。いまの寸法はそれと同じかきついので曲がりません`,
      fix: res.fix || '寸法を見直すか、くの字・中押しを試す' };
  }
  return { ...res, recs: same };
}

// 基準より小さいV：最長Lの実績があればそれで判定、無ければ曲がる判定でも △（最長Lを確認中）
function withSmallV(res, L, recs) {
  const sv0 = smallVCheck(res.row.mat, res.row.t, res.row.V);
  if (!sv0) return res;
  const sv = sv0;
  const note = `板厚 t${res.row.t} の基準は V${sv.baseV}。小さい V${res.row.V} は長いものが曲げられない`;
  // ① 確かめた最長L（SMALLV_MAXL）があれば、それで ○／✕
  if (sv.maxL != null) {
    if (!(L > sv.maxL)) return { ...res, smallV: sv };
    const why = `${note}（L ${sv.maxL}mm まで・実績）`;
    return { ...res, smallV: sv, grade: 'ng', why: res.grade === 'ng' ? `${res.why}。さらに${why}` : why,
      fix: [res.fix, `L を ${sv.maxL}mm 以下にするか、V${sv.baseV} で曲げる`].filter(Boolean).join('、または') };
  }
  // ② 登録した実績で曲がった一番長い L。それ以下なら長さは大丈夫。超えると「そこまでは未確認」（✕ にはしない）
  const rl = recMaxL(recs, null, res.row);
  if (rl != null && L <= rl) return { ...res, smallV: { ...sv, recL: rl } };
  const known = rl != null ? `曲がった実績は L ${rl}mm まで。` : '';
  if (res.grade === 'ng' || res.grade === 'check') return { ...res, smallV: sv, why: `${res.why}。${note}（${known}最長Lは確認中）` };
  return { ...res, smallV: sv, grade: 'check', why: `${res.why}。ただし${note}ので、${known}L ${L}mm で曲がるかは確認中です`,
    fix: rl != null ? `L を ${rl}mm 以下にするか、基準の V${sv.baseV} に` : `基準の V${sv.baseV} に` };
}

function withLength(res, L, recs) {
  if (!(L > 0)) return res;
  res = withSmallV(res, L, recs);
  const lim = lenLimit(res.row);
  if (L <= lim.v) return { ...res, lenLim: lim };
  const why = `曲げ長さ L ${L}mm が長すぎます（${lim.why}で ${lim.v}mm まで）`;
  const fix = `L を ${lim.v}mm 以下に`;
  // 形でも当たるときは、両方の理由を並べる
  if (res.grade === 'ng') return { ...res, lenLim: lim, why: `${res.why}。さらに${why}`, fix: res.fix ? `${res.fix}、かつ${fix}` : fix };
  return { ...res, lenLim: lim, grade: 'ng', why, fix };
}

// その材質・板厚で使う型を全部判定し、いちばん良いものを答えにする。
// 同じ等級なら、折り曲げ表の基準金型（その板厚で普段使うV）を優先する。
export function judgeAll(rows, shape, mat, t, dims, L, recs = []) {
  const cand = rows.filter((r) => r.mat === mat && r.t === t);
  const baseV = (() => { const b = pickDie(mat, t); return b && b.v ? Number(String(b.v).replace(/\D/g, '')) : null; })();
  const res = cand.map((row) => {
    // 計算 → 長さ・小さいV → 登録した実績（いちばん強い）の順に重ねる
    const r = withRecords(withLength(shape === 'Z' ? judgeZ(row, ...dims, L) : judgeU(row, ...dims, L), L, recs), shape, dims, L, recs);
    // くの字の L 上限は、普通のヤゲン（904061）で形として当たるときだけ出す（小さいVの△などでは出さない）
    const plainGeo = r.geo && r.geo.ok && !r.punch;
    if (!plainGeo && !(shape === 'Z' && Z_ACT_ON && row.zAct)) r.kuno = kunoLimits(row, dims, shape === 'Z' ? [1, -1] : [1, 1]);
    return r;
  });
  res.sort((a, b) => (RANK[b.grade] - RANK[a.grade]) || ((b.row.V === baseV) - (a.row.V === baseV)) || (a.row.V - b.row.V));
  return { list: res, best: res[0] || null, baseV };
}

export const seqText = (seq) => (seq || []).map((s) => `曲げ${s.bend + 1}${s.mirror ? '（突き当て反対）' : ''}${s.valley ? '（裏返し）' : ''}`).join(' → ');
export const machineLabel = (m) => (MACHINE_LIB[m] ? MACHINE_LIB[m].name : m);
