---
parent-rfc: /Users/kawata/shyme/zasso/crates/anthropx/RFC-ROOT.md
parent-omissions: /Users/kawata/shyme/zasso/crates/anthropx/OMISSIONS-001.md
---

# RFC OMISSIONS-001: anthropx 実装漏れ・不足の是正

## Abstract

本 RFC は親 RFC（RFC-ROOT.md）の実装において発見された 6 件の実装漏れ（O-001〜O-006）を是正するための設計を定義する。対象は HTTP クライアント接続設定（build_provider_clients）、リクエストレベルタイムアウト（non-stream / streaming）、メトリクス登録の冪等性ガード（OnceLock）、リクエストメトリクス記録（record_request）、および llm-bridge-core バージョン更新の 5 領域である。各是正は親 RFC の該当セクション（§F.1, §F.2, §F.6, §6.2, §10.4）を完全に充足する。

## Motivation

親 RFC（RFC-ROOT.md）の実装レビューにより、以下の実装漏れ・不足が特定された（詳細は OMISSIONS-001.md 参照）。

| ID | 深刻度 | 領域 | 問題 |
|----|--------|------|------|
| O-001 | high | HTTP クライアント | `build_provider_clients()` が `reqwest::Client::new()` を素で使用し、connect_timeout / pool / keepalive / User-Agent を設定していない |
| O-002 | high | リクエストタイムアウト | `execute_with_failover()` および `translate_non_stream()` に `reqwest::RequestBuilder::timeout()` が未適用 |
| O-003 | medium | ストリーミングタイムアウト | `proxy_sse_stream()` および `translate_stream()` の `select!` ループにチャンク間 idle timeout が未実装 |
| O-004 | medium | メトリクス登録 | `register_metrics()` に OnceLock ガードがなく、複数回呼び出し時に `describe_*!` の重複警告リスク |
| O-005 | medium | メトリクス記録 | `handle_messages()` 後処理で `record_request()` が未呼び出し（※実装確認時点ですでに対応済み） |
| O-006 | medium | 依存関係 | `llm-bridge-core` が v0.2.6 固定。v0.3.0（Rust 2024 Edition 対応版、2026-06-26 リリース）に未更新 |

これらの漏れは親 RFC の設計を実装に正確に反映していない状態であり、システムの信頼性（タイムアウト未設定による無期限待機）、可観測性（メトリクス未記録）、保守性（依存関係の陳腐化）に影響を及ぼす。本 RFC でこれらを全て是正する。

## Design

### §1 HTTP クライアント接続設定（O-001, N1）

`build_provider_clients()` の `reqwest::Client` 生成時に `reqwest::Client::builder()` を使用し、以下の設定を一括適用する。

**設定項目・値・根拠:**

| 設定 | 値 | 取得元 | 根拠 |
|------|-----|--------|------|
| `connect_timeout` | `connect_ms` | `provider.config.timeouts.connect_ms → config.global.timeouts.connect_ms`（デフォルト 3000ms） | upstream 接続不能時の無期限待機防止 |
| `pool_max_idle_per_host` | `usize::MAX` | 固定値 | HTTP/1.1 keepalive による TCP + TLS ハンドシェイク再利用。`max_in_flight`（デフォルト64）が実効上の上限となるため過剰ではない |
| `tcp_keepalive` | `Some(Duration::from_secs(30))` | 固定値 | 長時間ストリームの NAT/ファイアウォール切断防止。30秒は業界標準 |
| `default_headers` | `User-Agent: "anthropx/{version}"` | `env!("CARGO_PKG_VERSION")` | RFC §F.6 の要求。`CARGO_PKG_VERSION` によりリリースごとに自動反映 |

`connect_ms` のフォールバックチェーン: `provider.config.timeouts.connect_ms` が `Some` ならその値、`None` なら `config.global.timeouts.connect_ms` の値（デフォルト 3000ms）。

