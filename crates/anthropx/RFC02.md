# RFC 02 — anthropx: Supplementary Design Specification

> **Status:** Final
> **Version:** 1.0
> **Date:** 2026-06-22
> **Supersedes:** — (補完仕様書。RFC 01 と併用する)
> **DesignTree:** `DesignTree.json`
> **CheckList:** `CheckList.md`

---

## Abstract

本仕様書は anthropx crate の初版設計（RFC 01）と実装コードの網羅的突合監査（`docs/REMAININGS.md`）で発見された 16 項目の乖離・不足を完全に補うための設計仕様を定義する。

対象範囲は以下の 9 領域である：

1. **セキュリティ属性** — `#![forbid(unsafe_code)]` と警告属性の crate レベル設定
2. **メトリクス再設計** — `metrics` crate 導入によるラベル付きカウンタ・ヒストグラムへの移行
3. **Translate streaming リアルタイム化** — 蓄積型一括変換からチャンク単位逐次変換への全面改修
4. **Lossy handling 契約達成** — `allow_lossy=true + error_lossy_continue=true` 時の続行ロジック
5. **Feature gate 整備** — server feature によるデュアルモード構成の確立
6. **設定検証補完** — `url_prefix` 正規化、alias 衝突チェック修正
7. **モジュール分割** — `config/mod.rs` 1517行の責務分離
8. **テスト拡充** — AC#4/5/6 不足テストの追加と応答形式検証
9. **コード品質改善** — 重複保守解消・型整理・公開API補完

全設計判断は `DesignTree.json`（11 ノード）に記録され、本仕様書は同ツリーの全ノードを完全網羅する。

---

## Motivation

anthropx は Rust 実装の Anthropic 互換 API プロキシサーバーであり、単一バイナリとして独立稼働すると同時に、他の Rust プロジェクトに crate として埋め込んで使用できるデュアルモード構成を採用する。

初版実装は RFC 01 の全機能要件を満たしたが、コード網羅監査により以下の 3 つのカテゴリで改善余地が確認された：

1. **セキュリティ不変条件の未達**: `#![forbid(unsafe_code)]` が未設定であり、unsafe コードの混入をコンパイル時に検出できない。
2. **設計仕様と実装の乖離**: metrics crate 未使用（AtomicU64 代替）、translate streaming 蓄積型、lossy 続行ロジック未達成、feature gate 欠如の 4 点。
3. **コード品質の可監査性不足**: 1517行の config/mod.rs、重複した status_code マッピング、不完全な設定検証ロジック。

本仕様書の目標は、これらの乖離をすべて解消し、RFC 01 の設計契約を完全に充足することである。

---

## Design

### §1 セキュリティ属性と Crate 設定（M#1）

#### 1.1 Crate レベル属性

`src/lib.rs` の冒頭に以下の 3 属性を設定する。これらは crate 全体に適用される不変条件である。

```rust
// src/lib.rs
#![forbid(unsafe_code)]
#![warn(rust_2024_compatibility)]
#![warn(missing_debug_implementations)]
```

**各属性の意図:**

| 属性 | 効果 | 根拠 |
|------|------|------|
| `forbid(unsafe_code)` | unsafe コードの混入をコンパイル時に禁止 | セキュリティ不変条件。例外なく全 crate で遵守 |
| `warn(rust_2024_compatibility)` | Edition 2024 移行時の互換性問題を警告 | 将来のエディション移行準備 |
| `warn(missing_debug_implementations)` | Debug 実装欠落を警告 | デバッグ容易性の確保 |

`#![warn(missing_docs)]` は本フェーズでは有効化しない。全公開アイテムへの doc コメント追加は別チケットで段階的に実施する。

#### 1.2 ProxyServer の再公開

`lib.rs` に以下の再公開を追加し、ライブラリ利用者が `anthropx::ProxyServer` としてアクセスできるようにする：

```rust
// src/lib.rs に追加
pub use lifecycle::ProxyServer;
```

これにより RFC Appendix B の以下の利用例が成立する：

```rust
use anthropx::{AppConfig, ProxyServer};

let config = AppConfig::default();
let handle = ProxyServer::start(config).await.unwrap();
```

---

### §2 メトリクス再設計（M#2/M#5）

#### 2.1 依存クレート

`Cargo.toml` に以下を追加する：

```toml
[dependencies]
metrics = "0.24"
metrics-exporter-prometheus = "0.16"
```

`metrics-exporter-prometheus` は server feature 配下とする（library 用途では不要）。

#### 2.2 メトリクス命名規則

命名規則は以下の方針に従う：

| 規則 | 例 |
|------|-----|
| プレフィックス: `anthropx_` | `anthropx_requests_total` |
| カウンタサフィックス: `_total` | `anthropx_requests_total` |
| ヒストグラムサフィックス: `_ms` | `anthropx_request_latency_ms` |
| ラベルは snake_case | `provider`, `mode`, `stream`, `status` |

#### 2.3 カウンタ定義

`register_metrics()` 関数で全カウンタとヒストグラムを事前登録する：

