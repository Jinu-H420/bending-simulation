// 曲げた／曲げられなかった実績の入れ物。
//
// 置き場所は1か所だけ：共有フォルダ bendsim.json の `zuRecords`。
// シミュレーター・かんたん判定・Z曲げ・コの字判定のどこから登録しても、同じ所に貯まる。
// 共有フォルダにつないでいない間は、このPCのブラウザにも同じ形で控えを置き、つないだときに送る。
//
// 1件の形（zuRecord）
//   { id, at, who, shape, mat, t, V, machine, sel, dims, L, method, punch, ok, lenFail, note,
//     n（同じ段取りで記録した回数）, case: { key, sim, segs, bends, seq, dieFlip, punchFlip } }
//   case はシミュレーターで記録したときだけ入る（同じ段取りを開いたら、その実績を先に出すため）。

const KEY = 'bendsim.zurecords.v1';
const OLD = 'bendsim.records.v2';   // 前の形（このPCだけに残っているもの）。読むときに新しい形へ直す

// 記録を引くときの鍵。ここに入れた項目が一致したものを「同じ条件」とみなす。
// 寸法は 1mm 刻みに丸める（0.1mm 違いで別物にすると永遠に貯まらない）。
export function caseKey(c) {
  return [
    c.die, c.dieFlip ? 'F' : '-',
    c.punch, c.punchFlip ? 'F' : '-',
    c.machine, c.mat, `t${c.t}`,
    c.segs.map((x) => Math.round(x)).join('/'),
    c.bends.map((b) => `${Math.round(b.angle)}${b.dir > 0 ? '山' : '谷'}`).join(''),
    c.seq.map((s) => `${s.bend + 1}${s.mirror ? '⇄' : ''}${s.valley ? '裏' : ''}`).join('>'),
  ].join('|');
}

// 金型と板だけの、ゆるい鍵。寸法違いでも「この型でこの板厚」の傾向を見る。
export const loosKey = (c) => [c.die, c.dieFlip ? 'F' : '-', c.mat, `t${c.t}`].join('|');
const looseOf = (r) => [r.sel, r.case && r.case.dieFlip ? 'F' : '-', r.mat, `t${r.t}`].join('|');

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// 前の形（key・bent・die…）を、いまの形（zuRecord）に直す
function fromOld(r) {
  return {
    id: r.id || newId(), at: r.at || '', who: r.who || '', shape: r.shape || 'free',
    mat: r.mat, t: r.t, V: r.V || null, machine: r.machine, sel: r.die, dims: r.segs || [],
    L: r.L || null, method: 'normal', punch: r.punch, ok: !!r.bent, lenFail: false, note: r.note || '', n: r.n || 1,
    case: { key: r.key, sim: r.sim, segs: r.segs, bends: r.bends, seq: r.seq, dieFlip: !!r.dieFlip, punchFlip: !!r.punchFlip },
  };
}

export function loadRecords() {
  const read = (k) => { try { const a = JSON.parse(localStorage.getItem(k) || 'null'); return Array.isArray(a) ? a : []; } catch { return []; } };
  const cur = read(KEY);
  if (cur.length) return cur;
  const old = read(OLD).map(fromOld);      // 前の形しかないPCは、ここで移し替える
  if (old.length) save(old);
  return old;
}

function save(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

// 2つの一覧を混ぜる（id が同じものは新しいほう）。共有フォルダとこのPCの控えを合わせるのに使う
export function mergeRecords(a, b) {
  const m = new Map((a || []).map((r) => [r.id, r]));
  for (const r of b || []) {
    if (!r || !r.id) continue;
    const cur = m.get(r.id);
    if (!cur || (r.at || '') >= (cur.at || '')) m.set(r.id, r);
  }
  const next = [...m.values()].sort((x, y) => ((x.at || '') < (y.at || '') ? 1 : -1));
  save(next);
  return next;
}

// シミュレーターの「実際はどうでしたか」から1件足す。
// 同じ段取り（case.key が同じ）の記録があれば、回数を足して最新の結果で上書きする。
export function addRecord(list, c, bent, note, who) {
  const key = caseKey(c);
  const d = new Date();   // 記録の日時は日本時間（端末の時刻）で残す
  const p2 = (n) => String(n).padStart(2, '0');
  const now = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const next = list.slice();
  const i = next.findIndex((r) => r.case && r.case.key === key);
  const one = {
    id: i >= 0 ? next[i].id : newId(), at: now, who: (who || '').trim(), shape: c.shape || 'free',
    mat: c.mat, t: c.t, V: c.V || null, machine: c.machine === 'hg2203' ? 'HG2203' : 'HD3504NT', sel: c.die,
    dims: (c.dims || c.segs).map((x) => +Number(x).toFixed(1)), L: c.L || null,
    method: c.method || 'normal', punch: c.punch, ok: !!bent, lenFail: false, note: note || '', n: 1,
    case: {
      key, sim: c.simOK, dieFlip: !!c.dieFlip, punchFlip: !!c.punchFlip,
      segs: c.segs.map((x) => +x.toFixed(1)),
      bends: c.bends.map((b) => ({ angle: b.angle, dir: b.dir })),
      seq: c.seq.map((s) => ({ bend: s.bend, mirror: !!s.mirror, valley: !!s.valley })),
    },
  };
  if (i >= 0) { one.n = (next[i].n || 1) + 1; one.note = note || next[i].note; next[i] = one; } else next.unshift(one);
  save(next);
  return { list: next, rec: one };
}

export function removeRecord(list, id) {
  const next = list.filter((r) => r.id !== id);
  save(next);
  return next;
}

// いまの段取りに当たる実績を探す。同じ段取りが最優先、次に同じ型・板厚のもの。
export function lookup(list, c) {
  const key = caseKey(c);
  const exact = list.find((r) => r.case && r.case.key === key) || null;
  const lk = loosKey(c);
  const similar = list.filter((r) => r !== exact && looseOf(r) === lk);
  return { exact, similar };
}

// 同じ型・板厚で、シミュレーションが外した回数。多いほどその型は当てにならない。
export function missRate(list, c) {
  const lk = loosKey(c);
  const rel = list.filter((r) => looseOf(r) === lk && r.case && r.case.sim != null);
  if (!rel.length) return null;
  return { n: rel.length, miss: rel.filter((r) => r.case.sim !== r.ok).length };
}

export function exportJSON(list) {
  return JSON.stringify({ version: 3, savedAt: new Date().toISOString(), zuRecords: list }, null, 1);
}

// 読み込みは足し算（id で混ぜる）。前の形のファイルも読める。
export function importJSON(list, text) {
  const obj = JSON.parse(text);
  const raw = Array.isArray(obj) ? obj : (obj.zuRecords || obj.records || []);
  const incoming = raw.map((r) => (r && r.key && r.bent !== undefined ? fromOld(r) : r));
  return mergeRecords(list, incoming);
}
