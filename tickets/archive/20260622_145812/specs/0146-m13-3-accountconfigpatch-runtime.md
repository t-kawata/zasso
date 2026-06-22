---
ticket_id: 146
title: "M13-3: AccountConfigPatch — アカウント設定の runtime 更新"
slug: m13-3-accountconfigpatch-runtime
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0146-m13-3-accountconfigpatch-runtime/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0146-m13-3-accountconfigpatch-runtime/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0146-m13-3-accountconfigpatch-runtime/review.md
---
# M13-3: `AccountConfigPatch` — アカウント設定の runtime 更新

## Summary

`RuntimeCommand::UpdateAccountConfig` は現在 `Err(InvalidState)` を返すスタブである。
本チケットで state の config 更新 + backend への反映を実装する。

## Background

`SipAccountHandle::update_config()` 経由で呼ばれるアカウント設定の動的更新。
reactor 内で state の `AccountEntry.config` を差し替え、変更箇所を PJSUA に伝達する。

## Investigation

### 証拠 1: reactor.rs:179 のスタブ

```rust
RuntimeCommand::UpdateAccountConfig { account_id, patch: _, reply } => {
    let result = (|| -> Result<(), SipError> {
        let mut state_guard = state.blocking_write();
        let _entry = state_guard.get_account_mut(account_id)?;
        // [::STUB::] 要解決: AccountConfigPatch の適用ロジック
        Err(SipError::invalid_state(
            "UpdateAccountConfig: patch application not yet implemented",
        ))
    })();
    let _ = reply.send(result);
}
```

`patch` が unused、常にエラーを返す。

### 証拠 2: AccountConfigPatch は定義済み

`config.rs` に `AccountConfigPatch` struct が存在し、`Option` フィールドで部分更新を表現する。

### 証拠 3: AccountEntry に update_config メソッドがない

`state.rs` の `AccountEntry` には設定更新メソッドが未定義。
`AccountConfigPatch` を `AccountConfig` に適用するロジックは `config.rs` にあるはず。

## Scope

### 1. `state.rs` — AccountEntry に config 更新メソッド追加

```rust
impl AccountEntry {
    /// アカウント設定を部分的に更新する。
    pub fn apply_patch(&mut self, patch: AccountConfigPatch) -> Result<(), SipError> {
        self.config.apply_patch(patch)
    }
}
```

`AccountConfig::apply_patch` が既に定義されていればそれを呼び出す。
未定義の場合は config.rs に実装を追加する。

### 2. `reactor.rs` — UpdateAccountConfig ハンドラ実装

```rust
RuntimeCommand::UpdateAccountConfig { account_id, patch, reply } => {
    let result = (|| -> Result<(), SipError> {
        let mut state_guard = state.blocking_write();
        let entry = state_guard.get_account_mut(account_id)?;
        entry.apply_patch(patch)?;
        // PJSUA に反映（pjsip feature 有効時）
        if let Some(native_id) = entry.native_id {
            // backend.update_account(native_id, &entry.config)?;
        }
        Ok(())
    })();
    let _ = reply.send(result);
}
```

PJSUA 側の更新は backend trait に `update_account` メソッドが追加された時点で実装する。
現時点では state の更新のみで完了とする。

### 3. 既存スタブの解決

reactor.rs:179 の `[::STUB::]` マーカーを削除する。

## Non-scope

- PJSUA backend の `update_account` メソッド追加（SipBackend trait 変更が必要）
- M19-2 feature flags（TLS/SRTP 設定の動的変更とは独立）

## Test Plan

| # | テスト | 内容 | 種別 |
|---|--------|------|------|
| 1 | apply_patch 正常系 | patch の各フィールドが config に反映される | ユニット（config.rs） |
| 2 | 存在しないアカウント | AccountNotFound | ユニット（reactor） |
| 3 | Shutdown 後 | ShutdownInProgress | ユニット（reactor） |
| 4 | 既存テスト維持 | 390 passed | 回帰 |

## Acceptance Criteria

- [ ] `RuntimeCommand::UpdateAccountConfig` がエラーを返さず state の config を更新すること
- [ ] reactor.rs:179 の `[::STUB::]` が削除されていること
- [ ] `cargo test -p siprs` 390 passed
- [ ] `cargo test -p siprs --features pjsip` 389 passed
- [ ] `cargo fmt --check` 通過
