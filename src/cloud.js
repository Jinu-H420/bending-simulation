// 段取り（入力した数値一式）と実績記録を、社内の共有フォルダに置くための入れ物。
//
// 置き場所：\\srv02\共有\データフォルダ\ユーザー共有用\地主\claudecode\曲げシミュレーション
//   bendsim.json   { version, savedAt, savedBy, current: 最後の段取り, saves: [名前付き], records: [実績] }
//   履歴\bendsim_YYYYMMDD.json   その日最初に保存する前の中身（壊れたとき戻す用）
//
// ブラウザ（Chrome・Edge）のフォルダ読み書き機能を使う。最初に1回フォルダを選ぶと、
// 選んだフォルダをブラウザが覚えている。iPhone など使えない端末では何もしない。

const FILE = 'bendsim.json';
const DB = 'bendsim-folder';

export const folderSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

// 選んだフォルダはブラウザ内の IndexedDB に覚えさせる（localStorage には入らない）
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('h');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('h', mode);
      const req = fn(tx.objectStore('h'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}
export const loadFolder = async () => {
  try { return (await idb('readonly', (s) => s.get('dir'))) || null; } catch { return null; }
};
const keepFolder = (h) => idb('readwrite', (s) => (h ? s.put(h, 'dir') : s.delete('dir'))).catch(() => {});

// 読み書きの許可。'granted' ならそのまま使える。'prompt' はボタンを押してもらって聞く。
export async function permission(dir, ask) {
  const opt = { mode: 'readwrite' };
  let p = await dir.queryPermission(opt);
  if (p !== 'granted' && ask) p = await dir.requestPermission(opt);
  return p;
}

export async function pickFolder() {
  const dir = await window.showDirectoryPicker({ id: 'bendsim', mode: 'readwrite' });
  await keepFolder(dir);
  return dir;
}
export const forgetFolder = () => keepFolder(null);

// 画面にそのまま出せる言葉にした失敗
const fail = (msg) => Object.assign(new Error(msg), { friendly: true });

const empty = () => ({ version: 1, current: null, saves: [], records: [] });

export async function pull(dir) {
  let fh;
  try {
    fh = await dir.getFileHandle(FILE);
  } catch (e) {
    if (e && e.name === 'NotFoundError') return { data: empty() };
    throw fail(why(e));
  }
  const text = await (await fh.getFile()).text();
  if (!text.trim()) return { data: empty() };
  try {
    return { data: { ...empty(), ...JSON.parse(text) } };
  } catch {
    throw fail(`${FILE} が壊れています。履歴フォルダの前の日のファイルを bendsim.json に名前を変えて戻してください`);
  }
}

const why = (e) => (
  e && e.name === 'NotAllowedError' ? 'フォルダを使う許可がありません。「つなぐ」を押して許可してください'
  : e && e.name === 'NotFoundError' ? 'フォルダが見つかりません（サーバーにつながっているか確認）'
  : e && e.name === 'NoModificationAllowedError' ? 'ほかのPCが書き込み中です。少し待ってもう一度'
  : `読み書きできませんでした（${e && e.message ? e.message : e}）`
);

// 実績は足し算で混ぜる（同じ鍵は回数の多いほう）。ほかのPCで足した記録を消さないため。
export function mergeRecords(a, b) {
  const byKey = new Map((a || []).map((r) => [r.key, r]));
  for (const r of b || []) {
    if (!r || !r.key) continue;
    const cur = byKey.get(r.key);
    if (!cur || (r.n || 1) > (cur.n || 1) || ((r.n || 1) === (cur.n || 1) && r.at > cur.at)) byKey.set(r.key, r);
  }
  return [...byKey.values()].sort((x, y) => (x.at < y.at ? 1 : -1));
}

async function writeText(dir, name, text) {
  const fh = await dir.getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(text);
  await w.close();
}

// 書く。直前に読み直して、ほかのPCの記録と名前付き保存を混ぜてから上書きする。
// change: { current?, saveAs?: 名前, removeSave?: 名前, records?, removeKeys?: 消した実績の鍵 }
export async function push(dir, change, who) {
  try {
    const { data } = await pull(dir);
    // その日最初の保存の前に、今の中身を履歴に写しておく
    const d = new Date();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    if (data.savedAt) {
      const hist = await dir.getDirectoryHandle('履歴', { create: true });
      try { await hist.getFileHandle(`bendsim_${ymd}.json`); } catch {
        await writeText(hist, `bendsim_${ymd}.json`, JSON.stringify(data, null, 1));
      }
    }
    const now = d.toISOString();
    const next = { ...data, version: 1, savedAt: now, savedBy: who || '' };
    if (change.current) next.current = { at: now, params: change.current };
    if (change.saveAs && change.current) {
      next.saves = [{ name: change.saveAs, at: now, params: change.current },
        ...(data.saves || []).filter((s) => s.name !== change.saveAs)];
    }
    if (change.removeSave) next.saves = (data.saves || []).filter((s) => s.name !== change.removeSave);
    let recs = mergeRecords(data.records, change.records);
    if (change.removeKeys && change.removeKeys.length) recs = recs.filter((r) => !change.removeKeys.includes(r.key));
    next.records = recs;
    await writeText(dir, FILE, JSON.stringify(next, null, 1));
    return next;
  } catch (e) {
    throw e && e.friendly ? e : fail(why(e));
  }
}
