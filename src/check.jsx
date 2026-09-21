// 曲がるか かんたん判定。
// 形と寸法（外寸）と板厚を入れると、シミュレーターと同じ干渉判定で ○/✕ を出す。
// 曲げ順・突き当て（左右）・裏返しは自動で探す。✕ のときは理由（どこに当たるか）と、
// 通る別の金型を出す。
import React, { useState, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import {
  pickDie, resolveDie, lookupTable, NOBI_TABLE, MINOUT_TABLE, searchSequences, reachCheck,
  computeChain, toolsFor, minGap, shoulderReach, strokeState, MACHINE_DIES, MACHINE_LIB, dieLabel,
} from '../bending-simulator.jsx';
import './check.css';

const PUNCH = '904061';
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

const machineOfSel = (sel) => Object.keys(MACHINE_DIES).find((m) => MACHINE_DIES[m].main.includes(sel));
const vOf = (info) => Math.round(info.vHalf * 2);

// 1つの金型で判定する
function judge({ shape, outer, t, mat, sel, nobiIn }) {
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

const seqText = (seq) => seq.map((s) => `曲げ${s.bend + 1}${s.mirror ? '（突き当て反対側）' : ''}${s.valley ? '（裏返し）' : ''}`).join(' → ');

function Result({ r, big }) {
  const warn = LENIENT[r.V], good = MATCHED[r.V];
  return (
    <div className={`res ${r.ok ? 'ok' : 'ng'} ${big ? 'big' : ''}`}>
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
        {r.ok && warn && <span className="caution">⚠ V{r.V}は、Z曲げの実績でシミュが甘く出た型です。最初の1本で確かめてください</span>}
        {r.ok && good && <span className="trust">● V{r.V}は、Z曲げの実績と合っている型です</span>}
      </div>
    </div>
  );
}

function App() {
  const [shape, setShape] = useState('U');
  const [dims, setDims] = useState(SHAPES.U.def);
  const [mat, setMat] = useState('鉄');
  const [t, setT] = useState(4.5);
  const [nobiText, setNobiText] = useState('');
  const [result, setResult] = useState(null);
  const [others, setOthers] = useState(null);
  const [busy, setBusy] = useState('');

  const S = SHAPES[shape];
  const base = useMemo(() => pickDie(mat, t), [mat, t]);
  const nobiIn = nobiText.trim() === '' ? null : Number(nobiText);

  const pickShape = (k) => { setShape(k); setDims(SHAPES[k].def); setResult(null); setOthers(null); };
  const input = () => ({ shape, outer: dims.map(Number), t: Number(t), mat, nobiIn: Number.isFinite(nobiIn) ? nobiIn : null });

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
        <div className="dims">
          {S.labels.map((lb, i) => (
            <label key={lb}>
              <span>{lb}</span>
              <input inputMode="decimal" value={dims[i]}
                onChange={(e) => { const d = [...dims]; d[i] = e.target.value; setDims(d); setResult(null); setOthers(null); }} />
            </label>
          ))}
        </div>
        <div className="hint">左から順に、{S.labels.join(' → ')}。すべて板の外側で測った寸法です。</div>

        <div className="step">③ 材質と板厚</div>
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
          <Result r={result} big />
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
            {others.filter((r) => !r.skip).map((r) => <Result key={r.sel} r={r} />)}
          </div>
          {others.some((r) => r.skip) && (
            <div className="hint">この板厚を折り曲げ表で使わない型は外しました：{[...new Set(others.filter((r) => r.skip).map((r) => r.V))].map((v) => `V${v}`).join('・')}</div>
          )}
        </section>
      )}

      <footer>
        判定はシミュレーター（ヤゲン904061・中間板標準・V.dxf で確認した土台）と同じ計算です。曲げ角度は90°で見ています。
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
