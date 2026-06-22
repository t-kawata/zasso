---
ticket_id: 168
title: M4-2: Binary entrypoint (main.rs)
slug: m4-2-binary-entrypoint-mainrs
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0168-m4-2-binary-entrypoint-mainrs/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0168-m4-2-binary-entrypoint-mainrs/review.md
---
# M4-2: Binary entrypoint (main.rs)

> **参照設計書:** crates/anthropx/RFC.md (§9 lifecycle.rs の binary entrypoint)
> **生成元:** Tickets.md L479-501

## Summary

`[[bin]]` エントリポイント `src/main.rs` を実装する。`cli::parse_args()` → `AppConfig::from_toml()` → `ProxyServer::start()` → `handle.join()` の起動シーケンス。Ctrl+C で graceful shutdown。

## Background

M4-1 で `ProxyServer::start()` と `ServerHandle` は完成したが、実際にバイナリとして起動するための `main.rs` が未実装。tracing subscriber の設定、Ctrl+C シグナルハンドラ、起動ログ出力が必要。

## Scope

### 実装対象
1. **`src/main.rs`** (新規) — `#[cfg(feature = "server")]` ガード
   - `#[tokio::main]`
   - `cli::parse_args()` → config path
   - `AppConfig::from_toml(&config_path)?`
   - tracing subscriber 初期化（log_format に従う）
   - `ProxyServer::start(config).await?`
   - Ctrl+C signal ハンドラ設定
   - `handle.join().await?`

### 非対象
- 結合テスト（M4-3）
- tracing subscriber のカスタマイズ（最小限の初期化のみ）

## Investigation

### 依存
| ID | 関係 | 状態 |
|----|------|------|
| M4-1 (ticket 167) | 先行: ProxyServer::start | ✅ reviewed |
| M2-3 (CLI) | 先行: cli::parse_args | ✅ 実装済み |

### 起動シーケンス
```
main()
├── cli::parse_args() → -t <config.toml>
├── AppConfig::from_toml(&path) → config
├── tracing_subscriber::fmt().init()
├── ProxyServer::start(config).await → handle
├── tokio::signal::ctrl_c().await
├── handle.shutdown().await もしくは handle.join().await
```

## Acceptance Criteria
- [ ] `cargo build` が成功する
- [ ] 起動シーケンスが main() 内で完結している
- [ ] tracing subscriber が初期化される
- [ ] `make check-be` 通過
- [ ] 既存テストが全て通過

## Notes
### 成果物
- 計画: context/0168-m4-2-binary-entrypoint-mainrs/plan.md（未作成）
- 実装サマリ: context/0168-m4-2-binary-entrypoint-mainrs/implementation.md（未作成）
- レビュー報告書: context/0168-m4-2-binary-entrypoint-mainrs/review.md（未作成）
