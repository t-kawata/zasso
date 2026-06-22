---
ticket_id: 2
title: Shutdown ポリシー拡張 — GetAccountInfo 許可（P2）
slug: shutdown-getaccountinfo-p2
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/shyme/shyme/zasso/tickets/context/0002-shutdown-getaccountinfo-p2/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0002-shutdown-getaccountinfo-p2/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0002-shutdown-getaccountinfo-p2/review.md
---
# Shutdown ポリシー拡張 — GetAccountInfo 許可（P2）

## Summary

Shutdown 進行中でも RegistrationState の最終確認を可能にするため、
GetAccountInfo コマンドを許可する。併せて `AccountInfoSnapshot` に
`is_shutting_down: bool` フィールドを追加し、応答に shutdown 進行中フラグを含める。
ConfConnect/ConfDisconnect は media リソース変更を伴うため明示的に拒否する。

## Background

RFC02 §9 では Shutdown 中の command 振り分けポリシーが定義されている。
GetAccountInfo は読み取り専用操作であり、Shutdown 中でも RegistrationState の
最終確認に使用可能であるべき。一方、ConfConnect/ConfDisconnect は media リソースの
変更を伴うため、Shutdown 中は拒否する必要がある。

本チケットは M20-8 として設計されており、M12-5（SipClient::shutdown()）で
実装された shutdown フローにポリシー拡張を加えるものである。

## Scope

1. `AccountInfoSnapshot` に `is_shutting_down: bool` フィールドを追加
2. `Reactor::run_loop_async()` の Shutdown 時 GetAccountInfo ハンドラで、
   backend から取得した `AccountInfoSnapshot` に `is_shutting_down: true` を注入
3. ConfConnect/ConfDisconnect の Shutdown 時拒否は既存の `reject_command()` で
   カバー済みであるため、改修不要（確認のみ）
4. MockBackend / PjsuaBackend の `get_account_info()` 戻り値に `is_shutting_down`
   フィールドを追加（コンパイルエラー回避）
5. テスト追加: Shutdown 中 GetAccountInfo の `is_shutting_down` フラグ検証
6. リグレッション確認: 非 Shutdown 時の全コマンド正常動作

## Non-scope

- Shutdown フローそのものの変更（M12-5 で完了済み）
- 既存テストの変更（`test_shutdown_get_account_info_allowed` 等はそのまま維持）
- PjsuaBackend の実装詳細変更（戻り値フィールド追加のみ）

## Investigation

### 調査結果（ソースコード解析による物理的証拠）

#### 1. Reactor shutdown 分岐 — 実装済み

`crates/siprs/src/runtime/reactor.rs` `run_loop_async()` L216-L239:

```rust
// シャットダウン後は新規コマンドを拒否。
let mut is_shutting_down = false;

while let Some(cmd) = rx.recv().await {
    if is_shutting_down {
        // Shutdown コマンド自身は idempotent に成功を返す。
        if matches!(cmd, RuntimeCommand::Shutdown { .. }) {
            if let RuntimeCommand::Shutdown { reply } = cmd {
                let _ = reply.send(Ok(()));
            }
            continue;
        }
        // GetAccountInfo は読み取り専用操作のため Shutdown 中も許可する。
        if let RuntimeCommand::GetAccountInfo {
            native_acc_id,
            reply_tx,
        } = cmd
        {
            let result = backend.get_account_info(native_acc_id);
            let _ = reply_tx.send(result);
            continue;
        }
        // その他のコマンドは拒否。
        reject_command(cmd, "client is shutting down");
        continue;
    }
    // ... 通常のコマンドディスパッチ
```

**確認点:**
- ✅ Shutdown コマンド → idempotent success
- ✅ GetAccountInfo → backend にルーティング（許可）
- ✅ その他全コマンド → `reject_command()` で拒否
- ❌ **GetAccountInfo の応答に `is_shutting_down` フラグが含まれていない**
  （`backend.get_account_info()` の結果をそのまま返している）

