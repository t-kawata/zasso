---
ticket_id: 193
title: blocking_read → read().await 全面修正（P0）
slug: blocking-read-readawait-p0
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
dependencies: 
plan_path: /Users/shyme/shyme/zasso/tickets/context/0193-blocking-read-readawait-p0/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0193-blocking-read-readawait-p0/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0193-blocking-read-readawait-p0/review.md
---

# blocking_read → read().await 全面修正（P0）

## Summary

`tokio::sync::RwLock` の `blocking_read()` / `blocking_write()` を全 `read().await` / `write().await` に置き換える。対象は client.rs の公開API 4関数の非同期化 + reactor.rs 内の全 blocking ロック呼び出し23箇所。合計 27 箇所の修正。

## Background

RFC02 §7.1 で「Client 側: `read().await` 絶対義務」と定めている。しかし現状、`tokio::sync::RwLock` の `blocking_read()` / `blocking_write()` が 27 箇所で使用されており、Tokio の非同期ランタイム上でブロッキング呼び出しを行っている。

リスク:
- **デッドロック**: Tokio ワーカースレッドをブロックすると同一スレッドプール上の他のタスクが進行不能
- **パフォーマンス劣化**: ブロッキング → ワーカースレッド枯渇 → スループット低下
- **協調的マルチタスクの破壊**: `.await` による yield 機会を逸する

## Scope

1. **`crates/siprs/src/client.rs`**: 4箇所の `blocking_read()` → `read().await`。関数シグネチャの `async fn` 化を含む
2. **`crates/siprs/src/runtime/reactor.rs`**: 14箇所の `blocking_read()` → `read().await`、9箇所の `blocking_write()` → `write().await`
3. **`crates/siprs/src/client.rs` tests**: sync `#[test]` → `#[tokio::test] async fn` への変更

## Non-scope

- ライブラリ外部の破壊的変更影響評価（本チケットでは内部修正に集中）
- `state` の型変更（`tokio::sync::RwLock` 維持）
- ロック粒度や原子性の最適化

## Investigation

### 物理的証拠: 全 27 箇所の blocking 呼び出し

**client.rs — 4箇所（すべて `blocking_read()`）:**

| 行 | 関数 | 現在のシグネチャ | 修正後 |
|----|------|-----------------|--------|
| 234 | `SipClient::account()` | `pub fn account(...)` | `pub async fn account(...)` |
| 246 | `SipClient::accounts()` | `pub fn accounts(...)` | `pub async fn accounts(...)` |
| 412 | `SipClient::call_state()` | `pub fn call_state(...)` | `pub async fn call_state(...)` |
| 627 | `SipAccountHandle::registration_state()` | `pub fn registration_state(...)` | `pub async fn registration_state(...)` |

**client.rs テストコード影響箇所（sync → async 変換が必要）:**

```text
client.rs:955     #[test] fn test_account_registration_state()
client.rs:1016    #[test] fn test_account_registration_state_not_found()
client.rs:1040    #[test] fn test_account_registration_state_shutdown()
client.rs:1158    registration_state() 呼び出し（統合テスト内）
client.rs:1278    #[test] fn test_call_state()
client.rs:1354    call_state() 呼び出し
client.rs:883     client.account() 呼び出し
client.rs:903     client.accounts() 呼び出し
```

**reactor.rs — 14箇所の `blocking_read()`:**

| 行 | コンテキスト | 用途 |
|----|------------|------|
| 211 | RemoveAccount ハンドラブロック内 | native_id 解決 |
| 231 | ModifyAccount ハンドラブロック内 | native_id 解決 |
| 260 | MakeCall ハンドラブロック内 | native_id 解決 |
| 292 | Answer ハンドラブロック内 | native_id 解決 |
| 309 | Hangup ハンドラブロック内 | native_id 解決 |
| 322 | Hold ハンドラブロック内 | native_id 解決 |
| 336 | Unhold ハンドラブロック内 | native_id 解決 |
| 356 | Transfer ハンドラブロック内 | 通話情報読み取り |
| 410 | SendDtmf ハンドラブロック内 | native_id 解決 |
| 670 | `resolve_native_call_id()` ヘルパー | native_id 解決 |
| 724 | DtmfDigit イベントハンドラ | native_id → CallId |
| 750 | DtmfDigit2 イベントハンドラ | native_id → CallId |
| 945 | `handle_call_media_state_changed()` | media 状態解決 |
| 1010 | `resolve_runtime_account_id()` ヘルパー | native_id → AccountId |

**reactor.rs — 9箇所の `blocking_write()`:**