`pool_max_idle_per_host` は `ProviderConfig` のフィールドとしては追加しない。現時点で provider 別設定の要求はなく、固定値 `usize::MAX` で十分である（YAGNI）。

`User-Agent` は以下の形式で設定する：

```
anthropx/0.1.0
```

`tcp_keepalive` は macOS 標準の TCP keepalive 間隔 30 秒を使用する（ソケットオプション `TCP_KEEPALIVE` / `TCP_KEEPIDLE`）。

### §2 リクエストレベルタイムアウト（O-002, N2）

non-stream リクエストの送信に `reqwest::RequestBuilder::timeout()` を追加する。

**適用箇所:**

1. `execute_with_failover()`（`transparent.rs`）— non-stream transparent 中継
2. `translate_non_stream()`（`translate.rs`）— non-stream translate 変換

**設定値のフォールバックチェーン:**

```
provider.config.timeouts.total_ms (Option<u64>)
  → config.global.timeouts.total_ms (u64, デフォルト 600000ms)
```

**実装パターン:**

```rust
// フォールバック解決
let total_ms = provider
    .config
    .timeouts
    .as_ref()
    .and_then(|t| t.total_ms)
    .unwrap_or(config.global.timeouts.total_ms);

// 適用
let response = cloned
    .bearer_auth(key)
    .timeout(Duration::from_millis(total_ms))
    .send()
    .await;
```

`timeout()` が発火すると `reqwest::Error`（kind = `Request::Timeout`）が返る。`execute_with_failover()` のエラーハンドリングでは既存のマッピング（`UpstreamError`）に統合されるため、ProxyError の variant 追加は不要。

### §3 ストリーミング idle timeout（O-003, N2）

`proxy_sse_stream()`（transparent）および `translate_stream()`（translate）の `tokio::select!` ループ内で、チャンク受信待機に `tokio::time::timeout()` をラップする。

**設定値のフォールバックチェーン:**

```
provider.config.timeouts.read_ms (Option<u64>)
  → config.global.timeouts.read_ms (u64, デフォルト 600000ms)
```

**タイムアウト時の動作（grill 決定 Q2→A）:**

- タイムアウト発生時はストリームを即座に切断する
- 後続チャンクは送信しない
- エラー応答は送信しない（すでに partial response 送信中のため不可能）
- クライアント側はストリームの予期せぬ終端として検知する
- この動作は Anthropic 標準 API と同一の体感を提供する

`tcp_keepalive`（§1）とは異なる目的: `tcp_keepalive` は OS レベルの無通信検出であり、`tokio::time::timeout` はアプリケーションレベルの無応答検出である。両者は独立して設定される。

**proxy_sse_stream() の変更後構造:**

```rust
async fn proxy_sse_stream(upstream_resp: reqwest::Response, cancel: CancellationToken, read_ms: u64) -> Response {
    let (tx, rx) = mpsc::channel::<Result<axum::body::Bytes, axum::Error>>(64);
    let mut stream = upstream_resp.bytes_stream();
    let timeout_dur = Duration::from_millis(read_ms);

    tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => break,
                chunk = tokio::time::timeout(timeout_dur, stream.next()) => {
                    match chunk {
                        Ok(Some(Ok(bytes))) => {
                            if tx.send(Ok(bytes)).await.is_err() { break; }
                        }
                        Ok(Some(Err(_))) | Ok(None) => break,
                        Err(_) => {
                            tracing::warn!("stream idle timeout, closing");
                            break;  // タイムアウト時は即座切断
                        }
                    }
                }
            }
        }
    });

    let stream_body = Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx));
    (StatusCode::OK, [("content-type", "text/event-stream"), ("cache-control", "no-cache")], stream_body).into_response()
}
```

**translate_stream() の変更:** 同様の `tokio::time::timeout(timeout_dur, upstream_stream.next())` を `select!` ブランチに追加する。コード構造は proxy_sse_stream と同一パターン。

