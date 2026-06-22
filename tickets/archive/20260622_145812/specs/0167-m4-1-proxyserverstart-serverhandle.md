---
ticket_id: 167
title: M4-1: ProxyServer::start — 起動シーケンス + ServerHandle
slug: m4-1-proxyserverstart-serverhandle
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0167-m4-1-proxyserverstart-serverhandle/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0167-m4-1-proxyserverstart-serverhandle/review.md
---
# M4-1: ProxyServer::start — 起動シーケンス + ServerHandle

> **参照設計書:** crates/anthropx/RFC.md (§9 ライフサイクル管理, §1.1 デュアルモード)
> **生成元:** Tickets.md L448-477

## Summary

全コンポーネントの初期化と起動を統括する `ProxyServer::start()` と、graceful shutdown を提供する `ServerHandle` を実装する。

## Background

M3 フェーズで HTTP サーバーの全コンポーネント（AppState, Router, Auth, Handler, Transparent, Translate）は整ったが、これらを統合する起動シーケンスとライフサイクル管理が未実装。M4-1 では `ProxyServer::start(config)` → `ServerHandle` の起動・停止 API を提供し、バイナリエントリポイント（M4-2）から利用可能にする。

## Scope

### 実装対象

1. **`lifecycle.rs`** (新規)
   - `ProxyServer` struct（new 不要、start が唯一の公開メソッド）
   - `ProxyServer::start(config: AppConfig) -> Result<ServerHandle, Box<dyn Error>>`
     - `config.validate()` → エラー時は abort
     - `CancellationToken::new()`
     - `build_http_clients(&config)` → HashMap<String, reqwest::Client>
     - `build_schedulers(&config)` → HashMap<String, KeyScheduler>
     - `build_limiters(&config)` → HashMap<String, ConcurrencyLimiter>
     - `AppState::new(config, clients, schedulers, limiters)`
     - `axum::serve(listener, router).with_graceful_shutdown(cancel)`
   - `ServerHandle` struct
     - `cancel: CancellationToken`, `join_handle: JoinHandle<()>`
     - `async fn shutdown(self)` — cancel + timeout 30s join
     - `async fn join(self)` — 外部シグナル用

2. **`lib.rs`** (修正)
   - `pub mod lifecycle;`（`#[cfg(feature = "server")]`）

### 非対象（別チケット）

- Binary entrypoint main.rs（M4-2）
- Mock server integration tests（M4-3）
- tracing subscriber の設定（M4-2 の責務）

## Investigation

### 依存チケット

| ID | 関係 | 状態 |
|----|------|------|
| M3-1 (ticket 162) | 先行: AppState | ✅ reviewed |
| M3-2 (ticket 163) | 先行: Auth | ✅ reviewed |
| M3-3 (ticket 164) | 先行: Handler | ✅ reviewed |
| M3-4 (ticket 165) | 先行: Transparent | ✅ done |
| M3-5 (ticket 166) | 先行: Translate | ✅ reviewed |
| M4-2 (ticket 168) | 後続: Binary entrypoint | ⏳ 未着手 |

### キーとなる既存関数
- `AppState::new()` — app_state.rs
- `build_router(state)` — http/router.rs
- `KeyScheduler::new(keys, name)` — routing/scheduler.rs
- `ConcurrencyLimiter::new(max_in_flight, max_queue)` — provider/limiter.rs
- `AppConfig::validate()` — config/mod.rs

## Test Plan

### ユニットテスト計画

#### 1. build_http_clients / build_schedulers / build_limiters
- provider 数に応じた正しい数の要素が生成される
- scheduler が provider 名を正しく設定する

#### 2. ServerHandle::shutdown
- cancel 発火後、30 秒以内にサーバーが停止する

#### 3. ProxyServer::start 設定エラー
- port=0 → Err + エラーログ

### ユニットテスト不可能な項目
実際のポートバインディングのテストは M4-3 で実施。

## Acceptance Criteria

- [ ] ProxyServer::start(config) が ServerHandle を返す
- [ ] 起動時に http_clients / schedulers / limiters が一括生成される
- [ ] config.validate() が失敗すると起動しない
- [ ] ServerHandle::shutdown() で graceful shutdown
- [ ] build_http_clients が provider ごとに Client を生成する
- [ ] `make check-be` 通過
- [ ] 全テスト通過

## Notes

### 成果物
- 計画: context/0167-m4-1-proxyserverstart-serverhandle/plan.md（未作成）
- 実装サマリ: context/0167-m4-1-proxyserverstart-serverhandle/implementation.md（未作成）
- レビュー報告書: context/0167-m4-1-proxyserverstart-serverhandle/review.md（未作成）
