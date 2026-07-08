# bending-simulation — 板金曲げシミュレーター

株式会社高橋鉄骨のアマダ製ベンディングマシン向けに、**指定の金型と板金形状で干渉せずに曲げられるか**を、実機に鋼板を投入する前にPC上で検証するツール。

詳しい開発経緯・設計・未解決事項は [`経緯まとめ.md`](経緯まとめ.md) を参照。

---

## 構成

| ファイル / フォルダ | 内容 |
|---|---|
| `bending-simulator.jsx` | メインの2Dキネマティクス・シミュレーター（React本体） |
| `bending-sim-step3.html` | AP100のDXFを読み込む単体HTMLツール（ブラウザで直接開ける） |
| `dxf/` | 金型DXFライブラリ（`kanagata/` 35個＋`bending.dxf`／`ヤゲン.dxf`） |
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

## AP100 DXF読み込みツール（`bending-sim-step3.html`）

こちらは**単体HTML**なので、ビルド不要でブラウザに直接ドラッグ＆ドロップして開けます。
DXFの解析ライブラリをCDNから読み込むため、**実行時にネット接続が必要**です。

---

## 技術スタック

- React 18
- Vite 6
- Tailwind CSS 4（`@tailwindcss/vite` プラグイン）

金型データは `bending-simulator.jsx` に座標が埋め込まれているため、
シミュレーター単体の表示に `dxf/` フォルダは不要です。
