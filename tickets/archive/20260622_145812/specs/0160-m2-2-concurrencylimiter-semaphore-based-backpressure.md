---
ticket_id: 160
title: "M2-2: ConcurrencyLimiter — Semaphore-based backpressure"
slug: m2-2-concurrencylimiter-semaphore-based-backpressure
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0160-m2-2-concurrencylimiter-semaphore-based-backpressure/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0160-m2-2-concurrencylimiter-semaphore-based-backpressure/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0160-m2-2-concurrencylimiter-semaphore-based-backpressure/review.md
---

# M2-2: ConcurrencyLimiter — Semaphore-based backpressure

## Summary

Provider ごとの最大同時実行数を制御する `ConcurrencyLimiter` 構造体を実装する。`tokio::sync::Semaphore` をラップし、in-flight 上限到達時は bounded queue で非同期待機させる。queue 満杯時は 429 相当のエラーを返す。`tokio::sync::OwnedSemaphorePermit` のドロップにより、permit は自動解放され、クライアント切断時も Future drop で安全に処理される。

**参照設計書:** `crates/anthropx/RFC.md` (§7 並行性制御)

## Background

`anthropx` は provider ごとに複数の同時リクエストを処理する。無制限の並行実行は上流 API のレート制限超過やサーバーリソースの枯渇を招く。`ConcurrencyLimiter` は以下の制御を提供する:

1. **max_in_flight**: 同時実行数の上限。`Semaphore` で制御し、超過時は queue で待機
2. **max_queue**: 待機キューの最大長。満杯時は即座に 429 (QueueFull) エラー
3. **Automatic release**: permit のドロップで自動的にセマフォカウントが戻る。クライアント切断（Future drop）時も同様

本チケットでは M0-1 の `GlobalLimitConfig`（`default_max_in_flight`, `default_max_queue`）を参照するが、この型自体は独立しているため直接の依存はない。

## Scope

- `provider/limiter.rs` の新規作成（`ConcurrencyLimiter` struct + `LimiterError` enum + `mod tests`）
- `src/lib.rs` に `pub mod provider;` 追加
- `Cargo.toml` に `tokio` (features = ["sync"]) 追加

### 定義する型

#### `ConcurrencyLimiter` struct

```rust
pub struct ConcurrencyLimiter {
    semaphore: Arc<Semaphore>,
    max_queue: usize,
    current_queue: AtomicUsize,
}
```

#### `LimiterError` enum

```rust
#[derive(Debug, thiserror::Error)]
pub enum LimiterError {
    #[error("queue is full")]
    QueueFull,
    #[error("semaphore closed")]
    Closed,
}
```

#### メソッド

| メソッド | シグネチャ | 説明 |
|---------|-----------|------|
| `new` | `fn new(max_in_flight: usize, max_queue: usize) -> Self` | Semaphore + queue カウンタの初期化 |
| `acquire` | `async fn acquire(&self) -> Result<OwnedSemaphorePermit, LimiterError>` | 楽観的 queue チェック → fetch_add → acquire_owned → fetch_sub |

### 配置

RFC のモジュール構成では `provider/limiter.rs` が想定されている。本チケットでは `src/provider/limiter.rs` に新規ファイルとして作成し、`lib.rs` に `pub mod provider;` を追加する。

### このチケットで実装しないこと

- `build_limiters()` — M4-1 (起動シーケンス) で実装
- HTTP レイヤーとの統合（`ProxyError::QueueFull` への変換）— M3-4 で実施
- `try_acquire` の公開 — 本チケットでは `acquire`（async 待機）のみ

## Investigation

### コードベース調査結果

