---
ticket_id: 144
title: "M19-3: metrics カウンター配線実装"
slug: m19-3-metrics
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0144-m19-3-metrics/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0144-m19-3-metrics/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0144-m19-3-metrics/review.md
---
# M19-3: metrics カウンター配線実装

## Summary

`metrics` optional feature として、crate 全体の運用状態を監視する 8 つのカウンター/ゲージを実装する。
feature 無効時はゼロオーバーヘッド（コンパイル時に一切の metrics コードが含まれない）。

**参照設計書:** `docs/rust-sip-client-rfc.md` (§34.2)

## Background

SIP クライアントの運用監視には以下の指標が不可欠:
- アクティブな通話数・登録アカウント数（ゲージ）
- DTMF 送受信・ICE 失敗・トランスポート再接続の累積回数（カウンター）
- 音声タップのオーバーフロー回数

`metrics` crate (https://crates.io/crates/metrics) を採用する。
Prometheus 等のエクスポーター統合は利用者側の責務とする。

## Investigation

### 証拠 1: metrics feature / crate ともに未導入

```bash
$ grep metrics crates/siprs/Cargo.toml
# 出力なし
```

### 証拠 2: カウンター挿入箇所の特定

| カウンター | 挿入箇所 | 対象ファイル |
|-----------|---------|-------------|
| `active_calls` | add_call/remove_call | runtime/reactor.rs |
| `registered_accounts` | RegistrationState 遷移 | runtime/state.rs |
| `audio_tap_overflows_total` | Tap oldest-drop | audio/tap.rs |
| `dtmf_sent_total` | send_dtmf 成功時 | client.rs |
| `dtmf_received_total` | DtmfReceived イベント発火 | runtime/reactor.rs |
| `ice_failures_total` | on_ice_transport_error callback | ffi/callbacks.rs |
| `transport_reconnects_total` | on_transport_state callback | ffi/callbacks.rs |
| `raw_sip_messages_total` | RawSIP イベント発行 | runtime/reactor.rs |

## Scope

### 1. `Cargo.toml` — metrics 依存追加

```toml
[dependencies]
metrics = { version = "0.24", optional = true }

[features]
metrics = ["dep:metrics"]
```

### 2. `src/lib.rs` — モジュール宣言

```rust
#[cfg(feature = "metrics")]
pub mod metrics;
```

### 3. `src/metrics/mod.rs` — 8 関数

```rust
use metrics::{counter, gauge};

pub fn set_active_calls(count: u64) { gauge!("siprs.active_calls", count as f64); }
pub fn set_registered_accounts(count: u64) { gauge!("siprs.registered_accounts", count as f64); }
pub fn increment_audio_tap_overflows() { counter!("siprs.audio_tap_overflows_total", 1); }
pub fn increment_dtmf_sent() { counter!("siprs.dtmf_sent_total", 1); }
pub fn increment_dtmf_received() { counter!("siprs.dtmf_received_total", 1); }
pub fn increment_ice_failures() { counter!("siprs.ice_failures_total", 1); }
pub fn increment_transport_reconnects() { counter!("siprs.transport_reconnects_total", 1); }
pub fn increment_raw_sip_messages() { counter!("siprs.raw_sip_messages_total", 1); }
```

### 4. 各挿入箇所への計装（`#[cfg(feature = "metrics")]` ゲート）

各ファイルに 1 行追加。既存ロジックの構造は変更しない。

## Non-scope

- Prometheus エクスポーター統合（利用者側責務）
- ヒストグラム（通話時間等の分布指標）
- M19-2 feature flags（独立して追加可能）

## Test Plan

build.rs と異なり `#[cfg(feature = "metrics")]` のテストは実行可能:

| # | 検証内容 | コマンド | 期待結果 |
|---|---------|---------|---------|
| 1 | metrics 無効ビルド | `cargo check -p siprs` | 成功 |
| 2 | metrics 有効ビルド | `cargo check -p siprs --features metrics` | 成功 |
| 3 | 全 feature 同時 | `cargo check -p siprs --all-features` | 成功 |
| 4 | 既存テスト維持 | `cargo test -p siprs` | 390 passed |
| 5 | metrics 有効テスト | `cargo test -p siprs --features metrics` | 全通過 |
| 6 | プロジェクト全体 | `make check-be` | 成功 |

## Acceptance Criteria

- [ ] `cargo check -p siprs --features metrics` 成功
- [ ] `cargo check -p siprs --all-features` 成功
- [ ] `cargo test -p siprs` 390 passed
- [ ] `cargo test -p siprs --features metrics` 全通過
- [ ] `make check-be` 成功
- [ ] `cargo fmt --check` 通過
