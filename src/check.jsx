// 曲がるか かんたん判定。
// 形と寸法（外寸）と板厚を入れると、シミュレーターと同じ干渉判定で ○/✕ を出す。
// 曲げ順・突き当て（左右）・裏返しは自動で探す。✕ のときは理由（どこに当たるか）と、
// 通る別の金型を出す。
import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import {
  pickDie, resolveDie, lookupTable, NOBI_TABLE, MINOUT_TABLE, searchSequences, reachCheck,
  computeChain, toolsFor, minGap, shoulderReach, strokeState, MACHINE_DIES, MACHINE_LIB, dieLabel,
  DIE_STOCK, DIE_UNIT_LEN, PL22_MAX_LEN, smallVCheck,
} from '../bending-simulator.jsx';
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
function judge({ shape, outer, t, mat, sel, nobiIn, L }) {
  return withLength(judgeShape({ shape, outer, t, mat, sel, nobiIn }), { L, t, mat });
}
function judgeShape({ shape, outer, t, mat, sel, nobiIn }) {
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
  const res = { sel, machine, V, label: dieLabel(sel), nobi, nobiSrc: nobiIn != null ? '手入力' : nb ? (nb.exact ? '表' : `表（t${nb.tUsed}で代用）`) : '無し' };
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

  const r = searchSequences(part, info.vHalf, info.polys, PUNCH, false, 'std', 1, openGap);
  if (r.sols.length) return { ...res, ok: true, seq: r.sols[0], minOut: mo && mo.val };

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
      if (w.gap < -0.05) break;
    }
    if (!best || worst.gap > best.gap) best = worst;
  }
  const where = best.gap <= -999 ? best.name : `${best.name}に ${(-best.gap).toFixed(1)}mm 当たる`;
  return { ...res, ok: false, why: `どの順番・置き方でも通りません。いちばん惜しいのは 曲げ${best.step}本目で ${where}` };
}

// その型・その寸法でシミュレーターを開くリンク。曲がらない型は、当たる所で止まる
function simLink(r, { shape, dims, mat, t, L }) {
  const S = SHAPES[shape];
  const seq = r.seq || S.dirs.map((d, k) => ({ bend: k, mirror: false, valley: d < 0 }));
  const note = [`かんたん判定から開きました：${S.name}　${mat} t${t}　${S.labels.map((lb, i) => `${lb}=${dims[i]}`).join('・')}（外寸）　L=${L}　${r.label}`];
  note.push(r.ok ? `判定：曲がります（${seqText(seq)}）。` : `判定：${r.why}。当たる瞬間で止めています（橙の丸が当たる所）。「▶ 全工程再生」で動きも見られます。`);
  const params = {
    t: Number(t), matType: mat, inputMode: 'outer', outerSegs: dims.map(Number), nobiOverride: null, bendLen: Number(L) || L_DEF,
    bends: S.dirs.map((d) => ({ angle: 90, dir: d })),
    dieSel: r.sel, machineSel: r.machine, dieFlip: false,
    punchType: PUNCH, punchFlip: false, chukanSel: 'std', dieBase: true, seq, nakaOn: false, nakaAngle: 20,
  };
  return `./#open=${encodeURIComponent(JSON.stringify({ params, note: note.join('\n') }))}`;
}

const seqText = (seq) => seq.map((s) => `曲げ${s.bend + 1}${s.mirror ? '（突き当て反対側）' : ''}${s.valley ? '（裏返し）' : ''}`).join(' → ');

function Result({ r, big, now }) {
  const warn = LENIENT[r.V], good = MATCHED[r.V];
  const href = r.sel ? simLink(r, now) : null;
  const Box = href ? 'a' : 'div';
  const boxProps = href ? { href, target: '_blank', rel: 'noreferrer' } : {};
  return (
    <Box {...boxProps} className={`res ${r.ok ? 'ok' : 'ng'} ${big ? 'big' : ''} ${href ? 'link' : ''}`}>
      <div className="res-head">
        <span className="mark">{r.ok ? '○' : '✕'}</span>
        <span className="verdict">{r.ok ? '曲がります' : '曲がりません'}</span>
        <span className="die">{r.label}（{MACHINE_LIB[r.machine] ? MACHINE_LIB[r.machine].name.replace('AMADA ', '') : r.machine}）</span>
      </div>
      {r.ok ? (
        <div className="res-body">曲げ順：<b>{seqText(r.seq)}</b></div>
      ) : (
        <div className="res-body">{r.why}</div>
      )}
      <div className="res-foot">
        片伸び {r.nobi != null ? r.nobi : '—'}（{r.nobiSrc}）
        {r.lenLim && <span className="len">曲げ長さは {r.lenLim.v}mm まで（{r.lenLim.why}）</span>}
        {r.ok && r.smallV && r.smallV.maxL == null && (
          <span className="caution">⚠ 板厚 t{r.t || ''} の基準は V{r.smallV.baseV}。小さい V{r.V} は長いものが曲げられません（最長Lは確認中）</span>
        )}
        {r.ok && warn && <span className="caution">⚠ V{r.V}は、Z曲げの実績でシミュが甘く出た型です。最初の1本で確かめてください</span>}
        {r.ok && good && <span className="trust">● V{r.V}は、Z曲げの実績と合っている型です</span>}
        {href && <span className="see">▶ この型でシミュレーションを見る</span>}
      </div>
    </Box>
  );
}

