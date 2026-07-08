import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';

// ============================================================================
// 金型実測データ（図面PDFのベクタ線分から直接トレース・寸法照合済み）
//
// ■ ダイ（V12.pdf）
//   ・V溝：V12・90°（半幅6.0 / 深さ6.0）、肩フラット各1.5
//   ・V金型ブロック：幅15 × 見え高さ50（ホルダに5mm差込み）
//   ・ホルダ：幅28（深さ50〜95）、側面にクランプ溝（深さ67.5〜72.5、切込3.5）
//   ・以下 幅135（〜185）、幅255（〜235）、幅415（ベース）
//   ・照合済み寸法：V12 / 50・95・185・235 / 60・120・200（V金型側面基準）
//
// ■ ヤゲン＝パンチ（ヤゲン.pdf）
//   ・全高122.7 / 全幅78.3 / タング厚9.1（刃先中心から22.6mmオフセット）
//   ・刃先部幅9.8、先端角86°（片側47°）
//   ・照合済み寸法：4 / 9.1 / 9.9 / 9.1 / 32.8 / 13.4（上端チェーン）、
//     27.5・15.5・32.3・29.3・13.6（左）、26.1・29.3・47.5・16（右）、
//     42.7 / 10.7 / 9.8 / 10.6 / 8.3 / 4.2 / 13 / 7 / 5.4 / 2.2 ほか
// ============================================================================

// 座標系：Y下向き正。原点＝V溝肩の上面高さ・V中心。
const DIE_RIGHT_HALF = [
  [0, 6.0],        // V底（90° V12）
  [6.0, 0],        // V肩
  [7.5, 0],        // 肩フラット1.5 → V金型右端
  [7.5, 50],       // V金型側面（見え高さ50）
  [14.0, 50],      // ホルダ上面
  [14.0, 67.5],
  [17.5, 67.5],    // クランプ溝
  [17.5, 72.5],
  [14.0, 72.5],
  [14.0, 95],
  [67.5, 95],      // 幅135ブロック
  [67.5, 185],
  [127.5, 185],    // 幅255ブロック
  [127.5, 235],
  [207.5, 235],    // 幅415ベース
  [207.5, 330],    // （図面は235以深で紙面外。描画用に延長）
];

function mirrorClose(right) {
  const pts = [];
  for (let i = right.length - 1; i >= 1; i--) pts.push([-right[i][0], right[i][1]]);
  for (const p of right) pts.push(p);
  return pts;
}

// パンチ実測輪郭：刃先頂点＝(0,0)、上方向＝負。閉ポリゴン。
const PUNCH_YAGEN = [
  [0, 0],            // 刃先（86°）
  [4.9, -5.3],       // 右刃面（47°）
  [4.9, -25.1],      // 刃先部 右側面（幅9.8）
  [15.6, -25.1],     // 段10.6
  [15.6, -3.9],
  [23.9, -3.9],      // 段8.3
  [28.1, -19.8],     // 面取り 4.2×16
  [28.1, -67.3],     // 右外側面（47.5）
  [14.7, -67.3],     // 段13.4
  [14.7, -96.6],     // （29.3）
  [-18.1, -96.6],    // 上部段32.8
  [-18.1, -122.7],   // タング右（26.1）
  [-27.2, -122.7],   // タング厚9.1・頂部
  [-27.2, -80.0],    // タング左（42.7）
  [-32.8, -80.0],
  [-37.1, -87.4],    // フック斜面（9.2×5.6）
  [-46.2, -93.0],
  [-46.2, -95.2],    // （2.2）
  [-50.2, -95.2],    // （4.0）
  [-50.2, -79.7],    // 左端面（15.5）
  [-39.4, -72.5],    // 斜面 10.7×7.2
  [-39.4, -47.3],    // （左チェーン32.3側）
  [-30.2, -47.3],
  [-30.2, -18.0],
  [-24.9, -4.4],     // 斜面 5.4×13.6
  [-17.9, -4.4],     // （7.0）
  [-17.9, -25.1],
  [-4.9, -25.1],     // 段13.0 → 刃先部 左側面
  [-4.9, -5.3],      // 左刃面
];

// 汎用ストレートパンチ（比較用）
const PUNCH_STRAIGHT = mirrorClose([
  [0, 0], [4.9, -5.3], [4.9, -22], [9, -22], [9, -122],
]).map((p) => p);

