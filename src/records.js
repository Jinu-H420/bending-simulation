// 曲げた／曲げられなかった実績をためて、次の判定に使うための入れ物。
//
// 考え方：シミュレーションは幾何の当たり判定しかしていないので、台の形が
// 少し違う・板が逃げる・押さえ方が違う、といった現場の事情を知らない。
// そこで「実際どうだったか」を条件ごとに記録し、同じ条件が来たら
// シミュレーションの答えより実績を優先して出す。
//
// 保存先はブラウザの localStorage。書き出し／読み込みでファイルにもできる。

const KEY = 'bendsim.records.v2';

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
export function loosKey(c) {
  return [c.die, c.dieFlip ? 'F' : '-', c.mat, `t${c.t}`].join('|');
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const a = JSON.parse(raw);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];   // 読めない・保存が使えない環境でも動きは止めない
  }
}

function save(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// 1件足す。同じ鍵の記録が既にあれば、件数を足して最新の結果で上書きする。
export function addRecord(list, c, bent, note) {
  const key = caseKey(c);
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const next = list.slice();
  const i = next.findIndex((r) => r.key === key);
  const one = {
    key, loose: loosKey(c), bent, note: note || '',
    at: now, sim: c.simOK, n: 1,
    die: c.die, dieFlip: !!c.dieFlip, punch: c.punch, punchFlip: !!c.punchFlip,
    machine: c.machine, mat: c.mat, t: c.t, nobi: c.nobi,
    segs: c.segs.map((x) => +x.toFixed(1)),
    bends: c.bends.map((b) => ({ angle: b.angle, dir: b.dir })),
    seq: c.seq.map((s) => ({ bend: s.bend, mirror: !!s.mirror, valley: !!s.valley })),
  };
  if (i >= 0) {
    one.n = (next[i].n || 1) + 1;
    one.note = note || next[i].note;
    next[i] = one;
  } else {
    next.unshift(one);
  }
  save(next);
  return next;
}

export function removeRecord(list, key) {
  const next = list.filter((r) => r.key !== key);
  save(next);
  return next;
}

// いまの条件に当たる実績を探す。完全一致が最優先、次に同じ型・板厚のもの。
export function lookup(list, c) {
  const key = caseKey(c);
  const exact = list.find((r) => r.key === key) || null;
  const lk = loosKey(c);
  const similar = list.filter((r) => r.key !== key && r.loose === lk);
  return { exact, similar };
}

// 同じ型・板厚で、シミュレーションが外した回数。多いほどその型は当てにならない。
export function missRate(list, c) {
  const lk = loosKey(c);
  const rel = list.filter((r) => r.loose === lk && r.sim != null);
  if (!rel.length) return null;
  const miss = rel.filter((r) => r.sim !== r.bent).length;
  return { n: rel.length, miss };
}

export function exportJSON(list) {
  return JSON.stringify({ version: 2, savedAt: new Date().toISOString(), records: list }, null, 1);
}

// 読み込みは足し算。既にある鍵は件数の多いほうを残す。
export function importJSON(list, text) {
  const obj = JSON.parse(text);
  const incoming = Array.isArray(obj) ? obj : (obj.records || []);
  const byKey = new Map(list.map((r) => [r.key, r]));
  for (const r of incoming) {
    if (!r || !r.key) continue;
    const cur = byKey.get(r.key);
    if (!cur || (r.n || 1) > (cur.n || 1)) byKey.set(r.key, r);
  }
  const next = [...byKey.values()].sort((a, b) => (a.at < b.at ? 1 : -1));
  save(next);
  return next;
}
