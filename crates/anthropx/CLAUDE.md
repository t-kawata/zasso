# anthropx: LLM Bridge Proxy Server — 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** crates/anthropx/RFC.md
> **生成日:** 2026-06-19

## 目的とスコープ

`anthropx` は Rust 実装の Anthropic 互換 API プロキシサーバー。単一バイナリとして独立稼働するだけでなく、他の Rust プロジェクトに crate として埋め込んで使用できるデュアルモード構成を採用する。プロトコル変換は `llm-bridge-core` に委譲し、本 crate はルーティング・認証・スケジューリング・並行性制御・可観測性を担当する。

## アーキテクチャ概要

```
Client (Claude Code)
    │ POST /v1/messages { model: "provider/name", ... }
    ▼
┌─────────────────────────────────────┐
│         anthropx proxy              │
│  ┌──────────┐  ┌─────────────────┐  │
│  │  Auth    │  │  Router         │  │
│  │  Layer   │─▶│  /v1/messages   │  │
│  │ (Tower)  │  │  /v1/models     │  │
│  └──────────┘  │  /healthz       │  │
│                │  /metrics       │  │
│                └───────┬─────────┘  │
│                        │            │
│          ┌─────────────┴─────┐      │
│          ▼                   ▼      │
│  ┌──────────────┐  ┌──────────────┐ │
│  │  Transparent │  │  Translate   │ │
│  │  (reverse    │  │  (llm-bridge │ │
│  │   proxy)     │  │   -core      │ │
│  └──────┬───────┘  │  変換)      │ │
│         │          └──────┬───────┘ │
│         ▼                 ▼         │
│    Anthropic API     OpenAI API     │
└─────────┬──────────────────┬────────┘
          ▼                  ▼
     DeepSeek etc.     Qwen / Ollama
```

## 主要な型とデータ構造

| 型 | 種別 | 用途 |
|---|------|------|
| `AppConfig` | struct | 最上位設定: global + providers |
| `GlobalConfig` | struct | サーバー全体設定 (port, timeout, limits, aliases) |
| `ProviderConfig` | struct | Provider 単位設定 (base_url, api_keys, mode) |
| `ModelConfig` | struct | モデル定義 (public, upstream, enabled, tags) |
| `TimeoutConfig` | struct | 3種のtimeout (connect/read/total) |
| `GlobalLimitConfig` | struct | in-flight / queue デフォルト値 |
| `OpenAiWireApi` | enum | Auto / ChatCompletions / Responses |
| `LogFormat` | enum | Text / Json |
| `ResolvedModel` | struct | model 解決結果 (public + upstream) |
| `AppState` | struct | サーバー実行時状態 (config, clients, schedulers, limiters) |
| `KeyScheduler` | struct | API key round-robin (AtomicUsize) |
| `ConcurrencyLimiter` | struct | Semaphore-based backpressure |
| `ServerHandle` | struct | ライフサイクル制御 (CancellationToken) |
| `LossyLevel` | enum | Error / Warn / Info |
| `ProxyError` | enum | 12 variant, thiserror + IntoResponse |
| `ConfigError` | enum | 設定検証エラー |

## モジュール間の関係

```
lib.rs (ProxyServer, AppConfig を re-export)
  ├── config/ ─── mod.rs (型定義), parse.rs (TOML), validate.rs
  ├── app_state.rs ─── AppState
  ├── http/ ─── mod.rs (Router), routes.rs, auth.rs, errors.rs
  ├── routing/ ─── mod.rs (Resolver), scheduler.rs (KeyScheduler)
  ├── provider/ ─── mod.rs, transparent.rs, translate.rs, limiter.rs
  ├── lifecycle.rs ─── ServerHandle
  ├── observability/ ─── mod.rs, metrics.rs
  └── util/ ─── headers.rs, ids.rs
main.rs ─── clap CLI → AppConfig::from_toml → ProxyServer::start
```

依存方向: `config/` (他に依存しない) → `routing/` → `provider/` → `http/` → `lifecycle.rs` → `main.rs`

## スタブ一覧と解決計画

| スタブ | 該当箇所 | 解決チケット |
|--------|---------|-------------|
| `auth.rs` の client_auth_layer / upstream_auth_layer の実体内ロジック | RFC §3.2 | M3-2 |
| `build_http_clients()` 関数 | RFC §9 | M4-1 |
| `build_schedulers()` 関数 | RFC §9 | M4-1 |
| `build_limiters()` 関数 | RFC §9 | M4-1 |
| `generate_request_id()` 関数 | RFC §3.3 | M3-1 |
| `serialize_sse_event()` 関数 | RFC §8 | M3-5 |
| `sse_response()` 関数 | RFC §8 | M3-4 |
| `stream_response()` / `json_response()` 関数 | RFC §5 | M3-4 |
| `axum_sse_response()` 関数 | RFC §5.2 | M3-5 |
| `ConfigError` 型 (参照のみ) | RFC §2 | M0-2 |
| `LimiterError` 型 (参照のみ) | RFC §7 | M2-2 |
