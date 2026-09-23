// 「どこまで曲げられるか」の3つの部品（グラフ・数字・早見表）。
// Z曲げ・コの字判定（zu/）と、曲がるか かんたん判定（check.html）の両方で同じものを使う。
//   LimitChart  … 限界のカーブ（普通・くの字・中押し）
//   LimitDetail … いまの寸法での上限と、曲げるための条件
//   QuickTable  … 10mm（Zは5mm）刻みの早見表
// row は zu/data/zu-data.json の1行（型ごとのカーブ・最小フランジ・片伸び）。
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { SUTE_MIN_INNER } from '../bending-simulator.jsx';
import { zLimitA, uLimitH, uKunoH, uNakaH, exactLimit, actLimit, Z_ACT_ON } from './judge.js';
import './limits.css';

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
export function LimitChart({ shape, row, x, y, grade }) {
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
          {grade === 'ng' ? '✕' : grade === 'check' ? '△' : '○'} いまの寸法
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
export function LimitDetail({ shape, row, x, y, other }) {
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
  // いまの寸法が上限に収まっているか（○＝曲がる）。実績があれば実績の上限で見る
  const lim = act && act.A != null ? act.A : ex;
  const fits = lim === undefined ? undefined : lim == null ? false : lim === Infinity ? true : y <= lim;
  const room = typeof lim === 'number' && Number.isFinite(lim) ? +(lim - y).toFixed(0) : null;
  const numTxt = (v) => (v == null ? '曲げられない' : v === Infinity ? '上限なし' : `${v}`);
  return (
    <div className="ld">
      <div className={`ld-box ${fits === undefined ? '' : fits ? 'yes' : 'no'}`}>
        <div className="ld-q">{xN} <b>{x}mm</b> のとき、{yN}は</div>
        <div className="ld-a">
          {ex === undefined && !act ? '計算中…' : (
            <>
              <span className="big">{numTxt(act && act.A != null ? act.A : ex)}</span>
              {(act && act.A != null ? act.A : ex) != null && (act && act.A != null ? act.A : ex) !== Infinity && <span className="unit">mm まで</span>}
            </>
          )}
        </div>
        <div className="ld-s">
          {fits === undefined ? '' : (
            <span className={`mark ${fits ? 'ok' : 'ng'}`}>{fits ? '○' : '✕'} いまは {y}mm{room != null ? (fits ? `（あと ${room}mm いける）` : `（${-room}mm 超えている）`) : ''}</span>
          )}
          <span className="tag">{act && act.A != null ? '実績' : '計算・1mm単位'}</span>
        </div>
      </div>
      <div className={`ld-box ${fits === undefined ? '' : fits ? 'yes' : 'no'}`}>
        <div className="ld-q">{yN} <b>{y}mm</b> で曲げるには</div>
        <div className="ld-a"><span className="big2">{need.txt}</span></div>
        <div className="ld-s">
          <span className={`mark ${fits ? 'ok' : 'ng'}`}>{fits ? '○' : '✕'} いまの {xN} は {x}mm</span>
          <span className="tag">{need.src}</span>
        </div>
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

export function QuickTable({ shape, row, x }) {
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