#### 2. reject_command — ConfConnect/ConfDisconnect カバー済み

`reject_command()` L669-L741 は全 `RuntimeCommand` バリアントを網羅しており、
`ConfConnect` (L731-L732) および `ConfDisconnect` (L734-L735) も
`SipError::invalid_state(message)` で正しく拒否される。

```
RuntimeCommand::ConfConnect { reply_tx, .. } => {
    let _ = reply_tx.send(Err(SipError::invalid_state(message)));
}
RuntimeCommand::ConfDisconnect { reply_tx, .. } => {
    let _ = reply_tx.send(Err(SipError::invalid_state(message)));
}
```

**結論:** ConfConnect/ConfDisconnect の Shutdown 時拒否は既存コードでカバー済み。
改修不要。

#### 3. AccountInfoSnapshot — `is_shutting_down` 未定義

`crates/siprs/src/runtime/command.rs` L38-L50:

```rust
pub(crate) struct AccountInfoSnapshot {
    pub acc_id: AccountId,
    pub registration_status: u16,
    pub registration_expires: Option<u32>,
    pub online_status: bool,
    pub uri: String,
}
```

**確認点:** `is_shutting_down: bool` フィールドが存在しない。追加が必要。

#### 4. AccountInfoSnapshot 構築箇所一覧

| 場所 | ファイル | 行 |
|------|----------|-----|
| MockBackend::get_account_info() | `runtime/backend.rs` | L334-L340 |
| PjsuaBackend::get_account_info() | `ffi/pjsua_backend.rs` | L554-L564 |

両方で `AccountInfoSnapshot { .. }` を構築している。フィールド追加後は
コンパイルエラーになるため、両方に `is_shutting_down: false` （または適切な値）
を追加する必要がある。Shutdown 中は reactor 側で `true` に上書きするため、
backend 側では常に `false` で初期化してよい。

#### 5. 既存テスト状況

| テスト | 行 | 結果 |
|--------|-----|------|
| `test_shutdown_get_account_info_allowed` | L1389-L1433 | ✅ PASS — GetAccountInfo が Shutdown でブロックされない |
| `test_shutdown_conf_connect_rejected` | L1435-L1473 | ✅ PASS — ConfConnect が InvalidState で拒否される |
| `test_shutdown_conf_disconnect_rejected` | L1475-L1512 | ✅ PASS — ConfDisconnect が InvalidState で拒否される |

**欠けているテスト:**
- Shutdown 中 GetAccountInfo の応答に `is_shutting_down: true` が含まれることの確認
- 非 Shutdown 時 GetAccountInfo の応答に `is_shutting_down: false` が含まれることの確認
- 非 Shutdown 時 ConfConnect/ConfDisconnect が正常動作することの確認（リグレッション）

#### 6. 犯罪・スタブスキャン

- Malfeasance.json: 未解決の犯罪なし ✅
- `find-all-stubs.js runtime/`: スタブなし ✅

### ソースマップ

| 識別子 | ファイル | 行 | 役割 |
|---------|----------|-----|------|
| `AccountInfoSnapshot` | `runtime/command.rs` | L39-L50 | アカウント情報スナップショット型 |
| `run_loop_async()` | `runtime/reactor.rs` | L208-L665 | Reactor メインループ |
| Shutdown 分岐 (is_shutting_down) | `runtime/reactor.rs` | L216-L239 | Shutdown 中の command 振り分け |
| `reject_command()` | `runtime/reactor.rs` | L669-L741 | コマンド拒否ハンドラ（全バリアント網羅） |
| MockBackend::get_account_info() | `runtime/backend.rs` | L318-L341 | MockBackend 実装 |
| PjsuaBackend::get_account_info() | `ffi/pjsua_backend.rs` | L533-L565 | PjsuaBackend 実装 |
| `test_shutdown_get_account_info_allowed` | `runtime/reactor.rs` | L1389-L1433 | GetAccountInfo Shutdown 許可テスト |
| `test_shutdown_conf_connect_rejected` | `runtime/reactor.rs` | L1435-L1473 | ConfConnect Shutdown 拒否テスト |
| `test_shutdown_conf_disconnect_rejected` | `runtime/reactor.rs` | L1475-L1512 | ConfDisconnect Shutdown 拒否テスト |

