// Z曲げ・コの字 曲がるか判定（問い合わせ用）。
// シミュレーター本体とは別のアプリ。判定の計算だけ本体と同じものを使う（./judge.js）。
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import DATA from './data/zu-data.json';
import { judgeAll, zLimitA, uLimitH, seqText, RANK } from './judge.js';
import './zu.css';

const ROWS = DATA.rows;
const SHAPE = {
  Z: { name: 'Z曲げ', keys: ['A', 'S', 'B'], names: ['フランジA', '段差S', 'フランジB'], def: [50, 50, 50] },
  U: { name: 'コの字', keys: ['H1', 'W', 'H2'], names: ['立上りH1', '底W', '立上りH2'], def: [50, 100, 50] },
};
const GRADE = {
  'ok-act': { cls: 'ok', mark: '○', word: '曲がります', short: '○ 実績' },
  'ok-sim': { cls: 'ok', mark: '○', word: '曲がります', short: '○ 計算' },
  check: { cls: 'check', mark: '△', word: '確かめが必要', short: '△ 要確認' },
  ng: { cls: 'ng', mark: '✕', word: '曲がりません', short: '✕' },
};

// シミュレーター本体で、この形・この型を開くリンク。当たる工程・瞬間で止まって開く。
function simLink(shape, r, dims, mat) {
  const row = r.row;
  const dirs = shape === 'Z' ? [1, -1] : [1, 1];
  const seq = r.geo && r.geo.ok ? r.geo.seq
    : dirs.map((d, k) => ({ bend: k, mirror: false, valley: d < 0 }));
  const S = SHAPE[shape];
  const lines = [`Z・コの字判定から開きました：${S.name}　${mat} t${row.t}　${S.keys.map((k, i) => `${k}=${dims[i]}`).join('・')}（外寸）　${r.die}`];
  if (r.grade === 'ng' && r.geo && r.geo.ok) {
    lines.push(`判定：${r.why}。`);
    lines.push('※ この型は計算が実績より甘く出るため、絵では当たらなくても実績を優先しています。');
  } else if (r.grade === 'ng') {
    lines.push(`判定：${r.why}。当たる瞬間で止めています（橙の丸が当たる所）。「▶ 全工程再生」で動きも見られます。`);
  }
  const params = {
    t: row.t, matType: mat, inputMode: 'outer', outerSegs: dims, nobiOverride: null,
    bends: dirs.map((d) => ({ angle: 90, dir: d })),
    dieSel: row.sel, machineSel: row.machine === 'HG2203' ? 'hg2203' : 'hd3504nt', dieFlip: false,
    punchType: '904061', punchFlip: false, chukanSel: 'std', dieBase: true, seq,
  };
  return `../#open=${encodeURIComponent(JSON.stringify({ params, note: lines.join('\n') }))}`;
}

// 直し方を型ごとに出す。同じ直し方の型はまとめる（「V25・V20：段差Sを46mm以上に」）
function fixList(list) {
  const m = new Map();
  for (const r of list) if (r.fix) m.set(r.fix, [...(m.get(r.fix) || []), r.die]);
  return [...m].map(([fix, dies]) => ({ fix, dies: dies.join('・') }));
}

