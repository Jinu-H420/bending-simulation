// 会話で聞いた実績を、共有フォルダの bendsim.json（zuRecords）に1件足す。
// Z・コの字判定の「実績を登録」と同じ形で入れるので、次の判定からそのまま使われる。
// 使い方（1件）:
//   node scripts/add-zu-record.mjs '{"shape":"Z","mat":"鉄","t":4.5,"V":20,"machine":"HG2203","dims":[50,50,50],"L":1000,"method":"normal","ok":true,"who":"曲げ 田中（会話で確認）","note":""}'
//   shape: 'Z' | 'U'、dims: Z は [A,S,B]・コ は [H1,W,H2]（外寸）、method: 'normal' | 'kuno' | 'naka'
//   ok: 曲がった true／曲がらなかった false。長さ（力）で曲がらなかったときは "lenFail": true
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = process.env.BENDSIM_DIR || '\\\\srv02\\共有\\データフォルダ\\ユーザー共有用\\地主\\claudecode\\曲げシミュレーション';
const FILE = join(DIR, 'bendsim.json');
const rec = JSON.parse(process.argv[2] || 'null');
if (!rec || !['Z', 'U'].includes(rec.shape) || !Array.isArray(rec.dims) || rec.dims.length !== 3 || typeof rec.ok !== 'boolean' || !rec.who) {
  console.error('shape（Z/U）・dims（3つ）・ok（true/false）・who（確かめた人）は必須です');
  process.exit(1);
}
const data = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { version: 1, current: null, saves: [], records: [] };
// その日最初の書き込みの前に、今の中身を履歴に写す（画面から保存するときと同じ）
const d = new Date();
const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
mkdirSync(join(DIR, '履歴'), { recursive: true });
const hist = join(DIR, '履歴', `bendsim_${ymd}.json`);
if (existsSync(FILE) && !existsSync(hist)) copyFileSync(FILE, hist);
const one = {
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: d.toISOString(),
  sel: null, L: null, method: 'normal', punch: '904061', lenFail: false, note: '', ...rec,
  dims: rec.dims.map(Number),
};
data.zuRecords = [one, ...(data.zuRecords || [])];
data.savedAt = d.toISOString();
data.savedBy = `Claude（${rec.who}）`;
writeFileSync(FILE, JSON.stringify(data, null, 1));
console.log('登録しました', JSON.stringify(one));
