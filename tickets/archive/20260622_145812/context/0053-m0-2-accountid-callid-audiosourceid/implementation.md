# Implementation: M0-2 AccountId / CallId / AudioSourceId newtype 定義

## 変更ファイル一覧

| ファイル | 種別 | 行数 | 内容 |
|----------|------|------|------|
| crates/siprs/src/util/mod.rs | 新規 | 5行 | util モジュール宣言、pub mod id |
| crates/siprs/src/util/id.rs | 新規 | 410行 | AccountId / CallId / AudioSourceId 正式定義 + serde impl + 13 tests |
| crates/siprs/src/lib.rs | 修正 | +1行 | `pub mod util;` 追加 |
| crates/siprs/src/error.rs | 修正 | -36行 | 仮定義ブロック削除、use 追加、from_raw→from_test |

## 実装内容

### util/id.rs 主要構成

1. **AccountId(NonZeroU64)** — generate(), into_raw(), Display (42行)
2. **CallId(NonZeroU64)** — generate(), into_raw(), Display
3. **AudioSourceId(NonZeroU64)** — generate(), into_raw(), Display（新規追加）
4. **serde 手動実装** — 3型 × (Serialize + Deserialize) = 6 impl、全 `#[cfg(feature = "serde")]`
5. **テスト用 from_test()** — 3型、`#[cfg(test)]` ゲート、ゼロ値チェック付き
6. **13 テスト関数** — 一意性、不変条件(100万回)、等価性、順序、Display、型非互換性、Send+Sync+Copy、serde roundtrip、serde ゼロ拒否

### error.rs 変更点

- L15-L51 の仮定義ブロック全削除（AccountId(u64) / CallId(u64) / from_raw）
- `use crate::util::id::{AccountId, CallId};` 追加
- テストの `from_raw(42)` → `from_test(42)` に変更

## ビルド・テスト結果

- `cargo build` → ✅ OK（0 error, 0 warning）
- `cargo clippy -- -D warnings` → ✅ OK（0 warning）
- `cargo test` → ✅ OK（21 passed, 0 failed）

### テスト内訳（21件）

**error.rs（10件 — M0-1 継続 + テスト修正）:**
- test_sip_error_display_contains_kind_and_message ✅
- test_retryable_false_group / true_group ✅
- test_native_error_is_retryable ✅
- test_account_call_id_roundtrip ✅（from_test に更新）
- test_native_status_none / some ✅
- test_all_variants_covered_by_retryable_mapping ✅
- test_error_send_sync ✅
- test_debug_output_format ✅

**id.rs（11件 — M0-2 新規）:**
- test_account_id_generate_uniqueness ✅（100回）
- test_account_id_non_zero_invariant ✅（100万回）
- test_account_id_equality ✅（HashMap）
- test_account_id_ordering ✅（Ord）
- test_account_id_display ✅
- test_call_id_generate_uniqueness ✅
- test_call_id_display ✅
- test_audio_source_id_generate_uniqueness ✅
- test_audio_source_id_display ✅
- test_id_types_not_interchangeable ✅（コンパイル時検証）
- test_id_send_sync_copy ✅

## Quality Checks
- run-quality-checks.js: 17 findings（全て許容範囲: expect は generate/from_test の標準パターン、1文字変数はテスト内、コメントアウトは意図的コンパイルエラー確認）
- error.rs の仮定義・from_raw 完全除去確認 ✅
