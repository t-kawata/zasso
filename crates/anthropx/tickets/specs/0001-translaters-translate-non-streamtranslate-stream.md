---
ticket_id: 1
title: translate.rs: translate_non_stream/translate_stream タイムアウト追加
slug: translaters-translate-non-streamtranslate-stream
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# translate.rs: translate_non_stream/translate_stream タイムアウト追加

## Summary

`src/provider/translate.rs` の `translate_non_stream()` に non-stream リクエストタイムアウト（`.timeout(Duration::from_millis(total_ms))`）、`translate_stream()` にストリーム idle timeout（`tokio::time::timeout` による chunk 読み取り終了）を追加する。既に実装済みの `transparent.rs` と同一のパターンを適用する。

## Background

RFC-OMISSIONS-001 の O-002（translate 全般の non-stream タイムアウト未設定）および O-003（translate stream の idle timeout 未設定）に対応する。親チケット P2「リクエスト・ストリームタイムアウト」のうち、P2-1（transparent.rs）は既に実装・レビュー完了済み。本チケットは translate.rs に対する同一パターンの適用を行う。

## Scope

### P2-2-1: translate_non_stream に total_ms タイムアウト追加

- `src/provider/translate.rs`: `translate_non_stream()` 関数内の `.send()` 呼び出し前に `.timeout(Duration::from_millis(total_ms))` を追加
- `src/provider/translate.rs`: `handle_translate()` から `total_ms` を引数経由で注入（`state.config.global.timeouts.total_ms` から取得）
- **タイムアウト値解決**: `state.config.global.timeouts.total_ms` を直接使用（provider 単位の override は現状不要 — YAGNI）

### P2-2-2: translate_stream に read_ms idle timeout 追加

- `src/provider/translate.rs`: `translate_stream()` の `tokio::select!` 内、`upstream_stream.next()` の読み取りを `tokio::time::timeout(timeout_dur, upstream_stream.next())` でラップ
- `src/provider/translate.rs`: `handle_translate()` から `read_ms` を引数経由で注入
- **idle timeout 時の動作**: `tracing::warn!("translate stream idle timeout ({}ms), closing", read_ms)` を出力し、ループを break（chunk 読み取り終了 → ストリームクローズ）
- transparent.rs の `proxy_sse_stream()`（同ファイル:309 行, `tokio::time::timeout(timeout_dur, stream.next())`）と同一パターン

### 共通

- `handle_translate()` のシグネチャ: 変更不要（既に `state: Arc<AppState>` を受け取っており、内部で timeouts にアクセス可能）
- `translate_non_stream()` のシグネチャ: `total_ms: u64` パラメータ追加
- `translate_stream()` のシグネチャ: `read_ms: u64` パラメータ追加
- `use std::time::Duration;` の import 追加（translate.rs には現状なし）

## Non-scope

- Provider 単位のタイムアウト override 機構は実装しない（YAGNI — 現状の設定モデルに `ProviderConfig.timeouts` は存在しない）
- 接続タイムアウト（connect_ms）は既に lifecycle.rs の reqwest::Client builder で設定済み（P1-1 で対応完了）のため、translate.rs では扱わない
- translate_stream の failover 機能は実装しない（transparent.rs の `execute_with_failover` と異なり、translate stream は非対応）
- SSE keepalive と idle timeout の区別は行わない（transparent.rs と同一）

## Investigation

### 証拠1: translate_non_stream に timeout がない（O-002）

`src/provider/translate.rs` 353-361行。`.send()` 呼び出しに `.timeout()` がない：

```rust
let upstream_resp = provider
    .http_client
    .post(&upstream_url)
    .bearer_auth(key)
    .json(&upstream_body)
    .send()                          // ← .timeout(Duration::from_millis(total_ms)) がない
    .await
    .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;
```

参照: `src/provider/transparent.rs` 86-89行（既に timeout 設定済み）：

```rust
let response = cloned
    .bearer_auth(key)
    .timeout(Duration::from_millis(total_ms))
    .send()
    .await;
```

### 証拠2: translate_stream の select! 内に idle timeout がない（O-003）

`src/provider/translate.rs` 574-614行。`tokio::spawn` 内部の `select!` で `upstream_stream.next()` を直接読んでいる：

```rust
loop {
    tokio::select! {
        biased;
        _ = cancel.cancelled() => {
            break;
        }
        chunk = upstream_stream.next() => {    // ← idle timeout 未設定
            // ...
        }
    }
}
```

参照: `src/provider/transparent.rs` 136-155行（既に idle timeout 設定済み）：

```rust
loop {
    tokio::select! {
        biased;
        _ = cancel.cancelled() => break,
        chunk = tokio::time::timeout(timeout_dur, stream.next()) => {
            match chunk {
                // ...
                Err(_) => {
                    tracing::warn!("stream idle timeout ({}ms), closing", read_ms);
                    break;
                }
            }
        }
    }
}
```

### 証拠3: タイムアウト設定値の所在