function Icon({ kind }) {
  const P = kind === 'Z' ? '6,18 28,18 28,42 56,42' : '10,12 10,44 54,44 54,12';
  return (
    <svg width="42" height="36" viewBox="0 0 62 54" aria-hidden="true">
      <polyline points={P} fill="none" stroke="currentColor" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// 形の図（寸法の取り方）。数字は入力に合わせて変わる
function Figure({ shape, dims }) {
  const [a, b, c] = dims;
  const dim = (x1, y1, x2, y2, txt, tx, ty, anchor = 'middle') => (
    <g>
      <line className="dim" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="1.5" markerStart="url(#ar)" markerEnd="url(#ar)" />
      <text x={tx} y={ty} textAnchor={anchor}>{txt}</text>
    </g>
  );
  return (
    <svg className="fig" viewBox="0 0 320 190" role="img" aria-label="寸法の取り方">
      <defs>
        <marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" opacity=".55" />
        </marker>
      </defs>
      {shape === 'Z' ? (
        <>
          <polyline className="plate" points="40,60 150,60 150,140 270,140" fill="none" strokeWidth="7" strokeLinejoin="miter" />
          {dim(36, 38, 154, 38, `A ${a}`, 95, 30)}
          {dim(176, 56, 176, 144, `S ${b}`, 184, 105, 'start')}
          {dim(146, 166, 274, 166, `B ${c}`, 210, 186)}
          <text className="lab" x="40" y="96">外寸で入れる</text>
        </>
      ) : (
        <>
          <polyline className="plate" points="70,40 70,150 250,150 250,40" fill="none" strokeWidth="7" strokeLinejoin="miter" />
          {dim(44, 36, 44, 154, `H1 ${a}`, 38, 100, 'end')}
          {dim(66, 174, 254, 174, `W ${b}`, 160, 170)}
          {dim(276, 36, 276, 154, `H2 ${c}`, 282, 100, 'start')}
          <text className="lab" x="160" y="100" textAnchor="middle">外寸で入れる</text>
        </>
      )}
    </svg>
  );
}

// 限界のグラフ。Z：段差S（横）と短いほうのフランジ上限（縦）／コの字：底W（横）と立上り上限（縦）
function LimitChart({ shape, row, x, y, grade }) {
  const wrap = useRef(null);
  const [hov, setHov] = useState(null);
  const W = 600, H = 300, L = 52, R = 16, T = 16, B = 40;
  const pts = shape === 'Z' ? (row.zCurve || []).map((p) => ({ x: p.S, y: p.A })) : (row.uCurve || []).map((p) => ({ x: p.W, y: p.H }));
  const xMax = shape === 'Z' ? Math.max(150, Math.ceil((x + 20) / 50) * 50) : Math.max(300, Math.ceil((x + 20) / 50) * 50);
  // 縦の目盛りは、いまの寸法と、見えている範囲の上限カーブが入る高さ（300まで。上限なしは上端に張り付く）
  const curveTop = Math.max(0, ...pts.filter((p) => p.x <= xMax && p.y != null && p.y < 399).map((p) => p.y));
  const yMax = Math.min(300, Math.max(150, Math.ceil((Math.max(y, curveTop) + 20) / 50) * 50));
  const sx = (v) => L + (v / xMax) * (W - L - R);
  const sy = (v) => T + (1 - Math.min(v, yMax) / yMax) * (H - T - B);
  const act = shape === 'Z' && row.zAct;
  // 実績があれば実績の範囲、なければ計算カーブ
  const segs = [];
  let cur = [];
  for (const p of pts) {
    if (p.x > xMax) break;
    if (p.y == null) { if (cur.length) segs.push(cur); cur = []; continue; }
    cur.push([sx(p.x), sy(Math.min(p.y, yMax))]);
  }
  if (cur.length) segs.push(cur);
  const zone = segs.map((s) => `M${s[0][0]},${sy(0)} ` + s.map((q) => `L${q[0]},${q[1]}`).join(' ') + ` L${s[s.length - 1][0]},${sy(0)} Z`);
  const actZone = act ? (() => {
    const s1 = act.S, a1 = act.A, far = act.far;
    const p = [[sx(s1), sy(0)], [sx(s1), sy(a1)]];
    if (far) { p.push([sx(far.S), sy(a1)], [sx(far.S), sy(far.A)], [sx(xMax), sy(far.A)]); } else p.push([sx(xMax), sy(a1)]);
    p.push([sx(xMax), sy(0)]);
    return 'M' + p.map((q) => q.join(',')).join(' L') + ' Z';
  })() : null;
  const xt = []; for (let v = 0; v <= xMax; v += 50) xt.push(v);
  const yt = []; for (let v = 0; v <= yMax; v += 50) yt.push(v);
  const col = grade === 'ng' ? 'var(--ng)' : grade === 'check' ? 'var(--chk)' : 'var(--ok)';
  const onMove = (e) => {
    const r = wrap.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const xv = ((px - L) / (W - L - R)) * xMax;
    if (xv < 0 || xv > xMax) { setHov(null); return; }
    const yv = shape === 'Z' ? zLimitA(row, xv) : uLimitH(row, xv);
    setHov({ px: (px / W) * r.width, xv, yv });
  };
  const xName = shape === 'Z' ? '段差S' : '底W', yName = shape === 'Z' ? '短いほうのフランジ' : '低いほうの立上り';
  return (
    <div style={{ position: 'relative' }} ref={wrap} onMouseMove={onMove} onMouseLeave={() => setHov(null)}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${xName}と${yName}の上限`}>
        {yt.map((v) => <line key={v} className="gl" x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} />)}
        {yt.map((v) => <text key={'y' + v} x={L - 8} y={sy(v) + 4} textAnchor="end">{v}</text>)}
        {xt.map((v) => <text key={'x' + v} x={sx(v)} y={H - B + 18} textAnchor="middle">{v}</text>)}
        <line className="ax" x1={L} x2={W - R} y1={sy(0)} y2={sy(0)} />
        <text className="tt" x={W - R} y={H - 4} textAnchor="end">{xName}（mm）→</text>
        <text className="tt" x={L} y={T - 2} textAnchor="start" dy="10" dx="6">↑ {yName}（mm）</text>
        {actZone ? <path d={actZone} fill="var(--okzone)" /> : zone.map((d, i) => <path key={i} d={d} fill="var(--okzone)" />)}
        {segs.map((s, i) => <polyline key={i} points={s.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" />)}
        {act && (
          <>
            {[{ x: act.S, y: act.A }, ...(act.far ? [act.far] : [])].map((p, i) => (
              <circle key={i} cx={sx(p.x ?? p.S)} cy={sy(p.y ?? p.A)} r="5.5" fill="var(--s2)" stroke="var(--card)" strokeWidth="2" />
            ))}
          </>
        )}
        {(() => {
          const p = pts.find((q) => q.x <= xMax && q.y != null && q.y >= 399);
          return p ? <text x={sx(p.x) + 4} y={sy(yMax) + 14} style={{ fill: 'var(--sub)' }}>ここから上限なし →</text> : null;
        })()}
        {hov && <line x1={sx(hov.xv)} x2={sx(hov.xv)} y1={T} y2={sy(0)} stroke="var(--muted)" strokeDasharray="3 3" />}
        <circle cx={sx(Math.min(x, xMax))} cy={sy(Math.min(y, yMax))} r="8" fill={col} stroke="var(--card)" strokeWidth="2.5" />
        <text x={sx(Math.min(x, xMax)) + 12} y={sy(Math.min(y, yMax)) + 5} style={{ fill: 'var(--ink)', fontWeight: 700, fontSize: 14 }}>
          {GRADE[grade].mark} いまの寸法
        </text>
      </svg>
      {hov && (
        <div className="tip" style={{ left: Math.min(hov.px + 10, (wrap.current?.clientWidth || 300) - 170), top: 8 }}>
          {xName} {hov.xv.toFixed(0)} → {yName} {hov.yv == null ? '曲げられない' : Number.isFinite(hov.yv) ? `${hov.yv.toFixed(0)}mm まで（計算）` : '上限なし（計算）'}
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: 'var(--s1)' }} />計算の上限（これより下なら当たらない）</span>
        {act && <span><i className="dot" style={{ background: 'var(--s2)' }} />実績（ここまで曲げた）</span>}
        <span><i style={{ background: 'var(--okzone)', height: 10 }} />曲がる範囲{act ? '（実績）' : ''}</span>
      </div>
    </div>
  );
}

function App() {
  const [shape, setShape] = useState(() => (location.hash === '#u' ? 'U' : 'Z'));
  const [dimsBy, setDimsBy] = useState({ Z: SHAPE.Z.def.map(String), U: SHAPE.U.def.map(String) });
  const [mat, setMat] = useState('鉄');
  const [t, setT] = useState(4.5);
  const [pickV, setPickV] = useState(null);
  const [copied, setCopied] = useState(false);
  const S = SHAPE[shape];
  const dimsTxt = dimsBy[shape];
  const dims = dimsTxt.map(Number);
  const valid = dims.every((v) => Number.isFinite(v) && v > 0);

  const tList = useMemo(() => [...new Set(ROWS.filter((r) => r.mat === mat).map((r) => r.t))].sort((a, b) => a - b), [mat]);
  useEffect(() => { if (!tList.includes(t)) setT(tList.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), tList[0])); }, [tList]);
  useEffect(() => { history.replaceState(null, '', shape === 'U' ? '#u' : '#z'); }, [shape]);

  // 入力が止まってから判定（干渉判定は少し重い）
  const [res, setRes] = useState(null);
  useEffect(() => {
    if (!valid) { setRes(null); return; }
    const id = setTimeout(() => setRes(judgeAll(ROWS, shape, mat, t, dims)), 200);
    return () => clearTimeout(id);
  }, [shape, mat, t, dimsTxt.join('|')]);
  useEffect(() => setPickV(null), [shape, mat, t]);

  const best = res && res.best;
  const shown = res && (res.list.find((r) => r.row.V === pickV) || best);
  const x = shape === 'Z' ? dims[1] : dims[1];
  const y = Math.min(dims[0], dims[2]);   // 先に曲げる、短いほう（低いほう）で見る

  const answer = useMemo(() => {
    if (!best) return '';
    const g = GRADE[best.grade];
    const d = S.keys.map((k, i) => `${k}=${dims[i]}`).join('・');
    const head = `${S.name}　${mat} t${t}　${d}（外寸）`;
    if (best.grade === 'ng') {
      const fixes = fixList(res.list).map((f) => `・${f.dies}：${f.fix}`);
      return `${head}\n→ 曲がりません。${best.why}。${fixes.length ? `\nこうすれば曲げられます\n${fixes.join('\n')}` : ''}`;
    }
    const src = best.grade === 'ok-act' ? '実績のある範囲です' : best.grade === 'ok-sim' ? '計算で確認しました' : '';
    return `${head}\n→ ${g.word}（${best.die}・${best.machine}）。${best.grade === 'check' ? `${best.why}。${best.fix ? `${best.fix}すれば確実です。` : ''}` : src}`;
  }, [best, shape, mat, t, dimsTxt.join('|')]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(answer); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* コピーできない環境 */ }
  };

  return (
    <div className="wrap">
      <header>
        <h1>Z曲げ・コの字 曲がるか判定</h1>
        <p>問い合わせの多い2つの形だけ。寸法と板厚を入れると、すぐに答えが出ます。</p>
      </header>

      <div className="tabs">
        {Object.entries(SHAPE).map(([k, s]) => (
          <button key={k} className={`tab ${shape === k ? 'on' : ''}`} onClick={() => setShape(k)}>
            <Icon kind={k} />{s.name}
          </button>
        ))}
      </div>

      <div className="grid2">
        <section className="card">
          <h2>① 寸法（外寸 mm）と板厚</h2>
          <Figure shape={shape} dims={dimsTxt} />
          <div className="dims">
            {S.keys.map((k, i) => (
              <label key={k} className="f"><span>{S.names[i]}</span>
                <input inputMode="decimal" value={dimsTxt[i]}
                  onChange={(e) => { const d = [...dimsTxt]; d[i] = e.target.value; setDimsBy({ ...dimsBy, [shape]: d }); }} />
              </label>
            ))}
          </div>
          <div className="row">
            <div className="seg">
              {['鉄', '縞'].map((m) => <button key={m} className={mat === m ? 'on' : ''} onClick={() => setMat(m)}>{m}</button>)}
            </div>
            <label className="f" style={{ width: 130 }}><span>板厚 t</span>
              <select value={t} onChange={(e) => setT(Number(e.target.value))}>
                {tList.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </label>
          </div>
          <div className="hint">板厚は、実際に使う型がある厚さだけ選べます。ボンデは鉄で見てください。角度は90°。</div>
        </section>

        <section>
          {!valid && <div className="card">寸法を数字で入れてください。</div>}
          {valid && !res && <div className="card">判定しています…</div>}
          {best && (
            <div className={`verdict ${GRADE[best.grade].cls}`}>
              <div className="v-head">
                <span className="v-mark">{GRADE[best.grade].mark}</span>
                <span className="v-word">{GRADE[best.grade].word}</span>
              </div>
              <div className="v-body">
                {best.grade !== 'ng' && <div>型：<b>{best.die}</b>（{best.machine}）<span className="tag">{best.src === '実績' ? '実績あり' : '計算のみ'}</span></div>}
                <div>{best.why}</div>
                {best.grade !== 'ng' && best.geo && best.geo.ok && <div className="hint">曲げ順：{seqText(best.geo.seq)}</div>}
              </div>
              {best.grade !== 'ng' && best.fix && <div className="v-fix">→ {best.fix}すれば確実です</div>}
              {best.grade === 'ng' && res.list.some((r) => r.fix) && (
                <div className="v-fix">
                  こうすれば曲げられます
                  {fixList(res.list).map((f) => <div key={f.dies}>・{f.dies}：{f.fix}</div>)}
                </div>
              )}
              <a className={`simbtn ${best.grade === 'ng' ? 'strong' : ''}`} href={simLink(shape, best, dims, mat)} target="_blank" rel="noreferrer">
                {best.grade === 'ng' ? `▶ どこが当たるか、シミュレーションで見る（${best.die}）` : `▶ シミュレーションで見る（${best.die}）`}
              </a>
            </div>
          )}

          {res && res.list.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h2>② 型ごとの結果（{mat} t{t}）</h2>
              <table className="dies">
                <thead><tr><th>型</th><th>機械</th><th>判定</th><th>理由</th><th></th></tr></thead>
                <tbody>
                  {res.list.map((r) => (
                    <tr key={r.row.V} className={shown && shown.row.V === r.row.V ? 'sel' : ''} onClick={() => setPickV(r.row.V)}>
                      <td><b>{r.die}</b>{r.row.V === res.baseV && <span className="tag">基準</span>}</td>
                      <td>{r.machine}</td>
                      <td className={`g ${r.grade}`}>{GRADE[r.grade].short}</td>
                      <td>{r.why}</td>
                      <td><a className="see" href={simLink(shape, r, dims, mat)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>見る</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="hint">行を押すと、下のグラフがその型に変わります。</div>
            </div>
          )}
        </section>
      </div>

      {shown && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2>③ どこまで曲げられるか（{shown.die}・{mat} t{t}）</h2>
          <LimitChart shape={shape} row={shown.row} x={x} y={y} grade={shown.grade} />
          <div className="hint">
            {shape === 'Z'
              ? '短いほうのフランジを先に曲げる想定。長いほうのフランジは上限なし（最小フランジ以上）。'
              : '低いほうの立上りを先に曲げる想定（先に立てた側が上型に当たる）。コの字は実績がまだ無く、計算の値です。'}
          </div>
        </section>
      )}

      {best && (
        <section className="card">
          <h2>④ 回答文（コピーしてそのまま使えます）</h2>
          <textarea className="answer" readOnly value={answer} rows={answer.split('\n').length + 1} />
          <button className="copy" onClick={copy}>{copied ? 'コピーしました' : 'コピー'}</button>
        </section>
      )}

      <footer>
        判定の順番：①折り曲げ表の最小フランジ → ②干渉の計算（ヤゲン904061・V.dxf で確認した土台） → ③Z曲げは実績を優先。
        データ作成 {DATA.made}。
        <div style={{ marginTop: 6 }}>
          <a href="../">シミュレーター（詳しく見る）</a>
          <a href="../check.html">ほかの形の判定</a>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