```rust
// src/observability/metrics.rs
use metrics::{counter, histogram, describe_counter, describe_histogram};

// server feature 時のみ Prometheus レコーダーをインストールする。
// library モードでは metrics マクロは no-op として動作する。
#[cfg(feature = "server")]
mod exporter {
    use metrics_exporter_prometheus::{PrometheusBuilder, PrometheusHandle};
    use once_cell::sync::Lazy;

    pub(crate) static METRICS_HANDLE: Lazy<PrometheusHandle> = Lazy::new(|| {
        PrometheusBuilder::new()
            .install_recorder()
            .expect("failed to install Prometheus recorder")
    });
}
#[cfg(feature = "server")]
pub(crate) use exporter::METRICS_HANDLE;

pub fn register_metrics() {
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

#### 2.4 `record_request` 関数

```rust
pub fn record_request(
    provider: &str,
    mode: &str,
    stream: bool,
    status: u16,
    latency_ms: u64,
) {
    let labels = [
        ("provider", provider),
        ("mode", mode),
        ("stream", stream.to_string().as_str()),
        ("status", status.to_string().as_str()),
    ];

    counter!("anthropx_requests_total", &labels).increment(1);
    histogram!("anthropx_request_latency_ms", &labels).record(latency_ms as f64);
}
```

#### 2.5 レイテンシヒストグラム

metrics crate のデフォルトバケット（`[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]` 秒）を使用する。カスタムバケット設定は行わない。

```rust
// デフォルトバケットを使用（metrics crate のデフォルト値）
// 秒単位のデフォルト: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0
```

#### 2.6 メトリクスフォーマット

`/metrics` エンドポイントは Prometheus text exposition format で出力する：

```rust
// src/http/routes.rs
// server feature 時のみ /metrics エンドポイントで Prometheus 形式を出力
#[cfg(feature = "server")]
pub(crate) async fn metrics_handler() -> String {
    crate::observability::metrics::METRICS_HANDLE.render()
}
```

#### 2.7 Failover メトリクス

```rust
// src/provider/transparent.rs — execute_with_failover 内
pub fn record_failover(provider: &str) {
    counter!("anthropx_failover_total", "provider" => provider).increment(1);
}
```

#### 2.8 Lossy メトリクス

```rust
// src/provider/translate.rs — lossy 検出時
pub fn record_lossy(level: &str) {
    counter!("anthropx_lossy_total", "level" => level).increment(1);
}
```

#### 2.9 `register_metrics` の呼び出し場所

```rust
// src/lifecycle.rs — ProxyServer::start の先頭
pub async fn start(config: AppConfig) -> Result<ServerHandle, Box<dyn Error>> {
    register_metrics();  // メトリクス登録
    config.validate()?;
    // ...
}
```

#### 2.10 既存 AtomicU64 からの移行パス

既存のグローバル `AtomicU64` 変数は全削除する。置き換え対応表：

| 削除対象 | 置き換え |
|---------|---------|
| `static TOTAL_REQUESTS: AtomicU64` | `counter!("anthropx_requests_total", ...)` |
| `static FAILOVER_COUNT: AtomicU64` | `counter!("anthropx_failover_total", ...)` |
| `static TOTAL_ERRORS: AtomicU64` | 同上 requests_total の status=5xx で集計 |
| `fn record_request(status: u16)` | `fn record_request(provider, mode, stream, status, latency_ms)` |
| `fn record_failover()` | `fn record_failover(provider: &str)` |

---

### §3 Translate Streaming リアルタイム化（M#3）

#### 3.1 現状の問題

現在の `collect_and_transform_stream()` は upstream からの SSE チャンクをすべて `Vec<u8>` に蓄積し、ストリーム終了後に `transform_stream()` で一括変換する。これによりクライアントは full response が完了するまで最初のトークンを受信できず、ストリーミングの利点（TTFU: Time To First Token）が完全に失われる。

```
// 現在のフロー（蓄積型）
Upstream SSE chunk1 → │
Upstream SSE chunk2 → │→ Vec<u8> buffer → [stream end] → transform_stream() → 一括送信
Upstream SSE chunk3 → │
```

#### 3.2 目標アーキテクチャ

```
// 目標フロー（チャンク逐次変換型）
Upstream SSE chunk1 → transform_chunk() → 即時 tx 送信 → クライアント
Upstream SSE chunk2 → transform_chunk() → 即時 tx 送信 → クライアント
Upstream SSE chunk3 → transform_chunk() → 即時 tx 送信 → クライアント
```

#### 3.3 実装設計

`translate_stream()` を以下の構造で再実装する。`transparent.rs` の `proxy_sse_stream()` パターンをベースとする。

```rust
// src/provider/translate.rs
use axum::body::Body;
use futures::stream::StreamExt;
use std::convert::Infallible;
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

