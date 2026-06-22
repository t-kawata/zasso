# 実装サマリ: #175 M1-1: doctor.sh — 環境診断スクリプト

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| mycc/doctor.sh | 新規作成（46行） | 環境診断スクリプト本体 |
| mycc/tests/test-doctor.sh | 新規作成（310行） | 10テストケース（26アサーション） |

## doctor.sh の構成

- `#!/usr/bin/env bash` + `set -euo pipefail`
- `SCRIPT_DIR` / `PROJECT_ROOT` の解決 → `source "$SCRIPT_DIR/common.sh"`
- 8ステップ逐次実行（RFC 処理フロー図通り）:
  1. check_apple_silicon → 不全時 exit 1
  2. check_brew → 不全時 exit 1
  3. check_tool "Python 3.12" → 不全時 exit 1
  4. check_tool "Git" → 不全時 exit 1
  5. check_tool "uv" → 不全時 exit 1
  6. check_tool "Node.js" → 不全時 exit 1
  7. check_claude → 不全時 exit 1
  8. check_model → 不全時 警告 + 案内（非終了）
- 全通過 → 「環境は整っています。」 + exit 0
- MODEL_DIR 環境変数対応、未設定時は Quality 版デフォルトパス

## テスト結果

- 全26テストパス（正常系4、異常系14、警告系3、境界値5）
- カバレッジ: クリティカルパス（異常系・警告系）100%

## 品質チェック

- run-quality-checks.js: 0 issues
- 翻訳可能性: 関数名（動詞句）・変数名（ドメイン概念）・マジックナンバーなし

## 依存関係

- 先行チケット M0-1 (173), M0-2 (174): 共に reviewed 完了済み
- スタブ: なし。本チケットで解決すべきスタブは存在しない
