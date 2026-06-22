# M4-3 実装サマリ

## 変更概要
ggufrs サーバーの結合テストを実装した。reqwest を dev-dependency に追加し、
空設定の GgufEngine でサーバーを起動して HTTP 経由で全シナリオを検証する。

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `tests/server_integration_test.rs` | 新規 | 結合テスト（1テスト関数、5シナリオ） |
| `Cargo.toml` | 編集 | reqwest dev-dependency追加 + 古いSTUB行削除 |

## 結合テストシナリオ（1テスト関数に統合）

| # | シナリオ | 期待 |
|---|---------|------|
| 1 | GET /v1/models (ライフサイクル確認) | 200 OK |
| 2 | GET /v1/models レスポンス形式 | object:"list", data: 配列 |
| 3 | POST /v1/chat/completions (不在モデル) | 404 + {"error":...} |
| 4 | POST /v1/chat/completions (空ボディ) | 404 |
| 5 | POST /anthropic/v1/messages (空ボディ) | 400 + {"error":...} |

## 技術的判断

- ポート競合回避のため全シナリオを1テスト関数に統合（Rustのテストランナーは並列実行）
- MockEngine 不可（pub(crate)）のため、空設定 GgufEngine を使用
- stop_test_server() は abort 結果を match で安全に処理（正常完了とcancelledを両方許容）

## テスト結果
- 全159テスト通過（既存158 + 新規1統合テスト）
- cargo check --all-targets: 警告0
- cargo fmt: フォーマット済み