pub(crate) async fn translate_stream(
    upstream_response: reqwest::Response,
    stream_state: &StreamState,
    cancel: CancellationToken,
) -> Result<Response<Body>, ProxyError> {
    let (tx, rx) = mpsc::channel::<Result<Bytes, Infallible>>(64);
    let mut upstream_stream = upstream_response.bytes_stream();
    let state = stream_state.clone();
    let cancel = cancel.clone();

    // 変換タスクを spawn
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // upstream からのチャンク受信
                chunk = upstream_stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            // チャンク単位で変換
                            match transform_chunk(bytes, &state) {
                                Ok(Some(anthropic_event)) => {
                                    // 変換結果を即時送信
                                    if tx.send(Ok(anthropic_event)).await.is_err() {
                                        break; // クライアント切断
                                    }
                                }
                                Ok(None) => continue, // 変換不要チャンク
                                Err(e) => {
                                    tracing::warn!("chunk transform error: {e}");
                                    // lossy 契約に従う（§4 参照）
                                    if state.should_continue_on_lossy() {
                                        continue;
                                    }
                                    break;
                                }
                            }
                        }
                        Some(Err(e)) => {
                            tracing::error!("upstream stream error: {e}");
                            break;
                        }
                        None => break, // ストリーム正常終了
                    }
                }
                // キャンセル通知
                _ = cancel.cancelled() => {
                    tracing::info!("translate stream cancelled");
                    break;
                }
            }
        }
    });

    // SSE 応答を返す
    let body = Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx));
    Ok(Response::builder()
        .header("Content-Type", "text/event-stream")
        .header("Cache-Control", "no-cache")
        .body(body)
        .unwrap())
}
```

#### 3.4 `transform_chunk` 関数

llm-bridge-core の `transform_stream()` がチャンク単位の逐次投入に対応していることを前提とする。チャンク単位の変換インターフェース：

```rust
/// SSE チャンクを Anthropic 形式に変換する。
///
/// - `Ok(Some(bytes))`: 変換完了、クライアントに送信すべきデータあり
/// - `Ok(None)`: 変換不要（keepalive 等）、スキップ
/// - `Err(e)`: 変換エラー
fn transform_chunk(
    chunk: Bytes,
    state: &StreamState,
) -> Result<Option<Bytes>, ProxyError> {
    // llm-bridge-core の transform_stream をチャンク単位で呼び出す
    let transformed = state
        .transform_fn
        .as_ref()
        .ok_or(ProxyError::Internal("transform not initialized".into()))?
        .transform(chunk.as_ref())
        .map_err(|e| ProxyError::TransformLossy(e.to_string()))?;

    if transformed.is_empty() {
        return Ok(None);
    }

    // SSE event にラップ
    let sse_event = format!("data: {}\n\n", serde_json::to_string(&transformed)?);
    Ok(Some(Bytes::from(sse_event)))
}
```

#### 3.5 CancellationToken の伝搬パス

ServerHandle の shutdown が translate stream にも伝搬されるよう、`CancellationToken` を `handle_translate()` → `translate_stream()` へ渡す：

```rust
// src/provider/translate.rs
pub(crate) async fn handle_translate(
    state: &AppState,
    provider: &ProviderConfig,
    resolved: &ResolvedModel,
    api_key: &str,
    body: Value,
    is_stream: bool,
    cancel: CancellationToken,
) -> Result<Response<Body>, ProxyError> {
    // ...
    if is_stream {
        let upstream_resp = send_upstream_request(&client, url, body, true).await?;
        translate_stream(upstream_resp, &stream_state, cancel).await
    } else {
        // non-stream path (変更なし)
        handle_translate_non_stream(&client, url, body).await
    }
}
```

---

### §4 Lossy Handling 契約達成（M#4/m#12）

#### 4.1 現状分析

`allow_lossy` と `error_lossy_continue` の真理値表に基づく `LossyLevel::should_reject()` は正しく実装されている。問題は `TransformError::LossyDowngrade` 発生時に `llm_bridge_core::anthropic_to_openai()` が部分的な変換結果を返せない API 設計にある。

現状の動作:

| allow_lossy | error_lossy_continue | LossyLevel | 現状の動作 | 正しい動作 |
|-------------|---------------------|------------|-----------|-----------|
| false       | false               | Error      | 400 拒否 ✅ | 400 拒否 |
| false       | false               | Warn       | 続行 ✅ | 続行 |
| true        | false               | Error      | 400 拒否 ✅ | 400 拒否 |
| true        | true                | Error      | Err 返却 ❌ | 続行+metrics |

`allow_lossy=true + error_lossy_continue=true` の場合のみ契約未達であり、このケースで Error 級 lossy を続行できない原因は llm-bridge-core の API 制約によるものである。

#### 4.2 解決戦略: Lossy-Tolerant 変換 API

llm-bridge-core 側に「損失許容型」変換 API を追加する。現在の API は「全か無か」だが、以下のインターフェースで「損失警告付き成功」を返せるようにする：

```rust
// llm-bridge-core に追加する API（設計案）
/// 変換結果。損失フィールドの情報を含む。
pub struct TransformResult<T> {
    /// 変換済みデータ（損失フィールドは省略または代替値で埋められる）
    pub data: T,
    /// 損失が発生したフィールドの一覧
    pub lossy_fields: Vec<LossyField>,
}

/// 損失が発生した個別フィールド
pub struct LossyField {
    pub name: String,
    pub level: LossyLevel,
    pub detail: String,
}

/// 損失許容型変換 — 損失フィールドは省略されるが、変換自体は成功する
pub fn anthropic_to_openai_lossy(
    request: TransformRequest,
) -> Result<TransformResult<TransformedRequest>, TransformError> {
    // 従来の変換を試行
    let transformed = anthropic_to_openai(request.clone())?;
    // 損失フィールドの検出
    let lossy_fields = detect_lossy_fields(&request, &transformed);
    Ok(TransformResult {
        data: transformed,
        lossy_fields,
    })
}

/// anthropic_to_openai の内部実装（損失フィールドを許容）
fn anthropic_to_openai_lossy_inner(
    request: TransformRequest,
) -> (TransformedRequest, Vec<LossyField>) {
    // 各フィールドの変換を個別に試行し、失敗したフィールドは lossy として記録
    // 成功したフィールドのみで変換結果を構築
}
```

#### 4.3 anthropx 側の適応

llm-bridge-core の lossy-tolerant API が利用可能になった後、`provider/translate.rs` の lossy 処理を以下のように修正する：

```rust
// src/provider/translate.rs — non-stream path
use llm_bridge_core::transform::{anthropic_to_openai_lossy, LossyLevel as CoreLossyLevel};

