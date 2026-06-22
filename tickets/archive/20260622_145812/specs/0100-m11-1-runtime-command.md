---
ticket_id: 100
title: "M11-1: RuntimeCommand enum 定義"
slug: m11-1-runtime-command
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0100-m11-1-runtime-command/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0100-m11-1-runtime-command/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0100-m11-1-runtime-command/review.md
---

# M11-1: `RuntimeCommand` enum 定義

## Summary

全公開 API 呼び出しを reactor スレッド上にシリアライズするためのコマンド型 `RuntimeCommand` を定義する。各バリアントは `oneshot::Sender` を持ち、reactor が処理完了後に結果を返送する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§7.2, §19, §22, §24.4)

## Background

### RFC 準拠

RFC §7.2 command serialization「公開 API は RuntimeCommand を unbounded MPSC で reactor へ送る。reactor は単一スレッドで順序実行し、結果を oneshot で返す」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M7-1 (#90) | `tokio` 依存（`tokio::sync::oneshot`）— 既に追加済み |
| M0-1 (#52) | `SipError` — 全 reply のエラー型 |
| M2-1 (#62) | `ClientConfig` — `Initialize` コマンドで使用 |
| M2-2 (#63) | `AccountConfig` / `DtmfMethod` |
| M2-3 (#64) | `OutgoingCallRequest` |
| M0-2 (#53) | `AccountId` / `CallId` / `AudioSourceId` |

### 設計判断

- **`src/runtime/command.rs`**: 新規ファイル。`RuntimeCommand` と `HangupReason` を定義
- **17 バリアント**: RFC §7.2 の全操作を網羅
- **`reply` フィールド**: 各バリアントに `oneshot::Sender<Result<T, SipError>>` を持つ
- **`HangupReason`**: 切断理由を明示する enum

## Scope

### `crates/siprs/src/runtime/command.rs`（新規）

```rust
use crate::audio::format::AudioFormat;
use crate::config::{AccountConfig, ClientConfig, DtmfMethod, OutgoingCallRequest};
use crate::error::SipError;
use crate::util::id::{AccountId, AudioSourceId, CallId};

/// 切断理由。
pub(crate) enum HangupReason {
    Bye,
    Cancel,
    Busy,
    Decline,
    InternalError,
}

/// Reactor に送信するランタイムコマンド。
///
/// 全公開 API はこの enum に変換され、unbounded MPSC 経由で
/// reactor スレッドに送られる。処理結果は oneshot で返送される。
pub(crate) enum RuntimeCommand {
    Initialize {
        config: ClientConfig,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    AddAccount {
        config: AccountConfig,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    RemoveAccount {
        account_id: AccountId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    SetRegistration {
        account_id: AccountId,
        enabled: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    MakeCall {
        account_id: AccountId,
        request: Box<OutgoingCallRequest>,
        reply: tokio::sync::oneshot::Sender<Result<CallId, SipError>>,
    },
    Hangup {
        call_id: CallId,
        reason: HangupReason,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    Hold {
        call_id: CallId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    Unhold {
        call_id: CallId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    SendDtmf {
        call_id: CallId,
        digits: String,
        method: DtmfMethod,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    Answer {
        call_id: CallId,
        code: u16,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    Transfer {
        call_id: CallId,
        target: String,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    AddAudioSource {
        call_id: CallId,
        reply: tokio::sync::oneshot::Sender<Result<AudioSourceId, SipError>>,
    },
    RemoveAudioSource {
        call_id: CallId,
        source_id: AudioSourceId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    SetSourceGain {
        call_id: CallId,
        source_id: AudioSourceId,
        gain: f32,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    MuteSource {
        call_id: CallId,
        source_id: AudioSourceId,
        muted: bool,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    SubscribeAudio {
        call_id: CallId,
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
    Shutdown {
        reply: tokio::sync::oneshot::Sender<Result<(), SipError>>,
    },
}
```

### `crates/siprs/src/runtime/mod.rs`（修正）

- `pub mod command;` 追加

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_runtime_command_send` | `RuntimeCommand` が `Send` であること |
| 2 | `test_hangup_reason_variants` | `HangupReason` 全バリアント構築可能 |

## Non-scope

- `RuntimeHandle` — M11-2
- Reactor loop — M11-3
- MockBackend を使用した結合テスト — M11-3

## Test Plan

### 基本方針

コンパイル時検証（Send）と enum の構築テスト。

### ユニットテスト不可能な項目（例外）

- 実際の MPSC 送受信 — M11-2 / M11-3 で検証

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 296 + 新規 2）
- [ ] `src/runtime/command.rs` が作成されている
- [ ] `RuntimeCommand` enum が 17 バリアントを持つこと
- [ ] `HangupReason` enum が 5 バリアントを持つこと
- [ ] 全テストで `unwrap()` 不使用

## Notes

### OutgoingCallRequest の Boxing

`MakeCall` バリアントの `request` フィールドは `Box<OutgoingCallRequest>` とすることで enum のサイズ肥大化を防ぐ。

### M11 マイルストーン

```text
M11-1 (#100): RuntimeCommand enum 定義 ← 本チケット
M11-2 (#101): RuntimeHandle — MPSC + oneshot 送受信
M11-3 (#102): Reactor loop — 単一スレッドでのコマンド処理
```