// ============================================================================
// 幾何ユーティリティ
// ============================================================================
const rad = (deg) => (deg * Math.PI) / 180;
const rotV = (v, phi) => {
  const c = Math.cos(phi), s = Math.sin(phi);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

function distSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let u = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  u = Math.max(0, Math.min(1, u));
  return Math.hypot(p[0] - (a[0] + u * dx), p[1] - (a[1] + u * dy));
}

function distPoly(p, poly) {
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) {
    m = Math.min(m, distSeg(p, poly[i], poly[(i + 1) % poly.length]));
  }
  return m;
}

function densify(pts, step = 0.8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
    }
  }
  return out;
}

// ============================================================================
// 金型生成
// ============================================================================
function buildDie(dieType, vHalf, dieHalf) {
  if (dieType === 'flat') {
    const W = Math.max(dieHalf, vHalf + 2);
    return mirrorClose([[0, vHalf], [vHalf, 0], [W, 0], [W, 150]]);
  }
  return mirrorClose(DIE_RIGHT_HALF); // 実機はV12固定
}

function buildPunch(punchType, punchFlip, tipY) {
  const base = punchType === 'yagen' ? PUNCH_YAGEN : PUNCH_STRAIGHT;
  return base.map(([x, y]) => [punchFlip ? -x : x, y + tipY]);
}

// ============================================================================
// 板のキネマティクス（エアベンディング近似・中立軸ポリライン）
// アクティブ曲げ頂点はパンチ直下、両側はV肩支点で回転。最大90°。
// ============================================================================
function computeChain(part, seq, stepIdx, prog, vHalf) {
  const { t, segs, bends } = part;
  const B = bends.length;
  const st = seq[stepIdx];
  const msegs = st.mirror ? [...segs].reverse() : segs;
  const srcOf = (i) => (st.mirror ? B - 1 - i : i);
  const mb = [];
  for (let i = 0; i < B; i++) {
    const s = bends[srcOf(i)];
    mb.push({ angle: s.angle, dir: (st.valley ? -1 : 1) * s.dir, src: srcOf(i) });
  }
  const j = st.mirror ? B - 1 - st.bend : st.bend;
  const done = new Set(seq.slice(0, stepIdx).map((s) => s.bend));

  const activeDirOK = mb[j].dir > 0;
  const theta = rad(Math.min(90, mb[j].angle)) * Math.max(0, Math.min(1, prog));
  const alpha = theta / 2;
  const d = vHalf * Math.tan(alpha);
  const vy = -t / 2 + d;

  const signedOf = (i) =>
    done.has(mb[i].src) ? rad(mb[i].angle) * mb[i].dir : 0;

  const left = [];
  let D = [-Math.cos(alpha), -Math.sin(alpha)];
  let pos = [0, vy];
  for (let i = j; i >= 0; i--) {
    pos = [pos[0] + D[0] * msegs[i], pos[1] + D[1] * msegs[i]];
    left.push(pos);
    if (i > 0) D = rotV(D, signedOf(i - 1));
  }
  const right = [];
  D = [Math.cos(alpha), -Math.sin(alpha)];
  pos = [0, vy];
  for (let i = j + 1; i < msegs.length; i++) {
    pos = [pos[0] + D[0] * msegs[i], pos[1] + D[1] * msegs[i]];
    right.push(pos);
    if (i < msegs.length - 1) D = rotV(D, -signedOf(i));
  }

  const pts = [...left.reverse(), [0, vy], ...right];
  return { pts, vy, d, activeDirOK, thetaDeg: (theta * 180) / Math.PI };
}

// ============================================================================
// 干渉判定：中立軸を密サンプリングし金型ポリゴンへの侵入／板厚未満の接近を検出。
// 正規接触点（V肩・パンチ刃先）は除外。
// ============================================================================
function detectCollisions(chain, tools, t, vHalf) {
  const clearance = t * 0.45;
  const exR = t * 1.8 + 1.5;
  const excl = [[-vHalf, 0], [vHalf, 0], [0, chain.vy]];
  const hits = [];
  for (const p of densify(chain.pts)) {
    if (excl.some((e) => Math.hypot(p[0] - e[0], p[1] - e[1]) < exR)) continue;
    for (const poly of tools) {
      if (pointInPoly(p, poly) || distPoly(p, poly) < clearance) {
        hits.push(p);
        break;
      }
    }
  }
  return hits;
}