fn handle_lossy_translation(
    request: TransformRequest,
    allow_lossy: bool,
    error_lossy_continue: bool,
) -> Result<TransformedRequest, ProxyError> {
    match anthropic_to_openai_lossy(request) {
        Ok(result) => {
            // 損失フィールドをログとメトリクスに記録
            for field in &result.lossy_fields {
                tracing::warn!(
                    "lossy field: {} (level={:?}): {}",
                    field.name, field.level, field.detail
                );
                record_lossy(&field.level.to_string());
            }
            // 損失があれば span に記録
            if !result.lossy_fields.is_empty() {
                Span::current().record("lossy_applied", true);
            }
            Ok(result.data)
        }
        Err(e) => {
            // 損失許容型でも変換不能な場合は通常エラー
            Err(ProxyError::TransformLossy(e.to_string()))
        }
    }
}
```

stream path では、各チャンクの変換結果に損失フィールドが含まれる場合、続行＋メトリクス記録を行う：

```rust
// src/provider/translate.rs — stream path（チャンク単位の lossy 処理）
fn process_chunk_with_lossy(
    chunk: &[u8],
    state: &StreamState,
) -> Result<Option<AnthropicEvent>, ProxyError> {
    let transform_result = state.lossy_transform(chunk)?;
    for field in &transform_result.lossy_fields {
        record_lossy(&field.level.to_string());
        Span::current().record("lossy_applied", true);
    }
    Ok(transform_result.event)
}
```

#### 4.4 移行期間中の動作

llm-bridge-core の lossy-tolerant API が利用可能になるまでの間、`allow_lossy=true + error_lossy_continue=true` の組み合わせでは Error 級 lossy 発生時に 400 エラーを返す（現状維持）。この制約は以下のドキュメントコメントで明示する：

```rust
// src/config/mod.rs
/// allow_lossy フィールド
///
/// # 現状の制約
///
/// `allow_lossy=true + error_lossy_continue=true` の場合でも Error 級 lossy が
/// 発生した場合はエラーを返す。これは llm-bridge-core の変換 API が部分結果を
/// 返せない設計による制約である。llm-bridge-core の lossy-tolerant API が
/// 利用可能になり次第、本制約は解消される。
#[serde(default)]
pub allow_lossy: bool,
```

`LossyLevel` enum 自体は現状維持し、将来の拡張に備える。

---

### §5 Feature Gate 整備とデュアルモード構成（m#6）

#### 5.1 Cargo.toml 修正

```toml
[features]
default = ["server"]
server = [
    "dep:clap",
    "dep:futures",
    "dep:http",
    "dep:tokio-util",
    "dep:tokio-stream",
    "dep:tracing-subscriber",
    "dep:metrics-exporter-prometheus",
]

[dependencies]
# unconditional（library 用途でも必要）
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "2"
toml = "0.8"
reqwest = { version = "0.12", default-features = false, features = ["json", "stream"] }
tokio = { version = "1", features = ["sync", "macros"] }
tracing = "0.1"
metrics = "0.24"
llm-bridge-core = "0.7"
sea-orm = { workspace = true }
proxmox-sortable-macro = "0.2"

# optional（server feature でのみ有効化）
clap = { version = "4", features = ["derive"], optional = true }
futures = { version = "0.3", optional = true }
http = { version = "1", optional = true }
tokio-util = { version = "0.7", features = ["sync"], optional = true }
tokio-stream = { version = "0.1", optional = true }
tracing-subscriber = { version = "0.3", features = ["json", "env-filter"], optional = true }
metrics-exporter-prometheus = { version = "0.16", optional = true }
```

#### 5.2 main.rs の Conditional Compilation

```rust
// src/main.rs
#![cfg(feature = "server")]

use anthropx::cli;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config_path = cli::parse_args();
    let config = anthropx::AppConfig::from_toml(&config_path)?;
    let handle = anthropx::ProxyServer::start(config).await?;
    handle.join().await?;
    Ok(())
}
```

#### 5.3 server feature 非依存の構成確認

`cargo build --no-default-features` で library 用途の最小ビルドを検証する：

```bash
# library 最小ビルド（設定型 + メモリ内完結ロジックのみ）
cargo build --no-default-features

# サーバービルド（デフォルト）
cargo build

# テスト（server feature 必要）
cargo test
```

#### 5.4 各モジュールの feature 依存関係

| モジュール | 依存性 | feature 要件 |
|-----------|--------|-------------|
| `config/` | serde, toml | unconditional |
| `routing/` | なし（純粋関数） | unconditional |
| `util/` | reqwest::http (HeaderMap) | unconditional（reqwest の再公開経由で利用） |
| `provider/` | reqwest, tokio | unconditional |
| `observability/` | metrics | unconditional |
| `http/` | axum, tower | server feature |
| `lifecycle.rs` | axum | server feature |
| `main.rs` | clap, tokio(full), tracing-subscriber | server feature |

`util/headers.rs` の `build_upstream_headers()` は `reqwest::http::HeaderMap` を使用する。`reqwest` は unconditional な依存のため、library モードでもコンパイル可能である。

---

### §6 設定検証補完（m#7/m#11）

#### 6.1 url_prefix 正規化

`AppConfig::validate()` 内で `self.global.url_prefix` を正規化する：

```rust
// src/config/validate.rs — Impl AppConfig { pub fn validate() }

