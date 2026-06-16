---
ticket_id: 94
title: "M8-3: ClientCapabilities / SrtpImplementation / AudioDeviceCaps 定義"
slug: m8-3-client-capabilities
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0094-m8-3-client-capabilities/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0094-m8-3-client-capabilities/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0094-m8-3-client-capabilities/review.md
---

# M8-3: `ClientCapabilities` / `SrtpImplementation` / `AudioDeviceCaps` 定義

## Summary

PJSUA 初期化後に確定する実行時能力を表現する `ClientCapabilities`（約20フィールド）と、関連型 `SrtpImplementation` / `AudioDeviceCaps` を定義する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§34.3)

## Background

### RFC 準拠

RFC §34.3「ClientCapabilities は初期化完了時に ClientInitialized イベントに載せて通知される。PJSIP のビルド時 feature とランタイム検出結果を反映する」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M6-1 (#72) | `ClientCapabilities` 空スケルトン（event.rs）— 本実装に差し替え |
| M1-3 (#60) | `TransportKind` — `ClientCapabilities::transport_types` で使用 |
| M2-2 (#63) | `Codec` / `DtmfMethod` — capabilities のフィールドで使用 |

### 設計判断

- **`src/event.rs` の `ClientCapabilities` を拡張**: 空構造体から §34.3 の全フィールドを持つ本実装に置き換える
- **`SrtpImplementation` enum**: 同一ファイルに定義（`ClientCapabilities` で使用）
- **`AudioDeviceCaps` struct**: 同一ファイルに定義
- **`ClientCapabilities::default_disabled()`**: 全機能無効のデフォルトコンストラクタ。Serialization/FFI バインディングで初期化後に各フィールドを上書き

## Scope

### `crates/siprs/src/event.rs`（修正）

```rust
use crate::config::{Codec, DtmfMethod};
use crate::transport::TransportKind;

/// SRTP 実装方式。
#[derive(Debug, Clone)]
pub enum SrtpImplementation {
    SdesSrtp,
    DtlsSrtp,
}

/// オーディオデバイス情報。
#[derive(Debug, Clone)]
pub struct AudioDeviceCaps {
    pub has_default_input: bool,
    pub has_default_output: bool,
    pub input_devices: Vec<String>,
    pub output_devices: Vec<String>,
}

/// クライアントの実行時機能マップ。
///
/// 初期化完了時に `ClientInitialized` イベントに載せて通知される。
/// PJSIP のビルド時 feature とランタイム検出結果を反映する。
#[derive(Debug, Clone)]
pub struct ClientCapabilities {
    // ── 台数制約 ──
    pub max_calls: u32,
    pub max_accounts: u32,

    // ── トランスポート ──
    pub transport_types: Vec<TransportKind>,

    // ── セキュリティ ──
    pub tls_available: bool,
    pub tls_version: Option<String>,
    pub srtp_available: bool,
    pub srtp_types: Vec<SrtpImplementation>,

    // ── メディア ──
    pub available_codecs: Vec<Codec>,
    pub opus_available: bool,
    pub audio_devices: AudioDeviceCaps,

    // ── NAT/ICE ──
    pub ice_supported: bool,
    pub trickle_ice_supported: bool,
    pub stun_supported: bool,
    pub turn_supported: bool,

    // ── DTMF ──
    pub dtmf_methods: Vec<DtmfMethod>,

    // ── SIP 拡張機能 ──
    pub supports_refer: bool,
    pub supports_session_timers: bool,

    // ── 付加機能 ──
    pub event_bus_capacity: usize,
    pub raw_sip_events_supported: bool,
    pub mixer_max_sources: usize,
}

impl ClientCapabilities {
    /// 全機能無効の `ClientCapabilities` を生成する。
    pub fn default_disabled() -> Self;
}
```

### テストコード（`event.rs` の既存テストモジュールに追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_default_disabled` | `default_disabled()` の全 boolean が false、全 Vec が空 |
| 2 | `test_srtp_implementation_variants` | 全バリアント構築可能 |
| 3 | `test_audio_device_caps_empty` | 空デバイスリスト許容 |
| 4 | `test_client_capabilities_clone_debug` | Clone / Debug 機能 |
| 5 | `test_client_capabilities_fields` | 全フィールド設定・取得 |

## Non-scope

- `ClientCapabilities` の `ClientState` への統合 — M8-1 ですでに `use crate::event::ClientCapabilities` で利用中
- `ClientInitialized` イベントへの組み込み — M12-2

## Test Plan

### 基本方針

`default_disabled()` の全フィールドが無効値であること、全バリアントの構築可能性を検証。

### ユニットテスト不可能な項目（例外）

- 実際の PJSUA 初期化結果との結合 — M12-2 / M17-4 で検証

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 253 + 新規 5）
- [ ] `event.rs` の `ClientCapabilities` が §34.3 の全約20フィールドを持つこと
- [ ] `SrtpImplementation` enum が定義されていること
- [ ] `AudioDeviceCaps` struct が定義されていること
- [ ] `ClientCapabilities::default_disabled()` が実装されていること
- [ ] 既存の `ClientState` / `SipEventPayload::ClientInitialized` が引き続きコンパイル可能であること

## Notes

### ClientCapabilities の差し替え

M6-1 で空構造体として仮定義された `ClientCapabilities` を本実装に置き換える。`runtime/state.rs` の `ClientState` および `SipEventPayload::ClientInitialized` バリアントは `use crate::event::ClientCapabilities` で参照しているため、修正不要。

### M8 マイルストーン

```text
M8-1 (#92): RegistrationState / ClientState / AccountEntry / CallEntry ← 完了済み
M8-2 (#93): CallState / MediaRuntime ← 完了済み
M8-3 (#94): ClientCapabilities / SrtpImplementation / AudioDeviceCaps ← 本チケット
```
