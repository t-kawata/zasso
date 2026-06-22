---
ticket_id: 74
title: "M6-3: RawSipMessage / SipMessageDirection 定義"
slug: m6-3-raw-sip-message
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/shyme/shyme/zasso/tickets/context/0074-m6-3-raw-sip-message/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0074-m6-3-raw-sip-message/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0074-m6-3-raw-sip-message/review.md
---

# M6-3: `RawSipMessage` / `SipMessageDirection` 定義

## Summary

生 SIP メッセージの構造化表現 `RawSipMessage` と送受信方向 `SipMessageDirection` を定義する。デバッグ・監査用途で全 SIP トラフィックを観測可能にし、`with_redaction` により認証情報の漏洩を防止する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§16)

## Background

### RFC 準拠

RFC §16「`redact_authorization == true` の場合、`Authorization`, `Proxy-Authorization` は `***REDACTED***` に置換して格納する」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M6-1 (#72) | `SipEventPayload` — 同一 `event.rs`（依存なし、sibling） |
| M6-2 (#73) | `EventMeta` / `SipEvent` — 同上 |
| M1-3 (#60) | `TransportKind` — `RawSipMessage::transport` フィールドで使用 |

### 設計判断

- **`src/event.rs` への追記**: M6-1 / M6-2 で作成済みの `event.rs` に追記
- **`SipMessageDirection`**: `Sent` / `Received`（`EventDirection` と類似だが別目的 — `EventDirection` は論理的方向、`SipMessageDirection` は物理的送受信）
- **`with_redaction`**: `self` を消費し `Self` を返す（builder パターン）。`ClientConfig::raw_sip_event.redact_authorization` から呼び出し側が制御
- **`from_raw_parts`**: FFI 層 (M17-3) で使用する raw constructor。全フィールドを個別引数で受け取る
- **Redaction アルゴリズム**: ヘッダ名を大文字小文字区別なく比較（`.to_lowercase()`）。`Authorization` と `Proxy-Authorization` の値を `***REDACTED***` に置換

## Scope

### `crates/siprs/src/event.rs`（追記）

```rust
use std::net::SocketAddr;
use crate::transport::TransportKind;

/// SIP メッセージの物理的送受信方向。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SipMessageDirection {
    /// 送信メッセージ。
    Sent,
    /// 受信メッセージ。
    Received,
}

/// 生 SIP メッセージの構造化表現。
///
/// デバッグ・監査用途で全 SIP トラフィックを観測可能にする。
/// `with_redaction()` で認証情報をマスクできる。
#[derive(Debug, Clone)]
pub struct RawSipMessage {
    pub direction: SipMessageDirection,
    pub transport: TransportKind,
    pub start_line: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<Vec<u8>>,
    pub text: String,
    pub content_length: usize,
    pub remote_addr: Option<SocketAddr>,
    pub local_addr: Option<SocketAddr>,
}

impl RawSipMessage {
    /// 生データから RawSipMessage を構築する（FFI 層用）。
    pub fn from_raw_parts(
        direction: SipMessageDirection,
        transport: TransportKind,
        start_line: impl Into<String>,
        headers: Vec<(String, String)>,
        body: Option<Vec<u8>>,
        text: impl Into<String>,
        content_length: usize,
        remote_addr: Option<SocketAddr>,
        local_addr: Option<SocketAddr>,
    ) -> Self;

    /// Authorization ヘッダを redact する。
    ///
    /// `redact == true` の場合、`Authorization` および `Proxy-Authorization` ヘッダの値を
    /// `"***REDACTED***"` に置換する。ヘッダ名の比較は大文字小文字を区別しない。
    pub fn with_redaction(mut self, redact: bool) -> Self;
}
```

### テストコード（`event.rs` の既存テストモジュールに追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_raw_sip_message_from_parts` | `from_raw_parts` で正しく構築できること |
| 2 | `test_redact_authorization` | `with_redaction(true)` が `Authorization` を redact すること |
| 3 | `test_redact_proxy_authorization` | `Proxy-Authorization` も redact すること |
| 4 | `test_redact_disabled` | `with_redaction(false)` はヘッダを変更しないこと |
| 5 | `test_redact_preserves_other_headers` | `From`, `To`, `Call-ID` 等は影響を受けないこと |
| 6 | `test_raw_sip_message_body` | `body` が `Option<Vec<u8>>` を保持できること |
| 7 | `test_raw_sip_message_text` | `text` が完全なメッセージを保持できること |
| 8 | `test_raw_sip_debug_redacted` | Debug 出力で redact 済みヘッダが露出しないこと |

## Non-scope

- `EventBus` との統合 — M7-1
- `subscribe_raw_sip()` — M12-3
- FFI 層からの `from_raw_parts` 呼び出し — M17-3
- 大文字小文字の完全な RFC 準拠パース — 現状は `to_lowercase()` で十分

## Test Plan

### 基本方針

- Redaction の網羅性: `Authorization` / `Proxy-Authorization` の両方を検証
- Redaction の副作用防止: その他のヘッダに影響がないことを確認
- 大文字小文字の耐性: `AUTHORIZATION` / `authorization` / `Authorization` のすべての表記揺れに対応

### ユニットテスト不可能な項目（例外）

- FFI 層からの構築経路 — M17-3 で統合テスト

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 216 テスト + 新規 8 テスト）
- [ ] `src/event.rs` に `RawSipMessage` / `SipMessageDirection` が追加されている
- [ ] `RawSipMessage` が §16 の全 9 フィールドを持つこと
- [ ] `with_redaction(true)` が `Authorization` / `Proxy-Authorization` を `***REDACTED***` に置換すること
- [ ] `with_redaction(false)` が何も変更しないこと
- [ ] ヘッダ名の比較が大文字小文字を区別しないこと
- [ ] 全テストで `unwrap()` 不使用

## Notes

### SipMessageDirection vs EventDirection

`SipMessageDirection`（`Sent`, `Received`）は raw SIP メッセージの物理的な送受信方向を表す。`EventMeta::direction`（`EventDirection::Inbound`, `Outbound`）は論理的なイベント方向を表す。両者は概念が異なるため別 enum として定義する。

### M6 マイルストーン

```text
M6-1 (#72): SipEventPayload enum + Info 構造体 ← 完了済み
M6-2 (#73): SipEvent / EventMeta / EventTimestamp ← 完了済み
M6-3 (#74): RawSipMessage / SipMessageDirection ← 本チケット
```
