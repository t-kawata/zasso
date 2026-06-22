---
ticket_id: 143
title: M2-3: GgufEngine::new() 実装 (lib.rs)
slug: m2-3-ggufenginenew-librs
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0143-m2-3-ggufenginenew-librs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0143-m2-3-ggufenginenew-librs/review.md
---

# M2-3: GgufEngine::new() 実装 (lib.rs)

## Summary

ggufrs crate のエントリポイントとなる `GgufEngine` 構造体と `GgufEngine::new()` コンストラクタを `lib.rs` に実装する。

## Background

`GgufEngine::new()` が crate 利用者の最初の接触点となる。この段階ではサーバー関連機能は含めず、モデル管理と推論の基盤を提供する。

依存関係: M1-5（ModelRegistry）、M0-5（GgufConfig）— 両方 reviewed ✅

## Scope

- `GgufEngine` 構造体: `registry: Arc<ModelRegistry>`, `server_handle: Mutex<Option<JoinHandle<Result<()>>>>`
- `GgufEngine::new(config: GgufConfig) -> Result<Self>`:
  - `ModelRegistry::from_config(config.models)` で構築
  - `registry.load_immediate().await` で即時ロード

## Non-scope

- `InferenceEngine` トレイト実装 — M3-2〜M3-4
- サーバー起動 — M4-2
- pub use re-export — M3-5

## Investigation

### lib.rs の現状

モジュール宣言 + STUB コメントのみ。`GgufEngine` 未定義。

### 依存関係

M1-5 (#140) reviewed ✅, M0-5 (#134) reviewed ✅

## Acceptance Criteria

- [ ] `GgufEngine` 構造体が定義されている
- [ ] `GgufEngine::new()` が設定から ModelRegistry を構築する
- [ ] `make check-ggufrs` が成功する
