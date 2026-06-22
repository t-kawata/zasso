---
ticket_id: 98
title: "M10-1: SipBackend trait 定義"
slug: m10-1-sip-backend-trait
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0098-m10-1-sip-backend-trait/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0098-m10-1-sip-backend-trait/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0098-m10-1-sip-backend-trait/review.md
---

# M10-1: `SipBackend` trait 定義

## Summary

PJSUA への全 FFI 呼び出しを抽象化する内部 trait `SipBackend` を定義する。`pub(crate)` であり外部に公開されない。テスト時は `MockBackend`（M10-2）に差し替え、PJSIP の初期化なしに Reactor と状態機械の全検証を可能にする。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§27a)

## Background

### RFC 準拠

RFC §27a「Runtime はこの trait を通じてのみ PJSUA を操作し、直接的な FFI 依存を runtime 層に漏らさない」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M2-1 (#62) | `ClientConfig` — `initialize` の引数 |
| M1-3 (#60) | `TransportConfig` — `create_transport` の引数 |
| M2-2 (#63) | `AccountConfig` / `DtmfMethod` |
| M2-3 (#64) | `OutgoingCallRequest` |
| M8-3 (#94) | `ClientCapabilities` — 戻り値 |
| M0-1 (#52) | `SipError` — 全メソッドのエラー型 |

### 設計判断

- **`src/runtime/backend.rs`**: 新規ファイル。trait 定義と型エイリアスを集約
- **型エイリアス**: `pjsua_acc_id = i32`, `pjsua_call_id = i32`, `pjsua_conf_port_id = i32`。M17-1 で `ffi` 型に差し替え
- **`pub(crate)`**: クレート外部に公開しない
- **`Send` 境界**: trait に `: Send` を付与し、Reactor 間での安全な所有権移動を保証

## Scope

### `crates/siprs/src/runtime/backend.rs`（新規）

```rust
use crate::config::{AccountConfig, ClientConfig, DtmfMethod, OutgoingCallRequest, TransportConfig};
use crate::error::SipError;
use crate::event::ClientCapabilities;

/// PJSUA ネイティブアカウント ID（M17-1 で ffi::pjsua_acc_id に差し替え）。
pub(crate) type NativeAccId = i32;
/// PJSUA ネイティブ通話 ID（同上）。
pub(crate) type NativeCallId = i32;
/// PJSUA カンファレンスポート ID（同上）。
pub(crate) type NativeConfPortId = i32;

/// 内部 SIP バックエンド抽象化。
///
/// Runtime はこの trait を通じてのみ PJSUA を操作し、
/// 直接的な FFI 依存を runtime 層に漏らさない。
pub(crate) trait SipBackend: Send {
    fn initialize(&mut self, config: &ClientConfig) -> Result<ClientCapabilities, SipError>;
    fn shutdown(&mut self) -> Result<(), SipError>;
    fn create_transport(&mut self, config: &TransportConfig) -> Result<(), SipError>;
    fn add_account(&mut self, config: &AccountConfig) -> Result<(NativeAccId, ClientCapabilities), SipError>;
    fn remove_account(&mut self, native_acc_id: NativeAccId) -> Result<(), SipError>;
    fn set_registration(&mut self, native_acc_id: NativeAccId, enabled: bool) -> Result<(), SipError>;
    fn make_call(&mut self, native_acc_id: NativeAccId, request: &OutgoingCallRequest) -> Result<NativeCallId, SipError>;
    fn answer_call(&mut self, native_call_id: NativeCallId, code: u16) -> Result<(), SipError>;
    fn hangup(&mut self, native_call_id: NativeCallId) -> Result<(), SipError>;
    fn conf_connect(&mut self, source: NativeConfPortId, sink: NativeConfPortId) -> Result<(), SipError>;
    fn conf_disconnect(&mut self, source: NativeConfPortId, sink: NativeConfPortId) -> Result<(), SipError>;
    fn configure_codecs(&mut self) -> Result<(), SipError>;
    fn send_dtmf(&mut self, native_call_id: NativeCallId, method: &DtmfMethod, digits: &str) -> Result<(), SipError>;
    fn transfer_call(&mut self, native_call_id: NativeCallId, target: &str) -> Result<(), SipError>;
}
```

### `crates/siprs/src/runtime/mod.rs`（修正）

- `pub mod backend;` 追加

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_sip_backend_object_safe` | trait が object-safe であること（`Box<dyn SipBackend>` がコンパイル可能） |
| 2 | `test_sip_backend_send` | `Box<dyn SipBackend>` が `Send` であること |
| 3 | `test_native_id_types` | 型エイリアスが `i32` であること |

## Non-scope

- `MockBackend` 実装 — M10-2
- `PjsuaBackend` 実装 — M17-4
- FFI 型への差し替え — M17-1

## Test Plan

### 基本方針

コンパイル時検証（object-safe + Send）を中心に、trait のメソッドシグネチャが正しいことを確認。

### ユニットテスト不可能な項目（例外）

- 実際のバックエンド動作 — M10-2 / M17-4 で検証

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 288 + 新規 3）
- [ ] `src/runtime/backend.rs` が作成されている
- [ ] `SipBackend` trait が 14 メソッド + `Send` 境界を持つこと
- [ ] 3 つの型エイリアス（`NativeAccId`, `NativeCallId`, `NativeConfPortId`）が定義されていること
- [ ] trait が `pub(crate)` であること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### 型エイリアスの M17-1 差し替え

本チケットでは `NativeAccId = i32` 等の簡易エイリアスを定義する。M17-1 で bindgen が生成する `ffi::pjsua_acc_id` に差し替える際は、型エイリアスの定義だけを変更すればよく、trait のメソッドシグネチャは修正不要。

### M10 マイルストーン

```text
M10-1 (#98): SipBackend trait 定義 ← 本チケット
M10-2 (#99): MockBackend 実装
```
