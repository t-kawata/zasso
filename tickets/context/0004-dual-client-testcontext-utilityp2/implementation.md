# 実装: Dual Client TestContext utility（P2）

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/siprs/tests/common/dual_client.rs` | **新規** | `DualClientContext` 構造体 + 全メソッド（new, call_a_to_b, answer_b, hangup_a/b, イベント待機ヘルパー8種, shutdown_all） |
| `crates/siprs/tests/common/mod.rs` | **編集** | `pub mod dual_client;` + `pub use dual_client::DualClientContext;` 追加 |
| `crates/siprs/tests/integration/dual_client.rs` | **新規** | 7 結合テストケース（new, call_a_to_b, answer_b, hangup_a, timeout, shutdown_all, single_client_unaffected） |
| `crates/siprs/tests/integration_test.rs` | **編集** | `#[path = "integration/dual_client.rs"] mod dual_client;` 追加 |

## 設計判断

1. **shutdown_all での二重破棄防止**: PjsuaBackend singleton を共有するため、client_a のみ `shutdown()` を呼び、client_b は drop で解放する
2. **`HangupReason::Bye` 採用**: spec では `UserRequested` と記載していたが、当該バリアントは存在しない。現状の enum は `Bye / Cancel / Busy / Decline / InternalError`
3. **`CallMediaPreferences` 手動構築**: Default がないため、`enable_early_media: true, enable_srtp: None, preferred_codecs: vec![]` で直接構築
4. **イベントバリアント名**: `IncomingCall` / `CallConnected` / `CallDisconnected` は `SipEventPayload` に定義済みでそのまま使用

## 検証結果

- `cargo check --all-targets`: ✅ 成功（警告 0）
- `cargo test --lib`: ✅ 458 テスト all pass
- `cargo fmt --check`: ✅ フォーマット修正完了（既存コードの整形も含む）
- `cargo clippy -- -D warnings`: ⚠️ 17 errors（全て既存コード、私の変更ファイルには 0）
- `run-quality-checks.js`: ⚠️ 14 issues（全て既存 mod.rs のパターン、私の変更は 3 行追加のみ）

## 未解決事項

- 結合テストは Docker Asterisk 環境でのみ実行可能（`-- --ignored --test-threads=1`）
- clippy 17 errors は既存コードの問題で本チケット範囲外
