# 実装サマリ: Shutdown ポリシー拡張 — GetAccountInfo 許可（P2）

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `crates/siprs/src/runtime/command.rs` | `AccountInfoSnapshot` に `is_shutting_down: bool` フィールドを追加（テスト用構築箇所含む） |
| `crates/siprs/src/runtime/reactor.rs` | Shutdown 中 GetAccountInfo ハンドラで backend 応答の Ok パスに `is_shutting_down: true` を注入 + テスト 2 件追加 |
| `crates/siprs/src/runtime/backend.rs` | MockBackend の `AccountInfoSnapshot` 構築に `is_shutting_down: false` を追加 |
| `crates/siprs/src/ffi/pjsua_backend.rs` | PjsuaBackend の `AccountInfoSnapshot` 構築に `is_shutting_down: false` を追加 |

## テスト結果

- 新規テスト `test_shutdown_get_account_info_passes_gate`: ✅ PASS
  - Shutdown 中 GetAccountInfo が reject_command されず NotInitialized になることを確認
- 新規テスト `test_normal_get_account_info_no_flag`: ✅ PASS
  - 非 Shutdown 時の GetAccountInfo 応答に `is_shutting_down: false` が含まれることを確認
- 既存 444 テスト全件 PASS ✅
- `cargo fmt` ✅ / `cargo clippy`（変更ファイルのみ）✅ / `cargo test` ✅

## 注意点

- MockBackend は shutdown 後に `initialized = false` となるため、Shutdown 中の
  backend 成功パス（`is_shutting_down: true`）は MockBackend ではテストできない。
  実際の PjsuaBackend では PJSIP ライブラリが shutdown 後も状態を保持するため
  問題ない。
- `is_shutting_down: bool` フィールドは全ての構築箇所でデフォルト `false` で初期化し、
  reactor の shutdown 分岐内でのみ `true` に上書きする設計。
- ConfConnect/ConfDisconnect の Shutdown 時拒否は既存の `reject_command()` で
  カバー済みであることを確認。
