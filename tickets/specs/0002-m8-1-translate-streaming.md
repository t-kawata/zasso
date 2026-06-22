---
ticket_id: 2
title: M8-1: Translate streaming リアルタイム化
slug: m8-1-translate-streaming
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0002-m8-1-translate-streaming/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0002-m8-1-translate-streaming/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0002-m8-1-translate-streaming/review.md
---
# M8-1: Translate streaming リアルタイム化

## Summary

translate stream の蓄積型一括変換（`collect_and_transform_stream()`）を、チャンク単位逐次変換 + 即時送信（`proxy_sse_stream()` パターン）に全面改修する。TTFU（Time To First Token）を full response 完了時から最初のチャンク受信時に短縮する。

## Background

現在の `translate_stream()` は upstream からの SSE チャンクをすべて `Vec<u8>` に蓄積し、ストリーム終了後に `transform_stream()` で一括変換する。これによりクライアントは full response が完了するまで最初のトークンを受信できず、ストリーミングの利点（TTFU）が完全に失われている。

**証拠**: `src/provider/translate.rs` L391-438 の `collect_and_transform_stream()` が全チャンクを `Vec<u8> buffer` に蓄積後、L434 で `transform_stream(&buffer, ...)` を一度だけ呼び出している。

一方、`transparent.rs` の `proxy_sse_stream()` は `mpsc::channel` + `tokio::spawn` で即時中継を実現しており、このパターンを translate stream にも適用する。

**検証済み**: `llm-bridge-core v0.2.6` の `transform_stream_events()` はチャンク単位の逐次投入に対応済みであり、新規 API 追加は不要。

## Scope

1. `translate_stream()` 関数の全面改修:
   - リクエスト変換（Anthropic → OpenAI）部分は維持
   - upstream 接続部分は維持
   - 応答処理を `collect_and_transform_stream()` → `mpsc::channel` + 逐次変換に変更
   - `CancellationToken` で中断可能
   - クライアント切断検出（`tx.send().await.is_err()`）

2. `transform_chunk()` 関数の新規追加:
   - 1 SSE チャンクを受け取り `transform_stream_events()` + `events_to_sse()` で変換
   - 変換不要チャンク（keepalive 等）は `Ok(None)`
   - SSE event 形式にラップして返す

3. `collect_and_transform_stream()` 関数の削除（全面置き換え）

4. `handle_translate()` の CancellationToken 引数は既に受け取っているため変更不要

## Non-scope

- Lossy handling 完全対応（`llm-bridge-core` の lossy-tolerant API が必要。別トラック EXT-1）
- `proxy_sse_stream()` の共通化（`transparent.rs` のパターンを参考にするが、今回の改修では translate.rs に閉じる）
- 統合テストの追加（M9-1 で対応。本チケットは unit test のみ追加）

## Investigation

### 証拠1: 現在の `collect_and_transform_stream()` が全チャンク蓄積型

**発見場所**: `src/provider/translate.rs` L391-438

現在の実装:
```rust
async fn collect_and_transform_stream(
    upstream_resp: reqwest::Response,
    llm_format: LlmApiFormat,
    cancel: CancellationToken,
) -> Result<Bytes, ProxyError> {
    let mut buffer = Vec::new();                    // ← 全チャンクを蓄積
    let mut stream = upstream_resp.bytes_stream();
    loop {
        tokio::select! {
            biased;
            _ = cancel.cancelled() => { ... }
            chunk = stream.next() => {
                match chunk {
                    Some(Ok(bytes)) => {
                        buffer.extend_from_slice(&bytes);  // ← 蓄積のみ
                    }
                    ...
                    None => break,  // ← ストリーム終了まで待つ
                }
            }
        }
    }
    // ストリーム終了後、初めて変換
    let mut state = StreamState::default();
    let events = transform_stream(&buffer, sse_format, &mut state)?;
    Ok(Bytes::from(events))
}
```

**問題**: TTFU = full response 完了時。ストリーミングの利点が完全に失われる。

### 証拠2: `proxy_sse_stream()` の即時中継パターン（目標アーキテクチャ）

**発見場所**: `src/provider/transparent.rs` L122-156

```rust
async fn proxy_sse_stream(upstream_resp: reqwest::Response, cancel: CancellationToken) -> Response {
    let (tx, rx) = mpsc::channel::<Result<axum::body::Bytes, axum::Error>>(64);
    let mut stream = upstream_resp.bytes_stream();
    tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => break,
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            if tx.send(Ok(bytes)).await.is_err() {
                                break;  // クライアント切断
                            }
                        }
                        _ => break,
                    }
                }
            }
        }
    });
    let stream_body = Body::from_stream(tokio_stream::wrappers::ReceiverStream::new(rx));
    (StatusCode::OK, [...], stream_body).into_response()
}
```

**キーポイント**:
- `mpsc::channel` で tx/rx 分離
- `tokio::spawn` で変換を非同期タスク化
- `tx.send().await.is_err()` でクライアント切断検出
- `Body::from_stream(ReceiverStream)` で axum ストリーミング応答

### 証拠3: `transform_stream_events()` がチャンク単位逐次投入に対応済み

