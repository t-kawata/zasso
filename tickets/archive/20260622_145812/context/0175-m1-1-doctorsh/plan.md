# 実装計画: #175 M1-1: doctor.sh — 環境診断スクリプト

## 要件
mycc/doctor.sh を新規作成。common.sh を source し、8ステップの環境チェックを逐次実行する。
不足ツールは該当ステップでエラー終了 + インストール手順表示。モデル不在のみ警告に留め exit 0。
全通過時は「環境は整っています。」を表示して exit 0。

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|---------|------|------|
| mycc/doctor.sh | 新規作成 | 環境診断スクリプト本体（約40行） |
| mycc/tests/test-doctor.sh | 新規作成 | 10テストケース（制御フロー検証） |

## 実装手順
1. doctor.sh 作成（shebang + set -euo pipefail + SCRIPT_DIR/PROJECT_ROOT + source common.sh）
2. タイトル表示 + 8ステップチェック（RFC 処理フロー図通り）
3. モデル不在時の警告 + 診断完了メッセージ
4. chmod +x で実行権限付与
5. test-doctor.sh 作成（10テストケース、PATH モック戦略）
6. テスト実行 → 全パス確認
7. 品質チェック（run-quality-checks.js + shellcheck）
8. 実装サマリ保存

## レビュー方法
- run-quality-checks.js で静的品質チェック
- 翻訳可能性 grep（関数名・変数名・マジックナンバー）
- テスト実行（全10ケースパス）
- shellcheck 警告なし確認
