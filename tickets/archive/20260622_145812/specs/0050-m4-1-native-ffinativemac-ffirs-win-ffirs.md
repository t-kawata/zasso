---
ticket_id: 50
title: M4-1: Native FFI（native/mac_ffi.rs / win_ffi.rs）
slug: m4-1-native-ffinativemac-ffirs-win-ffirs
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0050-m4-1-native-ffinativemac-ffirs-win-ffirs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0050-m4-1-native-ffinativemac-ffirs-win-ffirs/review.md
---
# M4-1: Native FFI（native/mac_ffi.rs / win_ffi.rs）

## Summary

MYCUTE の macOS/Windows ネイティブ音声認識の FFI 宣言を独立ファイルに抽出する。
`native/mac_ffi.rs`（macOS: Swift SpeechHelper との C FFI）
`native/win_ffi.rs`（Windows: C# SpeechHelper との C FFI + ヘルスチェック状態管理）
を新規作成し、`native/mod.rs` を有効化する。

## Background

MYCUTE では extern "C" 宣言が `src/stt/mac.rs` / `src/stt/win.rs` に埋め込まれている。
voiput ではこれらを `src/native/` に分離し、バックエンド実装から FFI の詳細を隠蔽する。

## Scope

### 1. `src/native/mac_ffi.rs`

MYCUTE `~/shyme/mycute/src/stt/mac.rs` の extern "C" ブロック（28〜53行目）を抽出:
- `speech_helper_init(speech_timeout_sec: f64) -> i32`
- `speech_helper_request_authorization() -> i32`
- `speech_helper_set_result_callback(callback)`
- `speech_helper_set_error_callback(callback)`
- `speech_helper_set_ready_callback(callback)`
- `speech_helper_set_audio_data_callback(callback)`
- `speech_helper_start_capture() -> i32`
- `speech_helper_stop_capture()`
- `speech_helper_start(locale: *const c_char) -> i32`
- `speech_helper_stop()`
- `speech_helper_cleanup()`
- `speech_helper_tick()`
- `tahoe_helper_init(locale, speech_timeout_sec) -> i32`
- `tahoe_helper_start(locale) -> i32`
- `tahoe_helper_stop()`

`#[link(name = "SpeechHelper")]` のまま維持。

### 2. `src/native/win_ffi.rs`

MYCUTE `~/shyme/mycute/src/stt/win.rs` の extern "C" ブロック（26〜42行目）を抽出:
- `speech_helper_init(speech_timeout_sec: f64) -> c_int`
- `speech_helper_set_result_callback(callback)`
- `speech_helper_set_error_callback(callback)`
- `speech_helper_set_ready_callback(callback)`
- `speech_helper_set_audio_data_callback(callback)`
- `speech_helper_start_capture() -> c_int`
- `speech_helper_stop_capture()`
- `speech_helper_start(locale: *const c_char) -> c_int`
- `speech_helper_stop()`
- `speech_helper_cleanup()`
- `speech_helper_tick()`
- `speech_helper_disable_ime()`
- `speech_helper_restore_ime()`
- `speech_helper_check_health() -> c_int`

加えて以下のヘルスチェック状態管理関数も移動:
- `WIN_HEALTH_CHECK: AtomicU32`
- `WIN_HEALTH_CHECKED: AtomicBool`
- `health_check_result() -> u32`
- `store_health_check_result(result: u32)`
- `is_health_check_acknowledged() -> bool`
- `acknowledge_health_check()`

`#[link(name = "SpeechHelper", kind = "static")]` のまま維持。

### 3. `src/native/mod.rs`

```rust
#[cfg(target_os = "macos")]
pub(crate) mod mac_ffi;

#[cfg(target_os = "windows")]
pub(crate) mod win_ffi;
```

### 4. `src/lib.rs`

- `// mod native;` → `mod native;` に変更（コメントアウト解除）

## Non-scope

- バックエンド実装（MacSpeechBackend / WinSpeechBackend）— M4-3, M4-4

## Investigation

### 証拠1: MYCUTE mac.rs の FFI 部

`~/shyme/mycute/src/stt/mac.rs` 28〜53行目に全 extern "C" 宣言が集約されている。
`#[link(name = "SpeechHelper")]` で Swift ライブラリをリンク。
Tahoe (macOS 15+) API も同一ブロック内に含まれる。
コールバック関数（result_callback, error_callback, mac_ready_callback, mac_audio_data_callback）およびグローバルチャネル（MAC_GLOBAL_TX, MAC_GLOBAL_SEQ, MAC_AUDIO_SENDER）はバックエンド側（backends/mac.rs）に残す。

### 証拠2: MYCUTE win.rs の FFI 部

`~/shyme/mycute/src/stt/win.rs` 26〜42行目に全 extern "C" 宣言が集約されている。
`#[link(name = "SpeechHelper", kind = "static")]` で C# 静的リンクライブラリをリンク。
加えて 57〜87行目にヘルスチェック状態管理（AtomicU32, AtomicBool）がある。
コールバック関数およびグローバルチャネルはバックエンド側（backends/win.rs）に残す。

### 証拠3: voiput の native/mod.rs 現在

現在 `src/native/mod.rs` は全行コメントアウト中。

## Test Plan

このチケットでは extern "C" 宣言の抽出のみ。ビルドが通ることを確認する。
実際の関数呼び出しテストは M4-3/M4-4 で行う。

### ユニットテスト可能な項目

- Windows: ヘルスチェック状態管理のユニットテスト（store → result → acknowledge の状態遷移）

## Boy Scout Rule

- extern "C" 宣言とグローバル状態管理をバックエンド実装から分離。関心の分離を改善。
- Windows の health check 状態管理を win_ffi.rs に集約（MYCUTE では win.rs 内に混在）。

## Acceptance Criteria

- [ ] `src/native/mac_ffi.rs` 作成（macOS FFI 宣言）
- [ ] `src/native/win_ffi.rs` 作成（Windows FFI 宣言 + ヘルスチェック状態）
- [ ] `src/native/mod.rs` 有効化
- [ ] `src/lib.rs` で `mod native;` 有効化
- [ ] `cargo check` がエラーなく通ること

## Notes

- このチケットで作成した FFI ファイルは M4-3（macOS バックエンド）と M4-4（Windows バックエンド）から参照される
- コールバック関数とグローバルチャネルは FFI 宣言ではなくバックエンド側に残す（FFI の使用箇所）

### 成果物

- 計画: context/0050-m4-1-native-ffi/plan.md（未作成）
- 実装サマリ: context/0050-m4-1-native-ffi/implementation.md（未作成）
- レビュー報告書: context/0050-m4-1-native-ffi/review.md（未作成）
