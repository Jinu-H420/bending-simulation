// Z曲げ・コの字 曲がるか判定（問い合わせ用）。
// シミュレーター本体とは別のアプリ。判定の計算だけ本体と同じものを使う（./judge.js）。
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import DATA from './data/zu-data.json';
import { METHOD_JA, judgeAll, zLimitA, uLimitH, uKunoH, uNakaH, seqText, RANK, exactLimit, actLimit, nakaOshi, nakaPose, PUNCH, Z_ACT_ON } from './judge.js';
import { SUTE_MIN_INNER } from '../bending-simulator.jsx';
import { folderSupported, loadFolder, pickFolder, permission, pull as folderPull, push as folderPush } from '../src/cloud.js';
import './zu.css';

const ROWS = DATA.rows;
const SHAPE = {
  Z: { name: 'Z曲げ', keys: ['A', 'S', 'B'], names: ['フランジA', '段差S', 'フランジB'], def: [50, 50, 50] },
  U: { name: 'コの字', keys: ['H1', 'W', 'H2'], names: ['立上りH1', '底W', '立上りH2'], def: [50, 100, 50] },
};
const GRADE = {
  'ok-act': { cls: 'ok', mark: '○', word: '曲がります', short: '○ 実績' },
  'ok-sim': { cls: 'ok', mark: '○', word: '曲がります', short: '○ 計算' },
  alt: { cls: 'ok', mark: '○', word: 'ヤゲンを替えれば曲がります', short: '○ ヤゲン替え' },
  // alt の見出しは使うヤゲンで変える（くの字なら L の上限も見出しに入れる）→ look()
  naka: { cls: 'naka', mark: '○', word: '中押しでしか曲がりません', short: '中押しのみ' },
  check: { cls: 'check', mark: '△', word: '計算では曲がります', short: '△ 確認' },
  ng: { cls: 'ng', mark: '✕', word: '曲がりません', short: '✕' },
};

// シミュレーター本体で、この形・この型を開くリンク。当たる工程・瞬間で止まって開く。
function simLink(shape, r, dims, mat, L) {
  const row = r.row;
  const dirs = shape === 'Z' ? [1, -1] : [1, 1];
  const seq = r.geo && r.geo.ok ? r.geo.seq
    : dirs.map((d, k) => ({ bend: k, mirror: false, valley: d < 0 }));
  const S = SHAPE[shape];
  const lines = [`Z・コの字判定から開きました：${S.name}　${mat} t${row.t}　${S.keys.map((k, i) => `${k}=${dims[i]}`).join('・')}（外寸）　${r.die}`];
  if (r.grade === 'ng' && r.geo && r.geo.ok) {
    lines.push(`判定：${r.why}。`);
    lines.push('※ この型は計算が実績より甘く出るため、絵では当たらなくても実績を優先しています。');
  } else if (r.src === '中押し') {
    lines.push(`判定：${r.why}。中押し（への字 → 両サイド90° → 中押し）の工程で開いています。「▶ 全工程再生」で動きが見られます。`);
  } else if (r.grade === 'ng') {
    lines.push(`判定：${r.why}。当たる瞬間で止めています（橙の丸が当たる所）。「▶ 全工程再生」で動きも見られます。`);
  }
  const params = {
    t: row.t, matType: mat, inputMode: 'outer', outerSegs: dims, nobiOverride: null, bendLen: L,
    bends: dirs.map((d) => ({ angle: 90, dir: d })),
    dieSel: row.sel, machineSel: row.machine === 'HG2203' ? 'hg2203' : 'hd3504nt', dieFlip: false,
    punchType: r.punch || '904061', punchFlip: !!r.punchFlip, chukanSel: 'std', dieBase: true, seq,
    nakaOn: r.src === '中押し',   // 中押しの判定なら、中押しの工程で開く
    nakaAngle: (r.naka && r.naka.angle) || 20,
  };
  return `../#open=${encodeURIComponent(JSON.stringify({ params, note: lines.join('\n') }))}`;
}

// 判定の枠の見た目。中押しで曲がるもの（△ を含む）は「中押しでしか曲がらない」を一番に見せる。
// △ は「計算では曲がるが、曲げ屋さんの確認が要る」なので、控えめに札を添えるだけにする
const isNaka = (r) => r.src === '中押し' && r.grade !== 'ng';
const isAlt = (r) => r.grade === 'alt' && !!r.punch;
// くの字の特殊ヤゲンのときは「くの字特殊ヤゲン（L ○mm以内）なら曲がります」、普通のヤゲンなら名前を出す
const altWord = (r) => (r.special ? `くの字特殊ヤゲン（L ${r.special.win}mm以内）なら曲がります` : `ヤゲン ${r.punch} なら曲がります`);
const altShort = (r) => (r.special ? '○ くの字' : '○ ヤゲン替え');
function look(r) {
  if (isNaka(r)) return { cls: 'naka', mark: '○', word: GRADE.naka.word, ask: r.grade === 'check' };
  const g = GRADE[r.grade];
  // くの字＝グラフのくの字と同じオレンジ、ほかのヤゲンに替えるとき＝青。普通の○（緑）と分ける
  const cls = isAlt(r) ? (r.special ? 'kuno' : 'punch') : g.cls;
  return { cls, mark: g.mark, word: isAlt(r) ? altWord(r) : g.word, ask: r.grade === 'check' };
}

