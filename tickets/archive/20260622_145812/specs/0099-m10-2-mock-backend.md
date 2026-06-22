---
ticket_id: 99
title: "M10-2: MockBackend 実装"
slug: m10-2-mock-backend
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0099-m10-2-mock-backend/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0099-m10-2-mock-backend/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0099-m10-2-mock-backend/review.md
---

# M10-2: `MockBackend` 実装

## Summary

テスト専用の `SipBackend` 実装 `MockBackend` を実装する。PJSUA の代わりにメモリ内で動作し、全操作の成功/失敗をテストシナリオに応じて制御できる。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§27a, §43.2)

## Background

### RFC 準拠

RFC §43.2「MockBackend を注入した Runtime を使用し、PJSIP の初期化なしに状態機械の全遷移を検証する」。§27a「内部テスト用として定義するに留める」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M10-1 (#98) | `SipBackend` trait — 実装対象 |
| M2-1 (#62) | `ClientConfig` / `ClientCapabilities` |
| M2-2 (#63) | `AccountConfig` / `DtmfMethod` |
| M2-3 (#64) | `OutgoingCallRequest` |

### 設計判断

- **`src/runtime/backend.rs` に追記**: 既存の backend.rs に `#[cfg(test)]` ブロックとして追加
- **`MockBackend` は `pub(crate)`**: 結合テストモジュールからアクセス可能
- **Result Injection パターン**: `set_xxx_result()` で任意の戻り値を注入。デフォルトは成功
- **未初期化チェック**: `initialize` 未呼び出しでの操作は `NotInitialized` を返す
- **二重初期化チェック**: 2回目の `initialize` は `AlreadyInitialized` を返す

## Scope

### `crates/siprs/src/runtime/backend.rs`（追記）

```rust
/// テスト専用の SIP バックエンド実装。
///
/// PJSUA の代わりにメモリ内で動作し、全操作の成功/失敗を
/// テストシナリオに応じて制御できる。
#[cfg(test)]
pub(crate) struct MockBackend {
    initialized: bool,
    accounts: HashMap<i32, AccountConfig>,
    calls: HashMap<i32, MockCall>,
    next_acc_id: i32,
    next_call_id: i32,
    // 注入された結果（Some なら優先返却）
    initialize_result: Option<Result<ClientCapabilities, SipError>>,
    add_account_result: Option<Result<i32, SipError>>,
    make_call_result: Option<Result<i32, SipError>>,
}

#[cfg(test)]
struct MockCall {
    account_id: i32,
    // 通話状態は M11 以降で拡張
}

#[cfg(test)]
impl SipBackend for MockBackend { /* 全メソッド実装 */ }

#[cfg(test)]
impl MockBackend {
    pub fn new() -> Self;
    pub fn set_initialize_result(&mut self, result: Result<ClientCapabilities, SipError>);
    pub fn set_add_account_result(&mut self, result: Result<i32, SipError>);
    pub fn set_make_call_result(&mut self, result: Result<i32, SipError>);
    pub fn reset(&mut self);
}
```

### テストコード（`backend.rs` または結合テスト）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_default_initialize` | デフォルト成功動作（initialize が Ok を返す） |
| 2 | `test_inject_failure` | 注入した失敗結果が正しく返される |
| 3 | `test_uninitialized_error` | initialize 未呼び出しで NotInitialized |
| 4 | `test_double_initialize` | 重複 initialize → AlreadyInitialized |
| 5 | `test_reset` | reset() で全状態がクリアされる |

## Non-scope

- MockBackend を使用した Reactor 結合テスト — M11-3
- `MockBackend::set_result` 以外の injection — 必要に応じて追加

## Test Plan

### 基本方針

MockBackend 自身の動作を検証する 5 テスト。

### ユニットテスト不可能な項目（例外）

- 実際の PJSUA との結合 — M17-4

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 291 + 新規 5）
- [ ] `MockBackend` が `SipBackend` を実装していること
- [ ] Result Injection パターンが機能すること
- [ ] 未初期化エラー / 二重初期化エラーが正しく返ること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### `#[cfg(test)]` の配置

`MockBackend` はテスト専用のため `#[cfg(test)]` アトリビュートを付与する。これにより本番ビルドには含まれず、テストビルド時のみコンパイルされる。

### M10 マイルストーン

```text
M10-1 (#98): SipBackend trait 定義 ← 完了済み
M10-2 (#99): MockBackend 実装 ← 本チケット
```