function App() {
  const [shape, setShape] = useState('U');
  const [dims, setDims] = useState(SHAPES.U.def);
  const [focus, setFocus] = useState(null);   // いま入力している寸法（図で色を変える）
  const [mat, setMat] = useState('鉄');
  const [t, setT] = useState(4.5);
  const [nobiText, setNobiText] = useState('');
  const [Ltext, setLtext] = useState(String(L_DEF));   // 曲げ長さ（奥行き）。ダイ1本835mmに収まる長さを既定に
  const [result, setResult] = useState(null);
  const [others, setOthers] = useState(null);
  const [busy, setBusy] = useState('');

  const S = SHAPES[shape];
  const base = useMemo(() => pickDie(mat, t), [mat, t]);
  const nobiIn = nobiText.trim() === '' ? null : Number(nobiText);

  const pickShape = (k) => { setShape(k); setDims(SHAPES[k].def); setFocus(null); setResult(null); setOthers(null); };
  const Lnum = Number(Ltext);
  const input = () => ({ shape, outer: dims.map(Number), t: Number(t), mat, L: Number.isFinite(Lnum) ? Lnum : 0,
    nobiIn: Number.isFinite(nobiIn) ? nobiIn : null });
  const now = { shape, dims, mat, t, L: Ltext };

  const run = () => {
    setOthers(null);
    if (!base || !base.sel) { setResult({ ok: false, label: '—', why: 'この板厚の基準金型が折り曲げ表にありません' }); return; }
    setBusy('判定しています…');
    setTimeout(() => { setResult(judge({ ...input(), sel: base.sel })); setBusy(''); }, 20);
  };

  // 使えるほかの金型を全部試す（1型ずつ画面に出す）
  const runOthers = () => {
    const all = [...MACHINE_DIES.hg2203.main, ...MACHINE_DIES.hd3504nt.main].filter((s) => s !== (base && base.sel));
    const out = [];
    setOthers([]);
    const step = (i) => {
      if (i >= all.length) { setBusy(''); return; }
      setBusy(`ほかの金型を調べています… ${i + 1}/${all.length}`);
      setTimeout(() => {
        const r = judge({ ...input(), sel: all[i], nobiIn: null });
        out.push(r);
        setOthers([...out].sort((a, b) => (b.ok - a.ok) || (a.V - b.V)));
        step(i + 1);
      }, 10);
    };
    step(0);
  };

  return (
    <div className="wrap">
      <header>
        <h1>曲がるか かんたん判定</h1>
        <p>形と寸法を入れて「判定する」を押すだけ。曲げ順と突き当ての向きは自動で探します。</p>
      </header>

      <section className="card">
        <div className="step">① 形</div>
        <div className="shapes">
          {Object.entries(SHAPES).map(([k, s]) => (
            <button key={k} className={`shape ${shape === k ? 'on' : ''}`} onClick={() => pickShape(k)}>
              <ShapeIcon kind={k} /><span>{s.name}</span>
            </button>
          ))}
        </div>

        <div className="step">② 寸法（外寸 mm）</div>
        <DimFigure shape={shape} labels={S.labels} dims={dims} focus={focus} />
        <div className="dims">
          {S.labels.map((lb, i) => (
            <label key={lb} className={focus === i ? 'on' : ''}
              onMouseEnter={() => setFocus(i)} onMouseLeave={() => setFocus((k) => (k === i ? null : k))}>
              <span>{lb}</span>
              <input inputMode="decimal" value={dims[i]}
                onFocus={() => setFocus(i)} onBlur={() => setFocus((k) => (k === i ? null : k))}
                onChange={(e) => { const d = [...dims]; d[i] = e.target.value; setDims(d); setResult(null); setOthers(null); }} />
            </label>
          ))}
        </div>
        <div className="hint">図の寸法線が、いま入れている数字の場所です。すべて板の外側で測った寸法です。</div>

        <div className="step">③ 曲げ長さ L（曲げ線に沿った長さ・mm）</div>
        <div className="row">
          <label className="inl"><span>L</span>
            <input inputMode="decimal" value={Ltext}
              onChange={(e) => { setLtext(e.target.value); setResult(null); setOthers(null); }} />
          </label>
          <div className="hint" style={{ marginTop: 0 }}>
            ダイは1本 {DIE_UNIT_LEN}mm。まず {L_DEF}mm（1本に収まる長さ）を入れてあります。長いものは、ダイの台数と機械の長さで曲げられないことがあります。
          </div>
        </div>

        <div className="step">④ 材質と板厚</div>
        <div className="row">
          <div className="seg">
            {['鉄', '縞'].map((m) => (
              <button key={m} className={mat === m ? 'on' : ''} onClick={() => { setMat(m); setResult(null); setOthers(null); }}>{m}</button>
            ))}
          </div>
          <label className="inl"><span>板厚 t</span>
            <input inputMode="decimal" value={t} onChange={(e) => { setT(e.target.value); setResult(null); setOthers(null); }} />
          </label>
          <label className="inl"><span>片伸び</span>
            <input inputMode="decimal" placeholder="表から自動" value={nobiText} onChange={(e) => { setNobiText(e.target.value); setResult(null); }} />
          </label>
        </div>
        <div className="hint">
          金型：<b>{base && base.sel ? dieLabel(base.sel) : '該当なし'}</b>（折り曲げ表の基準金型{base && !base.exact ? `・t${base.tUsed}の行で代用` : ''}）
          。片伸びは表に無いときだけ入れてください（例：V20・t6 は実績 4.5）。
        </div>

        <button className="go" onClick={run} disabled={!!busy}>判定する</button>
        {busy && <div className="busy">{busy}</div>}
      </section>

      {result && (
        <section>
          <Result r={result} big now={now} />
          {!others && (
            <button className="more" onClick={runOthers} disabled={!!busy}>
              {result.ok ? 'ほかの金型でも曲がるか調べる' : '曲がる金型を探す'}
            </button>
          )}
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

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
