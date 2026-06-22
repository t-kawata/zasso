# anthropx: RFC 設計に対する未達・乖離・課題一覧

> **生成元:** crates/anthropx/RFC.md と実装コードの網羅的突合監査
> **監査日:** 2026-06-22
> **RFC バージョン:** 1.0
> **対象:** crates/anthropx/src/ (21 files), crates/anthropx/tests/ (2 files)

---

## 目次

1. [Blocker 相当 (0)](#blocker)
2. [Major 相当 (5)](#major)
3. [Minor 相当 (7)](#minor)
4. [Nit 相当 (4)](#nit)
5. [テスト充足状況](#テスト充足状況)
6. [チケット別実装消化確認](#チケット別実装消化確認)
7. [優先順位つき改善推奨](#優先順位つき改善推奨)

---

## Blocker

該当なし。

---

## Major

### M#1: `#![forbid(unsafe_code)]` 未適用 — セキュリティ不変条件未達成

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/lib.rs` |
| **RFC 該当箇所** | Appendix C (`#![forbid(unsafe_code)]`) |
| **発見日** | 2026-06-22 |
| **優先度** | Major |

#### 現状

`src/lib.rs` に crate レベルの属性が一切設定されていない。RFC Appendix C で明示された以下の3属性がすべて欠落している：

```rust
// RFC 指定（未実装）
#![forbid(unsafe_code)]
#![warn(rust_2024_compatibility, missing_docs)]
#![warn(missing_debug_implementations)]
```

#### 影響

- `unsafe` コードの混入をコンパイル時に検出できない
- 公開 API のドキュメント欠落を警告できない
- `Debug` 実装の欠落を見逃す

#### 修正方法

`src/lib.rs` の冒頭に以下を追加する：

```rust
#![forbid(unsafe_code)]
#![warn(rust_2024_compatibility)]
#![warn(missing_debug_implementations)]
```

`missing_docs` はクレート内の全公開アイテムに doc コメントを追加するまで有効化できないため、段階的導入を検討する。

#### 関連チケット

M0-1, M0-2（型定義チケットは完了済みだが属性設定が漏れている）

---

### M#2: `metrics` crate (0.24) 未使用 — メトリクス次元の欠落

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `Cargo.toml`, `src/observability/metrics.rs` |
| **RFC 該当箇所** | §10 可観測性, 依存クレート一覧 |
| **発見日** | 2026-06-22 |
| **優先度** | Major |

#### 現状

RFC は `metrics = "0.24"` crate の `counter!` / `histogram!` マクロを使用し、provider/mode/stream/status のラベル付きカウンタとレイテンシヒストグラムを定義する設計だった。実装は生の `AtomicU64` グローバル変数で代替している。

```
// RFC 指定
metrics::counter!("llm_bridge_requests_total",
    "provider" => provider,
    "mode" => mode,
    "stream" => stream.to_string(),
    "status" => status.to_string(),
).increment(1);

metrics::histogram!("llm_bridge_request_latency_ms",
    "provider" => provider,
    "mode" => mode,
).record(latency_ms);

// 実装（代替）
static TOTAL_REQUESTS: AtomicU64 = AtomicU64::new(0);
TOTAL_REQUESTS.fetch_add(1, Ordering::Relaxed);
```

#### 乖離の詳細

| 観点 | RFC 設計 | 実装 |
|------|---------|------|
| **メトリクス命名** | `llm_bridge_*` | `anthropx_*` |
| **カウンタ次元** | provider, mode, stream, status | ラベルなし（status 区分のみ） |
| **レイテンシ** | `llm_bridge_request_latency_ms` ヒストグラム | 未実装 |
| **record_request シグネチャ** | `record_request(provider, mode, stream, status, latency_ms)` | `record_request(status: u16)` |
| **exporter 統合** | `metrics-exporter-prometheus` 等と統合可能 | 独自テキスト形式のみ |
| **依存クレート** | `metrics = "0.24"` | `metrics` crate なし |

#### 影響

- provider 別・モード別のリクエスト統計が取得不可能
- レイテンシの p50/p95/p99 が計測不可能
- Prometheus 等の標準エコシステムとの統合に追加作業が必要
- failover metrics も provider ラベルなし

#### 修正の難しさ

**中程度。** `metrics` crate の追加と全 `record_request()` 呼び出し箇所への次元情報伝搬が必要。provider/mode/stream 情報は `handle_messages` のスコープに存在するため、そこまでの配線が主な作業。

#### 関連実装

- `src/observability/metrics.rs` — `record_request(status)` と `record_failover()` の2関数のみ
- `src/http/routes.rs` L172-178 — `handle_messages` 内で `metrics::record_request(status)` 呼び出し
- `src/provider/transparent.rs` L84-86 — `metrics::record_failover()` 呼び出し

---

### M#3: Translate mode SSE がリアルタイムストリーミングではない

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/provider/translate.rs` (`translate_stream` → `collect_and_transform_stream`) |
| **RFC 該当箇所** | §5.2 (Translate mode stream path), §8 (SSE ストリーム処理) |
| **発見日** | 2026-06-22 |
| **優先度** | Major |

#### 現状

Translate mode の streaming パスは、upstream からの SSE チャンクを **すべて `Vec<u8>` に蓄積**し、ストリーム終了後に `transform_stream()` で一括変換してからクライアントに送信している。

```
// 現在のフロー（蓄積型）
Upstream SSE chunk1 → │
Upstream SSE chunk2 → │→ Vec<u8> buffer → [stream end]
Upstream SSE chunk3 → │                      ↓
                                       transform_stream()
                                            ↓
                                     一度にクライアント送信

// RFC が要求するフロー（リアルタイム型）
Upstream SSE chunk1 → transform_stream() → 即時クライアント送信
Upstream SSE chunk2 → transform_stream() → 即時クライアント送信
Upstream SSE chunk3 → transform_stream() → 即時クライアント送信
```

#### 影響

- クライアントは最初のトークンを受信するまで full response の完了を待つ
- 長時間生成（数分）のシナリオでストリーミングの利点（TTFU: Time To First Token）が完全に失われる
- ユーザー体験が非ストリーミングと同等になる

#### 原因

`collect_and_transform_stream()` (`provider/translate.rs` L377-424) が全チャンクを受信してから `transform_stream()` を一度だけ呼び出している。RFC §8 が示す `tokio::select!` によるチャンク単位の変換＋チャネル送信のパターンが実装されていない。

#### 修正方法

`translate_stream()` を以下のように書き換える：

1. upstream からの `bytes_stream()` をチャンクごとに処理
2. 各チャンクを `transform_stream()` に逐次投入
3. 変換結果の SSE event を `Body::new_channel()` の tx 側に即時送信
4. `CancellationToken` で中断可能にする

処理パターンは `provider/transparent.rs` の `proxy_sse_stream()` を参考にする。

#### 参考実装

- Transparent mode の `proxy_sse_stream()` (`src/provider/transparent.rs` L123-160) は正しくリアルタイム中継している

---

### M#4: Lossy handling 契約未達成 — `allow_lossy=true` でもエラーを返す

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/provider/translate.rs` (non-stream path L158-177, stream path L304-320) |
| **RFC 該当箇所** | §6 (Lossy Translation 制御), Appendix D (Q17 error_lossy_continue) |
| **発見日** | 2026-06-22 |
| **優先度** | Major |

#### 現状

RFC §6 の lossy 決定テーブル：

| allow_lossy | error_lossy_continue | Error 級 | Warn 級 | Info 級 |
|-------------|---------------------|---------|--------|--------|
| false | false | 400拒否 | 続行+metrics | 続行+debug |
| true | false | 400拒否 | 続行+metrics | 続行+debug |
| true | true | 続行+metrics | 続行+metrics | 続行+debug |

`allow_lossy=true + error_lossy_continue=true` の場合、Error 級 lossy でも続行し `tracing::warn!` + metrics を出力する契約。

実装では `should_reject()` が `false` を返すケースでも、依然として `Err(ProxyError::TransformLossy(...))` を返している：

```rust
// provider/translate.rs L165-176
Err(TransformError::LossyDowngrade(msg)) => {
    warn!(
        "lossy downgrade suppressed by allow_lossy ({allow_lossy}, {error_lossy_continue}): {msg}"
    );
    // ← ここで continue せず、依然として Err を返している
    return Err(ProxyError::TransformLossy(format!(
        "{msg} (allow_lossy={allow_lossy}, error_lossy_continue={error_lossy_continue})"
    )));
}
```

#### 原因

コメントに記載の通り「`llm-bridge-core` は変換不能データを含む body を返せない」。`TransformError::LossyDowngrade` が発生した時点で `llm_bridge_core::transform::anthropic_to_openai()` は `Err` を返しており、部分的な変換結果を取得できない。そのため `allow_lossy=true` でも続行するための入力データが存在しない。

#### 解決の方向性

根本的には `llm-bridge-core` 側で「lossy 警告付き成功 (`Ok` with warnings)」を返す API が必要。現状では以下のいずれかの対応となる：

1. **短期**: RFC の lossy 契約を「実装制約により `allow_lossy` は lossy 抑制に使えません」と文書化し、`LossyLevel` を将来の拡張用として維持する
2. **中期**: `llm-bridge-core` に lossy-tolerant 変換 API の追加を依頼し、対応後に契約を満たす実装入れ替え
3. **限定的対応**: `allow_lossy=true` 時に lossy フィールドを事前に除去した body で再試行する（ラウンドトリップ増加）

#### 関連ファイル

- `src/config/mod.rs` L402-425 (`LossyLevel::should_reject`)
- `src/provider/translate.rs` L158-177 (lossy 発生箇所)

---

### M#5: metrics 設計の乖離（M#2 補足）— record_request の引数不足

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/observability/metrics.rs`, `src/http/routes.rs` |
| **RFC 該当箇所** | §10 (構造化ログ), §3.3 (handle_messages) |
| **発見日** | 2026-06-22 |
| **優先度** | Major |

#### 現状

RFC §10 で定義された `record_request()` は以下のシグネチャを持つ設計だった：

```rust
// RFC 設計
pub fn record_request(
    provider: &str,
    mode: &str,
    stream: bool,
    status: u16,
    latency_ms: u64,
);
```

実装は以下：

```rust
// 実装
pub fn record_request(status: u16);
```

`provider`, `mode`, `stream`, `latency_ms` の4引数すべてが欠落している。また RFC の `tracing::info!` 構造化ログの全フィールドは以下の通り：

```
request_id, provider, public_model, upstream_model, mode, stream,
selected_key_index, status_code, latency_ms, lossy_applied, retry_count
```

実装は `tracing::info_span!` に `request_id`, `provider`, `model`, `stream` の4フィールドのみを設定している。

#### `ProxyServer` 再公開の欠落

RFC Appendix B のライブラリ利用例：

```rust
use anthropx::{AppConfig, ProxyServer};
```

現在は `ProxyServer` が `lib.rs` から `pub use` されていない。利用者は以下を必要とする：

```rust
use anthropx::lifecycle::ProxyServer;  // 回避策
```

`lib.rs` に `pub use lifecycle::ProxyServer;` を追加する必要がある。

---

## Minor

### m#6: Feature gate 不備 — デュアルモード設計がコンパイル不可能

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `Cargo.toml`, `src/main.rs` |
| **RFC 該当箇所** | §1.1 (デュアルモード構成, dependencies table), §9 (binary entrypoint) |
| **発見日** | 2026-06-22 |
| **優先度** | Minor |

#### 現状

RFC の依存クレート対比表では `clap`, `axum`, `reqwest`, `tokio` (full), `futures` を `server` feature の下でのみ有効化すると定義している。

| クレート | RFC 指定 | 実装 |
|----------|---------|------|
| `clap` | 要 server feature | ⚠️ unconditional |
| `futures` | 要 server feature | ⚠️ unconditional |
| `http` | 要 server feature | ⚠️ unconditional |
| `tokio-util` | 要 server feature | ⚠️ unconditional |
| `tokio-stream` | — (RFC 未記載) | ⚠️ unconditional |
| `tracing-subscriber` | — (RFC 未記載) | ⚠️ unconditional |

さらに `src/main.rs` に `#[cfg(feature = "server")]` がないため、`cargo build --no-default-features` では `#[tokio::main]` の展開に必要な `tokio/rt` と `tokio/macros` が不足しコンパイルに失敗する。

```text
error: the `#[tokio::main]` macro requires the `rt` feature
```

#### 影響

- `cargo build --no-default-features` でライブラリとしての利用が不可
- RFC §1.1 の中核要件「設定型のみの軽量ライブラリ」が達成できない
- 依存クレート数が不必要に増加

#### 修正方針

1. `Cargo.toml`: `clap`, `futures`, `http`, `tokio-util`, `tokio-stream`, `tracing-subscriber` を optional に変更し `server` feature で有効化
2. `src/main.rs`: `#[cfg(feature = "server")]` を追加
3. 各モジュールで server feature 非依存の部分と依存部分を整理

```toml
# 修正イメージ
[dependencies]
clap = { version = "4", features = ["derive"], optional = true }
futures = { version = "0.3", optional = true }

[features]
default = ["server"]
server = ["dep:clap", "dep:futures", "dep:http", ...]
```

---

### m#7: `AppConfig::validate()` — 複数の検証項目未実装

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/config/mod.rs` (`validate()` メソッド) |
| **RFC 該当箇所** | §2.1 (設定検証ルール) |
| **発見日** | 2026-06-22 |
| **優先度** | Minor |

#### 未実装の検証項目

| # | 検証項目 | RFC 参照 | 状態 | 詳細 |
|---|---------|----------|------|------|
| 1 | `url_prefix` 正規化（先頭 `/` 付与、末尾 `/` 除去） | §2.1 #7 | ❌ | 正規化処理自体が存在しない |
| 2 | global alias と provider alias の競合ログ出力 | §2.1 #5 | ❌ | 許容する設計だがログもない |
| 3 | alias **key** 同士の衝突チェック | §2.1 #4 | ⚠️ | alias の **value** と public model 名を比較している（ロジック不一致） |

#### `url_prefix` 正規化の詳細

RFC §2.1 #7:

> `url_prefix` の正規化（先頭 / 付与、末尾 / 除去）

例:

- `"proxy"` → `"/proxy"`
- `"/prefix/"` → `"/prefix"`
- `""` → `""`

この正規化は `AppConfig::validate()` 内で `self.global.url_prefix` を書き換える必要がある。現在は `build_router()` で prefix が空の場合に nest しないロジックになっているが、正規化自体は行われていない。

#### alias 衝突チェックのロジック誤り

RFC で意図されたチェック:

- `model_aliases` の **key** が `models[*].public` または他の alias key と衝突しないこと

現在の実装:

- `model_aliases` の **value** が `models[*].public` のいずれかに一致し、かつ key と value が異なる場合にエラー

```rust
// 現在のロジック（config/mod.rs L167-174）
for (alias_key, alias_value) in &provider.model_aliases {
    if public_names.contains(alias_value.as_str()) && alias_key != alias_value {
        errors.push(ConfigError::DuplicateAlias(alias_key.clone(), alias_value.clone()));
    }
}
```

想定される正しいロジック:

```rust
// 修正イメージ: alias key 同士の衝突チェック
for alias_key in provider.model_aliases.keys() {
    if public_names.contains(alias_key.as_str()) {
        errors.push(ConfigError::DuplicateAlias(alias_key.clone(), "..."));
    }
}
```

---

### m#8: モジュール分割が RFC の設計と異なる

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/config/mod.rs`, `src/util/mod.rs` |
| **RFC 該当箇所** | §1.2 (モジュール構成), Tickets.md フェーズ5 |
| **発見日** | 2026-06-22 |
| **優先度** | Minor |

#### 現状

RFC で規定された3ファイルの責務が親ファイルに統合されており、単一責任原則を満たしていない。

| RFC 指定のファイル | 責務 | 実装 | 備考 |
|-------------------|------|------|------|
| `config/mod.rs` | 型定義のみ | `config/mod.rs` (全責務を含む、1517行) | 型定義・検証・TOML読込・テストが混在 |
| `config/parse.rs` | TOML 読込 | （同上に統合） | — |
| `config/validate.rs` | 設定検証 | （同上に統合） | — |
| `util/mod.rs` | モジュール宣言のみ | `util/mod.rs` (build_upstream_headers + HOP_BY_HOP 定数) | RFC の `util/headers.rs` 相当が含まれる |
| `util/headers.rs` | header フィルタ | （同上に統合） | — |

`config/mod.rs` は 1517 行に達しており、CLAUDE.md のファイル上限（800行）を超過している。

---

### m#9: AC#5/AC#6 failover テストが RFC の受け入れ基準を満たしていない

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `tests/mock_server.rs` (`non_stream_key_failover_handles_error`, `stream_no_failover_returns_error`) |
| **RFC 該当箇所** | §12 受け入れ基準, Tickets.md M4-3 |
| **発見日** | 2026-06-22 |
| **優先度** | Minor |

#### 現状

RFC の AC#5 と AC#6 が要求する検証内容：

| AC | RFC 要求 | 実装のテスト |
|----|---------|------------|
| AC#5 | 503 を返す mock + 2 つの api_keys → failover 後 success | ❌ mock upstream なし、単に upstream 不在でエラーになることのみ確認 |
| AC#6 | 503 を返す mock + stream → エラー終端 | ❌ 同上 |

#### 期待されるテスト形状

```rust
// AC#5: 期待されるテスト（mock が 503 を返す）
async fn non_stream_key_failover_recovers_from_503() {
    // Arrange
    let attempt = Arc::new(AtomicUsize::new(0));
    let upstream_app = axum::Router::new().route("/{*path}", axum::routing::post({
        let attempt = attempt.clone();
        move || async move {
            let n = attempt.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                StatusCode::SERVICE_UNAVAILABLE  // 最初は 503
            } else {
                (StatusCode::OK, Json(mock_response()))  // failover 後成功
            }
        }
    }));
    let config = make_mock_config(upstream_app, true, vec![("m", "m")], None, None).await;
    // api_keys を2つ設定（config の keys に2つ）
    let server = build_proxy_test_server(config).await;
    let resp = server.post("/v1/messages").json(&json!({"model": "mock/m"})).await;
    assert_eq!(resp.status_code(), 200);  // failover 後成功
}
```

---

### m#10: Translate non-stream E2E テストが応答形式を検証していない

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `tests/mock_server.rs` L520-589 (`translate_non_stream_proxies_via_openai_wire`) |
| **RFC 該当箇所** | §12 AC#3 |
| **発見日** | 2026-06-22 |
| **優先度** | Minor |

#### 現状

テストは translate ルーティングがエラーにならないことのみ確認し、**応答が正しく Anthropic メッセージ形式に変換されているかを検証していない**：

```rust
// 現状: 範囲内チェックのみ
let status_code = resp.status_code().as_u16();
assert!(
    (200..600).contains(&status_code),
    "translate routing returned unexpected status {status_code}"
);
```

応答の JSON body が Anthropic 互換スキーマ（`type: "message"`, `content[].type: "text"` 等）に準拠していることを検証する必要がある。

---

### m#11: alias 検証ロジックが RFC の不変条件と異なる

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/config/mod.rs` L165-174 (`validate()` の alias チェック) |
| **RFC 該当箇所** | Tickets.md M1-2, RFC §2.1 #3 |
| **発見日** | 2026-06-22 |
| **優先度** | Minor |

#### 現状

Tickets.md M1-2 の不変条件:

> `model_aliases` の値が public model 名と衝突しない

実装は **alias の値（value）** と public model 名を比較している。RFC および一般的な「alias 衝突」の意味は **alias のキー（key）** が既存の public model 名または他の alias key と重複しないことである。

```rust
// 誤ったチェック（value と public 名を比較）
for (alias_key, alias_value) in &provider.model_aliases {
    if public_names.contains(alias_value.as_str()) && alias_key != alias_value {
        // alias_value（例: "gpt-4"）が public name（例: "gpt-4"）と一致
        // → 正しいが、チェックすべきは alias_key の重複
    }
}
```

#### 修正方針

```rust
// 正しいチェック: alias key が public model 名と重複しない
for alias_key in provider.model_aliases.keys() {
    if public_names.contains(alias_key.as_str()) {
        errors.push(ConfigError::DuplicateAlias(alias_key.clone(), alias_key.clone()));
    }
}
```

---

### m#12: Error 級 lossy 続行時の metrics 記録未実装

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/provider/translate.rs` L304-320 |
| **RFC 該当箇所** | §6 (Lossy Translation), Appendix D (Q17) |
| **発見日** | 2026-06-22 |
| **優先度** | Minor |

#### 現状

RFC §6 では Error 級 lossy 続行時（`allow_lossy=true, error_lossy_continue=true`）に以下を要求している：

1. `tracing::warn!` 出力（✅ 実装済み）
2. `llm_bridge_lossy_total` カウンタ増加（❌ 未実装）
3. `span.record("lossy_applied", true)`（❌ 未実装）

現在は `tracing::warn!` のみ出力され、メトリクスカウンタの増加も span への記録も行われていない。ただし M#4 の通りこのパス自体が `Err` を返すため、本来このロジックに到達しない状態である。M#4 の解決とセットで実装する必要がある。

#### 関連ファイル

- `src/observability/metrics.rs` — `llm_bridge_lossy_total` カウンタ未定義
- `src/provider/translate.rs` L165-176 (warn ログは出力)

---

## Nit

### n#13: `ProxyError::status_code()` と `IntoResponse` の重複保守

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/config/mod.rs` (status_code メソッド), `src/http/errors.rs` (IntoResponse) |
| **発見日** | 2026-06-22 |
| **優先度** | Nit |

#### 現状

`status_code()` (`config/mod.rs` L496-514) と `IntoResponse` (`http/errors.rs` L14-87) が同一のステータスコードマッピングを独立した match 式で定義している。将来 variant が追加されたとき、2箇所の更新漏れが発生しうる。

#### 改善案

`IntoResponse` が `status_code()` を呼び出すようにリファクタリングする：

```rust
impl IntoResponse for ProxyError {
    fn into_response(self) -> Response {
        let status = StatusCode::from_u16(self.status_code()).unwrap();
        let (error_type, message) = self.error_type_and_message();
        // ...
    }
}
```

---

### n#14: `to_llm_api_format()` が中間型を経由する

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/routing/mod.rs` (ApiFormat, to_llm_api_format) |
| **発見日** | 2026-06-22 |
| **優先度** | Nit |

#### 現状

RFC §1.3 の `resolve_api_format()` は直接 `llm_bridge_core::model::ApiFormat` を返す設計。実装はローカル `ApiFormat` enum を一度経由し、`to_llm_api_format()` で変換する2段階構造。

```rust
// 現在: 2段階
let api_format = resolve_api_format(&wire_api, &base_url); // ローカル ApiFormat
let llm_format = to_llm_api_format(&api_format);           // LlmApiFormat

// RFC 設計: 直接 LlmApiFormat を返す
let llm_format = resolve_api_format(&wire_api, &base_url); // LlmApiFormat
```

ファイル頭に `[::STUB::] M5-2 で llm_bridge_core::model::ApiFormat に完全置き換え予定` のコメントあり。

---

### n#15: `ConcurrencyLimiter::acquire()` の try_acquire 高速パス

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/provider/limiter.rs` L51-75 |
| **RFC 該当箇所** | §7 (並行性制御) |
| **発見日** | 2026-06-22 |
| **優先度** | Nit |

#### 現状

RFC §7 の設計は以下のシーケンス：

```
queue 残容量チェック → fetch_add → acquire_owned().await
```

実装はその前に `try_acquire_owned()` による非ブロッキングパスを追加している：

```
try_acquire_owned() → 成功: 即返却
                   → 失敗: queue 残容量チェック → fetch_add → acquire_owned().await
```

これはパフォーマンス改善であり機能的問題はないが、RFC からの逸脱である。`try_acquire` に成功した場合に `current_queue` の増加がない点に注意（`acquire_owned()` パスでは `fetch_add/fetch_sub` が行われる）。

---

### n#16: `record_request` の二重計上リスク

| 項目 | 内容 |
|------|------|
| **該当ファイル** | `src/http/routes.rs` L172-178 |
| **発見日** | 2026-06-22 |
| **優先度** | Nit |

#### 現状

`handle_messages` の後処理で `record_request(status)` を呼んでいるが、`handle_transparent` / `handle_translate` 内部でも metrics 出力をする可能性がある。現在の実装では各 provider handler 内では metrics 出力をしていないが、将来的な追加時に気付かず二重計上するリスクがある。

`execute_with_failover` 内で `record_failover()` は呼ばれている（これはカウンタが独立しているため問題ない）。

---

## テスト充足状況

### RFC 受け入れ基準（AC）の達成状況

| # | 基準 | 状態 | テスト | 備考 |
|---|------|------|--------|------|
| AC#1 | transparent non-stream | ✅ | `mock_server.rs` L378-402 + `routes.rs` L389-396 | mock upstream あり |
| AC#2 | transparent stream | ✅ | `mock_server.rs` L406-439 | SSE 中継確認 |
| AC#3 | translate non-stream | ⚠️ | `mock_server.rs` L521-589 | ルーティング確認のみ、変換結果未検証 |
| AC#4 | translate stream | ❌ | — | 変換パイプラインの統合テストなし |
| AC#5 | non-stream key failover | ❌ | `mock_server.rs` L241-264 | mock 503 なし、upstream 不在のみ確認 |
| AC#6 | stream no-failover | ❌ | `mock_server.rs` L272-295 | 同上 |
| AC#7 | /v1/models sorted | ✅ | `mock_server.rs` L135-152 | — |
| AC#8 | provider/model split | ✅ | `mock_server.rs` L159-170 | — |
| AC#9 | queue overflow → 429 | ✅ | `mock_server.rs` L443-464, L467-513 | in-flight / queue 両方確認 |
| AC#10 | /metrics, /healthz | ✅ | `mock_server.rs` L119-128 | — |

### ユニットテストカバレッジ

| モジュール | 状態 | 備考 |
|-----------|------|------|
| `cli.rs` | ✅ | 2 tests |
| `config/mod.rs` | ✅ | 30+ tests (型定義、シリアライズ、バリデーション) |
| `routing/mod.rs` | ✅ | 12 tests (parse, resolve, api_format) |
| `routing/scheduler.rs` | ✅ | 7 tests (round-robin, seed, multi-thread) |
| `provider/limiter.rs` | ✅ | 6 tests (acquire/release, queue full, error types) |
| `provider/transparent.rs` | ✅ | 4 tests (filter headers, Send bounds) |
| `provider/translate.rs` | ✅ | 8 tests (TransformError mapping, api_format, lossy) |
| `util/mod.rs` | ✅ | 4 tests (build_upstream_headers) |
| `util/ids.rs` | ✅ | 2 tests (request_id) |
| `observability/metrics.rs` | ✅ | 8 tests (counter operations) |
| `http/router.rs` | ✅ | 4 tests (endpoints, 404, url_prefix) |
| `http/routes.rs` | ✅ | 6 tests (healthz, models, handle_messages) |
| `http/errors.rs` | ✅ | 13 tests (all ProxyError variants) |
| `http/auth.rs` | ✅ | 9 tests (client auth, upstream headers) |
| `lifecycle.rs` | ✅ | 3 tests (provider clients, Send bound) |
| `mock_server.rs` | ✅ | 11 integration tests |

---

## チケット別実装消化確認

全 22 チケットの「完了」状態確認：

| チケット | 状態 | 確認事項 |
|---------|------|---------|
| M0-1 | ✅ | 6 structs + Default/Deserialize + BTreeMap 完成 |
| M0-2 | ✅ | 6 enum/struct + thiserror + Display |
| M1-1 | ✅ | 5 pure functions + tests |
| M1-2 | ⚠️ | validate 実装済みだが一部検証項目欠落（m#7） |
| M2-1 | ✅ | KeyScheduler + round-robin + seed |
| M2-2 | ✅ | ConcurrencyLimiter + try_acquire 高速パス有り（n#15） |
| M2-3 | ✅ | from_toml + cli parser |
| M3-1 | ⚠️ | ProxyError IntoResponse 有り、`#![forbid(unsafe_code)]` なし（M#1） |
| M3-2 | ✅ | 2 middleware layers + test |
| M3-3 | ⚠️ | 4 endpoints 有り、metrics 次元不足（M#2/M#5） |
| M3-4 | ✅ | Transparent mode + SSE streaming |
| M3-5 | ⚠️ | Translate mode 実装済みだが streaming 蓄積型（M#3）+ lossy 不完全（M#4） |
| M4-1 | ✅ | ProxyServer::start + ServerHandle |
| M4-2 | ⚠️ | main.rs binary entrypoint（feature gate 不備 m#6） |
| M4-3 | ⚠️ | Integration tests 有り、AC#4/#5/#6 不足（m#9/m#10） |
| M4-4 | ⚠️ | 実プロバイダーテスト有り、integration-test feature 分離済み |
| M5-1 | ⚠️ | Translate 本実装有り、M#3/M#4 の課題あり |
| M5-2 | ✅ | ProviderClient 統合 + build_provider_clients |
| M5-3 | ⚠️ | register_metrics/record_request 有り、metrics 実装が代替（M#2） |
| M5-4 | ⚠️ | integration-test feature 有り、AC 不足（m#9） |

---

## 優先順位つき改善推奨

### 即時対応推奨（セキュリティ・設計不変条件）

| 優先順位 | 課題 | 推定工数 | リスク |
|---------|------|---------|--------|
| 1 | M#1: `#![forbid(unsafe_code)]` 追加 | 10分 | なし（属性追加のみ） |
| 2 | m#6: feature gate 修正 | 0.5日 | コンパイル条件の整理 |
| 3 | m#7: validate 不足項目の追加（url_prefix 正規化, alias 衝突） | 0.5日 | 設定互換性 |

### 短期対応推奨（機能完全性）

| 優先順位 | 課題 | 推定工数 | リスク |
|---------|------|---------|--------|
| 4 | M#2/M#5: `metrics` crate 導入と次元追加 | 2-3日 | metrics 互換性 |
| 5 | M#3: translate streaming リアルタイム化 | 1日 | SSE チャンク変換の設計 |
| 6 | M#4: lossy handling 契約達成 | 1-2日 | llm-bridge-core 側対応が必要か調査 |

### 中長期対応

| 優先順位 | 課題 | 推定工数 |
|---------|------|---------|
| 7 | m#8: config/mod.rs の分割 (800行超過) | 0.5日 |
| 8 | m#9/m#10: 不足テストの追加（AC#4/#5/#6） | 1日 |
| 9 | n#13: status_code 重複解消 | 0.5日 |
| 10 | n#14: ApiFormat 中間型解消 | 0.5日 |

---

*本ドキュメントは RFC v1.0 と 2026-06-22 時点の実装の突合結果に基づく。*