// 曲げ方の順番（普通 → くの字 → 中押し）ごとに ○✕ を並べ、どれでしか曲がらないかを一目で見せる
function MethodLadder({ r, L }) {
  const kOk = (r.kuno || []).filter((k) => k.ok);
  const kWin = kOk.length ? Math.max(...kOk.map((k) => k.win)) : null;
  const alt = isAlt(r);
  const cells = [
    { name: '普通に曲げる', mark: '✕', note: r.hit ? `${r.hit}に当たる` : '型に当たる' },
    alt && !r.special
      ? { name: `ヤゲン ${r.punch}`, mark: '○', ok: true, note: 'ヤゲンを替える' }
      : { name: 'くの字特殊ヤゲン', mark: alt ? '○' : '✕', ok: alt,
        note: alt ? `L ${r.special.win}mm 以内（いま ${L}mm）`
          : kWin != null ? `L ${kWin}mm 以内なら可（いま ${L}mm）` : '形が当たる' },
    alt
      ? { name: '中押し', mark: '—', skip: true, note: 'ここまでしなくてよい' }
      : { name: '中押し', mark: '○', ok: true, note: r.naka && r.naka.angle ? `への字 ${r.naka.angle}°以上` : '' },
  ];
  return (
    <div className="mlad">
      {cells.map((c) => (
        <div key={c.name} className={`ml-cell ${c.ok ? 'yes' : c.skip ? 'skip' : 'no'}`}>
          <div className="ml-name">{c.name}</div>
          <div className="ml-mark">{c.mark}</div>
          <div className="ml-note">{c.note}</div>
        </div>
      ))}
    </div>
  );
}