**発見場所**: `llm-bridge-core v0.2.6` (`~/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/llm-bridge-core-0.2.6/src/stream/mod.rs` L70-100)

```rust
pub fn transform_stream_events(
    upstream_sse: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<StreamEvent>, TransformError>
```

**テストによる検証**（`tests.rs` L117-157）:
```rust
fn test_openai_stream_text_incremental_calls_only_stop_once() {
    let mut state = StreamState::default();
    // 1回目: "Hel" → [MessageStart, ContentBlockStart, ContentBlockDelta("Hel")]
    let first = transform_stream_events(b"...{\"content\":\"Hel\"}...", ApiFormat::OpenaiChat, &mut state).unwrap();
    assert_eq!(first.len(), 3);

    // 2回目: "lo" → [ContentBlockDelta("lo")] ← 状態を保持して継続
    let second = transform_stream_events(b"...{\"content\":\"lo\"}...", ApiFormat::OpenaiChat, &mut state).unwrap();
    assert_eq!(second.len(), 1);

    // 3回目: [DONE] → [ContentBlockStop, MessageDelta, MessageStop]
    let third = transform_stream_events(b"data: [DONE]\n\n", ApiFormat::OpenaiChat, &mut state).unwrap();
    assert_eq!(third.len(), 3);

    // 4回目: 完了後 → []
    let after = transform_stream_events(b"data: [DONE]\n\n", ApiFormat::OpenaiChat, &mut state).unwrap();
    assert!(after.is_empty());
}
```

**結論**: 新たな API 追加なしでチャンク単位の逐次変換が可能。

### 証拠4: `events_to_sse()` による StreamEvent → SSE bytes 変換

**発見場所**: `llm-bridge-core v0.2.6/src/stream/sse_output.rs` L8-106

```rust
pub fn events_to_sse(events: &[StreamEvent]) -> Vec<u8>
```

`events_to_sse()` は `StreamEvent` の配列を `"event: message_start\ndata: {...}\n\n"` 形式の Anthropic SSE bytes に変換する。`transform_chunk()` の出力として使用する。

### 証拠5: `transform_stream()` の実態 — delegate に過ぎない

**発見場所**: `llm-bridge-core v0.2.6/src/transform/streaming_entry.rs` L17-33

```rust
pub fn transform_stream(
    upstream_events: &[u8],
    source: ApiFormat,
    state: &mut StreamState,
) -> Result<Vec<u8>, TransformError> {
    let events = crate::stream::transform_stream_events(upstream_events, source, state)?;
    Ok(crate::stream::events_to_sse(&events))
}
```

つまり `transform_stream()` = `transform_stream_events()` + `events_to_sse()` の組み合わせに過ぎない。チャンク単位では `transform_stream_events()` + `events_to_sse()` を個別に呼び出すことで同じ変換を実現できる。

### 証拠6: 特徴ゲート（feature gate）の確認

**発見場所**: `crates/anthropx/Cargo.toml` L25, L38

```toml
llm-bridge-core = { version = "0.2.6", optional = true }
server = ["dep:axum", "dep:reqwest", "dep:uuid", "dep:llm-bridge-core",
          "tokio/full", "dep:futures", "dep:tokio-stream", "dep:tokio-util", ...]
```

- `futures`（StreamExt）→ server feature
- `tokio-stream`（ReceiverStream）→ server feature
- `tokio-util`（CancellationToken）→ server feature
- `llm-bridge-core` → server feature（`transform_stream_events`, `events_to_sse`）

translate.rs 全体が server feature 配下のため、新しい依存は発生しない。

### 証拠7: `handle_translate()` の CancellationToken 引数

**発見場所**: `src/provider/translate.rs` L74-130

`handle_translate()` は既に `state.cancel.clone()`（CancellationToken）を `translate_stream()` に渡している。今回の改修でシグネチャ変更は不要。

### 証拠8: `transform_chunk()` の実装に必要な型

- `StreamState`: `llm_bridge_core::model::StreamState` — `Default` 実装済み、逐次投入の状態を保持
- `StreamEvent`: `llm_bridge_core::model::StreamEvent` — 変換中間型
- `ApiFormat`（llm-bridge-core版）: `llm_bridge_core::model::ApiFormat` — `OpenaiChat` / `OpenaiResponses` / `AnthropicMessages`
- `TransformError`: `llm_bridge_core::model::TransformError` — `ProxyError::from` で変換可能

## Test Plan

### ユニットテスト計画

1. **`transform_chunk()` 関数のテスト**（`translate.rs` 内 `mod tests`）:

   | ケース | 入力 | 期待結果 |
   |--------|------|---------|
   | 正常: テキストチャンク変換 | OpenAI Chat の delta chunk | `Ok(Some(Bytes))` — Anthropic SSE 形式 |
   | 正常: 複数チャンクの逐次変換 | 分割された "Hel" + "lo" | 各チャンクが即時 ContentBlockDelta に変換される |
   | 正常: [DONE] 終端 | `data: [DONE]\n\n` | `Ok(Some(Bytes))` — message_stop を含む |
   | 正常: keepalive スキップ | 空行やコメント行 | `Ok(None)` |
   | 異常: 不正フォーマット | 壊れた JSON | `Err(ProxyError::UpstreamError(...))` または TransformLossy |

