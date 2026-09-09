# bending-simulation — 板金曲げシミュレーター

株式会社高橋鉄骨のアマダ製ベンディングマシン向けに、**指定の金型と板金形状で干渉せずに曲げられるか**を、実機に鋼板を投入する前にPC上で検証するツール。

詳しい開発経緯・設計・未解決事項は [`経緯まとめ.md`](経緯まとめ.md) を参照。

---

## 構成

| ファイル / フォルダ | 内容 |
|---|---|
| `bending-simulator.jsx` | メインの2Dキネマティクス・シミュレーター（React本体） |
| `docs/曲げ可否判断シート.html` | 4〜5型の曲げ可否判断シート（単体HTML・DXF実測のみ）。社内ミーティング配布用 |
| `docs/` | 配布用の資料（可否判断シート HTML・A3 印刷帳票 PDF・照合/工程 PNG・出典 xlsx／csv） |
| `bending-sim-step3.html` | AP100のDXFを読み込む単体HTMLツール（曲げ線の自動検出まで） |
| `bending-sim-step4.html` | AP100のDXFを曲げ線で分割し、各面の折り曲げ角度と断面を抽出する単体HTMLツール |
| `dxf/` | 金型DXFライブラリ（`kanagata/` 35個＋`bending.dxf`／`ヤゲン.dxf`／`ホルダ.dxf`／`V12_ホルダあり.dxf`／`特殊ヤゲン.dxf`／曲げ検証部品 `曲N.dxf`／`test/`） |
| `経緯まとめ.md` | 開発の全経緯・実装内容・TODO |
| `index.html` / `src/` / `vite.config.js` | Vite実行環境の足場 |

---

## セットアップと起動（`bending-simulator.jsx`）

Node.js（v18以上）が必要です。

```bash
# 1. 依存パッケージをインストール（初回のみ）
npm install

# 2. 開発サーバを起動
npm run dev
```

起動したらブラウザで以下を開く:

```
http://localhost:5173/
```

- `.jsx` を編集すると**ホットリロード**で即反映されます。
- サーバを止めるにはターミナルで `Ctrl+C`。

### 本番ビルド（任意）

```bash
npm run build     # dist/ に静的ファイルを生成
npm run preview   # ビルド結果をローカル確認
```

---

## 曲げ可否判断シート（`docs/曲げ可否判断シート.html`）

**単体HTML**。ビルド不要・ネット接続不要（フォントのみ CDN）でブラウザに直接開けます。
金型の断面・台・ヤゲン・上型ホルダの寸法はすべて社内DXFの実測値を埋め込んであり、推定値は入っていません。
対応は現時点で HG2203 の V12・V25／HD3504NT の V32・V40 の4型のみ。

## AP100 DXF読み込みツール（`bending-sim-step3.html` / `bending-sim-step4.html`）

こちらも**単体HTML**なので、ビルド不要でブラウザに直接ドラッグ＆ドロップして開けます。
DXFの解析ライブラリをCDNから読み込むため、**実行時にネット接続が必要**です。
step3 は曲げ線の自動検出まで、step4 は曲げ線での分割・折り曲げ角度・断面抽出まで。

---

## 技術スタック

- React 18
- Vite 6
- Tailwind CSS 4（`@tailwindcss/vite` プラグイン）

金型データは `bending-simulator.jsx` に座標が埋め込まれているため、
シミュレーター単体の表示に `dxf/` フォルダは不要です。