// 中押しの3工程を小さな絵で並べる。普通の曲げ（2回）より1回多いことも見せる
function NakaSteps({ angle, inner, pending }) {
  const pic = {
    1: <polyline points="12,50 60,36 108,50" />,
    2: <polyline points="20,10 20,52 60,40 100,52 100,10" />,
    3: (<>
      <polyline points="20,10 20,52 100,52 100,10" />
      <path className="ns-punch" d="M60 6 V30 M52 22 L60 32 L68 22" />
    </>),
  };
  const steps = [
    [1, `への字 ${angle}°${angle ? '以上' : ''}`, '底の真ん中を軽く曲げる'],
    [2, '両サイドを90°', '立上りを2か所'],
    [3, '中押しで平らに', '底の山を押して戻す'],
  ];
  return (
    <div className="naka-box">
      <div className="ns-row">
        {steps.map(([k, head, sub], i) => (
          <div key={k} className="ns-step">
            <svg viewBox="0 0 120 62" aria-hidden="true">{pic[k]}</svg>
            <div className="ns-head"><span className="ns-no">{k}</span>{head}</div>
            <div className="ns-sub">{sub}</div>
            {i < steps.length - 1 && <span className="ns-arrow" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>
      <div className="ns-chips">
        <span>曲げ回数 <b>4回</b>（普通は2回）</span>
        {inner != null && <span>底の内-内 <b>{inner}mm</b>{pending ? '（120mm未満は現場で未確認）' : ''}</span>}
        <span>最終手段：くの字が使えるならそちら</span>
      </div>
    </div>
  );
}

// くの字ヤゲンの L 上限を1行で。「くの字165：L 200mm 以内 ○（いま L=250 ✕）」
function kunoText(kuno, L) {
  const ok = (kuno || []).filter((k) => k.ok);
  if (!ok.length) return null;
  return ok.map((k) => `${k.punch.replace('特殊 ', '')}：L ${k.win}mm 以内${L > 0 ? (L <= k.win ? '（いまのLで○）' : `（いまのL ${L}mm は超える）`) : ''}`).join('　／　');
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
function Figure({ shape, dims, L }) {
  const [a, b, c] = dims;
  const dim = (x1, y1, x2, y2, txt, tx, ty, anchor = 'middle') => (
    <g>
      <line className="dim" x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="1.5" markerStart="url(#ar)" markerEnd="url(#ar)" />
      <text x={tx} y={ty} textAnchor={anchor}>{txt}</text>
    </g>
  );
  return (
    <svg className="fig" viewBox="0 -20 330 210" role="img" aria-label="寸法の取り方">
      <defs>
        <marker id="ar" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="currentColor" opacity=".55" />
        </marker>
      </defs>
      {(() => {
        // 奥行き（L方向）を斜めに描いて、立体に見せる
        const P = shape === 'Z' ? [[40, 60], [150, 60], [150, 140], [270, 140]] : [[70, 40], [70, 150], [250, 150], [250, 40]];
        const dx = 30, dy = -22;
        const back = P.map(([x, y]) => `${x + dx},${y + dy}`).join(' ');
        const e = P[P.length - 1];
        return (
          <g className="depth">
            <polyline points={back} fill="none" strokeWidth="2" />
            {P.map(([x, y], i) => <line key={i} x1={x} y1={y} x2={x + dx} y2={y + dy} strokeWidth="2" />)}
            <text className="lab" x={e[0] + dx / 2 + 8} y={e[1] + dy / 2 + 2}>L {L}</text>
          </g>
        );
      })()}
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
// コの字の3つの曲げ方の上限カーブ（底Wごと）。中押しは押し切った瞬間に上型が入る高さ
const W_GRID = []; for (let w = 20; w <= 300; w += 10) W_GRID.push(w);
const toY = (v) => (v == null ? null : v === Infinity ? 400 : v);
function uCurves(row) {
  return {
    kuno: (row.uKuno || []).map((p) => ({ x: p.W, y: p.H })),
    naka: W_GRID.map((w) => ({ x: w, y: toY(uNakaH(row, w)) })),
  };
}
function LimitChart({ shape, row, x, y, grade }) {
  const wrap = useRef(null);
  const [hov, setHov] = useState(null);
  const extra = useMemo(() => (shape === 'U' ? uCurves(row) : null), [shape, row]);
  const W = 600, H = 300, L = 52, R = 16, T = 16, B = 40;
  const pts = shape === 'Z' ? (row.zCurve || []).map((p) => ({ x: p.S, y: p.A })) : (row.uCurve || []).map((p) => ({ x: p.W, y: p.H }));
  const xMax = shape === 'Z' ? Math.max(150, Math.ceil((x + 20) / 50) * 50) : Math.max(300, Math.ceil((x + 20) / 50) * 50);
  // 縦の目盛りは、いまの寸法と、見えている範囲の上限カーブが入る高さ（300まで。上限なしは上端に張り付く）
  const allPts = extra ? [...pts, ...extra.kuno, ...extra.naka] : pts;
  const curveTop = Math.max(0, ...allPts.filter((p) => p.x <= xMax && p.y != null && p.y < 399).map((p) => p.y));
  const yMax = Math.min(300, Math.max(150, Math.ceil((Math.max(y, curveTop) + 20) / 50) * 50));
  const sx = (v) => L + (v / xMax) * (W - L - R);
  const sy = (v) => T + (1 - Math.min(v, yMax) / yMax) * (H - T - B);
  const act = shape === 'Z' && Z_ACT_ON && row.zAct;
  const actRef = shape === 'Z' && !Z_ACT_ON && row.zAct;   // 確認中のシートの値（判定には使わない）
  // 実績があれば実績の範囲、なければ計算カーブ
  const segs = [];
  let cur = [];
  for (const p of pts) {
    if (p.x > xMax) break;
    if (p.y == null) { if (cur.length) segs.push(cur); cur = []; continue; }
    cur.push([sx(p.x), sy(Math.min(p.y, yMax))]);
  }
  if (cur.length) segs.push(cur);
  // 線を途切れ（曲げられない所）で分けて描く
  const lineSegs = (ps) => {
    const out = []; let c = [];
    for (const p of ps) {
      if (p.x > xMax) break;
      if (p.y == null) { if (c.length) out.push(c); c = []; continue; }
      c.push([sx(p.x), sy(Math.min(p.y, yMax))]);
    }
    if (c.length) out.push(c);
    return out;
  };
  const kunoSegs = extra ? lineSegs(extra.kuno) : [];
  const nakaSegs = extra ? lineSegs(extra.naka) : [];
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
    setHov({ px: (px / W) * r.width, xv, yv, kv: shape === 'U' ? uKunoH(row, xv) : null, nv: shape === 'U' ? uNakaH(row, xv) : null });
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
        {nakaSegs.map((s, i) => <polyline key={'n' + i} points={s.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--s3)" strokeWidth="2" strokeDasharray="7 4" strokeLinejoin="round" />)}
        {kunoSegs.map((s, i) => <polyline key={'k' + i} points={s.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--s2)" strokeWidth="2" strokeLinejoin="round" />)}
        {segs.map((s, i) => <polyline key={i} points={s.map((q) => q.join(',')).join(' ')} fill="none" stroke="var(--s1)" strokeWidth="2.5" strokeLinejoin="round" />)}
        {/* 線の名前を右端に（色だけに頼らない） */}
        {/* 線の名前は、その線のいちばん高い所に付ける（線が重なる右端だと名前も重なるため） */}
        {(() => {
          // 普通は右端に。くの字・中押しは「普通の線からいちばん上に離れた所」に付ける（右で線が重なっても名前が重ならない）
          const labs = [];
          const lastSeg = segs.length ? segs[segs.length - 1] : null;
          if (lastSeg) { const q = lastSeg[lastSeg.length - 1]; labs.push({ name: '普通', x: q[0], y: q[1] }); }
          if (extra) {
            [[extra.kuno, 'くの字（L200まで）'], [extra.naka, '中押し']].forEach(([ps, name]) => {
              let best = null;
              for (const p of ps) {
                if (p.y == null || p.x > xMax) continue;
                const nv = uLimitH(row, p.x);
                const base = nv == null ? 0 : Math.min(Number.isFinite(nv) ? nv : 400, yMax);
                const d = Math.min(p.y, yMax) - base;
                if (!best || d > best.d + 0.5) best = { d, x: sx(p.x), y: sy(Math.min(p.y, yMax)) };
              }
              if (best) labs.push({ name, x: best.x, y: best.y });
            });
          }
          return labs.map((lb) => {
            const anchor = lb.x > W * 0.6 ? 'end' : 'start';
            return <text key={lb.name} x={lb.x + (anchor === 'end' ? -4 : 6)} y={lb.y - 7} textAnchor={anchor} style={{ fill: 'var(--sub)', fontWeight: 700 }}>{lb.name}</text>;
          });
        })()}
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
        {actRef && [{ x: actRef.S, y: actRef.A }, ...(actRef.far ? [{ x: actRef.far.S, y: actRef.far.A }] : [])].map((p, i) => (
          <circle key={'r' + i} cx={sx(p.x)} cy={sy(p.y)} r="5" fill="none" stroke="var(--muted)" strokeWidth="2" />
        ))}
        {hov && <line x1={sx(hov.xv)} x2={sx(hov.xv)} y1={T} y2={sy(0)} stroke="var(--muted)" strokeDasharray="3 3" />}
        {/* いまの寸法から縦・横に点線。横線がカーブの下にある所なら曲がる */}
        <line x1={L} x2={W - R} y1={sy(Math.min(y, yMax))} y2={sy(Math.min(y, yMax))} stroke={col} strokeDasharray="5 4" strokeWidth="1.5" opacity=".8" />
        <line x1={sx(Math.min(x, xMax))} x2={sx(Math.min(x, xMax))} y1={sy(0)} y2={T} stroke="var(--muted)" strokeDasharray="2 4" strokeWidth="1" />
        <circle cx={sx(Math.min(x, xMax))} cy={sy(Math.min(y, yMax))} r="8" fill={col} stroke="var(--card)" strokeWidth="2.5" />
        <text x={sx(Math.min(x, xMax)) + 12} y={sy(Math.min(y, yMax)) + 5} style={{ fill: 'var(--ink)', fontWeight: 700, fontSize: 14 }}>
          {GRADE[grade].mark} いまの寸法
        </text>
      </svg>
      {hov && (
        <div className="tip" style={{ left: Math.min(hov.px + 10, (wrap.current?.clientWidth || 300) - 170), top: 8 }}>
          {xName} {hov.xv.toFixed(0)} → {yName} {hov.yv == null ? '曲げられない' : Number.isFinite(hov.yv) ? `${hov.yv.toFixed(0)}mm まで（計算）` : '上限なし（計算）'}
          {shape === 'U' && <><br />くの字 {limTxt(hov.kv == null ? null : Number.isFinite(hov.kv) && hov.kv < 399 ? Math.floor(hov.kv) : Infinity)}　／　中押し {limTxt(hov.nv == null ? null : Number.isFinite(hov.nv) ? Math.floor(hov.nv) : Infinity)}</>}
        </div>
      )}
      <div className="legend">
        <span><i style={{ background: 'var(--s1)' }} />{shape === 'U' ? '普通に曲げる' : '計算の上限'}（これより下なら当たらない）</span>
        {shape === 'U' && <span><i style={{ background: 'var(--s2)' }} />くの字ヤゲン（L 200mm まで）</span>}
        {shape === 'U' && <span><i style={{ background: 'var(--s3)' }} />中押し（最終手段）</span>}
        {act && <span><i className="dot" style={{ background: 'var(--s2)' }} />実績（ここまで曲げた）</span>}
        {actRef && <span><i className="dot" style={{ background: 'none', border: '2px solid var(--muted)' }} />シートの実績（確認中・判定には使わない）</span>}
        <span><i style={{ background: 'var(--okzone)', height: 10 }} />曲がる範囲{act ? '（実績）' : ''}</span>
      </div>
    </div>
  );
}

// カーブ（計算）で、縦の値が y 以上になる横の範囲。「約 90〜110mm、約 220mm 以上」
function rangesOver(pts, y, lastX) {
  const out = [];
  let st = null, prev = null;
  for (const p of pts) {
    const ok = p.y != null && p.y >= y;
    if (ok && st == null) st = p.x;
    if (!ok && st != null) { out.push([st, prev]); st = null; }
    prev = p.x;
  }
  if (st != null) out.push([st, null]);
  return out.map(([a, b]) => (b == null || b >= lastX ? `約 ${a}mm 以上` : a === b ? `約 ${a}mm` : `約 ${a}〜${b}mm`));
}
const limTxt = (v) => (v == null ? '曲げられない' : v === Infinity ? '上限なし' : `${v}mm まで`);

// ③の上：いまの寸法での上限と、いまの寸法で曲げるための条件を、数字で言い切る
function LimitDetail({ shape, row, x, y, other }) {
  const [ex, setEx] = useState(undefined);   // undefined＝計算中
  useEffect(() => {
    setEx(undefined);
    const id = setTimeout(() => setEx(exactLimit(row, shape, x, other)), 30);
    return () => clearTimeout(id);
  }, [row, shape, x, other]);
  const Z = shape === 'Z';
  const pts = Z ? (row.zCurve || []).map((p) => ({ x: p.S, y: p.A })) : (row.uCurve || []).map((p) => ({ x: p.W, y: p.H }));
  const lastX = pts.length ? pts[pts.length - 1].x : 0;
  const xN = Z ? '段差S' : '底W', yN = Z ? '短いほうのフランジ' : '立上り';
  const act = Z ? actLimit(row, x) : null;

  // いまの y で曲げるための x の条件
  let need;
  if (Z && Z_ACT_ON && row.zAct) {
    const a = row.zAct;
    if (y <= a.A) need = { txt: `${xN} を ${a.S}mm 以上`, src: '実績' };
    else if (a.far && y <= a.far.A) need = { txt: `${xN} を ${a.far.S}mm 以上`, src: '実績' };
    else need = { txt: `実績では ${a.far ? a.far.A : a.A}mm まで。${yN}を短くする`, src: '実績' };
  } else {
    const r = rangesOver(pts, y, lastX);
    need = r.length ? { txt: `${xN} を ${r.join('、または ')}`, src: '計算・10mm刻み' } : { txt: `どの${xN}でも無理。${yN}を短くする`, src: '計算' };
  }
  return (
    <div className="ld">
      <div className="ld-box">
        <div className="ld-q">{xN} <b>{x}mm</b> のとき、{yN}は</div>
        {act ? (
          <>
            <div className="ld-a">{act.A == null ? act.why : `${act.A}mm まで`}<span className="tag">実績</span></div>
            <div className="ld-s">計算では {ex === undefined ? '…' : limTxt(ex)}（この型は計算が甘く出るので実績を使う）</div>
          </>
        ) : (
          <div className="ld-a">{ex === undefined ? '計算中…' : limTxt(ex)}<span className="tag">計算・1mm単位</span></div>
        )}
      </div>
      <div className="ld-box">
        <div className="ld-q">{yN} <b>{y}mm</b> で曲げるには</div>
        <div className="ld-a">{need.txt}<span className="tag">{need.src}</span></div>
      </div>
      {!Z && (() => {
        // 曲げ方ごとの、いまの底Wでの立上り上限。現場の順番：普通 → くの字 → 中押し（最終手段）
        const k = uKunoH(row, x), n = uNakaH(row, x);
        const kv = k == null ? null : k >= 399 ? Infinity : Math.floor(k);
        const nv = n == null ? null : Number.isFinite(n) ? Math.floor(n) : Infinity;
        const ok = (v) => v != null && (v === Infinity || y <= v);
        const inner = x - 2 * row.t;
        const rowsT = [
          ['普通に曲げる', ex === undefined ? undefined : ex, '904061'],
          ['くの字ヤゲン', kv, 'L 200mm まで（くの字165）・70mm まで（くの字100）'],
          ['中押し（最終手段）', nv, inner < SUTE_MIN_INNER ? `内-内 ${inner}mm。${SUTE_MIN_INNER}mm 未満は現場で未確認` : `内-内 ${inner}mm`],
        ];
        return (
          <div className="ld-naka">
            <b>曲げ方ごとの立上り上限（底W {x}mm）</b>
            <table className="kt">
              <thead><tr><th>曲げ方</th><th>立上り</th><th>いまの {y}mm</th><th>条件</th></tr></thead>
              <tbody>
                {rowsT.map(([name, v, cond]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td><b>{v === undefined ? '…' : limTxt(v)}</b></td>
                    <td className={v === undefined ? '' : ok(v) ? 'g ok-sim' : 'g ng'}>{v === undefined ? '' : ok(v) ? '○' : '✕'}</td>
                    <td className="cond">{cond}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}
    </div>
  );
}

// 中押しで押し切った瞬間の断面。上型がコの字の内側に入るかを見せる
function NakaFigure({ t, W, H1, H2, naka }) {
  const { tools, plate } = nakaPose(t, W, H1, H2);
  const top = Math.max(H1, H2) + 60;          // 立上りより少し上まで見せる
  const half = Math.max(W / 2 + 20, 80);
  const vb = `${-half} ${-top} ${half * 2} ${top + t + 20}`;
  const clip = (pts) => pts.map(([x, y]) => [x, Math.max(y, -top - 5)]);
  const hit = !naka.ok;
  return (
    <div className="naka-fig">
      <svg viewBox={vb} className="chart" style={{ maxHeight: 320 }} role="img" aria-label="中押しで押し切ったときの断面">
        {tools.map((tl, i) => (
          <polygon key={i} points={clip(tl.pts).map((q) => q.join(',')).join(' ')}
            fill={tl.name === 'ヤゲン' ? 'var(--s1)' : 'none'} fillOpacity=".15" stroke="var(--s1)" strokeWidth={Math.max(1, half / 150)} />
        ))}
        <polygon points={plate.map((q) => q.join(',')).join(' ')} fill="var(--ink)" fillOpacity=".75" />
        {naka.at != null && (
          <line x1={-half} x2={half} y1={-naka.at} y2={-naka.at} stroke={hit ? 'var(--ng)' : 'var(--ok)'} strokeDasharray="6 4" strokeWidth={Math.max(1, half / 200)} />
        )}
      </svg>
      <div className="hint">
        中押しで押し切った瞬間（底は平ら・立上りは垂直・刃先は底の中央）。青がヤゲン・中間板・ホルダ、黒が板。
        点線がいちばん狭い高さ（刃先から {naka.at}mm）：{hit ? '上型が立上りに当たる' : `片側 ${naka.clear}mm あく`}。
        {Number.isFinite(naka.maxH) ? `この内-内なら、立上りの内側 ${naka.maxH}mm まで上型が入る。` : ''}
      </div>
    </div>
  );
}

// ③の下：早見表。横の寸法ごとの上限を並べる。いまの寸法の列に色を付ける
function QuickTable({ shape, row, x }) {
  const Z = shape === 'Z';
  const step = Z ? 5 : 10;
  const pts = (Z ? (row.zCurve || []).map((p) => ({ x: p.S, y: p.A })) : (row.uCurve || []).map((p) => ({ x: p.W, y: p.H })))
    .filter((p) => p.x % step === 0);
  const span = Z ? 60 : 120;
  const from = Math.max(pts.length ? pts[0].x : 0, Math.round((x - span / 2) / step) * step);
  const cols = pts.filter((p) => p.x >= from && p.x <= from + span);
  const near = cols.reduce((b, p) => (!b || Math.abs(p.x - x) < Math.abs(b.x - x) ? p : b), null);
  const v = (y) => (y == null ? '✕' : y >= 399 ? 'なし' : Math.floor(y));
  return (
    <div className="qt-wrap">
      <table className="qt">
        <tbody>
          <tr><th>{Z ? '段差S' : '底W'}</th>{cols.map((p) => <td key={p.x} className={p === near ? 'now' : ''}>{p.x}</td>)}</tr>
          {Z && Z_ACT_ON && row.zAct && (
            <tr><th>実績の上限</th>{cols.map((p) => { const a = actLimit(row, p.x); return <td key={p.x} className={p === near ? 'now' : ''}>{a.A == null ? '✕' : a.A}</td>; })}</tr>
          )}
          <tr><th>{Z ? '計算の上限' : '普通に曲げる'}</th>{cols.map((p) => <td key={p.x} className={p === near ? 'now' : ''}>{v(p.y)}</td>)}</tr>
          {!Z && <tr><th>くの字（L200まで）</th>{cols.map((p) => <td key={p.x} className={p === near ? 'now' : ''}>{v(uKunoH(row, p.x))}</td>)}</tr>}
          {!Z && <tr><th>中押し</th>{cols.map((p) => { const n = uNakaH(row, p.x); return <td key={p.x} className={p === near ? 'now' : ''}>{n == null ? '✕' : Number.isFinite(n) ? Math.floor(n) : 'なし'}</td>; })}</tr>}
        </tbody>
      </table>
      <div className="hint">早見表（mm）。✕＝最短でも曲げられない、なし＝上限なし。{Z ? '' : '左右の立上りが同じ高さのときの値。'}</div>
    </div>
  );
}

// 実績の登録。曲げ屋さんに聞いて確かな結果だけを1件ずつ登録する。登録したものは次の判定から使う
function RecordPanel({ shape, mat, t, dims, L, list, best, recs, dir, pendingDir, connect, saveRec, dropRec, msg }) {
  const [V, setV] = useState(best ? best.row.id : list[0].row.id);
  const [method, setMethod] = useState('normal');
  const [ok, setOk] = useState(true);
  const [lenFail, setLenFail] = useState(false);
  const [note, setNote] = useState('');
  const [who, setWho] = useState(() => { try { return localStorage.getItem('zu.who') || ''; } catch { return ''; } });
  useEffect(() => { if (best) setV(best.row.id); }, [best && best.row.id, shape, t]);
  const row = (list.find((r) => r.row.id === V) || list[0]).row;
  const mine = recs.filter((r) => r.shape === shape && r.mat === mat && r.t === t);
  const submit = () => {
    if (!who.trim()) { alert('だれに確かめたか（名前）を入れてください'); return; }
    try { localStorage.setItem('zu.who', who.trim()); } catch { /* 無視 */ }
    const punch = method === 'kuno' ? '特殊 くの字165' : method === 'kuno100' ? '特殊 くの字100' : '904061';
    saveRec({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), who: who.trim(),
      shape, mat, t, V: row.V, machine: row.machine, sel: row.sel, dims: dims.map(Number), L: L > 0 ? L : null,
      method: method.startsWith('kuno') ? 'kuno' : method, punch, ok, lenFail: !ok && lenFail, note: note.trim(),
    });
    setNote('');
  };
  return (
    <div className="card rec" style={{ marginTop: 12 }}>
      <h2>実績を登録（曲げ屋さんに確かめた結果だけ）</h2>
      {!folderSupported() ? (
        <div className="hint">登録は会社PCの Chrome・Edge でできます（共有フォルダに保存するため）。</div>
      ) : !dir ? (
        <div>
          <button className="copy" onClick={connect}>{pendingDir ? '共有フォルダにつなぐ' : '共有フォルダを選ぶ'}</button>
          <div className="hint">シミュレーターと同じ「曲げシミュレーション」フォルダを選んでください。つなぐと、登録済みの実績も判定に使います。</div>
        </div>
      ) : (
        <>
          <div className="rec-now">いまの寸法：{shape === 'Z' ? `A${dims[0]}・S${dims[1]}・B${dims[2]}` : `H${dims[0]}・W${dims[1]}・H${dims[2]}`}　{mat} t{t}　L{L || '—'}</div>
          <div className="rec-grid">
            <label className="f"><span>型</span>
              <select value={V} onChange={(e) => setV(e.target.value)}>
                {list.map((r) => <option key={r.row.id} value={r.row.id}>{r.die}（{r.row.machine}）</option>)}
              </select>
            </label>
            <label className="f"><span>曲げ方</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)}>
                <option value="normal">普通（904061）</option>
                <option value="kuno">くの字165</option>
                <option value="kuno100">くの字100</option>
                <option value="naka">中押し</option>
              </select>
            </label>
            <label className="f"><span>確かめた人</span>
              <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="例：曲げ 田中" />
            </label>
          </div>
          <div className="seg" style={{ marginTop: 8, display: 'inline-flex' }}>
            <button className={ok ? 'on' : ''} onClick={() => setOk(true)}>○ 曲がった</button>
            <button className={!ok ? 'on' : ''} onClick={() => setOk(false)}>✕ 曲がらなかった</button>
          </div>
          {!ok && (
            <label className="rec-len"><input type="checkbox" checked={lenFail} onChange={(e) => setLenFail(e.target.checked)} />
              長さ（力）が足りなかった（形は当たっていない）</label>
          )}
          <input className="rec-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ひとこと（当たった所、への字の角度 など）" />
          <button className="copy" onClick={submit}>登録する</button>
          {msg && <div className="hint">{msg}</div>}
          {mine.length > 0 && (
            <table className="kt rec-list">
              <thead><tr><th>日付</th><th>型</th><th>寸法</th><th>L</th><th>曲げ方</th><th>結果</th><th>確かめた人</th><th></th></tr></thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id}>
                    <td>{String(r.at).slice(5, 10)}</td>
                    <td>V{r.V}{/^lib:30[56]40:/.test(r.sel || '') ? ' 2溝' : ''}</td>
                    <td>{r.dims.join('・')}</td>
                    <td>{r.L || '—'}</td>
                    <td>{(METHOD_JA[r.method] || '').replace(/で$|に$/, '')}</td>
                    <td className={r.ok ? 'g ok-sim' : 'g ng'}>{r.ok ? '○' : r.lenFail ? '✕ 長さ' : '✕'}</td>
                    <td>{r.who}</td>
                    <td><button className="del" onClick={() => { if (confirm('この実績を消しますか？')) dropRec(r.id); }}>消す</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="hint">
            登録した実績は、同じ形・材質・板厚・型の判定で計算より優先します（Z：段差が広く・短いほうのフランジが短いほど楽／コ：底がほぼ同じで立上りが低いほど楽）。
            小さいVでは、曲がった一番長い L が最長Lになります。
          </div>
        </>
      )}
    </div>
  );
}

const INPUT_KEY = 'zu.inputs.v1';
function loadInputs() {
  try {
    const v = JSON.parse(localStorage.getItem(INPUT_KEY) || 'null');
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
function saveInputs(v) {
  try { localStorage.setItem(INPUT_KEY, JSON.stringify(v)); } catch { /* 覚えられない環境でも動く */ }
}

function App() {
  // 入力はこの端末のブラウザに覚えておく。シミュレーターを見て戻っても、入れた数字のまま
  const saved = useMemo(() => loadInputs(), []);
  const [shape, setShape] = useState(() => (location.hash === '#u' ? 'U' : location.hash === '#z' ? 'Z' : saved.shape || 'Z'));
  const [dimsBy, setDimsBy] = useState(() => saved.dimsBy || { Z: SHAPE.Z.def.map(String), U: SHAPE.U.def.map(String) });
  const [mat, setMat] = useState(saved.mat || '鉄');
  const [t, setT] = useState(saved.t || 4.5);
  const [Ltxt, setLtxt] = useState(saved.Ltxt || '1000');   // 曲げ長さ L（曲げ線に沿った製品の長さ）
  useEffect(() => { saveInputs({ shape, dimsBy, mat, t, Ltxt }); }, [shape, dimsBy, mat, t, Ltxt]);
  const Lnum = Number(Ltxt);
  const [pickV, setPickV] = useState(null);
  const [copied, setCopied] = useState(false);
  const S = SHAPE[shape];
  const dimsTxt = dimsBy[shape];
  const dims = dimsTxt.map(Number);
  const valid = dims.every((v) => Number.isFinite(v) && v > 0);

  const tList = useMemo(() => [...new Set(ROWS.filter((r) => r.mat === mat).map((r) => r.t))].sort((a, b) => a - b), [mat]);
  useEffect(() => { if (!tList.includes(t)) setT(tList.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), tList[0])); }, [tList]);
  useEffect(() => { history.replaceState(null, '', shape === 'U' ? '#u' : '#z'); }, [shape]);

  // 登録した実績（共有フォルダ bendsim.json の zuRecords）。シミュレーターと同じフォルダ・同じファイル
  const [dir, setDir] = useState(null);          // つながっているフォルダ
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

  // 入力が止まってから判定（干渉判定は少し重い）
  const [res, setRes] = useState(null);
  useEffect(() => {
    if (!valid) { setRes(null); return; }
    const id = setTimeout(() => setRes(judgeAll(ROWS, shape, mat, t, dims, Lnum, recs)), 200);
    return () => clearTimeout(id);
  }, [shape, mat, t, dimsTxt.join('|'), Ltxt, recs]);
  useEffect(() => setPickV(null), [shape, mat, t]);

  const best = res && res.best;
  const shown = res && (res.list.find((r) => r.row.id === pickV) || best);
  const x = shape === 'Z' ? dims[1] : dims[1];
  const y = Math.min(dims[0], dims[2]);   // 先に曲げる、短いほう（低いほう）で見る

  const answer = useMemo(() => {
    if (!best) return '';
    const g = GRADE[best.grade];
    const d = S.keys.map((k, i) => `${k}=${dims[i]}`).join('・');
    const head = `${S.name}　${mat} t${t}　${d}（外寸）　L=${Ltxt}`;
    const kt = kunoText(best.kuno, Lnum);
    const kLine = kt ? `\nくの字ヤゲンなら曲がる長さ：${kt}` : '';
    if (best.grade === 'ng') {
      const fixes = fixList(res.list).map((f) => `・${f.dies}：${f.fix}`);
      return `${head}\n→ 曲がりません。${best.why}。${kLine}${fixes.length ? `\nこうすれば曲げられます\n${fixes.join('\n')}` : ''}`;
    }
    const src = best.grade === 'ok-act' ? '実績のある範囲です' : best.grade === 'ok-sim' ? '計算で確認しました' : '';
    const word = isNaka(best) ? GRADE.naka.word : isAlt(best) ? altWord(best) : g.word;
    const ask = best.grade === 'check' ? `曲げ屋さんに確認が要ります：${best.why}。${best.fix ? `${best.fix}すれば確実です。` : ''}` : '';
    return `${head}\n→ ${word}（${best.die}・${best.machine}）。${ask || (best.grade === 'naka' || best.grade === 'alt' ? `${best.why}。` : src)}${kLine}`;
  }, [best, shape, mat, t, dimsTxt.join('|'), Ltxt]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(answer); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* コピーできない環境 */ }
  };

  return (
    <div className="wrap">
      <header>
        <h1>Z曲げ・コの字 曲がるか判定</h1>
        <p>問い合わせの多い2つの形だけ。寸法と板厚を入れると、すぐに答えが出ます。</p>
        {!Z_ACT_ON && shape === 'Z' && <p className="notice">Z曲げは、段差の実績を曲げ屋さんに確認中のため、いまはシミュレーションの計算で判定しています。</p>}
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
          <Figure shape={shape} dims={dimsTxt} L={Ltxt} />
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
            <label className="f" style={{ width: 140 }}><span>曲げ長さ L</span>
              <input inputMode="decimal" value={Ltxt} onChange={(e) => setLtxt(e.target.value)} />
            </label>
          </div>
          <div className="hint">L は曲げ線に沿った製品の長さ（図の奥行き方向）。板厚は、実際に使う型がある厚さだけ選べます。ボンデは鉄で見てください。角度は90°。</div>
        </section>

        <section>
          {!valid && <div className="card">寸法を数字で入れてください。</div>}
          {valid && !res && <div className="card">判定しています…</div>}
          {best && (
            <div className={`verdict ${look(best).cls}`}>
              <div className="v-head">
                <span className="v-mark">{look(best).mark}</span>
                <span className={`v-word ${look(best).word.length > 16 ? 'long' : ''}`}>{look(best).word}</span>
                {look(best).ask && <span className="v-ask">△ 曲げ屋さんに確認</span>}
              </div>
              {(isNaka(best) || isAlt(best)) && <MethodLadder r={best} L={Lnum} />}
              <div className="v-body">
                {best.grade !== 'ng' && <div>型：<b>{best.die}</b>（{best.machine}）<span className="tag">{best.src === '実績' ? '実績あり' : best.src === '中押し' ? '中押し' : '計算のみ'}</span>{best.recs && best.recs.length > 0 && best.src !== '実績' && <span className="tag">この型の実績 {best.recs.length}件</span>}{best.punch && <span className="tag">{best.special ? `くの字特殊ヤゲン${best.punch.replace('特殊 くの字', '')}` : `ヤゲン ${best.punch}`}</span>}</div>}
                <div>{best.why}</div>
                {best.grade !== 'ng' && best.src !== '中押し' && best.geo && best.geo.ok && <div className="hint">曲げ順：{seqText(best.geo.seq)}</div>}
              </div>
              {best.src === '中押し' && best.naka && best.grade !== 'ng' && (
                <NakaSteps angle={best.naka.angle} inner={best.naka.inner} pending={best.grade === 'check'} />
              )}
              {kunoText(best.kuno, Lnum) && !isNaka(best) && (
                <div className="v-kuno">
                  <b>くの字ヤゲンなら曲がる長さ</b>
                  <table className="kt">
                    <thead><tr><th>ヤゲン</th><th>曲げ長さ L</th><th>いまの L={Lnum}</th></tr></thead>
                    <tbody>
                      {best.kuno.filter((k) => k.ok).map((k) => (
                        <tr key={k.punch}>
                          <td>{k.punch.replace('特殊 ', '')}</td>
                          <td><b>{k.win}mm 以内</b></td>
                          <td className={Lnum <= k.win ? 'g ok-sim' : 'g ng'}>{Lnum <= k.win ? '○ 使える' : '✕ 長すぎる'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {best.grade !== 'ng' && best.fix && <div className="v-fix">→ {best.fix}すれば確実です</div>}
              {best.grade === 'ng' && res.list.some((r) => r.fix) && (
                <div className="v-fix">
                  こうすれば曲げられます
                  {fixList(res.list).map((f) => <div key={f.dies}>・{f.dies}：{f.fix}</div>)}
                </div>
              )}
              <a className={`simbtn ${best.grade === 'ng' ? 'strong' : best.src === '中押し' ? 'naka' : isAlt(best) ? look(best).cls : ''}`} href={simLink(shape, best, dims, mat, Lnum)} target="_blank" rel="noreferrer">
                {best.grade === 'ng' ? `▶ どこが当たるか、シミュレーションで見る（${best.die}）`
                  : best.src === '中押し' ? `▶ 中押しの工程をシミュレーションで見る（${best.die}）` : `▶ シミュレーションで見る（${best.die}）`}
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
                    <tr key={r.row.id} className={shown && shown.row.id === r.row.id ? 'sel' : ''} onClick={() => setPickV(r.row.id)}>
                      <td><b>{r.die}</b>{r.row.V === res.baseV && <span className="tag">基準</span>}</td>
                      <td>{r.machine}</td>
                      <td className={`g ${isNaka(r) ? 'naka' : isAlt(r) ? (r.special ? 'kuno' : 'punch') : r.grade}`}>{isNaka(r) ? (r.grade === 'check' ? '中押しのみ △' : '中押しのみ') : isAlt(r) ? altShort(r) : GRADE[r.grade].short}</td>
                      <td>{r.why}{kunoText(r.kuno, Lnum) && <div className="kuno-s">くの字なら：{kunoText(r.kuno, Lnum)}</div>}</td>
                      <td><a className="see" href={simLink(shape, r, dims, mat, Lnum)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>見る</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="hint">行を押すと、下のグラフがその型に変わります。</div>
            </div>
          )}
          {res && res.list.length > 0 && (
            <RecordPanel shape={shape} mat={mat} t={t} dims={dims} L={Lnum} list={res.list} best={best}
              recs={recs} dir={dir} pendingDir={pendingDir} connect={connect} saveRec={saveRec} dropRec={dropRec} msg={recMsg} />
          )}
        </section>
      </div>

      {shown && (
        <section className="card" style={{ marginTop: 12 }}>
          <h2>③ どこまで曲げられるか（{shown.die}・{mat} t{t}）</h2>
          <LimitDetail shape={shape} row={shown.row} x={x} y={y} other={Math.max(dims[0], dims[2])} />
          <LimitChart shape={shape} row={shown.row} x={x} y={y} grade={shown.grade} />
          <QuickTable shape={shape} row={shown.row} x={x} />
          {shape === 'U' && shown.naka && (
            <>
              <h2 style={{ marginTop: 14 }}>中押しで押し切ったとき（{shown.die}・ヤゲン904061）</h2>
              <NakaFigure t={t} W={dims[1]} H1={dims[0]} H2={dims[2]} naka={{ ...shown.naka, ok: shown.naka.clear > 0 }} />
            </>
          )}
          <div className="hint">
            {shape === 'Z'
              ? '短いほうのフランジを先に曲げる想定。長いほうのフランジは上限なし（最小フランジ以上）。'
              : '低いほうの立上りを先に曲げる想定（先に立てた側が上型に当たる）。オレンジ＝くの字ヤゲン（曲げ長さ L が窓以内のときだけ）、緑の点線＝中押しで押し切ったとき上型が入る高さ（への字の角度は判定で確かめている）。現場の順番は 普通 → くの字 → 中押し。コの字は実績がまだ無く、計算の値です。'}
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