| 行 | コンテキスト | 用途 |
|----|------------|------|
| 158 | Initialize ハンドラ | 初期化状態書き込み |
| 176 | Shutdown ハンドラ | シャットダウン状態設定 |
| 189 | AddAccount ハンドラ | アカウント追加 |
| 218 | RemoveAccount ハンドラ | アカウント削除 |
| 247 | ModifyAccount ハンドラ | アカウント更新 |
| 267 | MakeCall ハンドラ | 発呼状態書き込み |
| 426 | AddAudioSource ハンドラ | media 状態更新 |
| 504 | SubscribeAudio ハンドラ | tap channel 保持 |
| 864 | `handle_call_state_changed()` | 通話状態更新 |

**型確認（両ファイルとも `tokio::sync::RwLock` 使用）:**

```rust
// reactor.rs:14
use tokio::sync::{watch, RwLock};

// client.rs:9
use tokio::sync::RwLock;
```

したがって `blocking_read()` → `read().await`、`blocking_write()` → `write().await` は機械的置換が可能。

**ブロッキング呼び出しゼロ確認:**
```bash
grep -rn 'blocking_read\|blocking_write' crates/siprs/ --include='*.rs' | grep -v '/target/'
# → 該当の 27 行のみ。テストコードには 0 件。
```

**犯罪（Malfeasance）確認:**
```bash
.claude/scripts/tickets/scan-crimes.sh
# → 未解決の犯罪 0 件。クリーン。
```

## Test Plan

### ユニットテスト計画

1. **client.rs テストの async 化**: 8 箇所のテスト関数を `#[test]` → `#[tokio::test] async fn` に変更し、`.account()` / `.accounts()` / `.call_state()` / `.registration_state()` 呼び出しに `.await` を追加
2. **reactor.rs テスト**: 既存テストはすべて `async fn` で記述済みのため修正不要（コンパイル確認のみ）
3. **ロック置換の健全性確認**:
   - `blocking_read()` / `blocking_write()` の grep が 0 件であることを確認
   - `cargo build -p siprs` が警告なく成功
   - `cargo test -p siprs` の全テスト通過

### ユニットテスト不可能な項目（例外）

なし。全項目がユニットテスト + grep 確認で検証可能。

## Boy Scout Rule — 翻訳可能性計画

1. **client.rs**: `let state = self.inner.state.blocking_read()` → `let state = self.inner.state.read().await`
   - 変数名 `state` は「状態のロックガード」という概念を適切に表現しており維持
   - `drop(state)` の明示的呼び出しを削除（async 版ではスコープ終了で自動解放されるため不要。`drop` は手動解放の意図を示すが、`RwLockReadGuard` の async 版ではスコープ依存が明確）
2. **reactor.rs ヘルパー関数**: `resolve_native_call_id()` / `resolve_runtime_account_id()` → async fn 化。関数名は「native_id を解決する」という動詞句を維持
3. 各ハンドラ内のクロージャ `(|| -> Result<...> { ... })()` パターンは維持（責務分離の意図が明確）

## Acceptance Criteria

- [ ] `cargo build -p siprs` が警告なく成功
- [ ] `cargo test -p siprs` の全テストが通過
- [ ] `crates/siprs/src/` 内に `blocking_read()` が 0 件
- [ ] `crates/siprs/src/` 内に `blocking_write()` が 0 件
- [ ] `SipClient::account()` が `async fn` になり `read().await` を使用
- [ ] `SipClient::accounts()` が `async fn` になり `read().await` を使用
- [ ] `SipClient::call_state()` が `async fn` になり `read().await` を使用
- [ ] `SipAccountHandle::registration_state()` が `async fn` になり `read().await` を使用
- [ ] reactor.rs の全 `state.blocking_read()` → `state.read().await`
- [ ] reactor.rs の全 `state.blocking_write()` → `state.write().await`
- [ ] テストコードの sync `#[test]` → `#[tokio::test] async fn` が適切に変更されている
- [ ] 翻訳可能性の検証が通っている

## Notes

- plan_path: context/0193-blocking-read-readawait-p0/plan.md（未作成、/plan-ticket 承認後に作成）
- implementation_path: context/0193-blocking-read-readawait-p0/implementation.md（未作成、/start-ticket 実装完了後に作成）
- review_report_path: context/0193-blocking-read-readawait-p0/review.md（未作成、/review-ticket 全チェック通過後に作成）

### 成果物

- 計画: context/0193-blocking-read-readawait-p0/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0193-blocking-read-readawait-p0/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0193-blocking-read-readawait-p0/review.md（未作成、/review-ticket 全チェック通過後に作成）
