// dist-single/ のビルド成果物を1枚のHTMLに畳んで docs/曲げ加工シミュレーター.html を作る。
//
// 現場に配る用の単体HTML。ビルド不要・オフラインで開ける（曲げ可否判断シートと同じ扱い）。
// 手で書き写すと必ず本体と乖離するので、必ず npm run build:single から生成すること。
//
// 使い方: npm run build:single
//   （内部で vite build --base=./ --outDir dist-single を先に走らせる）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { execSync } from 'node:child_process';

const DIST = 'dist-single';
const OUT = 'docs/曲げ加工シミュレーター.html';

const asset = (url) => readFileSync(`${DIST}/assets/${basename(url)}`, 'utf8');

// インラインした中身に閉じタグの文字列があるとそこでHTMLが切れるので潰す
const safeJs = (s) => s.replace(/<\/script/gi, '<\\/script');
const safeCss = (s) => s.replace(/<\/style/gi, '<\\/style');

let html = readFileSync(`${DIST}/index.html`, 'utf8');
let nJs = 0;
let nCss = 0;

html = html.replace(/<script\b[^>]*\bsrc="([^"]+)"[^>]*><\/script>/gi, (_m, src) => {
  nJs++;
  return `<script type="module">\n${safeJs(asset(src))}\n</script>`;
});
html = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"[^>]*>/gi, (_m, href) => {
  nCss++;
  return `<style>\n${safeCss(asset(href))}\n</style>`;
});

if (nJs !== 1 || nCss !== 1) {
  console.error(`想定と違う構成です（script=${nJs} / stylesheet=${nCss}）。ビルド設定を確認してください。`);
  process.exit(1);
}
// 外部参照が残っているとオフラインで壊れるので、その場合は失敗させる
const leftover = html.match(/(?:src|href)="(?!data:)[^"]*\.(?:js|css|png|jpg|svg|woff2?)"/gi);
if (leftover) {
  console.error(`外部参照が残っています: ${leftover.join(', ')}`);
  process.exit(1);
}

let rev = 'unknown';
try {
  rev = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  /* git が無い環境でも生成はできるようにする */
}

const banner = `<!--
  板金曲げシミュレーター（単体HTML・現場配布用）

  自動生成物です。直接編集しないでください。
  元ソース : bending-simulator.jsx
  生成方法 : npm run build:single
  元コミット: ${rev}
  生成日時 : ${new Date().toISOString()}
-->
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, banner + html, 'utf8');

const kb = (Buffer.byteLength(banner + html) / 1024).toFixed(1);
console.log(`generated: ${OUT}  (${kb} kB, from ${rev})`);
