---
obsidianUIMode: preview
---

# Cursor 内でブラウザ確認しながら進める

見積り計算書.html を Cursor 内のブラウザで開き、編集とプレビューを並べて進める手順です。

**ショートカット一覧** → [[ショートカットキー]]

---

## 方法1: 簡易サーバー + Cursor のブラウザ（おすすめ）

1. **ターミナルでサーバーを起動**
   ```bash
   cd "/Users/jinushihayato/Library/Mobile Documents/iCloud~md~obsidian/Documents/BRAIN2/.claude/skills/bending-estimate"
   python3 -m http.server 8765
   ```
   → 「Serving HTTP on 0.0.0.0 port 8765」と出たら起動済み。**このターミナルは閉じない。**

2. **Cursor のブラウザで開く**
   - サイドバーまたはタブで **「Browser」** を開く（Cursor に組み込みのブラウザ）。
   - アドレス欄に次の URL を入力して Enter:
     ```
     http://localhost:8765/見積り計算書.html
     ```
   - 日本語ファイル名がずれる場合は:
     ```
     http://localhost:8765/
     ```
     で一覧を開き、「見積り計算書.html」をクリック。

3. **編集しながら確認**
   - 左（または上）に **見積り計算書.html** のエディタ、右（または下）に **Browser** を並べる。
   - HTML を保存したら、ブラウザで **更新（F5 または Cmd+R）** すると反映される。

4. **終わったら**
   - サーバーを止める: ターミナルで **Ctrl+C**。

---

## 方法2: Simple Browser（サーバーなし）

- **Cmd + Shift + P** → 「Simple Browser: Show」と入力して実行。
- 表示されたアドレス欄に **file://** でローカルパスを入れる（環境によっては file が制限される場合あり）:
  ```
  file:///Users/jinushihayato/Library/Mobile Documents/iCloud~md~obsidian/Documents/BRAIN2/.claude/skills/bending-estimate/見積り計算書.html
  ```
- file が開けない場合は **方法1** を使う。

---

## 方法3: 外部ブラウザで開く

- 見積り計算書.html を **右クリック** → **Reveal in Finder** でフォルダを開き、ファイルをダブルクリックで Safari/Chrome で開く。
- 編集は Cursor、表示は外のブラウザ。保存のたびにブラウザで再読み込み。

---

**まとめ**: 編集と確認を Cursor 内でやりたいなら、**方法1（python3 -m http.server 8765 + Browser タブ）** が確実です。
