# 実装サマリー: RuntimeCommand 新設 — GetAccountInfo / ConfConnect / ConfDisconnect（P0-P1）

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `crates/siprs/src/runtime/command.rs` | `MediaDirection` enum, `AccountInfoSnapshot` struct, `RuntimeCommand::GetAccountInfo`/`ConfConnect`/`ConfDisconnect` 追加 + 4 テスト |
| `crates/siprs/src/runtime/backend.rs` | `SipBackend::get_account_info()` trait メソッド追加, `MockBackend` 実装 + 5 テスト |
| `crates/siprs/src/runtime/reactor.rs` | 3 ハンドラ match arm + `handle_conf_connect`/`handle_conf_disconnect`/`resolve_native_call_id` helper 関数 + Shutdown ポリシー（GetAccountInfo 許可）+ `reject_command` arm + `#![allow(dead_code)]` 削除 + 7 テスト |
| `crates/siprs/src/ffi/pjsua_backend.rs` | `PjsuaBackendRef` 委譲, `PjsuaBackend` pjsip FFI 実装（`pjsua_acc_get_info`）, non-pjsip stub |

## 検証結果

- `cargo test` (siprs): **407 passed, 0 failed** (+2 doc-test)
- `make check-be` (zasso main): **clean compile**
- 犯罪スキャン: **0 件**
- スタブ検索: **0 件**
- 品質チェック: 全 issues は既存コード由来

## テスト内訳

| テストグループ | 数 | 状態 |
|--------------|---|------|
| 型定義テスト（command.rs） | 4 | ✅ |
| MockBackend テスト（backend.rs） | 5 | ✅ |
| Reactor 結合テスト（reactor.rs） | 7 | ✅ |