/// url_prefix を正規化する。
///
/// - 空文字列 → 空文字列（変更なし）
/// - 先頭に `/` がない → 先頭に `/` を付与
/// - 末尾に `/` がある → 末尾の `/` を除去
///
/// # 例
///
/// | 入力 | 出力 |
/// |------|------|
/// | `""` | `""` |
/// | `"proxy"` | `"/proxy"` |
/// | `"/prefix/"` | `"/prefix"` |
/// | `"/"` | `""` |
/// | `"//"` | `""` |
fn normalize_url_prefix(prefix: &str) -> String {
    if prefix.is_empty() {
        return String::new();
    }

    // 末尾の / を全て除去
    let trimmed_end = prefix.trim_end_matches('/');

    if trimmed_end.is_empty() {
        return String::new(); // "/" や "//" → ""
    }

    // 先頭に / がない場合のみ付与
    if trimmed_end.starts_with('/') {
        trimmed_end.to_string()
    } else {
        format!("/{}", trimmed_end)
    }
}

// validate() 内での呼び出し
self.global.url_prefix = normalize_url_prefix(&self.global.url_prefix);
```

#### 6.2 Alias Key 衝突チェック修正

現在の実装は alias の **値（value）** と public model 名を比較している。正しくは alias の **キー（key）** が public model 名または他の alias key と重複しないことをチェックする：

```rust
// src/config/validate.rs — 修正後の alias 衝突チェック

// 修正前（誤り）
for (alias_key, alias_value) in &provider.model_aliases {
    if public_names.contains(alias_value.as_str()) && alias_key != alias_value {
        errors.push(ConfigError::DuplicateAlias(
            alias_key.clone(),
            alias_value.clone(),
        ));
    }
}

// 修正後（正しい）
for alias_key in provider.model_aliases.keys() {
    if public_names.contains(alias_key.as_str()) {
        errors.push(ConfigError::DuplicateAlias(
            alias_key.clone(),
            format!("public model name '{}'", alias_key),
        ));
    }
}

// 追加: alias key 同士の重複チェック（同一 provider 内で同一 key は serde が防ぐが、
// 異なる model 定義との関係を明示的にチェック）
let all_model_keys: HashSet<&str> = provider.models.iter()
    .map(|m| m.public.as_str())
    .collect();
for alias_key in provider.model_aliases.keys() {
    if all_model_keys.contains(alias_key.as_str()) {
        errors.push(ConfigError::DuplicateAlias(
            alias_key.clone(),
            format!("model '{}' is already defined as a public model", alias_key),
        ));
    }
}
```

#### 6.3 Alias 競合ログ出力

global alias と provider alias の競合は許容する（provider alias 優先）が、競合発生時は `tracing::info!` でログ出力する：

```rust
// src/config/validate.rs

/// global alias と provider alias の競合をログに出力する。
/// 競合時は provider alias が優先される。
fn log_alias_conflicts(
    global_aliases: &BTreeMap<String, String>,
    providers: &BTreeMap<String, ProviderConfig>,
) {
    for (provider_name, provider_config) in providers {
        for alias_key in provider_config.model_aliases.keys() {
            if global_aliases.contains_key(alias_key.as_str()) {
                tracing::info!(
                    "alias conflict resolved by provider priority: \
                     global alias '{}' overridden by provider '{}'",
                    alias_key,
                    provider_name
                );
            }
        }
    }
}
```

---

### §7 モジュール分割（m#8）

#### 7.1 config/ ディレクトリの再編

RFC 01 の設計に従い、`config/mod.rs`（1517行）を 3 ファイルに分割する：

```
src/config/
├── mod.rs          # 型定義のみ（AppConfig, GlobalConfig, ProviderConfig, ModelConfig,
│                   #   TimeoutConfig, GlobalLimitConfig）
├── parse.rs        # TOML 読込（AppConfig::from_toml）
└── validate.rs     # 設定検証（AppConfig::validate, url_prefix 正規化, alias チェック）
```

```rust
// src/config/mod.rs — 型定義のみ
mod parse;
mod validate;

pub use parse::*;     // from_toml を再公開
pub use validate::*;  // validate を再公開
// 型定義（struct, enum）はこのファイルに残す
```

```rust
// src/config/parse.rs — TOML 読込
use std::path::Path;
use crate::config::AppConfig;

impl AppConfig {
    pub fn from_toml(path: &Path) -> Result<Self, ConfigError> {
        let content = std::fs::read_to_string(path)
            .map_err(ConfigError::Io)?;
        let config: AppConfig = toml::from_str(&content)
            .map_err(|e| ConfigError::Parse(e.to_string()))?;
        config.validate()
            .map_err(|errors| ConfigError::ValidationFailed(
                errors.into_iter().map(|e| e.to_string()).collect()
            ))?;
        Ok(config)
    }
}
```

```rust
// src/config/validate.rs — 設定検証
impl AppConfig {
    pub fn validate(&self) -> Result<(), Vec<ConfigError>> {
        let mut errors = Vec::new();
        // ... 全検証ロジック（§6 の修正を含む）
        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }
}
```

#### 7.2 util/ ディレクトリの再編

```
src/util/
├── mod.rs      # モジュール宣言 + 汎用ユーティリティ
└── headers.rs  # build_upstream_headers + HOP_BY_HOP_HEADERS 定数
```

```rust
// src/util/headers.rs
use once_cell::sync::Lazy;
use reqwest::http::HeaderMap;
use std::collections::HashSet;

/// RFC 7230 §6.1 で定義された hop-by-hop ヘッダー。
/// プロキシはこれらのヘッダーを転送してはならない。
pub(crate) static HOP_BY_HOP_HEADERS: Lazy<HashSet<String>> = Lazy::new(|| {
    [
        "connection", "keep-alive", "proxy-authenticate",
        "proxy-authorization", "te", "trailers",
        "transfer-encoding", "upgrade",
    ]
    .into_iter()
    .map(String::from)
    .collect()
});