### §4 register_metrics() の冪等性ガード（O-004, N3）

`std::sync::OnceLock<()>` をモジュールレベルの `static` に設置し、`register_metrics()` の先頭で初回実行のみ `describe_*!` が呼ばれるようにガードする。

**実装:**

```rust
use std::sync::OnceLock;

/// register_metrics() が初回のみ実行されることを保証するガード。
static METRICS_REGISTERED: OnceLock<()> = OnceLock::new();

pub fn register_metrics() {
    // [`ProxyServer::start()`] が複数回呼ばれても describe_*! は初回のみ実行
    METRICS_REGISTERED.set(()).unwrap_or_default();

    // 初回呼び出し時のみ describe_*! を実行する
    if METRICS_REGISTERED.get().is_some() {
        // server feature 時は METRICS_HANDLE の初期化をトリガー
        #[cfg(feature = "server")]
        { let _ = &*exporter::METRICS_HANDLE; }

        describe_counter!("anthropx_requests_total", "Total number of proxy requests by provider, mode, stream, status");
        describe_counter!("anthropx_failover_total", "Total number of key failover events by provider");
        describe_counter!("anthropx_lossy_total", "Total number of lossy translation events by level");
        describe_histogram!("anthropx_request_latency_ms", "Request latency in milliseconds by provider and mode");
    }
}
```

`OnceLock::set()` は初回のみ `Ok(())` を返し、2 回目以降は `Err(())` を返す。無視してよい。

`std::sync::Once`（低レベルプリミティブ）ではなく `OnceLock` を選んだ理由:
- `OnceLock` は戻り値を保持できる（`Once::call_once` は保持できない）
- 将来 metrics 登録時のハンドル保持等に拡張可能
- `OnceLock` は標準ライブラリで安定化済み（Rust 1.70 以降）

### §5 handle_messages の record_request() 呼び出し（O-005, N4）

**本 omission は実装確認時点ですでに対応済みである。**

`src/http/routes.rs` の `handle_messages()` は以下の構造で `record_request()` を正しく呼び出している:

- 関数先頭で `start_time = std::time::Instant::now()` を取得（line 114）
- 処理前に `metrics_provider`, `metrics_stream`, `metrics_mode` を抽出（lines 122-131）
- 処理後（`async move { ... }.instrument(span).await`）の直後（lines 201-218）で `latency_ms` を計算し、`result` の `Ok/Err` 両方の経路で `record_request()` を呼び出し
- エラー時は `e.status_code()` で HTTP ステータスコードを取得

現状の実装は RFC §10.4 の要求を充足している。変更不要。

参考までに現在の実装コード:

```rust
// handle_messages の末尾（routes.rs 201-218）— すでに実装済み
let latency_ms = start_time.elapsed().as_millis() as u64;
match &result {
    Ok(_) => {
        if let (Some(provider), Some(mode)) = (&metrics_provider, &metrics_mode) {
            metrics::record_request(provider, mode, metrics_stream, 200, latency_ms);
        }
    }
    Err(e) => {
        let status = e.status_code();
        if let (Some(provider), Some(mode)) = (&metrics_provider, &metrics_mode) {
            metrics::record_request(provider, mode, metrics_stream, status, latency_ms);
        }
        tracing::warn!(error = %e, status = status, "request failed");
    }
}
```

### §6 llm-bridge-core v0.3.0 更新戦略（O-006, N5）

`Cargo.toml` の `llm-bridge-core = { version = "0.2.6", optional = true }` を `"0.3.0"` に更新する。

**更新手順:**

1. `cargo add llm-bridge-core@0.3.0` で依存関係を更新
2. `cargo check` でコンパイルエラーの有無を確認
3. breaking change の影響を評価:
   - パブリック API の変更（関数シグネチャ、型名、モジュールパス）
   - `TransformError` variant の追加・削除
   - `anthropic_to_openai()` / `openai_response_to_anthropic_message()` のシグネチャ変更
   - `transform_stream_events()` / `events_to_sse()` の変更
