---
ticket_id: 105
title: "M12-2: SipClient::new() — 初期化・バリデーション・Reactor起動"
slug: m12-2-sip-client-new
status: reviewed
created_at: 2026-06-17
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0105-m12-2-sip-client-new/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0105-m12-2-sip-client-new/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0105-m12-2-sip-client-new/review.md
---

# M12-2: `SipClient::new()` — 初期化・バリデーション・Reactor起動

## Summary

`SipClient::new(config: ClientConfig) -> Result<Self, SipError>` を実装する。config バリデーション、EventBus 生成、Reactor スレッド起動、PJSUA 初期化、ClientInitialized イベント発行の一連の初期化シーケンスを実行する。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§8.3, §41.1)

## Background

### RFC 準拠

RFC §8.3「SipClient::new(config) -> Result<Self, SipError>」。§42 fail-fast validation。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M12-1 (#104) | `SipClient` / `ClientInner` |
| M11-3 (#102) | `CoreReactor::spawn()` |
| M7-1 (#90) | `EventBus` |
| M8-1 (#92) | `ClientState` |
| M2-1 (#62) | `ClientConfig` / `TimeoutConfig` |
| M3-1 (#65) | `validate_client_config()` |

### 設計判断

- **`SipClient::new()` はブロッキング**: 初期化が完了するまで同期的に待つ
- **Initialize コマンド**: reactor に送信後、`send_and_wait` で完了を待つ
- **タイムアウト**: `config.timeouts.command_timeout` を初期化完了の上限とする。タイムアウト時は `SipError::Timeout`
- **MockBackend テスト**: 実際の PJSUA なしで全シーケンスをテスト

## Scope

### `crates/siprs/src/client.rs`（追記）

```rust
impl SipClient {
    /// 新しい `SipClient` インスタンスを生成する。
    ///
    /// 1. Config バリデーション
    /// 2. EventBus 生成
    /// 3. CoreReactor 起動
    /// 4. PJSUA 初期化（SipBackend 経由）
    /// 5. ClientCapabilities 確定 → ClientInitialized イベント
    pub fn new(config: ClientConfig) -> Result<Self, SipError>;
}
```

### テストコード

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_new_success` | 正常初期化 → SipClient + ClientInitialized イベント |
| 2 | `test_new_invalid_config` | event_bus_capacity < 16 → InvalidConfig |
| 3 | `test_new_initialize_failure` | MockBackend initialize 失敗 → エラー伝播 |

## Non-scope

- `SipClient::shutdown()` — M12-5
- `subscribe()` / `add_account()` — M12-3, M12-4
- `tracing::instrument` — M12-6

## Test Plan

### 基本方針

MockBackend を使用した結合テスト。3 シナリオ（正常系、InvalidConfig、initialize 失敗）。

### ユニットテスト不可能な項目（例外）

- 実際の PJSUA 初期化 — M17-4

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 308 + 新規 3）
- [ ] `SipClient::new()` が正常に SipClient を生成すること
- [ ] 不正 config で `InvalidConfig` が返ること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### 初期化シーケンス

```text
SipClient::new(config)
  → validate_client_config(&config)?
  → EventBus::new(...)
  → ClientState::new(...)
  → CoreReactor::spawn(backend, events, state, shutdown_rx)
  → handle.send_and_wait(|reply| RuntimeCommand::Initialize { config, reply })
  → SipClient { inner: Arc::new(ClientInner { ... }) }
```

### M12 マイルストーン

```text
M12-1 (#104): SipClient 構造体 ← 完了済み
M12-2 (#105): SipClient::new() ← 本チケット
M12-3〜M12-6: subscribe / add_account / shutdown / tracing
```
