---
ticket_id: 72
title: "M6-1: SipEventPayload enum 全バリアント + 関連 Info 構造体"
slug: m6-1-sip-event-payload
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/shyme/shyme/zasso/tickets/context/0072-m6-1-sip-event-payload/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0072-m6-1-sip-event-payload/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0072-m6-1-sip-event-payload/review.md
---

# M6-1: `SipEventPayload` enum 全バリアント + 関連 Info 構造体

## Summary

crate の全イベントを単一の `SipEventPayload` enum で表現する。`#[non_exhaustive]` により将来のバリアント追加に対する破壊的変更を防止する。データを持つバリアントは対応する Info 構造体を保持する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§15.1)

## Background

### RFC 準拠

RFC §15.1「要件で列挙された全イベントを payload enum で完全定義する」。`#[non_exhaustive]` により将来のバリアント追加に対する破壊的変更を防止。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M0-1 (#52) | `SipError` — `Error(SipError)` バリアントで使用 |
| M2-3 (#64) | `OutgoingCallRequest` — `ReferRequest` が `ReferRequest` 型を使用（RFC §37 参照） |

### 循環依存の注意

`ClientCapabilities`（`ClientInitialized(ClientCapabilities)`）は M8-3 で定義予定のため、本チケットでは `use crate::client::capabilities::ClientCapabilities;` で参照する。M8-3 実装時にパス解決が必要。

### 設計判断

- **`src/event.rs`**: 新規ファイル。`lib.rs` のコメントアウトされた `pub mod event;` を有効化
- **36 バリアント**: RFC §15.1 の完全実装。データなしバリアントはタプル構造体（`()`）として定義し将来拡張に備える
- **Info 構造体は同一ファイルに定義**: `SipEventPayload` と同時に参照できるよう同一ファイル内で定義
- **`#[non_exhaustive]`**: `SipEventPayload` に付与
- **`Debug` + `Clone`**: 全型に derive
- **`serde` feature**: optional feature として提供。`serde` feature 有効時のみ Serialize/Deserialize を derive
- **Info 構造体の命名**: RFC §15.1 に従う（`RegistrationInfo`, `RegistrationFailure`, `OutgoingCallInfo` 等）

## Scope

### `crates/siprs/src/event.rs`（新規）

```rust
use crate::error::SipError;
// ClientCapabilities は M8-3 で定義予定。

/// イベント種別を定義する payload enum。
///
/// `#[non_exhaustive]` により将来のバリアント追加に対する破壊的変更を防止する。
#[derive(Debug, Clone)]
#[non_exhaustive]
pub enum SipEventPayload {
    // ── 登録系（6） ──
    RegistrationStarted(RegistrationInfo),
    RegistrationSucceeded(RegistrationInfo),
    RegistrationFailed(RegistrationFailure),
    /// 登録解除成功（データなし）。
    UnregistrationSucceeded(()),
    UnregistrationFailed(RegistrationFailure),
    /// 登録期限切れ（データなし）。
    RegistrationExpired(()),

    // ── 発着信系（13） ──
    OutgoingCallStarted(OutgoingCallInfo),
    OutgoingCallTrying(ProvisionalInfo),
    OutgoingCallRinging(ProvisionalInfo),
    EarlyMediaReceived(EarlyMediaInfo),
    CallConnected(ConnectedCallInfo),
    IncomingCall(IncomingCallInfo),
    CallDisconnected(DisconnectInfo),
    CallCancelled(CancelInfo),
    CallRejected(RejectInfo),
    /// 通話保留（データなし）。
    CallHeld(()),
    /// 通話再開（データなし）。
    CallResumed(()),
    ReferReceived(ReferRequest),
    TransferCompleted(TransferInfo),

    // ── メディア系（3） ──
    MediaActive(MediaActiveInfo),
    MediaStopped(MediaStoppedInfo),
    MediaError(MediaErrorInfo),

    // ── DTMF系（2） ──
    DtmfSent(DtmfSentInfo),
    DtmfReceived(DtmfReceivedInfo),

    // ── ICE系（3） ──
    /// ICE ネゴシエーション開始（データなし）。
    IceNegotiationStarted(()),
    IceNegotiationSucceeded(IceSuccessInfo),
    IceNegotiationFailed(IceFailureInfo),

    // ── トランスポート系（3） ──
    TransportConnected(TransportConnectedInfo),
    TransportDisconnected(TransportDisconnectedInfo),
    TransportError(TransportErrorInfo),

    // ── アカウント系（3） ──
    AccountAdded(AccountSnapshot),
    AccountRemoved(AccountSnapshot),
    AccountConfigChanged(AccountSnapshot),

    // ── クライアントライフサイクル系（2） ──
    ClientInitialized(ClientCapabilities),
    /// クライアントシャットダウン（データなし）。
    ClientShutdown(()),

    // ── エラー系（1） ──
    Error(SipError),
}

// ── 登録系 Info ──
#[derive(Debug, Clone)] pub struct RegistrationInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct RegistrationFailure { /* ... */ }

// ── 発着信系 Info ──
#[derive(Debug, Clone)] pub struct OutgoingCallInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct ProvisionalInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct EarlyMediaInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct ConnectedCallInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct IncomingCallInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct DisconnectInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct CancelInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct RejectInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct TransferInfo { /* ... */ }

// ── メディア系 Info ──
#[derive(Debug, Clone)] pub struct MediaActiveInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct MediaStoppedInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct MediaErrorInfo { /* ... */ }

// ── DTMF系 Info ──
#[derive(Debug, Clone)] pub struct DtmfSentInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct DtmfReceivedInfo { /* ... */ }

// ── ICE系 Info ──
#[derive(Debug, Clone)] pub struct IceSuccessInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct IceFailureInfo { /* ... */ }

// ── トランスポート系 Info ──
#[derive(Debug, Clone)] pub struct TransportConnectedInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct TransportDisconnectedInfo { /* ... */ }
#[derive(Debug, Clone)] pub struct TransportErrorInfo { /* ... */ }

// ── アカウント系 Info ──
#[derive(Debug, Clone)] pub struct AccountSnapshot { /* ... */ }

// ── クライアントライフサイクル系 ──
// ClientCapabilities は M8-3 で定義。本チケットでは型のみ `use` で参照。
```

**Info 構造体のフィールドは M6-2 以降の詳細設計で充填する。本チケットではスケルトン（空構造体）として定義し、後続チケットでフィールドを追加する。**

### `crates/siprs/src/lib.rs`（修正）

- `// pub mod event;` → `pub mod event;` に変更
- `pub use event::SipEventPayload;` を追加

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_variant_count` | 全36バリアントが定義されていること（`SipEventPayload` の variant count 検証は困難なため、全データありバリアントの構築テストで代替） |
| 2 | `test_data_variants_constructible` | データありバリアント（`RegistrationStarted`, `CallConnected`, `DtmfReceived` 等）が Info 構造体を保持して構築できること |
| 3 | `test_empty_variants_constructible` | データなしバリアント（`CallHeld`, `IceNegotiationStarted` 等）が構築できること |
| 4 | `test_clone_all_variants` | 全バリアントの Clone が正しく機能すること |
| 5 | `test_nested_siperror` | `Error(SipError)` バリアントが正しくエラーをラップすること |
| 6 | `test_non_exhaustive_doc_test` | `#[non_exhaustive]` が動作していること（doc テストまたは外部 crate テスト） |

### `crates/siprs/src/client/capabilities.rs`（先行仮定義）

- `ClientCapabilities` の仮構造体を `pub struct ClientCapabilities;` として定義（M8-3 で差し替え）

## Non-scope

- Info 構造体のフィールド定義 — M6-2 以降で追加
- `EventMeta` / `EventTimestamp` — M6-2
- `SipEvent` エンベロープ — M6-2
- `RawSipMessage` — M6-3
- `EventBus` — M7-1
- `#[cfg(feature = "serde")]` — 別チケットで追加

## Test Plan

### 基本方針

- 全バリアントの構築テストで enum の完全性を検証（variant count はコンパイル時の網羅性で代替）
- Clone の正しさを全バリアントで確認
- データなしバリアントの `()` 構築が可能であることを確認

### ユニットテスト不可能な項目（例外）

- `#[non_exhaustive]` の外部 crate からの検証 — 現 crate 内では検証不可能。doc 例で概念的に示す
- `serde` roundtrip — serde feature 導入時（別チケット）

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 203 テスト + 新規 6 テスト）
- [ ] `src/event.rs` が作成されている
- [ ] `SipEventPayload` enum が 36 バリアントを持つこと
- [ ] 全 Info 構造体がスケルトン（空構造体）として定義されていること
- [ ] `ClientCapabilities` が利用可能であること（先行仮定義または use 参照）
- [ ] `lib.rs` で `pub mod event;` + `pub use` で公開されていること
- [ ] `#[non_exhaustive]` が付与されていること
- [ ] 全テストで `unwrap()` 不使用
- [ ] 既存テストへの回帰がないこと

## Notes

### スケルトン戦略

本チケットでは Info 構造体を空構造体として定義し、バリアントの存在のみを確定させる。フィールドの詳細設計は M6-2 以降で行う。これにより：
- 後続チケット（M6-2, M6-3）が Info 構造体のフィールドを追加する際に安全に拡張できる
- 本チケットのレビュー範囲を enum 構造の正当性に集中できる

### ClientCapabilities の先行仮定義

`ClientCapabilities` は M8-3 で正式定義されるが、M6-1 の `ClientInitialized(ClientCapabilities)` バリアントで必要となる。`src/client/capabilities.rs` に `pub struct ClientCapabilities;` を仮定義し、M8-3 でフィールドを追加する。

### M6 マイルストーン

```text
M6-1 (#72): SipEventPayload enum + Info 構造体スケルトン ← 本チケット
M6-2 (#73): SipEvent / EventMeta / EventTimestamp
M6-3 (#74): RawSipMessage / SipMessageDirection
```