4. 必要に応じてコードを修正
5. `cargo test` 全テストパスを確認
6. v0.3.0 に `TransformResult` API が含まれている場合、RFC §6.3 の独自 lossy-tolerant 変換実装を `scan_anthropic_request()` からライブラリ API への置き換えを検討する

**v0.3.0 は Rust 2024 Edition 対応版**である。anthropx 側の edition 移行計画（RFC §F.5）との直接の技術的依存関係はないが、edition 移行前に v0.3.0 に更新しておくことで、移行時の変更範囲を小さくできる。

**TransformResult API 調査項目:**

- `llm-bridge-core::transform` モジュールに `TransformResult` または同等の lossy 検出 API が存在するか
- 存在する場合、`scan_anthropic_request()` の pre-scan 方式からライブラリ API 方式への移行計画
- 移行完了後、`scan_anthropic_request()` および `process_lossy_events()` のテスト群は維持（regression 防止）

## Implementation

### §7 実装手順

#### 7.1 lifecycle.rs: build_provider_clients() 変更

```rust
// src/lifecycle.rs — build_provider_clients()
pub fn build_provider_clients(config: &AppConfig) -> HashMap<String, ProviderClient> {
    config
        .providers
        .iter()
        .map(|(name, provider_config)| {
            // TimeoutConfig から接続タイムアウトを解決（provider → global フォールバック）
            let connect_timeout = Duration::from_millis(
                provider_config
                    .timeouts
                    .as_ref()
                    .and_then(|t| t.connect_ms)
                    .unwrap_or(config.global.timeouts.connect_ms),
            );

            let user_agent: HeaderValue = format!(
                "anthropx/{}",
                env!("CARGO_PKG_VERSION")
            ).parse().expect("static User-Agent value must be valid");

            let mut default_headers = HeaderMap::new();
            default_headers.insert(http::header::USER_AGENT, user_agent);

            let http_client = reqwest::Client::builder()
                .connect_timeout(connect_timeout)
                .pool_max_idle_per_host(usize::MAX)
                .tcp_keepalive(Some(Duration::from_secs(30)))
                .default_headers(default_headers)
                .build()
                .expect("reqwest::Client::builder() should succeed with valid parameters");

            let scheduler = KeyScheduler::new(provider_config.api_keys.clone(), name.clone());
            // ... limiter と ProviderClient 構築は既存のまま
        })
        .collect()
}
```

**注意点:**
- `reqwest::Client::builder()` は失敗しないことが知られているが、失敗した場合の挙動については `ClientBuilder::build()` が返す `Result` を `expect()` で処理する（builder 引数が静的に検証可能な値のみであるため）
- `http::header::USER_AGENT` の使用には `dep:http` が server feature 依存として必要（現在はもう optional 依存として存在）
- `HeaderValue::parse()` は静的文字列に対してのみ使用し、動的入力には使用しないこと

#### 7.2 transparent.rs: non-stream timeout 追加

```rust
// src/provider/transparent.rs — execute_with_failover()
async fn execute_with_failover(
    provider_name: &str,
    scheduler: &KeyScheduler,
    request: RequestBuilder,
    total_ms: u64,  // 新規引数: 呼び出し元から渡す
) -> Result<reqwest::Response, ProxyError> {
    let max_attempts = scheduler.key_count().min(3);
    let mut last_error = None;

    for _attempt in 0..max_attempts {
        let key = scheduler.select_key();
        let cloned = request
            .try_clone()
            .ok_or_else(|| ProxyError::Internal("request body not cloneable".to_string()))?;
        // .timeout() を追加 — タイムアウトは reqwest::Error::Timeout として伝播
        let response = cloned
            .bearer_auth(key)
            .timeout(Duration::from_millis(total_ms))
            .send()
            .await;

        match response {
            Ok(resp) if resp.status().is_success() => return Ok(resp),
            Ok(resp) if resp.status().is_server_error() => {
                metrics::record_failover(provider_name);
                last_error = Some(ProxyError::Upstream(resp.status().as_u16()));
            }
            Ok(resp) => return Ok(resp), // 4xx → 即座
            Err(e) => {
                metrics::record_failover(provider_name);
                last_error = Some(ProxyError::UpstreamError(e.to_string()));
            }
        }
    }

    Err(last_error.unwrap_or(ProxyError::UpstreamError("all keys failed".to_string())))
}
```

