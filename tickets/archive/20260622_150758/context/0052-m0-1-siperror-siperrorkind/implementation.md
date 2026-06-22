# Implementation: M0-1 SipError / SipErrorKind 定義

## 変更ファイル一覧

| ファイル | 種別 | サイズ | 内容 |
|----------|------|--------|------|
| crates/siprs/Cargo.toml | 新規 | 20行 | package（siprs v0.1.0, edition 2021）、deps（thiserror, tracing, serde optional, static_assertions dev） |
| crates/siprs/src/lib.rs | 新規 | 16行 | crate ルート、pub mod error、コメントアウトで将来モジュール宣言 |
| crates/siprs/src/error.rs | 新規 | 360行 | AccountId/CallId 仮定義、SipErrorKind（23 variant）、SipError、コンストラクタ7種、テスト10件 |

## 実装内容

### error.rs 主要構成

1. **AccountId / CallId 仮定義**（u64 newtype、`#[doc(hidden)] from_raw` コンストラクタ）
2. **SipErrorKind enum**（23バリアント、全 variant に日本語 doc comment + retryable 根拠）
3. **SipError struct**（`#[derive(Debug, thiserror::Error)]`、`#[error("{kind}: {message}")]`）
4. **Display impl for SipErrorKind**（match で全23 variant を variant 名で表示）
5. **コンストラクタヘルパー**（invalid_config, invalid_state, timeout, native_error, channel_closed, shutdown_in_progress, invariant_broken）

### テスト結果（10 test OK）

- test_sip_error_display_contains_kind_and_message
- test_retryable_false_group
- test_retryable_true_group
- test_native_error_is_retryable
- test_account_call_id_roundtrip
- test_native_status_none
- test_native_status_some
- test_all_variants_covered_by_retryable_mapping（全23 variant 網羅性）
- test_error_send_sync
- test_debug_output_format

### ビルド確認

- `cargo build` → ✅ OK（0 error, 0 warning）
- `cargo clippy -- -D warnings` → ✅ OK（0 warning）
- `cargo test` → ✅ OK（10 test passed, 0 failed）
- `run-quality-checks.js` → ✅ OK（0 issues）
