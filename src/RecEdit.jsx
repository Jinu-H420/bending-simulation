// 登録した実績を、あとから直すための入力欄（実績一覧・かんたん判定・Z/コの字判定の登録欄の一覧で共用）。
// 2026-10-10 ユーザー指示：押し直すと「ひとこと」が足されていくだけだったので、その場で書き直せるようにする。
// 寸法・型は直さない（違う品物になるので、消して登録し直す）。
import React, { useState } from 'react';
import { deviceId } from './records.js';

const CAUSE_JA = { die: '型に当たった（この型だけ）', out: '曲げた後に抜けられない（どの型でも）' };
const METHODS = [['normal', '普通（904061）'], ['kuno', 'くの字165'], ['kuno100', 'くの字100'], ['naka', '中押し']];
const methodOf = (r) => (r.method === 'kuno' && /100/.test(r.punch || '') ? 'kuno100' : r.method || 'normal');

// 直した中身を、元の実績に重ねる（id と登録日はそのまま。直した日と PC を残す）
export function editedRecord(rec, f) {
  const m = f.method;
  const next = {
    ...rec,
    ok: f.ok, who: f.who.trim(), slip: f.slip.trim(), note: f.note.trim(),
    method: m.startsWith('kuno') ? 'kuno' : m,
    punch: m === 'kuno' ? '特殊 くの字165' : m === 'kuno100' ? '特殊 くの字100' : '904061',
    editedAt: new Date().toISOString(), editedBy: deviceId(),
  };
  if (f.ok) delete next.cause; else next.cause = f.cause;
  return next;
}

export function RecEditForm({ rec, onSave, onCancel, busy }) {
  const [f, setF] = useState({
    ok: !!rec.ok, cause: rec.cause || 'die', method: methodOf(rec),
    who: rec.who || '', slip: rec.slip || '', note: rec.note || '',
  });
  const up = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="rec-edit">
      <div className="re-row">
        <span className="re-seg">
          <button className={f.ok ? 'on ok' : ''} onClick={() => setF({ ...f, ok: true })}>○ 曲がった</button>
          <button className={!f.ok ? 'on ng' : ''} onClick={() => setF({ ...f, ok: false })}>✕ 曲がらなかった</button>
        </span>
        {!f.ok && (
          <label><span>理由</span>
            <select value={f.cause} onChange={up('cause')}>
              {Object.entries(CAUSE_JA).map(([k, w]) => <option key={k} value={k}>{w}</option>)}
            </select>
          </label>
        )}
        <label><span>曲げ方</span>
          <select value={f.method} onChange={up('method')}>
            {METHODS.map(([k, w]) => <option key={k} value={k}>{w}</option>)}
          </select>
        </label>
      </div>
      <div className="re-row">
        <label><span>確かめた人</span><input value={f.who} onChange={up('who')} placeholder="例：曲げ 田中" /></label>
        <label><span>伝票番号</span><input value={f.slip} onChange={up('slip')} /></label>
      </div>
      <label className="re-note"><span>ひとこと</span>
        <textarea rows={2} value={f.note} onChange={up('note')} placeholder="当たった所・お客さん など" />
      </label>
      <div className="re-btns">
        <button className="re-save" disabled={busy} onClick={() => onSave(editedRecord(rec, f))}>この内容で直す</button>
        <button className="re-cancel" onClick={onCancel}>やめる</button>
        <span className="re-hint">寸法・型は直せません（違う品物になるので、消して登録し直してください）</span>
      </div>
    </div>
  );
}