`total_ms` は呼び出し元（`handle_transparent()`）で解決し、`execute_with_failover()` に引数として渡す。

```rust
// handle_transparent() 内 — total_ms 解決
let total_ms = provider
    .config
    .timeouts
    .as_ref()
    .and_then(|t| t.total_ms)
    .unwrap_or(state.config.global.timeouts.total_ms);

// non-stream 分岐
let upstream_resp = execute_with_failover(provider_name, &provider.scheduler, req_builder, total_ms).await?;
```

#### 7.3 transparent.rs: streaming idle timeout 追加

`proxy_sse_stream()` に `read_ms` 引数を追加し、`select!` をラップする:

```rust
// src/provider/transparent.rs — proxy_sse_stream() 変更
async fn proxy_sse_stream(
    upstream_resp: reqwest::Response,
    cancel: CancellationToken,
    read_ms: u64,  // 新規引数
) -> Response {
    let (tx, rx) = mpsc::channel::<Result<axum::body::Bytes, axum::Error>>(64);
    let mut stream = upstream_resp.bytes_stream();
    let timeout_dur = Duration::from_millis(read_ms);

    tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => break,
                // streaming idle timeout でラップ
                chunk = tokio::time::timeout(timeout_dur, stream.next()) => {
                    match chunk {
                        Ok(Some(Ok(bytes))) => {
                            if tx.send(Ok(bytes)).await.is_err() { break; }
                        }
                        Ok(Some(Err(_))) | Ok(None) => break,
                        Err(_timeout) => {
                            // タイムアウト時は即座にストリームを切断
                            tracing::warn!("transparent stream idle timeout ({}ms), closing", read_ms);
                            break;
                        }
                    }
                }
            }
        }
    });

    let stream_body = Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx));
    (StatusCode::OK, [
        ("content-type", "text/event-stream"),
        ("cache-control", "no-cache"),
    ], stream_body).into_response()
}
```

`stream_response()` は同様に `read_ms` を受け取り `proxy_sse_stream()` に渡すよう変更する。

#### 7.4 translate.rs: non-stream timeout + streaming idle timeout 追加

`translate_non_stream()` の `provider.http_client.post(...)` 送信に `.timeout()` を追加:

```rust
// src/provider/translate.rs — translate_non_stream() timeout 追加
let total_ms = provider
    .config
    .timeouts
    .as_ref()
    .and_then(|t| t.total_ms)
    .unwrap_or(600_000);  // デフォルト 600000ms

let key = provider.scheduler.select_key();
let upstream_resp = provider
    .http_client
    .post(&upstream_url)
    .bearer_auth(key)
    .json(&upstream_body)
    .timeout(Duration::from_millis(total_ms))  // 追加
    .send()
    .await
    .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;
```

`translate_stream()` の `select!` ループに idle timeout を追加（proxy_sse_stream と同一パターン）:

```rust
// translate_stream() の select! 内
let read_ms = provider
    .config
    .timeouts
    .as_ref()
    .and_then(|t| t.read_ms)
    .unwrap_or(600_000);
let timeout_dur = Duration::from_millis(read_ms);

// select! ループ内
tokio::select! {
    biased;
    _ = cancel.cancelled() => break,
    chunk = tokio::time::timeout(timeout_dur, upstream_stream.next()) => {
        match chunk {
            Ok(Some(Ok(bytes))) => {
                // 既存の transform_chunk + send 処理
                match transform_chunk(&bytes, sse_format, &mut state) {
                    // ... 既存のまま
                }
            }
            Ok(Some(Err(e))) => { tracing::error!(...); break; }
            Ok(None) => break,
            Err(_timeout) => {
                tracing::warn!("translate stream idle timeout ({}ms), closing", read_ms);
                break;  // 即座切断
            }
        }
    }
}
```

