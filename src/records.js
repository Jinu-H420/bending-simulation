// 曲げた／曲げられなかった実績の入れ物。
//
// 置き場所は1か所だけ：共有フォルダ bendsim.json の `zuRecords`。
// シミュレーター・かんたん判定・Z曲げ・コの字判定のどこから登録しても、同じ所に貯まる。
// 共有フォルダにつないでいない間は、このPCのブラウザにも同じ形で控えを置き、つないだときに送る。
//
// 1件の形（zuRecord）
//   { id, at, who, slip（伝票番号・任意）, dev（登録したPCの番号・自動）, shape, mat, t, V, machine, sel, dims, L, method, punch, ok, lenFail, note,
//     n（同じ段取りで記録した回数）, case: { key, sim, segs, bends, seq, dieFlip, punchFlip } }
//   case はシミュレーターで記録したときだけ入る（同じ段取りを開いたら、その実績を先に出すため）。

const KEY = 'bendsim.zurecords.v1';
const DEV = 'bendsim.device.v1';    // このPCの番号（自動）
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

// このPCの番号。ブラウザは Windows の PC 名を読めないので、初めて開いたときに
// 番号を自動で作ってそのブラウザに覚えさせ、実績に付ける（名前を入れなくても「どのPCから」が分かる）。
// ブラウザの保存を消すと新しい番号になる。
export function deviceId() {
  try {
    const cur = localStorage.getItem(DEV);
    if (cur) return cur;
    const id = `PC-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    localStorage.setItem(DEV, id);
    return id;
  } catch { return ''; }
}

// 前の形（key・bent・die…）を、いまの形（zuRecord）に直す
function fromOld(r) {
  return {
    id: r.id || newId(), at: r.at || '', who: r.who || '', slip: r.slip || '', dev: r.dev || '', shape: r.shape || 'free',
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

// 登録した時刻（ミリ秒）。シミュレーターは「2026-10-08 13:45」（日本時間）、ほかは「2026-10-08T04:45:00Z」で
// 書いているので、文字のまま比べると順番が崩れる。時刻に直して比べる
export function atMs(r) {
  const s = String((r && r.at) || '');
  const ms = Date.parse(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isFinite(ms) ? ms : 0;
}
// 新しい順（登録した新しいものが上）
export const byNewest = (a, b) => atMs(b) - atMs(a);

// 同じ内容の実績かを見る鍵。シミュレーターの記録は段取り（case.key）、
// ほかは 形・材質・板厚・型・寸法・L・曲げ方・ヤゲン。○✕ は鍵に入れない（同じ条件なら新しい結果で上書き）
export function sameKey(r) {
  if (r.case && r.case.key) return `sim|${r.case.key}`;
  if (r.key && r.bent !== undefined) return `old|${r.key}`;   // 前の形の記録（共有フォルダの records）
  return [r.shape, r.mat, Number(r.t), r.V || '', r.sel || '',
    (r.dims || []).map((x) => +Number(x).toFixed(1)).join('/'), r.L || '', r.method || 'normal', r.punch || '', r.lenFail ? 'L' : '']
    .join('|');
}
// 同じ内容の重複を、新しい1件だけにする
function dedupe(list) {
  const seen = new Set();
  return list.slice().sort(byNewest).filter((r) => {
    const k = sameKey(r);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}
// ひとことを足す。前のものは消さない（同じなら1つ）。2026-10-09：上書きでひとことが消えて困ったため
const joinNote = (a, b) => {
  const x = (a || '').trim(), y = (b || '').trim();
  if (!x) return y;
  if (!y || x.includes(y)) return x;
  if (y.includes(x)) return y;
  return `${x}／${y}`;
};
// 実績を足す。同じ id か同じ内容の記録があれば、足さずに上書きする（何回押しても1件のまま）。
// 名前・伝票番号を空で押したときは前のものを残し、ひとことは前のものに足し、回数 n を足す。返すのは新しい順
export function upsertRecords(list, incoming) {
  let next = (list || []).slice();
  for (const r of incoming || []) {
    if (!r || !r.id) continue;
    const byId = next.find((x) => x.id === r.id);
    if (byId) {
      if (atMs(r) >= atMs(byId)) next = next.map((x) => (x.id === r.id ? r : x));
      continue;
    }
    const old = next.find((x) => sameKey(x) === sameKey(r));
    if (!old) { next.push(r); continue; }
    next = next.filter((x) => x !== old);
    next.push({ ...r, who: r.who || old.who || '', slip: r.slip || old.slip || '', note: joinNote(old.note, r.note),
      ...(r.ok ? {} : { cause: r.cause || old.cause }),
      n: (old.n || 1) + 1 });
  }
  return dedupe(next);
}

// 2つの一覧を混ぜる（id が同じものは新しいほう。同じ内容のものも新しい1件にまとめる）。
// 共有フォルダとこのPCの控えを合わせるのに使う
export function mergeRecords(a, b) {
  const m = new Map((a || []).map((r) => [r.id, r]));
  for (const r of b || []) {
    if (!r || !r.id) continue;
    const cur = m.get(r.id);
    if (!cur || atMs(r) >= atMs(cur)) m.set(r.id, r);
  }
  const next = dedupe([...m.values()]);
  save(next);
  return next;
}

// シミュレーターの「実際はどうでしたか」から1件足す。
// 同じ段取り（case.key が同じ）の記録があれば、回数を足して最新の結果で上書きする。
export function addRecord(list, c, bent, note, who, slip) {
  const key = caseKey(c);
  const d = new Date();   // 記録の日時は日本時間（端末の時刻）で残す
  const p2 = (n) => String(n).padStart(2, '0');
  // 秒まで残す（同じ分に登録したほかの記録と、新しい順に並べられるように）
  const now = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
  const next = list.slice();
  const i = next.findIndex((r) => r.case && r.case.key === key);
  const one = {
    id: i >= 0 ? next[i].id : newId(), at: now, who: (who || '').trim(), slip: (slip || '').trim(), dev: deviceId(), shape: c.shape || 'free',
    mat: c.mat, t: c.t, V: c.V || null, machine: c.machine === 'hg2203' ? 'HG2203' : 'HD3504NT', sel: c.die,
    dims: (c.dims || c.segs).map((x) => +Number(x).toFixed(1)), L: c.L || null,
    method: c.method || 'normal', punch: c.punch, ok: !!bent, lenFail: false, note: note || '', n: 1,
    case: {
      key, sim: c.simOK, gap: typeof c.gap === 'number' ? +c.gap.toFixed(2) : null,
      dieFlip: !!c.dieFlip, punchFlip: !!c.punchFlip,
      segs: c.segs.map((x) => +x.toFixed(1)),
      bends: c.bends.map((b) => ({ angle: b.angle, dir: b.dir })),
      seq: c.seq.map((s) => ({ bend: s.bend, mirror: !!s.mirror, valley: !!s.valley })),
    },
  };
  // 上書きしたものも、登録した新しいものとして一番上に出す
  if (i >= 0) { one.n = (next[i].n || 1) + 1; one.note = note || next[i].note; next.splice(i, 1); }
  next.unshift(one);
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

// 実績から学ぶ「余裕」。使うほど判定が実物に近づく。
//   need  ：シミュレーションでは当たらない（余裕があった）のに曲がらなかった → その余裕では足りない
//   allow ：シミュレーションでは当たるのに曲がった → その分は当たっても曲がる（板が逃げるなど）
// どちらも同じ型・材質・板厚の記録だけを見る。記録が無ければ null。
export function learned(list, sel, mat, t) {
  // 「曲げた後に抜けられない」（cause:'out'）は型に当たったのではないので、余裕の学習には使わない
  const rel = (list || []).filter((r) => r.sel === sel && r.mat === mat && Number(r.t) === Number(t)
    && r.cause !== 'out' && r.case && typeof r.case.gap === 'number');
  if (!rel.length) return null;
  const tooTight = rel.filter((r) => !r.ok && r.case.gap >= -0.05).map((r) => r.case.gap);
  const bentAnyway = rel.filter((r) => r.ok && r.case.gap < -0.05).map((r) => -r.case.gap);
  const need = tooTight.length ? +(Math.max(...tooTight) + 0.1).toFixed(2) : null;
  const allow = bentAnyway.length ? +Math.max(...bentAnyway).toFixed(2) : null;
  if (need == null && allow == null) return null;
  return { n: rel.length, need, allow };
}
// 判定で使う「当たり」の境目。実績が無ければこれまでどおり -0.05mm
export const gapLimit = (lr) => (lr && lr.need != null ? lr.need : lr && lr.allow != null ? -lr.allow : -0.05);

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
