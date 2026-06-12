---
ticket_id: 73
title: "M6-2: SipEvent / EventMeta / EventTimestamp 定義"
slug: m6-2-sip-event-meta
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/shyme/shyme/zasso/tickets/context/0073-m6-2-sip-event-meta/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0073-m6-2-sip-event-meta/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0073-m6-2-sip-event-meta/review.md
---

# M6-2: `SipEvent` / `EventMeta` / `EventTimestamp` 定義

## Summary

イベントのメタデータ（タイムスタンプ、アカウントID、通話ID、方向、SIP ステータスコード等）を payload と分離し、共通のイベントエンベロープ `SipEvent` でラップする。`event_id` は単調増加で全イベントを一意識別する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§15.2, §15.3)

## Background

### RFC 準拠

RFC §15.2 で `SipEvent` 構造体（`meta: EventMeta`, `payload: SipEventPayload`）を定義。§15.3 で `EventMeta` の全フィールドを定義。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M6-1 (#72) | `SipEventPayload` enum — 同一 `event.rs` で定義済み |
| M0-2 (#53) | `AccountId` / `CallId` — `EventMeta` の `account_id` / `call_id` フィールド |
| M0-1 (#52) | `SipError` — `SipEventPayload::Error` で使用（間接依存） |

### 設計判断

- **`src/event.rs` への追記**: M6-1 で作成済みの `event.rs` に `SipEvent` / `EventMeta` / `EventTimestamp` / `EventDirection` を追加
- **`EventTimestamp` newtype**: `SystemTime` をラップする newtype。`serde` feature で ISO 8601 シリアライズ
- **`event_id` 採番**: `std::sync::atomic::AtomicU64` で単調増加。`SipEvent::new()` で自動採番
- **fluent builder**: `SipEvent::with_meta()` で `EventMeta` の各部分を builder パターンで設定可能に
- **`Debug` + `Clone`**: 全型に derive。`EventMeta` の `logical_context` は `BTreeMap` で順序保証

## Scope

### `crates/siprs/src/event.rs`（追記）

```rust
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::SystemTime;

use crate::error::SipError;
// AccountId / CallId は util::id 経由（use は既存モジュールが持つ）

/// イベントの方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EventDirection {
    Inbound,
    Outbound,
}

/// `SystemTime` の newtype。
///
/// `serde` feature 有効時は ISO 8601 文字列にシリアライズされる。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct EventTimestamp(pub SystemTime);

/// イベントメタデータ。
///
/// 全イベントに共通する属性を保持する。
#[derive(Debug, Clone)]
pub struct EventMeta {
    pub event_id: u64,
    pub timestamp: EventTimestamp,
    pub account_id: Option<AccountId>,
    pub call_id: Option<CallId>,
    pub direction: Option<EventDirection>,
    pub headers: Option<Vec<(String, String)>>,
    pub status_code: Option<u16>,
    pub reason_phrase: Option<String>,
    pub logical_context: BTreeMap<String, String>,
}

/// イベントエンベロープ。
#[derive(Debug, Clone)]
pub struct SipEvent {
    pub meta: EventMeta,
    pub payload: SipEventPayload,
}

static NEXT_EVENT_ID: AtomicU64 = AtomicU64::new(1);

impl SipEvent {
    /// payload から SipEvent を生成する。
    ///
    /// `event_id` は自動採番、`timestamp` は現在時刻で自動設定される。
    pub fn new(payload: SipEventPayload) -> Self;

    /// payload とメタデータビルダーから SipEvent を生成する。
    ///
    /// `build()` を呼ぶまで event_id と timestamp は確定しない。
    pub fn with_meta(payload: SipEventPayload) -> EventMetaBuilder;
}

/// EventMeta の fluent builder。
pub struct EventMetaBuilder { /* ... */ }

impl EventMetaBuilder {
    pub fn account_id(mut self, id: AccountId) -> Self;
    pub fn call_id(mut self, id: CallId) -> Self;
    pub fn direction(mut self, dir: EventDirection) -> Self;
    pub fn header(mut self, name: &str, value: &str) -> Self;
    pub fn status_code(mut self, code: u16) -> Self;
    pub fn reason(mut self, phrase: &str) -> Self;
    pub fn context(mut self, key: &str, value: &str) -> Self;
    /// ビルドを完了し SipEvent を生成する。
    pub fn build(self) -> SipEvent;
}
```

### テストコード（`event.rs` の既存テストモジュールに追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_sip_event_new` | `SipEvent::new(payload)` が正しく生成されること |
| 2 | `test_event_id_monotonic` | 1000 イベントの `event_id` が単調増加で重複なし |
| 3 | `test_event_meta_fields` | `EventMeta` の全フィールドが正しく設定・取得できること |
| 4 | `test_event_meta_builder` | `SipEvent::with_meta().build()` で builder が機能すること |
| 5 | `test_event_timestamp_roundtrip` | `EventTimestamp(SystemTime::now())` が正しく保持されること |
| 6 | `test_event_direction` | `EventDirection` の全バリアントが構築可能であること |
| 7 | `test_clone_debug` | `SipEvent` の Clone / Debug が機能すること |

## Non-scope

- `serde` シリアライズ/デシリアライズ — 別チケットで optional feature として追加
- `EventBus` — M7-1
- `AccountEventReceiver` — M7-2
- Info 構造体のフィールド充填 — M6-1 スケルトンのまま

## Test Plan

### 基本方針

- `event_id` の単調増加性を 1000 イベント生成で検証
- Builder パターンの各メソッドが正しくフィールドを設定することを確認
- `Clone` / `Debug` の正常動作を確認

### ユニットテスト不可能な項目（例外）

- `serde` ISO 8601 シリアライズ — serde feature 導入時（別チケット）

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 209 テスト + 新規 7 テスト）
- [ ] `src/event.rs` に `SipEvent` / `EventMeta` / `EventTimestamp` / `EventDirection` / `EventMetaBuilder` が追加されている
- [ ] `event_id` が `AtomicU64` で単調増加すること
- [ ] `SipEvent::new()` と `SipEvent::with_meta()` の 2 つのコンストラクタが提供されていること
- [ ] `EventTimestamp` が `SystemTime` の newtype であること
- [ ] `EventMeta` が §15.3 の全 9 フィールドを持つこと
- [ ] 全テストで `unwrap()` 不使用
- [ ] 既存テストへの回帰がないこと

## Notes

### M6 マイルストーン

```text
M6-1 (#72): SipEventPayload enum + Info 構造体 ← 完了済み
M6-2 (#73): SipEvent / EventMeta / EventTimestamp ← 本チケット
M6-3 (#74): RawSipMessage / SipMessageDirection
```

### event_id の初期値

`AtomicU64::new(1)` で初期化し、`fetch_add(1, Ordering::Relaxed)` で採番する。0 は無効値として予約。`Relaxed` で十分な理由: event_id はユニーク保証のみが必要で、順序の整合性は `EventMeta` の `timestamp` が担保する。
