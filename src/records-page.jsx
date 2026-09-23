// 実績の一覧。
// シミュレーター・かんたん判定・Z曲げ／コの字判定のどこから登録したものも、
// 共有フォルダ bendsim.json の zuRecords に貯まる。ここではそれを全部見て、消せる。
import React, { useState, useMemo, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { folderSupported, loadFolder, pickFolder, permission, pull as folderPull, push as folderPush } from './cloud.js';
import { METHOD_JA } from '../zu/judge.js';
import './check.css';

const SHAPE_JA = { L: 'L曲げ', U: 'コの字', Z: 'Z曲げ', HAT: 'ハット', free: 'その他' };
const dieName = (r) => `V${r.V || '—'}${/^lib:30[56]40:/.test(r.sel || '') ? ' 2溝' : ''}`;

// 同じ型・材質・板厚で、実績が食い違っていないか（同じくらいの寸法で ○ と ✕ の両方がある）
function conflicts(list) {
  const out = [];
  const key = (r) => [r.shape, r.mat, r.t, r.V, r.sel].join('|');
  const by = new Map();
  for (const r of list) by.set(key(r), [...(by.get(key(r)) || []), r]);
  for (const [k, rs] of by) {
    const ok = rs.filter((r) => r.ok), ng = rs.filter((r) => !r.ok);
    for (const a of ok) {
      for (const b of ng) {
        // ○ のほうが ✕ と同じか、きつい寸法（＝おかしい）
        const same = a.dims.length === b.dims.length
          && a.dims.every((x, i) => Math.abs(x - b.dims[i]) <= 5);
        const harder = a.shape === 'Z'
          ? a.dims[1] <= b.dims[1] && Math.min(a.dims[0], a.dims[2]) >= Math.min(b.dims[0], b.dims[2])
          : a.shape === 'U'
            ? Math.abs(a.dims[1] - b.dims[1]) <= 5 && Math.min(a.dims[0], a.dims[2]) >= Math.min(b.dims[0], b.dims[2])
            : same;
        if (same || harder) out.push({ k, ok: a, ng: b });
      }
    }
  }
  return out;
}

function App() {
  const [dir, setDir] = useState(null);
  const [pendingDir, setPendingDir] = useState(null);
  const [recs, setRecs] = useState([]);
  const [msg, setMsg] = useState('');
  const [shape, setShape] = useState('すべて');
  const [mat, setMat] = useState('すべて');
  const [tSel, setTSel] = useState('すべて');
  const [die, setDie] = useState('すべて');

  const open = async (d) => {
    try {
      const { data } = await folderPull(d);
      setRecs(data.zuRecords || []); setDir(d); setPendingDir(null);
      setMsg(`共有フォルダの実績 ${(data.zuRecords || []).length} 件を読みました`);
    } catch (e) { setMsg(`読めませんでした：${e.message}`); }
  };
  useEffect(() => {
    if (!folderSupported()) return;
    (async () => {
      const d = await loadFolder();
      if (!d) return;
      if (await permission(d, false) === 'granted') open(d); else setPendingDir(d);
    })();
  }, []);
  const connect = async () => {
    try {
      const d = pendingDir || await pickFolder();
      if (await permission(d, true) === 'granted') await open(d);
    } catch (e) { if (!(e && e.name === 'AbortError')) setMsg(`つながりませんでした：${e.message || e}`); }
  };
  const drop = async (id) => {
    if (!dir) return;
    try { const d = await folderPush(dir, { removeZu: [id] }); setRecs(d.zuRecords || []); setMsg('消しました'); }
    catch (e) { setMsg(`消せませんでした：${e.message}`); }
  };

  const uniq = (f) => ['すべて', ...[...new Set(recs.map(f).filter((x) => x != null && x !== ''))].sort()];
  const list = useMemo(() => recs.filter((r) => (shape === 'すべて' || r.shape === shape)
    && (mat === 'すべて' || r.mat === mat)
    && (tSel === 'すべて' || String(r.t) === String(tSel))
    && (die === 'すべて' || dieName(r) === die)), [recs, shape, mat, tSel, die]);
  const bad = useMemo(() => conflicts(recs), [recs]);
  const badIds = new Set(bad.flatMap((c) => [c.ok.id, c.ng.id]));

  return (
    <div className="wrap">
      <header>
        <h1>実績の一覧</h1>
        <p>シミュレーター・かんたん判定・Z曲げ／コの字判定のどこから登録したものも、ここに全部出ます。</p>
      </header>

      <section className="card">
        {!folderSupported() ? (
          <div className="hint">会社PCの Chrome・Edge で開いてください（共有フォルダを読むため）。</div>
        ) : !dir ? (
          <div>
            <button className="more" onClick={connect}>{pendingDir ? '共有フォルダにつなぐ' : '共有フォルダを選ぶ'}</button>
            <div className="hint">シミュレーターと同じ「曲げシミュレーション」フォルダを選んでください。</div>
          </div>
        ) : (
          <>
            <div className="row">
              {[['形', shape, setShape, uniq((r) => r.shape), (v) => SHAPE_JA[v] || v],
                ['材質', mat, setMat, uniq((r) => r.mat), (v) => v],
                ['板厚', tSel, setTSel, uniq((r) => r.t), (v) => v],
                ['型', die, setDie, uniq(dieName), (v) => v]].map(([lb, val, set, opts, show]) => (
                  <label key={lb} className="inl" style={{ width: 120 }}><span>{lb}</span>
                    <select value={val} onChange={(e) => set(e.target.value)}>
                      {opts.map((o) => <option key={o} value={o}>{show(o)}</option>)}
                    </select>
                  </label>
                ))}
            </div>
            <div className="hint">{list.length} 件（全部で {recs.length} 件）。{msg}</div>
          </>
        )}
      </section>

      {bad.length > 0 && (
        <section className="card warnbox">
          <b>⚠ 実績が食い違っています（{bad.length}組）</b>
          <div className="hint">同じ型・材質・板厚で、「曲がった」ほうが「曲がらなかった」と同じかきつい寸法になっています。どちらかが間違いのはずなので、確かめて消してください。</div>
          <ul>
            {bad.slice(0, 10).map((c, i) => (
              <li key={i}>
                {dieName(c.ok)}・{c.ok.mat} t{c.ok.t}：○ {c.ok.dims.join('・')}（{String(c.ok.at).slice(0, 10)}）
                ／ ✕ {c.ng.dims.join('・')}（{String(c.ng.at).slice(0, 10)}）
              </li>
            ))}
          </ul>
        </section>
      )}

      {dir && (
        <section>
          <table className="rec-list">
            <thead>
              <tr><th>日付</th><th>形</th><th>材質・板厚</th><th>型</th><th>寸法（外寸）</th><th>L</th><th>曲げ方</th><th>結果</th><th>確かめた人</th><th>ひとこと</th><th /></tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id} className={badIds.has(r.id) ? 'bad' : ''}>
                  <td>{String(r.at).slice(0, 10)}</td>
                  <td>{SHAPE_JA[r.shape] || r.shape}</td>
                  <td>{r.mat} t{r.t}</td>
                  <td>{dieName(r)}<div className="sub2">{r.machine}</div></td>
                  <td>{(r.dims || []).join('・')}</td>
                  <td>{r.L || '—'}</td>
                  <td>{(METHOD_JA[r.method] || '').replace(/で$|に$/, '')}{r.case ? '' : ''}</td>
                  <td className={r.ok ? 'g-ok' : 'g-ng'}>{r.ok ? '○' : r.lenFail ? '✕ 長さ' : '✕'}
                    {r.case && typeof r.case.gap === 'number' && <div className="sub2">余裕 {r.case.gap}mm</div>}
                  </td>
                  <td>{r.who || '—'}</td>
                  <td>{r.note || ''}</td>
                  <td><button className="del" onClick={() => { if (confirm('この実績を消しますか？')) drop(r.id); }}>消す</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <div className="hint">まだありません。</div>}
          <div className="hint">
            「余裕」が入っているものはシミュレーターで記録したもので、判定の当たりの線（要る余裕）の学習に使われます。
          </div>
        </section>
      )}

      <footer>
        <div className="links">
          <a href="./">シミュレーター</a>
          <a href="./check.html">かんたん判定</a>
          <a href="./zu/">Z曲げ・コの字 判定</a>
          <a href="./dash/">確認資料の一覧</a>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
