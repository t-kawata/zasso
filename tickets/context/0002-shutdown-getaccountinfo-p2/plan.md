# 計画: Shutdown ポリシー拡張 — GetAccountInfo 許可（P2）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/siprs/src/runtime/command.rs` | 型定義変更 | `AccountInfoSnapshot` に `is_shutting_down: bool` を追加 |
| `crates/siprs/src/runtime/reactor.rs` | ロジック変更 + テスト追加 | Shutdown 分岐で応答にフラグ注入 + 新規テスト 2件 |
| `crates/siprs/src/runtime/backend.rs` | 追随修正 | MockBackend の構造体リテラルに `is_shutting_down: false` |
| `crates/siprs/src/ffi/pjsua_backend.rs` | 追随修正 | PjsuaBackend の構造体リテラルに `is_shutting_down: false` |

## 実装手順

1. `AccountInfoSnapshot` に `is_shutting_down: bool` を追加
2. MockBackend / PjsuaBackend の構造体リテラルに `is_shutting_down: false` を追加
3. Reactor の Shutdown 分岐で結果が Ok の場合にフラグを注入
4. テスト 2 件追加: `test_shutdown_get_account_info_has_flag` / `test_normal_get_account_info_no_flag`
5. `cargo fmt` / `cargo clippy` / `make test` で検証

## レビュー方法

- `run-quality-checks.js` で変更ファイル全点
- `cargo fmt && cargo clippy --all-targets -p siprs`
- `make test`
- 翻訳可能性 grep

## リスク

- PjsuaBackend は `#[cfg(not(feature = "pjsip"))]` のため `cargo check --all-features` で確認
- フィールド追加後のコンパイルエラーは全 3 構築箇所を特定済み