2. **`translate_stream()` のアーキテクチャテスト**:
   - 戻り値が `Response` で Content-Type: `text/event-stream` であること
   - Body が `Body::from_stream()` 由来であること（型検証、未実装の場合はコンパイルで確認）
   - `CancellationToken` が伝搬されること（コンパイル時検証）

3. **モック/スタブが必要な外部依存**:
   - `reqwest::Response`（`upstream_resp`）— `bytes_stream()` をスタブする必要あり
   - `tokio::sync::mpsc::channel` — 通常の非同期チャネル、モック不要
   - `CancellationToken` — `tokio_util::sync::CancellationToken`、テスト用に `child_token()` の生成

### 既存テストへの影響

現状の `translate.rs` のテスト（`mod tests`）は全て通過しなければならない：
- `transform_error_maps_all_variants`
- `lossy_downgrade_maps_to_transform_lossy`
- `lossy_error_should_reject` / `lossy_error_allow_lossy_continues` / `lossy_error_error_lossy_continue_continues`
- `to_llm_api_format_chat` / `to_llm_api_format_responses`
- `resolve_api_format_chat` / `resolve_api_format_responses` / `resolve_api_format_auto_chat`
- `allow_lossy_inherits_from_global`

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| 実際の upstream API との結合テスト | 外部サービス依存。M9-1 で mock SSE server による統合テストを追加予定 |
| クライアント切断のエンドツーエンド検証 | HTTP 切断は axum のレイヤーで処理。統合テストでのみ検証可能 |
| フルスループット・TTFU 計測 | ベンチマークテスト。本チケットでは性能計測フレームワーク未導入のため対象外 |

## Boy Scout Rule — 翻訳可能性計画

### `translate_stream()` 翻訳可能性改善

現在の `translate_stream()`（L285-384）は責務が混在し翻訳可能性が低い：
- リクエスト変換（Anthropic → OpenAI）
- upstream 接続
- 応答変換と中継
が一つの関数に詰まっている。

**改善計画**:

1. **責務分割**: upstream リクエスト送信部分は `send_upstream_request()` のような名前のヘルパー関数に抽出する（リクエスト変換、接続、応答処理の3段階に分割）

2. **変数名の明確化**:
   - `base` → `normalized_base_url`
   - `key` → `upstream_api_key`
   - `upstream_body` → `transformed_body_with_upstream_model`

3. **コメントの「なぜ」化**:
   - 現状のコメントは「何を」説明している（例: `// 2. Upstream SSE ストリームに接続`）
   - 不変条件（例: `stream_body["model"]` の書き換えが必要な理由）をコメントとして追加

4. **ハードコード値の定数化**:
   - `"text/event-stream"` → 定数 `SSE_CONTENT_TYPE`
   - `"no-cache"` → 定数 `SSE_CACHE_CONTROL`
   - チャネルサイズ `64` → 定数 `STREAM_CHANNEL_SIZE`

### `collect_and_transform_stream()` 削除

- 全面置き換えのため削除対象。削除時に関連コメントも同時に除去する

### 既存の翻訳可能性問題（本チケットで改善する範囲）

- `translate_non_stream()` が L141-271 と長大。これは今回のスコープ外だが、同じファイル内の関数として Boy Scout 的に改善の機会があれば対応する（例: 変換 + 送信の分離）
- `OpenAiWireApi::Auto` 解決ロジックの重複（`handle_translate` と routing モジュール）は M6-2 で既に対応済みのため改めて触れない

## Acceptance Criteria

- [ ] `transform_chunk()` がチャンク単位で `transform_stream_events()` を呼び出し、`events_to_sse()` で Anthropic SSE に変換して返す
- [ ] `translate_stream()` が `mpsc::channel` + `tokio::spawn` を使用し、各チャンクを即時変換・即時送信する
- [ ] `translate_stream()` が `CancellationToken` による中断に対応している
- [ ] `translate_stream()` がクライアント切断（`tx.send().await.is_err()`）を検出できる
- [ ] `collect_and_transform_stream()` が削除されている
- [ ] keepalive チャンクが `Ok(None)` として正しくスキップされる
- [ ] 既存テストがすべて通過する
- [ ] `cargo check --no-default-features` が通過する（library モード）
- [ ] `cargo clippy --all-targets -- -D warnings` が通過する

## Notes

<!--
注: このコメントは人間向けの説明である。AI は以下の手順に従うこと。

- plan_path: /plan-ticket が plan.md を作成後に frontmatter に更新する
- implementation_path: /start-ticket が implementation.md を作成後に frontmatter に更新する
- review_report_path: /review-ticket が review.md を作成後に frontmatter に更新する

各コマンドのワークフロー手順が frontmatter 更新の正しい手順である。
-->

### 成果物

- 計画: context/0002-m8-1-translate-streaming/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0002-m8-1-translate-streaming/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0002-m8-1-translate-streaming/review.md（未作成、/review-ticket 全チェック通過後に作成）
