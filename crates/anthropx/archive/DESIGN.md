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

## RFC 02 補足 — Supplementary Design (2026-06-22)

> **生成元:** crates/anthropx/RFC02.md
> **生成日:** 2026-06-22
> **目的:** 初版 RFC 01 と実装の乖離 16 項目を補完する設計

### 追加・変更される型・関数

| 要素 | 種別 | 用途 |
|------|------|------|
| `anthropx_requests_total` | metrics カウンタ | リクエスト数 (provider/mode/stream/status ラベル) |
| `anthropx_failover_total` | metrics カウンタ | Failover 回数 (provider ラベル) |
| `anthropx_lossy_total` | metrics カウンタ | Lossy 発生数 (level ラベル) |
| `anthropx_request_latency_ms` | metrics ヒストグラム | レイテンシ (provider/mode ラベル) |
| `METRICS_HANDLE` | static | Prometheus 形式レンダリング用ハンドラ |
| `record_request(provider, mode, stream, status, latency_ms)` | 関数 | リクエスト完了時メトリクス記録 |
| `record_failover(provider)` | 関数 | Failover イベント記録 |
| `record_lossy(level)` | 関数 | Lossy イベント記録 |
| `normalize_url_prefix()` | 関数 | url_prefix 正規化 |
| `transform_chunk()` | 関数 | SSE チャンク単位変換 |
| `translate_stream()` | 関数 | リアルタイム SSE 変換ストリーム |
| `anthropic_to_openai_lossy()` | 関数 | Lossy-tolerant 変換 (llm-bridge-core 側に追加予定) |

### 更新されるモジュール構成

```
lib.rs (+ #![forbid(unsafe_code)], pub use lifecycle::ProxyServer)
├── config/
│   ├── mod.rs      # 型定義のみ（従来の全責務から分離）
│   ├── parse.rs    # TOML 読込（新規分割）
│   └── validate.rs # 設定検証（新規分割）
├── util/
│   ├── mod.rs      # モジュール宣言
│   └── headers.rs  # build_upstream_headers + HOP_BY_HOP（新規抽出）
├── observability/metrics.rs  # metrics crate 導入（AtomicU64 → 置き換え）
└── provider/translate.rs     # translate_stream 全面改修
main.rs  ← #[cfg(feature = "server")] 追加
```

### Feature 構成

| feature | 内容 |
|---------|------|
| `default` | `["server"]` |
| `server` | clap, futures, http, tokio-util, tokio-stream, tracing-subscriber, metrics-exporter-prometheus |
| `integration-test` | 実プロバイダーテスト用 |
| (no feature) | 設定型 + メモリ内完結ロジックのみの最小 library ビルド |

### 未解決項目（別トラック）

| 項目 | 依存 | 状況 |
|------|------|------|
| Lossy 完全対応 (M#4) | llm-bridge-core 側の lossy-tolerant API | 設計完了、API 追加待ち |
| ApiFormat 中間型解消 (n#14) | llm-bridge-core | 既存 stub コメント維持 |

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
