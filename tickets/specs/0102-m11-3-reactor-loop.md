---
ticket_id: 102
title: "M11-3: Reactor loop — 単一スレッドでのコマンド処理"
slug: m11-3-reactor-loop
status: reviewed
created_at: 2026-06-16
updated_at: 2026-06-16
plan_path: /Users/shyme/shyme/zasso/tickets/context/0102-m11-3-reactor-loop/plan.md
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0102-m11-3-reactor-loop/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0102-m11-3-reactor-loop/review.md
---

# M11-3: Reactor loop — 単一スレッドでのコマンド処理

## Summary

全 PJSUA 操作を単一スレッド上で逐次実行する `CoreReactor` を実装する。`RuntimeCommand` を MPSC から受信し、`SipBackend` trait を通じてバックエンド操作を実行、結果を oneshot で返す。

**参照設計書:** [docs/rust-sip-client-rfc.md](../docs/rust-sip-client-rfc.md) (§7.1)

## Background

### RFC 準拠

RFC §7.1「Core reactor は `std::thread::JoinHandle<()>` 上で動作する専用スレッド。すべての PJSUA 制御 API をここで実行」。

### 既存チケットからの依存関係

| チケット | 依存内容 |
|----------|---------|
| M11-1 (#100) | `RuntimeCommand` — 処理するコマンド |
| M11-2 (#101) | `RuntimeHandle` — 送受信ハンドル |
| M10-1 (#98) | `SipBackend` / `MockBackend` |
| M7-1 (#90) | `EventBus` — イベント配信 |
| M8-1 (#92) | `ClientState` / `AccountEntry` / `CallEntry` |

### 設計判断

- **`src/runtime/reactor.rs`**: 新規ファイル。`CoreReactor` 構造体を定義
- **`spawn()`**: アソシエイテッド関数。`RuntimeHandle` とスレッドハンドルを返す
- **`run_loop()`**: MPSC receiver からコマンドを逐次受信して処理
- **コマンド処理**: match で各バリアントを処理。`send_and_wait` からの oneshot reply は各コマンド内で emit
- **panic safety**: `catch_unwind` で保護

## Scope

### `crates/siprs/src/runtime/reactor.rs`（新規）

```rust
pub(crate) struct CoreReactor;

impl CoreReactor {
    /// reactor スレッドを起動し、RuntimeHandle と JoinHandle を返す。
    pub fn spawn(
        backend: Box<dyn SipBackend>,
        events: EventBus,
        state: Arc<tokio::sync::RwLock<ClientState>>,
        shutdown_rx: tokio::sync::watch::Receiver<bool>,
    ) -> (RuntimeHandle, std::thread::JoinHandle<()>);

    /// メインループ（std::thread 上で動作）。
    fn run_loop(
        backend: &mut Box<dyn SipBackend>,
        rx: &mut tokio::sync::mpsc::UnboundedReceiver<RuntimeCommand>,
        events: &EventBus,
        state: &Arc<tokio::sync::RwLock<ClientState>>,
        mut shutdown_rx: tokio::sync::watch::Receiver<bool>,
    );
}
```

### `crates/siprs/src/runtime/mod.rs`（修正）

- `pub mod reactor;` 追加

### テストコード（`reactor.rs` テストモジュール + MockBackend）

| # | テスト名 | 内容 |
|---|---------|------|
| 1 | `test_reactor_initialize` | Initialize → ClientInitialized イベント確認 |
| 2 | `test_reactor_shutdown` | Shutdown 後コマンド → エラー |
| 3 | `test_reactor_account_not_found` | 存在しない AccountId → AccountNotFound |
| 4 | `test_reactor_parallel_commands` | 10並列 send_and_wait 逐次実行 |

## Non-scope

- 全17コマンドの完全実装 — M12 で SipClient と共に段階的に追加
- `catch_unwind` panic 保護 — 別チケット（panic policy）
- Info 構造体のフィールド充填 — イベント emit 時のデータ設定

## Test Plan

### 基本方針

MockBackend を使用した結合テスト。reactor スレッドを起動し、RuntimeHandle 経由でコマンドを送信、結果とイベントを検証。

### ユニットテスト不可能な項目（例外）

- 実際の PJSUA との結合 — M17-4

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（0 error, 0 warning）
- [ ] `cargo test` で全テストが PASS（既存 302 + 新規 4）
- [ ] `CoreReactor::spawn()` が正常に reactor スレッドを起動すること
- [ ] Initialize コマンドで SipBackend::initialize が呼ばれ、ClientInitialized イベントが emit されること
- [ ] Shutdown 後の後続コマンドがエラーになること
- [ ] 全テストで `unwrap()` 不使用

## Notes

### コマンド処理パターン

各 `RuntimeCommand` の処理は以下の共通パターンに従う：
1. 状態の事前チェック（shutdown, max_calls 等）
2. `SipBackend` の対応メソッド呼び出し
3. `ClientState` の更新（RwLock 経由）
4. `EventBus` へのイベント発行
5. `oneshot::Sender` への結果送信

### M11 マイルストーン

```text
M11-1 (#100): RuntimeCommand enum 定義 ← 完了済み
M11-2 (#101): RuntimeHandle — MPSC + oneshot 送受信 ← 完了済み
M11-3 (#102): Reactor loop — 単一スレッドでのコマンド処理 ← 本チケット
```