## Test Plan

### ユニットテスト計画

全て `runtime/reactor.rs` の `#[cfg(test)] mod tests` 内に既存テストと同様の
パターンで追加する。MockBackend を使用。

1. **`test_shutdown_get_account_info_has_flag`** — Shutdown 中 GetAccountInfo の応答に
   `is_shutting_down: true` が含まれることの確認
   - Initialize → AddAccount（AccountInfoSnapshot が返るためのセットアップ）→
     Shutdown → GetAccountInfo → `is_shutting_down == true` を検証

2. **`test_normal_get_account_info_no_flag`** — 非 Shutdown 時 GetAccountInfo の応答に
   `is_shutting_down: false` が含まれることの確認
   - Initialize → AddAccount → GetAccountInfo（Shutdown なし）→
     `is_shutting_down == false` を検証

3. **リグレッション確認** — 既存テストが全て PASS すること
   - `test_shutdown_get_account_info_allowed`（変更不要）
   - `test_shutdown_conf_connect_rejected`（変更不要）
   - `test_shutdown_conf_disconnect_rejected`（変更不要）

### ユニットテスト不可能な項目（例外）

なし。本チケットの全要件は MockBackend を用いたユニットテストで検証可能。

## Boy Scout Rule — 翻訳可能性計画

- **`run_loop_async()` L228-L236**: Shutdown 中の GetAccountInfo ハンドラは
  「backend から情報を取得し、shutdown フラグを注入して返す」という責務を担っている。
  現在はインラインで記述されているが、フラグ注入ロジックを追加後も可読性を維持するため、
  `let mut snapshot = backend.get_account_info(native_acc_id)?; snapshot.is_shutting_down = true;`
  の形で素直に記述する。
- 関数名 `run_loop_async` の L200〜L665 は一つの関数として長いが、本チケットの
  スコープ外であるため分割しない。必要に応じて将来のチケットで対応する。

## Acceptance Criteria

- [x] `AccountInfoSnapshot` に `is_shutting_down: bool` フィールドを追加
- [x] MockBackend / PjsuaBackend の `get_account_info()` 戻り値にフィールド追加
- [x] Shutdown 中 GetAccountInfo の応答に `is_shutting_down: true` を注入
- [x] ConfConnect/ConfDisconnect の Shutdown 時拒否が維持されていること
- [x] `test_shutdown_get_account_info_has_flag` が PASS
- [x] `test_normal_get_account_info_no_flag` が PASS
- [x] 既存テスト全件 PASS
- [x] 翻訳可能性の検証が通っている
- [x] 犯罪・スタブなし
- [x] `cargo fmt` / `cargo clippy` 通過
- [x] `make test` 通過

## Notes

### 成果物

- 計画: context/0002-shutdown-getaccountinfo-p2/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0002-shutdown-getaccountinfo-p2/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0002-shutdown-getaccountinfo-p2/review.md（未作成、/review-ticket 全チェック通過後に作成）

### 実装の注意点

- `AccountInfoSnapshot` のフィールド追加は構造体定義の変更であるため、全ての構築箇所で
  コンパイルエラーが発生する。以下の 3 箇所で `is_shutting_down: false` 追加が必要:
  1. `runtime/command.rs` — 型定義
  2. `runtime/backend.rs` — MockBackend
  3. `ffi/pjsua_backend.rs` — PjsuaBackend
- reactor の shutdown 分岐では、`backend.get_account_info()` の結果が Ok の場合のみ
  `is_shutting_down = true` に設定する。Err の場合はそのまま伝播する。
- 本チケットの実装は Tiny Change の定義を超える（3ファイル以上の変更、パブリック型の
  フィールド追加を含む）。`/plan-ticket` で計画承認を得てから `/start-ticket` で
  実装すること。