/// upstream リクエスト用のヘッダーを構築する。
///
/// - クライアント由来の Authorization / x-api-key を除去
/// - hop-by-hop ヘッダーを除去
/// - 指定された api_key で Bearer 認証を設定
pub(crate) fn build_upstream_headers(
    client_headers: &HeaderMap,
    api_key: &str,
) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for (name, value) in client_headers.iter() {
        let name_str = name.as_str().to_lowercase();
        if name_str == "authorization"
            || name_str == "x-api-key"
            || HOP_BY_HOP_HEADERS.contains(&name_str)
        {
            continue;
        }
        headers.insert(name.clone(), value.clone());
    }
    headers.insert(
        http::header::AUTHORIZATION,
        format!("Bearer {}", api_key).parse().unwrap(),
    );
    headers
}
```

```rust
// src/util/mod.rs
mod headers;
pub use headers::*;
// その他 util 関数
```

---

### §8 テスト拡充（m#9/m#10）

#### 8.1 AC#3: Translate Non-Stream 応答形式検証

既存の `translate_non_stream_proxies_via_openai_wire` テストに応答形式の検証を追加する：

```rust
// tests/mock_server.rs

#[tokio::test]
async fn translate_non_stream_response_format() {
    let (upstream_app, _) = make_mock_upstream(true, true);
    let config = make_mock_config(upstream_app, true, vec![("m", "m")], None, None).await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&json!({
            "model": "translate/m",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 100,
        }))
        .await;

    assert_eq!(resp.status_code(), StatusCode::OK);

    let body: Value = resp.json();
    // Anthropic 互換スキーマの検証
    assert_eq!(body["type"], "message");
    assert!(body["content"].is_array());
    assert!(!body["content"].as_array().unwrap().is_empty());
    assert_eq!(body["content"][0]["type"], "text");
    assert!(body["content"][0]["text"].as_str().unwrap().len() > 0);
    assert!(body["id"].as_str().unwrap().starts_with("msg_"));
    assert_eq!(body["model"], "translate/m");
    assert_eq!(body["role"], "assistant");
}
```

#### 8.2 AC#4: Translate Stream テスト

translate stream の統合テスト。mock upstream が SSE ストリームを返し、変換結果が正しく Anthropic SSE 形式になっていることを検証する：

```rust
#[tokio::test]
async fn translate_stream_proxies_via_openai_wire() {
    let mock_sse_chunks = vec![
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hello\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\" world\"}}]}\n\n",
        "data: [DONE]\n\n",
    ];

    let upstream_app = axum::Router::new()
        .route("/v1/chat/completions", axum::routing::post(move || {
            let chunks = mock_sse_chunks.clone();
            async move {
                let stream = futures::stream::iter(
                    chunks.into_iter().map(|c| Ok::<_, Infallible>(Bytes::from(c)))
                );
                Response::builder()
                    .header("Content-Type", "text/event-stream")
                    .body(Body::from_stream(stream))
                    .unwrap()
            }
        }));

    let config = make_mock_config(upstream_app, false, vec![("m", "m")], None, None).await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&json!({
            "model": "translate/m",
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": true,
            "max_tokens": 100,
        }))
        .await;

    assert_eq!(resp.status_code(), StatusCode::OK);

    // SSE ストリームとしての応答検証
    let content_type = resp.headers().get("content-type").unwrap();
    assert!(content_type.to_str().unwrap().contains("text/event-stream"));

    // ストリーム内容の検証（最初のイベントに type: "content_block_delta" が含まれる）
    let body = resp.text();
    assert!(body.contains("content_block_delta"));
    assert!(body.contains("text"));
}
```

#### 8.3 AC#5: Non-Stream Key Failover テスト

mock upstream が最初のリクエストに 503 を返し、2 つ目の api_key への failover 後に成功することを検証する：

```rust
#[tokio::test]
async fn non_stream_key_failover_recovers_from_503() {
    let attempt = Arc::new(AtomicUsize::new(0));
    let attempt_clone = attempt.clone();

    let upstream_app = axum::Router::new()
        .route("/v1/messages", axum::routing::post(move || {
            let n = attempt_clone.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            async move {
                if n == 0 {
                    // 最初のリクエストは 503
                    (StatusCode::SERVICE_UNAVAILABLE, Json(json!({
                        "error": {"type": "overloaded", "message": "upstream busy"}
                    })))
                } else {
                    // failover 後は成功
                    (StatusCode::OK, Json(json!({
                        "id": "msg_01",
                        "type": "message",
                        "role": "assistant",
                        "content": [{"type": "text", "text": "Hello"}],
                        "model": "m",
                    })))
                }
            }
        }));

    // 2 つの api_keys を設定
    let config = make_mock_config(
        upstream_app,
        true,
        vec![("m", "m")],
        Some(vec!["key1", "key2"]),
        None,
    ).await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&json!({
            "model": "transparent/m",
            "messages": [{"role": "user", "content": "Hello"}],
            "max_tokens": 100,
        }))
        .await;

    assert_eq!(resp.status_code(), StatusCode::OK);
    // failover が発生したことを確認
    assert_eq!(attempt.load(std::sync::atomic::Ordering::SeqCst), 2);
}
```

#### 8.4 AC#6: Stream No-Failover テスト

stream リクエストで 503 が返った場合、failover せずにエラー終端することを検証する：

```rust
#[tokio::test]
async fn stream_no_failover_returns_error() {
    let upstream_app = axum::Router::new()
        .route("/v1/messages", axum::routing::post(move || {
            async move {
                (StatusCode::SERVICE_UNAVAILABLE, Json(json!({
                    "error": {"type": "overloaded", "message": "upstream busy"}
                })))
            }
        }));

    // 2 つの api_keys を設定しても failover しないことを確認
    let config = make_mock_config(
        upstream_app,
        true,
        vec![("m", "m")],
        Some(vec!["key1", "key2"]),
        None,
    ).await;
    let server = build_proxy_test_server(config).await;

    let resp = server
        .post("/v1/messages")
        .json(&json!({
            "model": "transparent/m",
            "messages": [{"role": "user", "content": "Hello"}],
            "stream": true,
            "max_tokens": 100,
        }))
        .await;

    // stream の failover 禁止: 502 またはエラー終端
    assert!(resp.status_code().is_server_error());
}
```

---

### §9 コード品質改善

#### 9.1 n#13: `status_code()` と `IntoResponse` の統合

`IntoResponse` が `status_code()` を呼び出すようリファクタリングし、ステータスコードマッピングの重複保守を解消する：

```rust
// src/http/errors.rs

