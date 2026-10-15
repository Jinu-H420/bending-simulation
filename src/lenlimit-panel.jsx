// 小さいVで曲げられる最長の曲げ長さ L（耐圧）を、画面から登録する欄。
// 2026-10-16 ユーザー：「PL9 で V40 は L500 まで」のように実績の確認で分かったら、Webアプリに入れれば判定に反映するように。
// 置き場所は共有フォルダ bendsim.json の lenLimits（鍵 '材質|板厚|V' で1件）。プログラムの SMALLV_MAXL より優先する。
import React, { useState, useEffect } from 'react';
import { NOBI_TABLE, smallVCheck, SMALLV_MAXL } from '../bending-simulator.jsx';
import { deviceId } from './records.js';
import './lenlimit.css';

// その板厚で使う、基準より小さいV（折り曲げ表でその板厚を扱う型だけ）
export function smallVs(mat, t) {
  const m = mat === '縞' ? '縞' : '鉄';
  const tab = NOBI_TABLE[m] || {};
  return Object.keys(tab).map(Number).filter((V) => {
    const ts = Object.keys(tab[V] || {}).map(Number);
    return ts.length && t <= Math.max(...ts) + 1.5 && t >= Math.min(...ts) - 1 && smallVCheck(m, t, V);
  }).sort((a, b) => a - b);
}

export function LenLimitPanel({ mat, t, pickV, list, dir, save, drop, msg }) {
  const m = mat === '縞' ? '縞' : '鉄';
  const tt = Number(t);
  const Vs = smallVs(m, tt);
  const [V, setV] = useState(pickV && Vs.includes(pickV) ? pickV : Vs[0]);
  const [L, setL] = useState('');
  const [note, setNote] = useState('');
  const [who, setWho] = useState(() => { try { return localStorage.getItem('zu.who') || ''; } catch { return ''; } });
  useEffect(() => { if (pickV && Vs.includes(pickV)) setV(pickV); else if (!Vs.includes(V)) setV(Vs[0]); }, [pickV, m, tt]);
  if (!Vs.length || !dir) return null;
  const sv = smallVCheck(m, tt, V);
  const rows = Vs.map((v) => {
    const k = `${m}|${tt}|${v}`;
    const reg = (list || []).find((x) => x.key === k);
    return { V: v, k, reg, code: SMALLV_MAXL[k] };
  });
  const ok = Number(L) > 0;
  const add = () => {
    if (!ok) return;
    try { localStorage.setItem('zu.who', who.trim()); } catch { /* 無視 */ }
    save({ key: `${m}|${tt}|${V}`, mat: m, t: tt, V, maxL: Number(L), who: who.trim(), note: note.trim(), dev: deviceId(), at: new Date().toISOString() });
    setL(''); setNote('');
  };
  return (
    <div className="lenreg">
      <div className="lenreg-h">小さいVの最長L（耐圧）を登録</div>
      <div className="lenreg-hint">
        板厚 t{tt} の基準は V{sv ? sv.baseV : '—'}。それより小さいVは、長いと金型の耐圧が足りず曲がりません。
        確かめた「L 何mm まで曲がる」を入れると、次の判定から、それより長いものは ✕ になります。
      </div>
      <div className="lenreg-row">
        <label><span>型</span>
          <select value={V} onChange={(e) => setV(Number(e.target.value))}>
            {Vs.map((v) => <option key={v} value={v}>V{v}</option>)}
          </select>
        </label>
        <label><span>{m} t{tt} で L 何mm まで</span>
          <input inputMode="numeric" value={L} onChange={(e) => setL(e.target.value.replace(/[^\d.]/g, ''))} placeholder="例：500" />
        </label>
        <label><span>確かめた人（任意）</span>
          <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="例：曲げ 田中" />
        </label>
        <label className="wide"><span>ひとこと（任意）</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="例：L700 は耐圧で NG" />
        </label>
        <button disabled={!ok} onClick={add}>登録</button>
      </div>
      {msg && <div className="lenreg-hint">{msg}</div>}
      <table className="lenreg-list">
        <thead><tr><th>型</th><th>最長L</th><th>どこの値</th><th>確かめた人・ひとこと</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td>V{r.V}</td>
              <td><b>{r.reg ? `${r.reg.maxL}mm` : r.code != null ? `${r.code}mm` : '確認中'}</b></td>
              <td className="sub">{r.reg ? `登録 ${new Date(r.reg.at).toLocaleDateString('ja-JP')}` : r.code != null ? 'プログラム' : '—'}</td>
              <td className="sub">{r.reg ? [r.reg.who, r.reg.note].filter(Boolean).join('・') : ''}</td>
              <td>{r.reg && <button className="del" onClick={() => { if (confirm(`V${r.V} の登録を消しますか？`)) drop(r.k); }}>消す</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
