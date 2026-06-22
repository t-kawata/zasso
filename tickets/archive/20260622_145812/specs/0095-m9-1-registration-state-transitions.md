---
ticket_id: 95
title: "M9-1: RegistrationState 遷移ロジック"
slug: m9-1-registration-state-transitions
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0095-m9-1-registration-state-transitions/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0095-m9-1-registration-state-transitions/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0095-m9-1-registration-state-transitions/review.md
---

# M9-1: `RegistrationState` 遷移ロジック

## Summary

アカウント登録状態の正当な遷移を保証するロジックを実装する。不正な遷移（例: `Disabled → Idle`）は `SipError::InvalidState` として拒否される。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§17, §17.1)

## Background

### RFC 準拠

RFC §17.1 遷移規則（全8遷移パス）。「未登録でも `make_call()` は常に可能であるため、`RegistrationState` は発信可否に影響しない」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M8-1 (#92) | `RegistrationState` enum（7 variants） |
| M0-1 (#52) | `SipError` / `SipErrorKind::InvalidState` |

### 設計判断

- **`src/account.rs`**: `RegistrationState` と同じファイルにメソッドを追加
- **`RegistrationEvent` enum**: 同一ファイルに定義。`RegistrationState::apply_event()` が受け取る
- **`can_transition_to()`**: 状態遷移表に基づく判定。`apply_event()` 内で呼ばれる
- **遷移表**: RFC §17.1 の 8 遷移パス + no-op ケース（`Registered → register()` は `Ok`）

## Scope

### `crates/siprs/src/account.rs`（追記）

```rust
/// 登録状態遷移イベント。
pub enum RegistrationEvent {
    /// 明示的な登録要求。
    Register,
    /// 明示的な登録解除要求。
    Unregister,
    /// 登録機能の有効/無効設定。
    SetEnabled(bool),
    /// 登録成功（PJSIP callback）。
    Success,
    /// 登録失敗（PJSIP callback）。
    Failure(SipError),
    /// 登録期限切れ（PJSIP callback）。
    Expired,
}

impl RegistrationState {
    /// 現在の状態から `next` への遷移が合法かどうかを返す。
    pub fn can_transition_to(&self, next: RegistrationState) -> bool;

    /// イベントを適用し、状態遷移を実行する。
    pub fn apply_event(&mut self, event: RegistrationEvent) -> Result<(), SipError>;

    /// 登録完了状態（`Registered`）かどうかを返す。
    pub fn is_registered(&self) -> bool;

    /// 登録処理進行中（`Registering | Unregistering`）かどうかを返す。
    pub fn is_in_progress(&self) -> bool;

    /// 回復不能エラー状態（`Failed`）かどうかを返す。
    pub fn is_terminal_error(&self) -> bool;
}
```

### 遷移表

| 現在状態 | Register | Unregister | SetEnabled(true) | SetEnabled(false) | Success | Failure | Expired |
|---------|---------|-----------|-----------------|------------------|---------|---------|---------|
| Disabled | Registering | ❌ | Registering | Disabled | ❌ | ❌ | ❌ |
| Idle | Registering | ❌ | Registering | Disabled | ❌ | ❌ | ❌ |
| Registering | ❌ | ❌ | Registering | Disabled | Registered | Failed | ❌ |
| Registered | ✅(no-op) | Unregistering | Registered | Disabled | ❌ | ❌ | Expired |
| Unregistering | ❌ | ❌ | Unregistering | Disabled | Idle | Failed | ❌ |
| Failed | Registering | ❌ | Registering | Disabled | ❌ | ❌ | ❌ |
| Expired | Registering | ❌ | Registering | Disabled | ❌ | ❌ | ❌ |

✅ = no-op (現在状態を維持)、❌ = InvalidState, その他 = 遷移先

### テストコード（`account.rs` の既存テストモジュールに追記）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_full_lifecycle` | Disabled→Registering→Registered→Unregistering→Idle |
| 2 | `test_register_from_idle` | Idle→Registering→Registered |
| 3 | `test_retry_after_failure` | Failed→Registering→Registered |
| 4 | `test_expiry_renewal` | Registered→Expired→Registering→Registered |
| 5 | `test_reregister_is_noop` | Registered で register() → Ok |
| 6 | `test_unregister_from_disabled` | Disabled で unregister() → InvalidState |
| 7 | `test_unregister_from_failed` | Failed で unregister() → InvalidState |
| 8 | `test_set_enabled_false` | Registering→Disabled キャンセル, Registered→Disabled 即時無効化 |
| 9 | `test_is_registered` | Registered のみ true 確認 |
| 10 | `test_is_in_progress` | Registering / Unregistering で true 確認 |
| 11 | `test_is_terminal_error` | Failed のみ true 確認 |
| 12 | `test_all_transitions_table` | 48通りのテーブルテスト |

## Non-scope

- MockBackend を使用した結合テスト — M10-2
- 実際の PJSIP callback との統合 — M17-3

## Test Plan

### 基本方針

遷移表に基づく全組み合わせ（8状態×6イベント=48通り）のテーブルテスト。不正遷移では `SipErrorKind::InvalidState` が返ることを検証。

### ユニットテスト不可能な項目（例外）

- PJSIP callback との非同期統合 — M17-3

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS すること（既存 258 テスト + 新規 12 テスト）
- [ ] `src/account.rs` に `RegistrationEvent` enum が追加されている
- [ ] `RegistrationState` に 5 メソッド（`can_transition_to`, `apply_event`, `is_registered`, `is_in_progress`, `is_terminal_error`）が実装されている
- [ ] `apply_event()` が不正遷移を `SipError::InvalidState` で拒否すること
- [ ] 48通りの遷移表が全て正しいこと
- [ ] `make_call()` がどの状態でも呼び出し可能であること（任意の状態からの make_call を許容）
- [ ] 全テストで `unwrap()` 不使用

## Notes

### 遷移表の根拠

RFC §17.1 の状態遷移図および遷移規則に基づく。`SetEnabled(true)` と `Register` はほぼ同義だが、`Disabled→SetEnabled(true)` は register_on_start 相当の振る舞い。`Register` は明示的な register() 呼び出しに対応。

### M9 マイルストーン

```text
M9-1 (#95): RegistrationState 遷移ロジック ← 本チケット
M9-2 (#96): CallState 遷移ロジック
M9-3 (#97): ClientState 管理
```