#### 7.5 metrics.rs: OnceLock ガード追加

```rust
// src/observability/metrics.rs — 変更
use std::sync::OnceLock;

/// register_metrics() が初回のみ実行されることを保証するガード。
static METRICS_REGISTERED: OnceLock<()> = OnceLock::new();

pub fn register_metrics() {
    // 初回呼び出し: OnceLock::set() が Ok(()) を返す
    // 2回目以降: 何もしない（describe_*! の重複実行を防止）
    if METRICS_REGISTERED.set(()).is_err() {
        return;
    }

    // server feature 時は METRICS_HANDLE の初期化をトリガー
    #[cfg(feature = "server")]
    {
        let _ = &*exporter::METRICS_HANDLE;
    }

    describe_counter!(
        "anthropx_requests_total",
        "Total number of proxy requests by provider, mode, stream, status"
    );
    describe_counter!(
        "anthropx_failover_total",
        "Total number of key failover events by provider"
    );
    describe_counter!(
        "anthropx_lossy_total",
        "Total number of lossy translation events by level"
    );
    describe_histogram!(
        "anthropx_request_latency_ms",
        "Request latency in milliseconds by provider and mode"
    );
}
```

#### 7.6 routes.rs: record_request() の確認（変更不要）

`src/http/routes.rs` の `handle_messages()` はすでに `record_request()` を正しく実装済み。変更不要。既存のテスト（`handle_messages_valid_request` 等）が引き続きパスすることを確認する。

#### 7.7 Cargo.toml: llm-bridge-core バージョン更新

```bash
cargo add llm-bridge-core@0.3.0
```

更新後、`Cargo.toml` の該当行:

```toml
llm-bridge-core = { version = "0.3.0", optional = true }
```

### §8 テスト更新

既存の全テストは変更後もパスしなければならない。新たに追加・更新すべきテスト:

| テスト | 対象 | 内容 |
|--------|------|------|
| `build_provider_clients_has_configured_client` | lifecycle.rs | `build_provider_clients()` の生成した `ProviderClient.http_client` が `reqwest::Client` のデフォルトでないことを確認（connect_timeout が設定されている） |
| `execute_with_failover_timeout_applied` | transparent.rs | mock server の slow response（5秒以上）に対して `total_ms=100` でタイムアウトすることを確認 |
| `proxy_sse_stream_idle_timeout` | transparent.rs | チャンク間の遅延が `read_ms` を超えた場合にストリームが切断されることを確認 |
| `register_metrics_idempotent` | metrics.rs | `register_metrics()` を2回呼び出しても重複警告やパニックが発生しないことを確認 |
| `llm_bridge_core_v0_3_0_builds` | Cargo.toml | v0.3.0 更新後 `cargo check` がパスすることを確認 |

各テストの実装指針:

```rust
// lifecycle.rs のテスト追加例
#[cfg(test)]
mod tests {
    use reqwest::Client;

    #[test]
    fn build_provider_clients_has_configured_client() {
        let config = AppConfig::default_with_provider("test", "https://test.example.com");
        let clients = build_provider_clients(&config);
        let client = &clients.get("test").unwrap().http_client;

        // connect_timeout がデフォルト値（3000ms）で設定されていることを確認
        // reqwest の Client は timeout 設定の直接参照を公開していないため、
        // 型と Debug 出力で builder() 経由で生成されたことを確認する
        let _ = client;
    }
}
```

### §9 マイグレーション計画

