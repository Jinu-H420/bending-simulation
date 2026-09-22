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
} from '../bending-simulator.jsx';

const PUNCH = '904061';
export const RANK = { 'ok-act': 3, 'ok-sim': 2, check: 1, ng: 0 };

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

// Z曲げ：outer = [A, S, B]（外寸）
export function judgeZ(row, A, S, B) {
  const base = { row, die: `V${row.V}`, machine: machineName(row) };
  if (row.nobi == null) return { ...base, grade: 'ng', why: '片伸びが折り曲げ表にありません' };
  const short = Math.min(A, B), long = Math.max(A, B);
  if (short < row.minOut) {
    return { ...base, grade: 'ng', why: `フランジ ${short}mm が短く、V溝に落ちます（最小 ${row.minOut}mm）`,
      fix: `フランジを ${row.minOut}mm 以上に` };
  }
  const geo = geoCheck(row, [A, S, B], [1, -1]);
  const act = row.zAct;

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
  if (geo.ok) return { ...base, grade: 'ok-sim', src: '計算', why: '計算で通ります（この型の実績はまだありません）', geo };
  const sMin = zSimMinS(row);
  if (sMin != null && S < sMin) return { ...base, grade: 'ng', src: '計算', why: `段差S ${S}mm が狭すぎます（計算で約 ${sMin}mm 以上）`, fix: `段差Sを ${sMin}mm 以上に`, geo };
  const lim = zLimitA(row, S);
  if (lim != null && Number.isFinite(lim) && short > lim) {
    return { ...base, grade: 'ng', src: '計算', why: `短いほうのフランジ ${short}mm が長すぎて、型に当たります（計算で約 ${f1(lim)}mm まで）`, fix: `短いほうのフランジを ${Math.floor(lim)}mm 以下に`, geo };
  }
  return { ...base, grade: 'ng', src: '計算', why: 'どの曲げ順・置き方でも型に当たります', geo };
}

// コの字：outer = [H1, W, H2]（外寸）
export function judgeU(row, H1, W, H2) {
  const base = { row, die: `V${row.V}`, machine: machineName(row) };
  if (row.nobi == null) return { ...base, grade: 'ng', why: '片伸びが折り曲げ表にありません' };
  const short = Math.min(H1, H2);
  if (short < row.minOut) {
    return { ...base, grade: 'ng', why: `立上り ${short}mm が短く、V溝に落ちます（最小 ${row.minOut}mm）`, fix: `立上りを ${row.minOut}mm 以上に` };
  }
  const geo = geoCheck(row, [H1, W, H2], [1, 1]);
  if (geo.ok) return { ...base, grade: 'ok-sim', src: '計算', why: '計算で通ります（コの字の実績はまだありません）', geo };
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
  const act = row.zAct;
  if (!act) return null;
  if (S < act.S) return { A: null, why: `段差S ${act.S}mm 未満は実績なし` };
  if (act.far && S >= act.far.S) return { A: act.far.A };
  return { A: act.A };
}

// 一度に曲げられる長さ。ダイの所有台数（1台835mm）と機械の長さの短いほう
export function lenLimit(row) {
  const m = row.machine === 'HG2203' ? MACHINE_LIB.hg2203 : MACHINE_LIB.hd3504nt;
  const n = DIE_STOCK[row.V];
  const c = [{ v: m.len, why: `${row.machine}の長さ` }];
  if (n) c.push({ v: n * DIE_UNIT_LEN, why: `V${row.V}のダイ ${n}台×${DIE_UNIT_LEN}mm` });
  if (row.t >= 22) c.push({ v: PL22_MAX_LEN, why: 'PL22（金型寸法表の注記）' });
  return c.reduce((a, b) => (a.v <= b.v ? a : b));
}
function withLength(res, L) {
  if (!(L > 0)) return res;
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
export function judgeAll(rows, shape, mat, t, dims, L) {
  const cand = rows.filter((r) => r.mat === mat && r.t === t);
  const baseV = (() => { const b = pickDie(mat, t); return b && b.v ? Number(String(b.v).replace(/\D/g, '')) : null; })();
  const res = cand.map((row) => withLength(shape === 'Z' ? judgeZ(row, ...dims) : judgeU(row, ...dims), L));
  res.sort((a, b) => (RANK[b.grade] - RANK[a.grade]) || ((b.row.V === baseV) - (a.row.V === baseV)) || (a.row.V - b.row.V));
  return { list: res, best: res[0] || null, baseV };
}

export const seqText = (seq) => (seq || []).map((s) => `曲げ${s.bend + 1}${s.mirror ? '（突き当て反対）' : ''}${s.valley ? '（裏返し）' : ''}`).join(' → ');
export const machineLabel = (m) => (MACHINE_LIB[m] ? MACHINE_LIB[m].name : m);
