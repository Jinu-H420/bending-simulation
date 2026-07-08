---
name: bending-estimate
description: 曲げ加工見積り（材料費・切断費・曲げ工賃・穴あけ）の計算と見積り計算書の扱い。Claude Code で見積もりや計算書を扱うときに使用する。
---

# 曲げ加工見積りスキル（bending-estimate）

**ファイルの置き場所が変わりました。すべてのファイルは mitumori リポジトリにあります。**

Base directory for this skill: G:\マイドライブ\Takahashi_Central\Knowledge\mitumori

## 必ず読み込むファイル

**見積り計算の仕様は次の Markdown にまとまっています。作業前に必ず読み込むこと。**

- **見積り計算書_仕様まとめ.md** — 見積り計算書.html（材料費＋曲げ＋穴あけの本見積）の目的・画面構成・計算ロジック・データ参照・運用メモの全体仕様。
- **曲げ見積り計算書_実装メモ.md** — 曲げ見積り計算書.html（曲げ工賃のみ・検算用）の実装内容。**曲げ見積り計算書を触るときはこちらを必ず読み込むこと。**

```
G:\マイドライブ\Takahashi_Central\Knowledge\mitumori\見積り計算書_仕様まとめ.md
G:\マイドライブ\Takahashi_Central\Knowledge\mitumori\曲げ見積り計算書_実装メモ.md
```

## 使い方（Claude Code）

1. 上記 **見積り計算書_仕様まとめ.md** を読み込んでから、見積もり計算・計算書の修正・データ変更などの依頼に応じる。
2. HTML 計算書（見積り計算書.html・曲げ見積り計算書.html）や data/*.json を変更する場合は仕様書と矛盾しないようにする。
3. 変更後は mitumori リポジトリでコミット・プッシュすれば GitHub Pages に反映される。

## 関連ファイル（すべて mitumori リポジトリ）

| ファイル | 役割 |
|----------|------|
| 見積り計算書_仕様まとめ.md | 本見積（材料費込み）の**仕様の一次資料**（必読） |
| 曲げ見積り計算書_実装メモ.md | **曲げだけの計算書**の実装・引き継ぎ（必読） |
| 見積り計算書.html | 材料費＋曲げ＋穴あけのブラウザ計算書 |
| 曲げ見積り計算書.html | 曲げ工賃のみ・検算用 |
| index.html | トップページ（各計算書へのリンク） |
| data/rates.json | 材料単価・比重・形状乗率など |
| data/prices.json | 曲げ基準価格 |
| data/hole_prices.json | 穴あけ単価（板厚別） |

## GitHub Pages URL

- トップ: https://jinu-h420.github.io/mitumori/
- 曲げ見積り計算書: https://jinu-h420.github.io/mitumori/曲げ見積り計算書.html
- 見積り計算書: https://jinu-h420.github.io/mitumori/見積り計算書.html