本 RFC の是正はすべて同一クレート内のソースコード変更であり、データベースマイグレーション・外部リソース変更・API 互換性の破壊を伴わない。

| 変更 | 影響範囲 | 互換性 |
|------|----------|--------|
| lifecycle.rs の Client builder 変更 | 内部実装のみ | 完全互換（パブリック API 不変） |
| transparent.rs の timeout 追加 | `execute_with_failover()` に引数追加 | 内部関数（`pub(crate)`）のため影響限定的。呼び出し元の `handle_transparent()` も同時に変更 |
| translate.rs の timeout 追加 | `translate_non_stream()` の内部実装のみ | 完全互換 |
| metrics.rs の OnceLock 追加 | 内部実装のみ | 完全互換（`register_metrics()` のシグネチャ不変） |
| routes.rs | 変更不要 | — |
| Cargo.toml のバージョン更新 | llm-bridge-core 依存 | breaking change の可能性あり。別途検証 |

## Appendix

### A. 親 RFC との対応関係

| 本RFC § | 対応する OMISSIONS | 親 RFC § | 親 RFC 設計判断 |
|---------|-------------------|----------|----------------|
| §1 | O-001 | §F.1, §F.6 | design#4（TOML+プログラム構築の二刀流） |
| §2, §3 | O-002, O-003 | §F.1 | design#5（Key failover: non-stream のみ） |
| §4 | O-004 | §F.2 | design#8（metrics 登録は OnceLock で冪等性確保） |
| §5 | O-005 | §10.4 | — |
| §6 | O-006 | §1.1, §6.2 | — |

### B. 実装確認で発見された既存実装

`O-005（record_request 未呼び出し）`については、実装確認時点ですでに `handle_messages()` 内で正しく実装済みであった。本 RFC ではこれを確認事項として記録し、変更は行わない。

### C. 設計判断のまとめ（grill セッション決定事項）

| ID | 判断 | 選択肢 | 根拠 |
|----|------|--------|------|
| N1 | B | 標準構成 | keepalive 性能 + 長時間ストリーム切断防止 + User-Agent 設定。YAGNI により provider 別設定は追加しない |
| N2 | A | 即時切断 | Anthropic 標準 API と同一の体感。partial response 有効扱いは不完全応答のリスク。再試行はストリーム読み取りの複雑さに見合わない |
| N3 | A | OnceLock<()> | `Once`（戻り値保持不可）より拡張性が高い。MetricsHandle 保持（C）は YAGNI |
| N4 | B | 集約1箇所 | 全経路（成功+全 ProxyError）を漏れなく記録。コード重複最小 |
| N5 | A | 今すぐ更新 | v0.3.0 は Rust 2024 Edition 対応版で事前対応の好機。TransformResult 確認は RFC §6.3 設計に直接影響 |

### D. 検証手順

実装完了後、以下の手順で検証する:

```bash
# 1. コンパイル確認
cargo check --features server

# 2. ライブラリモード（server feature なし）のコンパイル確認
cargo check

# 3. clippy 警告なし
cargo clippy -- -D warnings

# 4. 全テスト実行
cargo test

# 5. llm-bridge-core v0.3.0 更新後も全テストパス
cargo test --features server
```

### E. 変更ファイル一覧

| ファイル | 変更種別 | 内容 |
|----------|----------|------|
| `src/lifecycle.rs` | 修正 | `build_provider_clients()` で builder 利用 + `handle_transparent()` に total_ms 伝達 |
| `src/provider/transparent.rs` | 修正 | `execute_with_failover()` に `.timeout()` 追加。`proxy_sse_stream()` に idle timeout 追加 |
| `src/provider/translate.rs` | 修正 | `translate_non_stream()` に `.timeout()` 追加。`translate_stream()` に idle timeout 追加 |
| `src/observability/metrics.rs` | 修正 | `OnceLock<()>` ガード追加 |
| `Cargo.toml` | 修正 | `llm-bridge-core` v0.2.6 → v0.3.0 |
