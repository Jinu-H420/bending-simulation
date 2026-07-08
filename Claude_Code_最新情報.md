# Claude Code 最新情報（把握メモ）

※ 公式ドキュメント・CHANGELOG を元にまとめたものです。詳細は [Claude Code Docs](https://docs.anthropic.com/en/docs/claude-code/quickstart) を参照。

---

## 現在の最新バージョン

- **2.1.42**（CHANGELOG より）
  - 起動パフォーマンス改善、プロンプトキャッシュヒット率改善
  - Opus 4.6 のワンタイム案内、/resume のセッションタイトル表示修正など

---

## 提供形態

| 形態 | 説明 |
|------|------|
| **CLI** | ターミナルで `claude`。プロジェクトディレクトリで対話・一発実行 |
| **Web** | [claude.ai/code](https://claude.ai/code) でブラウザから利用 |
| **Desktop** | デスクトップアプリ（並列セッション・Git 分離・ビジュアル diff 等） |
| **VS Code** | Claude Code 拡張。インライン diff・@メンション・プランレビュー |
| **JetBrains** | IntelliJ / PyCharm / WebStorm 等 |
| **Slack** | ワークスペースからタスクを委譲 |
| **CI/CD** | GitHub Actions / GitLab CI/CD でプログラム実行 |

---

## インストール（推奨）

```bash
# macOS / Linux / WSL（ネイティブ＝自動更新）
curl -fsSL https://claude.ai/install.sh | bash

# Homebrew（手動で upgrade 必要）
brew install --cask claude-code
```

**要件**: Claude Pro / Max / Teams / Enterprise、または [Claude Console](https://console.anthropic.com/)、または AWS Bedrock / Google Vertex AI / Microsoft Foundry のいずれか。

---

## よく使うコマンド

| コマンド | 用途 |
|----------|------|
| `claude` | 対話モード開始 |
| `claude "タスク"` | 1回だけタスク実行 |
| `claude -p "質問"` | 質問して終了 |
| `claude -c` | 直近の会話を続ける |
| `claude -r` | 過去の会話を再開 |
| `claude commit` | Git コミット作成 |
| `/help` | 利用可能なコマンド表示 |
| `/login` | アカウント切り替え |

---

## 主な機能（v2.1 系）

- **エージェント的な編集**: ファイル読み書き・コマンド実行・Git 操作を会話で依頼
- **MCP**: 300以上の外部サービスと Model Context Protocol で連携
- **サブエージェント**: 最大10並列で専門タスクを委譲
- **モデル切り替え**: Haiku（速い・安い）と Opus（高能力）を用途に応じて選択
- **権限**: ファイル・Bash・ネットワーク等のきめ細かい許可ルール
- **Hooks**: ファイル編集後・タスク完了時などにシェルを自動実行（CI/CD 連携）
- **Fast mode**: Opus 4.6 で応答を高速化（2.1.36〜）
- **Agent Teams（実験的）**: 複数 Claude Code セッションをチームとして協調（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`）
- **メモリ**: セッションをまたいで記憶を保持・参照
- **タスク管理**: 依存関係付きのタスク、バックグラウンド実行

---

## スキル・CLAUDE.md（プロジェクト連携）

- **スキル**: `.claude/skills/` に配置。スラッシュコマンドと統合（2.1.3〜）。
- **追加ディレクトリ**: `--add-dir` で指定したディレクトリ内の `.claude/skills/` も自動読み込み（2.1.32）。
- **CLAUDE.md**: プロジェクトの指示・コンテキスト。`--add-dir` 先から読む場合は `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`。
- **サンドボックス**: サンドボックス有効時は `.claude/skills` への書き込みはブロック（2.1.38）。

→ BRAIN2 の曲げ見積りでは、`.claude/skills/bending-estimate/` に SKILL.md と 見積り計算書_仕様まとめ.md を置いているので、Claude Code でこのリポジトリを開き「見積り計算書_仕様まとめ.md を読んで」と依頼するか、bending-estimate スキルを参照するとよい。

---

## 認証まわり（2.1.41〜）

- `claude auth login` / `claude auth status` / `claude auth logout` で CLI から認証状態を操作可能。

---

## ドキュメントの探し方

- **全体インデックス**: https://code.claude.com/docs/llms.txt に全ドキュメントのパスが列挙されている。
- **クイックスタート**: https://docs.anthropic.com/en/docs/claude-code/quickstart
- **CHANGELOG**: https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md

---

## 曲げ見積りスキルとの関係

- Claude Code で BRAIN2 を開いた状態で「見積り計算書_仕様まとめ.md を読んでから〇〇して」と依頼すれば、仕様を踏まえた返答が得られる。
- 見積り実行は `scripts/estimate_bending.py` を Claude Code に実行させる形で利用可能（`Claude_Codeで見積もり.md` 参照）。

以上が、現時点で把握している Claude Code の最新情報です。