`src/config/mod.rs` 271-281行 — `TimeoutConfig` 構造体：

```rust
pub struct TimeoutConfig {
    pub connect_ms: u64,  // 接続（デフォルト 3000ms）
    pub read_ms: u64,     // 読み取り idle（デフォルト 600000ms = 10分）
    pub total_ms: u64,    // 合計（デフォルト 600000ms = 10分）
}
```

`handle_translate()` は既に `state: Arc<AppState>` を持っており、
`state.config.global.timeouts.total_ms` / `state.config.global.timeouts.read_ms`
でアクセス可能。

### 証拠4: テストとの整合性

- `translate_non_stream` / `translate_stream` には現状のテストコード内で直接テストする async test は存在しない
- 既存の unit tests は全て純粋関数（`scan_anthropic_request`, `process_lossy_events`, `transform_chunk` 等）のテスト
- `#[tokio::test]` で mock サーバーを立ててタイムアウト動作を確認するのが現実的

## Test Plan

### ユニットテスト計画

- P2-2-1: translate_non_stream timeout
  - **正常系**: `handle_translate` 統合テスト — mock upstream が total_ms 以内に応答 → 成功を確認
  - **異常系**: mock upstream が total_ms=100ms で応答せず → `reqwest::Error` が `is_timeout()` を満たすことを確認 → `ProxyError::UpstreamError` に変換される
  - **境界値**: total_ms=0 のケース — 設定バリデーション（validate.rs）で弾かれることを確認（既存テストでカバー）

- P2-2-2: translate_stream idle timeout
  - **正常系**: mock upstream が read_ms 未満の間隔でチャンクを送信 → ストリーム正常継続
  - **異常系**: mock upstream が read_ms=100ms でチャンク間1000msの遅延 → `tracing::warn!` が出力されストリーム切断
  - **正常系**: cancel トークンが発火 → 即時中断（既存動作、変更なし）

- **モック外部依存**: テスト用の HTTP モックサーバー（`tests/mock_server.rs` 等）が必要。または wiremock 等のクレートを利用（既存のテストヘルパーを確認）。

### ユニットテスト不可能な項目（例外）

- `handle_translate` のエンドツーエンド統合テスト: テストコードからの呼び出しは可能だが、実際の upstream API との結合テストには API キーが必要なため CI ではスキップする（`#[ignore]` マークまたは feature flag で分離）。

## Boy Scout Rule — 翻訳可能性計画

### translate_non_stream — .send() 前の .timeout() 追加

```rust
// 変更前（353-361行）
let upstream_resp = provider
    .http_client
    .post(&upstream_url)
    .bearer_auth(key)
    .json(&upstream_body)
    .send()
    .await
    .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;

// 変更後
let upstream_resp = provider
    .http_client
    .post(&upstream_url)
    .bearer_auth(key)
    .json(&upstream_body)
    .timeout(Duration::from_millis(total_ms))  // ← 追加
    .send()
    .await
    .map_err(|e| ProxyError::UpstreamError(e.to_string()))?;
```

### translate_stream — select! 内 idle timeout

```rust
// 変更前（582行）
chunk = upstream_stream.next() => {

// 変更後
chunk = tokio::time::timeout(
    Duration::from_millis(read_ms),
    upstream_stream.next(),
) => {
    match chunk {
        Ok(inner) => match inner { /* 既存ロジック */ },
        Err(_) => {
            tracing::warn!("translate stream idle timeout ({}ms), closing", read_ms);
            break;
        }
    }
}
```

### 追加の翻訳可能性改善

- スコープ外だが、既存コードの翻訳可能性は良好（関数名は動詞句、変数名はドメイン概念）
- 今回の変更で触る範囲では改善点なし

## Acceptance Criteria

- [ ] translate_non_stream に `.timeout(total_ms)` が追加され、total_ms 超過時に reqwest::Error::Timeout が発生すること
- [ ] translate_stream の chunk 読み取りに `tokio::time::timeout(read_ms)` が追加され、read_ms 超過時にストリームが切断されること
- [ ] transparent.rs と同一パターン（`.timeout()` の前後配置、idle timeout の warn ログ書式）であること
- [ ] `handle_translate()` から timeouts 値が正しく伝播されること
- [ ] `cargo check` / `cargo clippy -- -D warnings` / `cargo fmt` が全てパスすること
- [ ] 既存テストが全て通過すること

## Notes

- plan: /plan-ticket P2-2 で計画策定
- implementation: /start-ticket P2-2 で実装
- review: /review-ticket P2-2 でレビュー

### 依存関係

- 入力元I/O: P1-1（reviewed）— reqwest::Client の builder 設定。同一の http_client を使用するため整合性確認済
- P2-1（reviewed）— transparent.rs の同一パターン実装。コードパターン（`.timeout()`, `tokio::time::timeout`）は本チケットの直接的な参考実装
- 循環依存: なし

### parentOmissionId

O-002（translate 全般の non-stream timeout）, O-003（translate stream の idle timeout）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