// ============================================================================
// メインコンポーネント
// ============================================================================
const BendingSimulator = () => {
  // --- 板形状（初期値：図面の展開 86.3 = 30 + 16.3 + 40、t2.3、Z曲げ90°×2）---
  const [t, setT] = useState(2.3);
  const [segs, setSegs] = useState([30, 16.3, 40]);
  const [bends, setBends] = useState([
    { angle: 90, dir: 1 },
    { angle: 90, dir: -1 },
  ]);
  // --- 金型 ---
  const [dieType, setDieType] = useState('v12');
  const [vW, setVW] = useState(12);
  const [dieHalf, setDieHalf] = useState(30);
  const [punchType, setPunchType] = useState('yagen');
  const [punchFlip, setPunchFlip] = useState(false);
  // --- 工程 ---
  const [seq, setSeq] = useState([
    { bend: 0, mirror: false, valley: false },
    { bend: 1, mirror: false, valley: true },
  ]);
  const [step, setStep] = useState(0);
  const [prog, setProg] = useState(1);
  const [playing, setPlaying] = useState(false);
  // --- 表示 ---
  const [view, setView] = useState({ scale: 4.2, cx: 0, cy: -20 }); // cx,cy=注視点(mm)
  const dragRef = useRef(null);

  const canvasRef = useRef(null);
  const vHalf = dieType === 'v12' ? 6 : vW / 2;
  const part = useMemo(() => ({ t, segs, bends }), [t, segs, bends]);
  const diePoly = useMemo(() => buildDie(dieType, vHalf, dieHalf), [dieType, vHalf, dieHalf]);

  // --- 全工程スイープ判定（ストローク0→100%を走査）---
  const verdicts = useMemo(() => {
    return seq.map((_, si) => {
      let orientationNG = false;
      let firstHit = null;
      for (let p = 0; p <= 1.0001; p += 0.04) {
        const ch = computeChain(part, seq, si, p, vHalf);
        if (!ch.activeDirOK) orientationNG = true;
        const punch = buildPunch(punchType, punchFlip, ch.vy - t / 2);
        const hits = detectCollisions(ch, [diePoly, punch], t, vHalf);
        if (hits.length > 0) {
          firstHit = { prog: p, count: hits.length };
          break;
        }
      }
      return { orientationNG, firstHit };
    });
  }, [part, seq, vHalf, diePoly, punchType, punchFlip, t]);

  const allOK = verdicts.every((v) => !v.firstHit && !v.orientationNG);

  // --- 現在フレーム ---
  const frame = useMemo(() => {
    const ch = computeChain(part, seq, step, prog, vHalf);
    const punch = buildPunch(punchType, punchFlip, ch.vy - t / 2);
    const hits = detectCollisions(ch, [diePoly, punch], t, vHalf);
    return { ch, punch, hits };
  }, [part, seq, step, prog, vHalf, diePoly, punchType, punchFlip, t]);

  // --- 再生 ---
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => {
      setProg((p) => Math.min(1, p + 0.01));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  useEffect(() => {
    if (!playing || prog < 1) return;
    const id = setTimeout(() => {
      if (step < seq.length - 1) {
        setStep(step + 1);
        setProg(0);
      } else {
        setPlaying(false);
      }
    }, 700);
    return () => clearTimeout(id);
  }, [playing, prog, step, seq.length]);

  // --- 描画 ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    const { scale, cx, cy } = view;
    const tx = (x) => W / 2 + (x - cx) * scale;
    const ty = (y) => H / 2 + (y - cy) * scale;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0c1116';
    ctx.fillRect(0, 0, W, H);

    // グリッド（10mm）
    ctx.strokeStyle = 'rgba(148,163,184,0.07)';
    ctx.lineWidth = 1;
    const gx0 = Math.floor((cx - W / 2 / scale) / 10) * 10;
    const gy0 = Math.floor((cy - H / 2 / scale) / 10) * 10;
    for (let gx = gx0; tx(gx) < W; gx += 10) {
      ctx.beginPath(); ctx.moveTo(tx(gx), 0); ctx.lineTo(tx(gx), H); ctx.stroke();
    }
    for (let gy = gy0; ty(gy) < H; gy += 10) {
      ctx.beginPath(); ctx.moveTo(0, ty(gy)); ctx.lineTo(W, ty(gy)); ctx.stroke();
    }
    // V中心線
    ctx.strokeStyle = 'rgba(56,189,248,0.25)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(tx(0), 0); ctx.lineTo(tx(0), H); ctx.stroke();
    ctx.setLineDash([]);

    const drawPoly = (poly, fill, stroke) => {
      ctx.beginPath();
      ctx.moveTo(tx(poly[0][0]), ty(poly[0][1]));
      for (let i = 1; i < poly.length; i++) ctx.lineTo(tx(poly[i][0]), ty(poly[i][1]));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'miter';
      ctx.stroke();
    };

    drawPoly(diePoly, '#161a10', '#d4a017');
    drawPoly(frame.punch, '#10161f', '#d4a017');

    // 板（中立軸を板厚幅で描画）
    const pts = frame.ch.pts;
    ctx.beginPath();
    ctx.moveTo(tx(pts[0][0]), ty(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(tx(pts[i][0]), ty(pts[i][1]));
    ctx.strokeStyle = frame.hits.length ? '#f87171' : '#e05252';
    ctx.lineWidth = Math.max(2, t * scale);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';
    ctx.stroke();

    // 干渉点
    for (const h of frame.hits) {
      ctx.beginPath();
      ctx.arc(tx(h[0]), ty(h[1]), 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251,146,60,0.9)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(tx(h[0]), ty(h[1]), 11, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(251,146,60,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 情報表示
    ctx.font = '13px ui-monospace, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`工程 ${step + 1}/${seq.length}　曲げ角度 ${frame.ch.thetaDeg.toFixed(1)}°`, 16, 24);
    if (!frame.ch.activeDirOK) {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('⚠ この向きでは谷曲げ（下向き）になります。「山谷反転」で裏返してください', 16, 44);
    }
    if (frame.hits.length) {
      ctx.fillStyle = '#fb923c';
      ctx.font = 'bold 14px ui-monospace, monospace';
      ctx.fillText(`⚠ 干渉検出：${frame.hits.length} 点`, 16, H - 18);
    }
  }, [frame, diePoly, step, seq.length, t, view]);

  // --- ビュー操作（ドラッグ＝パン、ホイール＝ズーム）---
  const onPointerDown = (e) => {
    dragRef.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const canvas = canvasRef.current;
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    setView((v) => ({
      ...v,
      cx: dragRef.current.cx - ((e.clientX - dragRef.current.x) * k) / v.scale,
      cy: dragRef.current.cy - ((e.clientY - dragRef.current.y) * k) / v.scale,
    }));
  };
  const onPointerUp = () => { dragRef.current = null; };
  const onWheel = useCallback((e) => {
    e.preventDefault();
    setView((v) => {
      const s = Math.min(12, Math.max(1.2, v.scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      return { ...v, scale: s };
    });
  }, []);
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [onWheel]);

  const viewPreset = (name) => {
    if (name === 'tip') setView({ scale: 5.5, cx: 0, cy: -25 });
    else if (name === 'all') setView({ scale: 1.7, cx: 0, cy: 60 });
    else setView({ scale: 4.2, cx: 0, cy: -20 });
  };

  // --- 形状編集 ---
  const setSeg = (i, v) => setSegs(segs.map((s, k) => (k === i ? v : s)));
  const setBend = (i, patch) => setBends(bends.map((b, k) => (k === i ? { ...b, ...patch } : b)));
  const addSeg = () => {
    setSegs([...segs, 30]);
    setBends([...bends, { angle: 90, dir: 1 }]);
    setSeq([...seq, { bend: bends.length, mirror: false, valley: false }]);
  };
  const removeSeg = () => {
    if (segs.length <= 2) return;
    setSegs(segs.slice(0, -1));
    setBends(bends.slice(0, -1));
    setSeq(seq.slice(0, -1).map((s) => ({ ...s, bend: Math.min(s.bend, bends.length - 2) })));
    setStep(0); setProg(1);
  };
  const setStepConf = (i, patch) => setSeq(seq.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const inp = 'w-16 bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-right text-slate-100 text-sm';
  const sel = 'bg-slate-800 border border-slate-600 rounded px-1.5 py-0.5 text-slate-100 text-sm';
  const lbl = 'text-slate-400 text-xs';
  const vbtn = 'px-2 py-0.5 text-xs rounded border border-slate-600 hover:bg-slate-800 text-slate-300';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 font-sans">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-baseline gap-3 mb-3 flex-wrap">
          <h1 className="text-lg font-bold tracking-wide text-slate-100">曲げ加工シミュレーター</h1>
          <span className="text-xs text-slate-500">実測金型（V12ダイ＋実機ヤゲン）｜プレスブレーキ干渉判定</span>
        </div>

        {/* 総合判定バー */}
        <div className={`rounded-md px-4 py-2.5 mb-3 border font-bold text-sm flex items-center gap-3 flex-wrap ${
          allOK ? 'bg-emerald-950/60 border-emerald-700 text-emerald-300'
                : 'bg-red-950/60 border-red-700 text-red-300'}`}>
          <span className="text-lg">{allOK ? '○' : '✕'}</span>
          {allOK ? '全工程 曲げ可能（干渉なし）' : '干渉あり — この段取りでは曲がりません'}
          <div className="ml-auto flex gap-2 flex-wrap">
            {verdicts.map((v, i) => (
              <button key={i}
                onClick={() => { setStep(i); setProg(1); setPlaying(false); }}
                className={`px-2.5 py-1 rounded text-xs font-mono border transition ${
                  step === i ? 'border-sky-400 bg-sky-900/40' : 'border-slate-700 bg-slate-900'
                } ${v.firstHit || v.orientationNG ? 'text-red-300' : 'text-emerald-300'}`}>
                工程{i + 1} {v.orientationNG ? '要反転' : v.firstHit ? `✕ ${Math.round(v.firstHit.prog * 100)}%で干渉` : '○'}
              </button>
            ))}
          </div>
        </div>

        {/* キャンバス */}
        <div className="border border-slate-800 rounded-md overflow-hidden bg-black relative">
          <canvas ref={canvasRef} width={880} height={560} className="w-full h-auto block cursor-grab active:cursor-grabbing"
            onPointerDown={onPointerDown} onPointerMove={onPointerMove}
            onPointerUp={onPointerUp} onPointerCancel={onPointerUp} />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button className={vbtn} onClick={() => viewPreset('tip')}>刃先</button>
            <button className={vbtn} onClick={() => viewPreset('std')}>標準</button>
            <button className={vbtn} onClick={() => viewPreset('all')}>全体</button>
          </div>
          <div className="absolute bottom-2 right-3 text-[10px] text-slate-500 font-mono">
            ドラッグ＝移動 / ホイール＝拡大縮小
          </div>
        </div>

        {/* 再生コントロール */}
        <div className="flex items-center gap-4 mt-3 bg-slate-900 border border-slate-800 rounded-md px-4 py-3">
          <button
            onClick={() => {
              if (!playing) { setStep(0); setProg(0); }
              setPlaying(!playing);
            }}
            className="px-4 py-1.5 rounded bg-sky-700 hover:bg-sky-600 text-white text-sm font-bold shrink-0">
            {playing ? '■ 停止' : '▶ 全工程再生'}
          </button>
          <span className={`${lbl} shrink-0`}>ストローク {Math.round(prog * 100)}%</span>
          <input type="range" min={0} max={100} value={Math.round(prog * 100)}
            onChange={(e) => { setPlaying(false); setProg(Number(e.target.value) / 100); }}
            className="flex-1 accent-sky-500" />
        </div>

        <div className="grid md:grid-cols-2 gap-3 mt-3">
          {/* 板形状 */}
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-100">板形状（展開寸法 mm）</h2>
              <div className="flex gap-2">
                <button onClick={addSeg} className="px-2 py-0.5 text-xs rounded border border-slate-600 hover:bg-slate-800">＋辺追加</button>
                <button onClick={removeSeg} className="px-2 py-0.5 text-xs rounded border border-slate-600 hover:bg-slate-800">－削除</button>
              </div>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <span className={lbl}>板厚 t</span>
              <input type="number" step={0.1} min={0.5} max={9} value={t}
                onChange={(e) => setT(Number(e.target.value) || 1)} className={inp} />
              <span className={`${lbl} ml-3`}>展開長 {segs.reduce((a, b) => a + b, 0).toFixed(1)} mm</span>
            </div>
            <div className="space-y-1.5">
              {segs.map((L, i) => (
                <React.Fragment key={i}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-500 w-10">辺{i + 1}</span>
                    <input type="number" step={0.1} min={2} value={L}
                      onChange={(e) => setSeg(i, Number(e.target.value) || 2)} className={inp} />
                    <span className={lbl}>mm</span>
                  </div>
                  {i < bends.length && (
                    <div className="flex items-center gap-2 pl-6 border-l-2 border-slate-700 ml-3">
                      <span className="text-xs font-mono text-amber-500 w-12">曲げ{i + 1}</span>
                      <input type="number" step={1} min={10} max={90} value={bends[i].angle}
                        onChange={(e) => setBend(i, { angle: Math.min(90, Number(e.target.value) || 90) })}
                        className={inp} />
                      <span className={lbl}>°</span>
                      <select value={bends[i].dir}
                        onChange={(e) => setBend(i, { dir: Number(e.target.value) })} className={sel}>
                        <option value={1}>山（上曲げ）</option>
                        <option value={-1}>谷（下曲げ）</option>
                      </select>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 金型・段取り */}
          <div className="bg-slate-900 border border-slate-800 rounded-md p-4">
            <h2 className="text-sm font-bold text-slate-100 mb-3">金型</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-2">
              <label className="flex items-center gap-1.5">
                <span className={lbl}>ダイ</span>
                <select value={dieType} onChange={(e) => setDieType(e.target.value)} className={sel}>
                  <option value="v12">実機 V12 段付きダイ（図面トレース）</option>
                  <option value="flat">標準角ダイ（汎用）</option>
                </select>
              </label>
              {dieType === 'flat' && (
                <>
                  <label className="flex items-center gap-1.5">
                    <span className={lbl}>V幅</span>
                    <input type="number" step={1} min={4} max={25} value={vW}
                      onChange={(e) => setVW(Number(e.target.value) || 12)} className={inp} />
                  </label>
                  <label className="flex items-center gap-1.5">
                    <span className={lbl}>ダイ半幅</span>
                    <input type="number" step={1} min={8} max={60} value={dieHalf}
                      onChange={(e) => setDieHalf(Number(e.target.value) || 30)} className={inp} />
                  </label>
                </>
              )}
              <label className="flex items-center gap-1.5">
                <span className={lbl}>パンチ</span>
                <select value={punchType} onChange={(e) => setPunchType(e.target.value)} className={sel}>
                  <option value="yagen">実機ヤゲン（図面トレース）</option>
                  <option value="straight">ストレート（汎用）</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-xs text-slate-400">
                <input type="checkbox" checked={punchFlip} onChange={(e) => setPunchFlip(e.target.checked)} />
                向き反転
              </label>
            </div>
            <div className="text-[11px] text-slate-500 font-mono mb-4 leading-relaxed">
              {dieType === 'v12'
                ? 'ダイ: V12・90°｜V金型 幅15×h50｜ホルダ幅28→135→255→415（深さ50/95/185/235）'
                : `ダイ: V${vW}・90°（汎用）`}
              <br />
              {punchType === 'yagen'
                ? 'ヤゲン: 全高122.7×全幅78.3｜刃先部幅9.8｜先端角86°（片側47°）｜タング厚9.1'
                : 'パンチ: ストレート（汎用・先端86°）'}
            </div>

            <h2 className="text-sm font-bold text-slate-100 mb-2">加工手順（工程ごとのセット向き）</h2>
            <div className="space-y-1.5">
              {seq.map((s, i) => (
                <div key={i} className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded px-2 py-1.5 border ${
                  step === i ? 'border-sky-700 bg-sky-950/30' : 'border-slate-800'}`}>
                  <span className="text-xs font-mono text-slate-400 w-12">工程{i + 1}</span>
                  <select value={s.bend} onChange={(e) => setStepConf(i, { bend: Number(e.target.value) })} className={sel}>
                    {bends.map((_, bi) => (
                      <option key={bi} value={bi}>曲げ{bi + 1}</option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input type="checkbox" checked={s.mirror}
                      onChange={(e) => setStepConf(i, { mirror: e.target.checked })} />
                    左右反転
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-400">
                    <input type="checkbox" checked={s.valley}
                      onChange={(e) => setStepConf(i, { valley: e.target.checked })} />
                    山谷反転（裏返し）
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* モデルの前提 */}
        <div className="mt-3 text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-md p-3 leading-relaxed">
          金型輪郭は図面PDF（V12.pdf／ヤゲン.pdf）のベクタ線分を直接トレースし、記載寸法と照合した実測値です
          （ダイ: V12・肩フラット1.5・段付き50/95/185/235、ヤゲン: 全高122.7・刃先部幅9.8・先端角86°ほか）。
          板は中立軸で表現し、展開寸法（図面値 30 / 16.3 / 40、展開長86.3）で入力します。
          エアベンディングの肩支点近似で内Rとスプリングバックは無視、曲げ角度は90°まで。
          判定は全ストロークを走査し、板厚の半分未満まで接近／侵入した点を干渉として橙色で表示します
          （V肩・刃先の正規接触部は除外）。
        </div>
      </div>
    </div>
  );
};

export default BendingSimulator;
