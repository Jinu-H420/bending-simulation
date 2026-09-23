// Z曲げ・コの字 曲がるか判定（問い合わせ用）。
// シミュレーター本体とは別のアプリ。判定の計算だけ本体と同じものを使う（./judge.js）。
import React, { useState, useMemo, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import DATA from './data/zu-data.json';
import { LimitChart, LimitDetail, QuickTable } from './limits.jsx';
import { METHOD_JA, recMatch, recText, judgeAll, zLimitA, uLimitH, uKunoH, uNakaH, seqText, RANK, exactLimit, actLimit, nakaOshi, nakaPose, PUNCH, Z_ACT_ON } from './judge.js';
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
const altWord = (r) => (r.special ? `くの字特殊ヤゲン（L ${r.special.win}mm以内）なら曲がります`
  : /^特殊 くの字/.test(r.punch || '') ? 'くの字特殊ヤゲンなら曲がります' : `ヤゲン ${r.punch} なら曲がります`);
const altShort = (r) => (r.special || /^特殊 くの字/.test(r.punch || '') ? '○ くの字' : '○ ヤゲン替え');
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
    alt && !r.special && !/^特殊 くの字/.test(r.punch || '')
      ? { name: `ヤゲン ${r.punch}`, mark: '○', ok: true, note: 'ヤゲンを替える' }
      : { name: 'くの字特殊ヤゲン', mark: alt ? '○' : '✕', ok: alt,
        note: alt && r.special ? `L ${r.special.win}mm 以内（いま ${L}mm）`
          : alt ? 'くの字で曲げる'
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
// 実績の登録。曲がると分かっているものはボタン1つで登録できる（型・曲げ方は判定の答えから入れる）。
function RecordPanel({ shape, mat, t, dims, L, list, best, recs, dir, pendingDir, connect, saveRec, dropRec, msg }) {
  const [open, setOpen] = useState(false);           // 型や曲げ方を自分で選びたいとき
  const [V, setV] = useState(best ? best.row.id : list[0].row.id);
  const [method, setMethod] = useState('normal');
  const [note, setNote] = useState('');
  const [who, setWho] = useState(() => { try { return localStorage.getItem('zu.who') || ''; } catch { return ''; } });
  // 判定の答えの曲げ方を、そのまま既定にする
  const autoMethod = best && best.src === '中押し' ? 'naka' : best && best.special ? 'kuno' : 'normal';
  useEffect(() => { if (best) { setV(best.row.id); setMethod(autoMethod); } }, [best && best.row.id, autoMethod, shape, t]);
  const picked = list.find((r) => r.row.id === V) || list[0];
  const row = picked.row;
  const done = recMatch(row, shape, dims, L, recs).ok;     // すでに実績がある寸法
  const mine = recs.filter((r) => r.shape === shape && r.mat === mat && r.t === t);
  const save = (ok) => {
    try { localStorage.setItem('zu.who', who.trim()); } catch { /* 無視 */ }
    const m = open ? method : autoMethod;
    saveRec({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), who: who.trim(),
      shape, mat, t, V: row.V, machine: row.machine, sel: row.sel, dims: dims.map(Number), L: L > 0 ? L : null,
      method: m.startsWith('kuno') ? 'kuno' : m,
      punch: m === 'kuno' ? '特殊 くの字165' : m === 'kuno100' ? '特殊 くの字100' : '904061',
      ok, lenFail: false, note: note.trim(),
      // そのときの計算（○✕と余裕）も残す。次からの「要る余裕」の学習に使う
      case: { key: null, sim: picked.grade !== 'ng', gap: typeof picked.gap === 'number' ? picked.gap : null },
    });
    setNote('');
  };
  const dieName = `${(list.find((r) => r.row.id === V) || list[0]).die}（${row.machine}）`;
  const size = shape === 'Z' ? `A${dims[0]}・S${dims[1]}・B${dims[2]}` : `H${dims[0]}・W${dims[1]}・H${dims[2]}`;
  return (
    <div className="card rec" style={{ marginTop: 12 }}>
      <h2>実績を登録</h2>
      {!folderSupported() ? (
        <div className="hint">登録は会社PCの Chrome・Edge でできます（共有フォルダに保存するため）。</div>
      ) : !dir ? (
        <div>
          <button className="copy" onClick={connect}>{pendingDir ? '共有フォルダにつなぐ' : '共有フォルダを選ぶ'}</button>
          <div className="hint">シミュレーターと同じ「曲げシミュレーション」フォルダを選んでください。</div>
        </div>
      ) : (
        <>
          {done ? (
            <div className="rec-done"><b>登録済みです</b><div>{recText(done)}</div></div>
          ) : (
            <div className="rec-now">{size}　{mat} t{t}　L{L || '—'}　／　{dieName}</div>
          )}
          <div className="rec-ask">実際はどうでしたか</div>
          <div className="rec-btns">
            <button className="big ok" onClick={() => save(true)}>○ 曲がった（登録）</button>
            <button className="big ng" onClick={() => save(false)}>✕ 曲がらなかった</button>
          </div>
          <button className="linkish" onClick={() => setOpen(!open)}>{open ? '閉じる' : '型・曲げ方・名前を変える'}</button>
          {open && (
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
              <label className="f"><span>確かめた人（任意）</span>
                <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="例：曲げ 田中" />
              </label>
            </div>
          )}
          {open && <input className="rec-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="ひとこと（当たった所 など）" />}
          {msg && <div className="hint">{msg}</div>}
          {mine.length > 0 && (
            <table className="kt rec-list">
              <thead><tr><th>日付</th><th>型</th><th>寸法</th><th>L</th><th>曲げ方</th><th>結果</th><th></th></tr></thead>
              <tbody>
                {mine.map((r) => (
                  <tr key={r.id}>
                    <td>{String(r.at).slice(5, 10)}</td>
                    <td>V{r.V}{/^lib:30[56]40:/.test(r.sel || '') ? ' 2溝' : ''}</td>
                    <td>{(r.dims || []).join('・')}</td>
                    <td>{r.L || '—'}</td>
                    <td>{(METHOD_JA[r.method] || '').replace(/で$|に$/, '')}</td>
                    <td className={r.ok ? 'g ok-sim' : 'g ng'}>{r.ok ? '○' : '✕'}</td>
                    <td><button className="del" onClick={() => { if (confirm('この実績を消しますか？')) dropRec(r.id); }}>消す</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
                {best.clash && <div className="hint">⚠ 反対の実績もあります（{recText(best.clash.ng)}）。実績の一覧で確かめてください</div>}
                {best.learn && (
                  <div className="hint">実績から学習（この型の記録 {best.learn.n}件）：
                    {best.learn.need != null ? `余裕 ${best.learn.need}mm 以上ないと曲がらなかったので、その線で見ています` : ''}
                    {best.learn.allow != null ? `${best.learn.need != null ? '／' : ''}絵で ${best.learn.allow}mm 当たっても曲がった実績があります` : ''}
                  </div>
                )}
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
          <div className="limits">
            <LimitDetail shape={shape} row={shown.row} x={x} y={y} other={Math.max(dims[0], dims[2])} />
            <LimitChart shape={shape} row={shown.row} x={x} y={y} grade={shown.grade} />
            <QuickTable shape={shape} row={shown.row} x={x} />
          </div>
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