- **発見1**: `tokio` は Cargo.toml に未追加。`features = ["sync"]` のみで十分（`Semaphore`, `OwnedSemaphorePermit` のため）。rt や macros は不要。
- **発見2**: `ConcurrencyLimiter` は RFC §7 に完全な実装コードが記載済み。`LimiterError` の enum 定義は RFC にコードブロックがないが、Tickets.md に `QueueFull` / `Closed` の2 variant が明示されている。
- **発見3**: `owning_ref` やライフタイム問題を回避するため、`acquire_owned()` を使用し `Arc<Semaphore>` + `OwnedSemaphorePermit` の組み合わせを採用。
- **発見4**: M0-1 の `GlobalLimitConfig` のデフォルト値は `default_max_in_flight=64`, `default_max_queue=256`。これらは本構造体の `new()` に渡されるパラメータ（ConcurrencyLimiter 自体は GlobalLimitConfig に依存しない）。
- **発見5**: M0-2 の `ProxyError` には `QueueFull` variant があるが、`LimiterError` は独立したエラー型。`LimiterError::QueueFull → ProxyError::QueueFull` の変換は M3-4 で行う。

### 必要な依存関係の追加

| クレート | 理由 | 特徴量 |
|---------|------|--------|
| `tokio` | `Semaphore` / `OwnedSemaphorePermit` | `sync` のみ |
| `thiserror` | `LimiterError` の derive | 既存（追加不要） |

## Test Plan

### ユニットテスト計画

非同期テストは `#[tokio::test]` を使用する。

| # | テストケース | 種別 | 検証内容 |
|---|------------|------|---------|
| 1 | `acquire_release_cycle` | 正常系 | acquire → permit drop → 再度 acquire 可能 |
| 2 | `max_in_flight_blocks` | 正常系 | max_in_flight=1 で2つ目の acquire がブロックされる |
| 3 | `max_queue_zero_rejects` | 異常系 | max_queue=0, in_flight=1 で2つ目 → Err(QueueFull) |
| 4 | `try_acquire_after_permit_drop` | 正常系 | permit drop 後は in_flight が減少し try_acquire が成功 |
| 5 | `limiter_error_display` | 正常系 | LimiterError の Display が意味のあるメッセージを出力 |
| 6 | `limiter_error_is_std_error` | 正常系 | LimiterError が std::error::Error を満たす |

### ユニットテスト不可能な項目（例外）

- QueueFull が実際に HTTP 429 として返されること → M3-4 Integration test
- クライアント切断時の Future drop による自動解放 − ランタイム結合のため手動テストまたは M4-3 Mock test
- `build_limiters()` 内での ConcurrencyLimiter 生成 → M4-1

## Boy Scout Rule — 翻訳可能性計画

- **関数名は動詞句**: `acquire` — 「取得する」
- **変数名はドメイン概念**: `max_in_flight`, `max_queue`, `current_queue`, `queued`
- **コメントは「なぜ」**: `Acquire` / `Release` ordering の選択理由、楽観的 queue チェックの意図
- **RFC 準拠**: 実装コードは RFC §7 のコードブロックをそのまま踏襲し、設計判断をコメントで補完

## Acceptance Criteria

- [ ] `cargo check -p anthropx` が警告ゼロで通過する
- [ ] `cargo clippy -D warnings` が通過する
- [ ] `cargo test -p anthropx` が全テスト（既存82 + 新規6 = 88 + 1 doctest）通過する
- [ ] `ConcurrencyLimiter::acquire` が permit を正常に取得できる
- [ ] permit を drop すると in-flight カウントが減少する
- [ ] `max_in_flight=1, max_queue=0` で2つ目の acquire が `Err(QueueFull)` を返す
- [ ] `LimiterError` が `std::error::Error` を満たす

## 依存・関連チケットID

| 関係 | チケット | 内容 |
|------|---------|------|
| **先行実装必須 (reviewed)** | M0-1 (#155) | GlobalLimitConfig（パラメータの型） |
| **先行実装必須 (reviewed)** | M0-2 (#156) | ProxyError::QueueFull（間接参照） |
| **先行実装必須 (reviewed)** | M2-1 (#159) | 並行実装可能（依存なし） |
| **後続** | M3-4 (#TBD) | acquire + failover で ConcurrencyLimiter を使用 |
| **後続** | M4-1 (#TBD) | build_limiters() で ConcurrencyLimiter を一括生成 |