impl ProxyError {
    /// HTTP ステータスコードを返す（単一の定義場所）
    pub fn status_code(&self) -> u16 {
        match self {
            Self::UnknownProvider(_)
            | Self::InvalidModel(_)
            | Self::MissingField(_)
            | Self::TransformLossy(_) => 400,
            Self::Unauthorized(_) => 401,
            Self::Forbidden(_) => 403,
            Self::QueueFull(_) => 429,
            Self::Upstream(_) | Self::UpstreamError(_) => 502,
            Self::Timeout(_) => 504,
            Self::Internal(_) | Self::Config(_) => 500,
        }
    }

    /// Anthropic 互換エラータイプ文字列を返す
    fn error_type(&self) -> &'static str {
        match self {
            Self::UnknownProvider(_) | Self::InvalidModel(_)
            | Self::MissingField(_) | Self::TransformLossy(_) => "invalid_request_error",
            Self::Unauthorized(_) => "authentication_error",
            Self::Forbidden(_) => "permission_error",
            Self::QueueFull(_) => "rate_limit_error",
            Self::Upstream(_) | Self::UpstreamError(_) => "upstream_error",
            Self::Timeout(_) => "timeout_error",
            Self::Internal(_) | Self::Config(_) => "internal_error",
        }
    }
}

impl IntoResponse for ProxyError {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.status_code())
            .expect("valid status code");
        let body = json!({
            "type": self.error_type(),
            "message": self.to_string(),
        });
        (status, Json(body)).into_response()
    }
}
```

#### 9.2 n#14: ApiFormat 中間型

`routing/mod.rs` の `ApiFormat` enum と `to_llm_api_format()` 関数は、`llm-bridge-core` の型に完全置き換えられるまでの間、既存の `[::STUB::] M5-2 で llm_bridge_core::model::ApiFormat に完全置き換え予定` コメントを維持する。本 RFC では変更しない。

#### 9.3 n#15: `ConcurrencyLimiter::acquire()` の try_acquire 高速パス

RFC 01 の設計にはない `try_acquire_owned()` 高速パスは、パフォーマンス改善として意図的に維持する。注意点として、`try_acquire` 成功時には `current_queue` の増加がないが、これは Semaphore の状態のみで in-flight 管理が完結するため問題ない。以下のコメントを追記する：

```rust
// src/provider/limiter.rs

/// セマフォを取得する（非ブロッキング優先、ブロッキングフォールバック）。
///
/// 1. try_acquire_owned() で非ブロッキング取得を試みる
/// 2. 失敗時のみ queue 残容量チェック → fetch_add → acquire_owned().await
///
/// try_acquire 成功時は current_queue を増加させないが、これは Semaphore
/// の permits のみで in-flight 数が正確に管理されるため問題ない。
pub async fn acquire(&self) -> Result<OwnedSemaphorePermit, LimiterError> {
    // 高速パス: 非ブロッキング
    if let Ok(permit) = self.semaphore.clone().try_acquire_owned() {
        return Ok(permit);
    }
    // 低速パス: queue 待機
    if self.current_queue.load(Ordering::Acquire) >= self.max_queue {
        return Err(LimiterError::QueueFull);
    }
    self.current_queue.fetch_add(1, Ordering::Release);
    let permit = self.semaphore.clone().acquire_owned().await
        .map_err(|_| LimiterError::Closed)?;
    self.current_queue.fetch_sub(1, Ordering::Release);
    Ok(permit)
}
```

#### 9.4 n#16: `record_request` 二重計上リスク

`routes.rs` の `handle_messages` 後処理で `record_request()` を呼ぶ設計は維持する。provider ハンドラ内部では metrics 出力を行わないという契約を明示する：

```rust
// src/http/routes.rs

/// リクエスト完了時のメトリクス記録
///
/// # 注意
///
/// record_request() は handle_messages の後処理で 1 度だけ呼ばれる。
/// provider ハンドラ（handle_transparent, handle_translate）の内部では
/// metrics 出力を行わないこと。二重計上を防ぐため、record_request() の
/// 呼び出しはこの 1 箇所に限定する。
```

---

## Implementation

### 実装順序

以下の順序で実装を進める。各ステップはコンパイルが通る状態を維持する。

| Step | 作業 | 依存 | 推定工数 |
|------|------|------|---------|
| 1 | `#![forbid(unsafe_code)]` + 警告属性追加（lib.rs） | なし | 10分 |
| 2 | `lib.rs` に `pub use lifecycle::ProxyServer` 追加 | なし | 5分 |
| 3 | `config/` モジュール分割（mod.rs / parse.rs / validate.rs） | 既存コード構造 | 1時間 |
| 4 | `util/headers.rs` 抽出 | 既存コード構造 | 30分 |
| 5 | 設定検証補完（url_prefix 正規化、alias 衝突チェック修正） | Step 3 | 1時間 |
| 6 | Feature gate: Cargo.toml + conditional compilation | なし | 1時間 |
| 7 | metrics crate 導入（依存追加 + register_metrics + record_request） | なし | 2時間 |
| 8 | metrics 配線（呼び出し箇所への次元情報伝搬） | Step 7 | 1時間 |
| 9 | コード品質改善（IntoResponse 統合、コメント追加） | なし | 30分 |
| 10 | translate streaming リアルタイム化 | §3 設計, transparent.rs | 2時間 |
| 11 | テスト拡充（AC#3/#4/#5/#6） | Step 10 | 1.5時間 |
| 12 | Lossy handling（llm-bridge-core 依存。別トラック） | llm-bridge-core リリース | — |

### 検証コマンド

```bash
# 各ステップ後の検証
make check-be    # バックエンドのコンパイル確認
make test        # 全テスト実行（新規テスト含む）

# 特別な検証
cargo build --no-default-features  # library 最小ビルド（Step 6 完了後）
cargo clippy --all-targets         # clippy 静的解析
```

### リスクと対策

| リスク | 確度 | 影響 | 対策 |
|--------|------|------|------|
| `metrics-exporter-prometheus` のバージョン非互換 | 低 | 中 | `cargo add` で追加しコンパイル確認。競合時は exporter を分離 |
| `transform_stream()` がチャンク単位未対応 | 中 | 高 | API シグネチャ確認後に実装開始。未対応時は中間 RingBuffer で吸収 |
| Feature gate 分割後のコンパイルエラー連鎖 | 低 | 高 | `cargo check` を逐次実行。`--no-default-features` と `--all-features` の両方で確認 |
| 既存テストが alias 衝突チェック修正で失敗 | 低 | 低 | テスト期待値を修正。変更内容は RFC の契約に沿った正しい動作 |

---

## Appendix

### A. Design Decision Log

| ID | 決定内容 | 根拠 | 決定日 |
|----|---------|------|--------|
| D01 | `#![forbid(unsafe_code)]` を全 crate に適用 | セキュリティ不変条件 | 2026-06-22 |
| D02 | metrics crate 0.24 + Prometheus exporter 採用 | ラベル付き次元とヒストグラムのニーズに適合 | 2026-06-22 |
| D03 | メトリクスプレフィックス `anthropx_` | crate 名との一貫性。観測性能は重視しない方針 | 2026-06-22 |
| D04 | record_request に provider/mode/stream/status/latency_ms の5次元 | RFC 設計の完全実装（過不足なし） | 2026-06-22 |
| D05 | ヒストグラムはデフォルトバケット | カスタム設定は過剰設計と判断 | 2026-06-22 |
| D06 | translate streaming は proxy_sse_stream パターンで全面改修 | TTFU 改善の本質的解決 | 2026-06-22 |
| D07 | Lossy handling 完全解決は llm-bridge-core の API 改善後に実施 | 暫定対応は行わない方針 | 2026-06-22 |
| D08 | server feature 配下にサーバー依存を隔離 | デュアルモード構成の確立 | 2026-06-22 |
| D09 | config を mod.rs/parse.rs/validate.rs に3分割 | RFC 01 設計通り。1517行の責務分離 | 2026-06-22 |
| D10 | 設定検証3項目すべてを完全実装 | 設計契約の完全充足 | 2026-06-22 |
| D11 | AC#4/5/6 は独立 axum::test 関数として追加 | テスト独立性と保守性確保 | 2026-06-22 |

### B. 影響分析マップ

RFC 02 の各変更が既存コードに与える影響：

| 変更 | 影響ファイル | 互換性 |
|------|------------|--------|
| `#![forbid(unsafe_code)]` | `src/lib.rs` | ✅ 既存コードに unsafe は存在しない |
| `pub use lifecycle::ProxyServer` | `src/lib.rs` | ✅ 追加のみ |
| config モジュール分割 | `src/config/mod.rs` → 3ファイル | ⚠️ 内部再編のみ。公開 API は同一 |
| metrics crate 導入 | `Cargo.toml`, `src/observability/metrics.rs` | ❌ AtomicU64 削除。metrics 出力形式変更 |
| metrics 配線 | `src/http/routes.rs`, `src/provider/transparent.rs` | ⚠️ record_request シグネチャ変更 |
| translate streaming | `src/provider/translate.rs` | ❌ 関数内部の全面的書き換え |
| feature gate | `Cargo.toml`, `src/main.rs` | ⚠️ library 利用者は feature 指定が必要に |
| 設定検証修正 | `src/config/mod.rs` → `validate.rs` | ⚠️ 新しいチェック追加のみ（既存通過） |
| IntoResponse 統合 | `src/http/errors.rs` | ✅ 内部リファクタリングのみ |

凡例: ✅ 互換性あり / ⚠️ 注意が必要 / ❌ 破壊的変更あり

### C. 参照

- [RFC 01 — anthropx: LLM Bridge Proxy Server](RFC.md) — 初版設計書
- [REMAININGS.md](docs/REMAININGS.md) — RFC vs 実装の乖離監査レポート
- [DesignTree.json](DesignTree.json) — 設計判断ツリー（11 ノード）
- [CheckList.md](CheckList.md) — RFC 02 要件チェックリスト
- [Tickets.md](Tickets.md) — 全実装チケット一覧
