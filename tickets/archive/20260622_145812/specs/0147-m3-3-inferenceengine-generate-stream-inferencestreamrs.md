---
ticket_id: 147
title: "M3-3: InferenceEngine generate_stream 実装 (inference/stream.rs)"
slug: "m3-3-inferenceengine-generate-stream-inferencestreamrs"
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0147-m3-3-inferenceengine-generate-stream-inferencestreamrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0147-m3-3-inferenceengine-generate-stream-inferencestreamrs/review.md
---
# M3-3: InferenceEngine generate_stream 実装 (inference/stream.rs)

## Summary

`InferenceEngine::generate_stream()` を実装する。mistralrs のストリーミング API（`Model::stream_chat_request`）を `futures::Stream` でラップし、非同期的にテキストチャンクを逐次生成する。

## Background

### 設計上の位置づけ

ストリーミング生成はユーザー体験の要。通常の `generate()` が全テキストを生成してから返すのに対し、`generate_stream()` はトークン生成と同時にチャンク単位でクライアントに返送する。これにより、最初のトークンが生成されるまでのレイテンシ（TTFT）を最小化する。

### 現在の実装状況

- `InferenceEngine` トレイト定義 (`inference/mod.rs`): ✅ 完了（M2-1）
- `generate()` / `generate_structured()` (`inference/generate.rs`): ✅ 完了（M3-2）
- `ModelRegistry::get()` (`registry.rs`): ✅ 完了（M3-2、GgufModelBuilder 実装）
- `generate_stream()` (`inference/generate.rs:137`): 🔧 **STUB** — `todo!("M3-3")`
- `Model::stream_chat_request()` (mistralrs 0.8.1): ✅ 使用可能
- `futures::Stream<Item = Response>` (mistralrs): ✅ `poll_next` 実装済み

### このチケットの必要性

STUB のままではストリーミングが必要なクライアント（チャットUI等）が利用できない。M4-1（サーバー）のストリーミングエンドポイントの前提条件でもある。

## Scope

### 実装するもの

1. **`inference/stream.rs` 作成**
   - ストリーミング生成の実装（mistralrs の `Stream<Response>` → `Stream<Result<String, GgufError>>` 変換）
   - mistralrs `Stream<'a>` のライフタイム問題の解決（`Arc<Model>` の保持）

2. **`inference/generate.rs` の `generate_stream` STUB 更新**
   - STUB → 実際の実装に置き換え（`stream.rs` の関数に委譲、または直接実装）

3. **`inference/mod.rs` の更新**
   - `pub mod stream;` 宣言

### 実装しないもの

- `send_raw()` — M3-4 で実装
- サーバーストリーミングエンドポイント — M4-1 で実装
- クライアントへの SSE (Server-Sent Events) — M4-1 で実装
- ストリームのバッファリング・流量制御 — デフォルト実装のみ

## Investigation

### mistralrs ストリーミング API

**`Model::stream_chat_request()`** (`mistralrs/src/model.rs`):
```rust
// 戻り値: Stream<'_> は futures::Stream<Item = Response> を実装
pub async fn stream_chat_request<R: RequestLike>(
    &self, request: R,
) -> crate::error::Result<Stream<'_>>;

pub struct Stream<'a> {
    _server: &'a Model,    // モデルへの参照（ライフタイム保持用）
    rx: Receiver<Response>, // チャンネル受信側
}

impl futures::Stream for Stream<'_> {
    type Item = Response;
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut TaskContext<'_>) -> Poll<Option<Self::Item>> {
        self.rx.poll_recv(cx)
    }
}
```

**`Response` enum** — ストリームの各項目:
- `Response::Chunk(ChatCompletionChunkResponse)` — テキストチャンク
  - `chunk.choices: Vec<ChunkChoice>` → `choice.delta.content: Option<String>`
- `Response::Done(ChatCompletionResponse)` — ストリーム完了
- `Response::ModelError(String, ChatCompletionResponse)` — モデルエラー
- `Response::InternalError(Box<dyn Error + Send + Sync>)` — 内部エラー

### ライフタイム問題

`Stream<'a>` は `Model` への参照（`_server: &'a Model`）を持つため、`Model` より長く生きられない。ストリームを `Pin<Box<dyn Stream + Send>>` として返すには、`'static` にする必要がある。

**解決策**: `tokio::sync::mpsc` チャンネルでラップする:
1. `model.stream_chat_request()` で mistralrs ストリームを取得
2. `Arc<Model>` を spawn したタスクに移動（モデルを生かし続ける）
3. 別タスクでストリームから読み取り、`mpsc::Sender` に送信
4. `mpsc::Receiver` 側を `futures::Stream` として返す

```rust
async fn generate_stream(...) -> Result<Pin<Box<dyn Stream<...>>>, GgufError> {
    let model = self.registry.get(model_name).await?;
    let request = RequestBuilder::new()
        .add_message(TextMessageRole::User, prompt)
        .set_sampling(params.into());
    let mistral_stream = model.stream_chat_request(request)
        .await.map_err(GgufError::MistralrsError)?;

    let (tx, rx) = tokio::sync::mpsc::channel::<Result<String, GgufError>>(16);

    // spawn タスクに model と mistral_stream を移動
    tokio::spawn(async move {
        // ストリームからチャンクを読み取り、チャンネルに送信
        ...
    });

    // ReceiverStream を Stream として返す
    Ok(Box::pin(tokio_stream::wrappers::ReceiverStream::new(rx)))
}
```

### ストリーム応答処理

```rust
use futures::StreamExt;
while let Some(response) = mistral_stream.next().await {
    match response {
        Response::Chunk(chunk) => {
            let content = chunk.choices
                .into_iter().next()
                .and_then(|c| c.delta.content)
                .unwrap_or_default();
            if tx.send(Ok(content)).await.is_err() { break; }
        }
        Response::Done(_) => break,
        Response::ModelError(msg, _) => {
            let _ = tx.send(Err(GgufError::MistralrsError(...))).await;
            break;
        }
        Response::InternalError(e) => {
            let _ = tx.send(Err(GgufError::InferenceFailed(Box::new(e)))).await;
            break;
        }
        _ => {} // その他バリアントは無視
    }
}
```

**注意**: `tokio_stream` クレートが必要になる可能性がある。ただし、`Receiver::recv()` を `futures::stream::unfold` でラップすれば `tokio_stream` 無しでも実装可能。

```rust
// unfold を使用した Receiver → Stream 変換（tokio_stream 不要）
use futures::stream::unfold;
let stream = unfold(rx, |mut rx| async move {
    rx.recv().await.map(|item| (item, rx))
});
```

### スタブ状況

- `inference/generate.rs:137`: STUB → M3-3 で実装に置き換え
- `inference/mod.rs:5`: 既に M3-2 で除去済み ✅

### 依存チケット状態

- M2-1 (InferenceEngine): ✅ 完了
- M2-2 (ModelRegistry::get): ✅ 完了
- M3-2 (generate): ✅ 完了 (#146)

## Test Plan

### ユニットテスト計画

`stream.rs` 内に、ストリーム変換ロジックのテストを追加する。
実際の mistralrs ストリームはモデルファイルが必要なため、代わりに `futures::stream::iter` でモックしたストリームを使用する。

#### 1. ストリーム変換ロジック（ヘルパー関数）

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 1.1 | チャンクを含むストリーム | 正常系 | 複数の Response::Chunk を文字列チャンクに変換できる |
| 1.2 | Done で終了するストリーム | 正常系 | Response::Done でストリームが終了する |
| 1.3 | 空のストリーム | 正常系 | 空ストリームは即座に None を返す |
| 1.4 | ModelError を含むストリーム | 異常系 | エラー項目が Err に変換され、ストリームが終了する |

#### 2. Response 型変換

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 2.1 | Chunk からテキスト抽出 | 正常系 | delta.content が正しく抽出される |
| 2.2 | Chunk で content=None | 正常系 | 空文字列になる |

#### カバレッジ目標

- `stream.rs`: ラインカバレッジ 80%+
- Response → Result 変換ロジック: 100%

### ユニットテスト不可能な項目（例外）

1. **`Model::stream_chat_request` の実際のストリーミング**: 実モデルファイルと mistralrs ランタイムが必要。M5-3 （結合テスト）で検証する。
2. **チャンネル経由の非同期ストリーム**: spawn タスクのテストは困難。代わりにヘルパー関数のテストでカバーする。

## Boy Scout Rule — 翻訳可能性計画

### 新規コードで遵守すべきルール

1. **関数名は動詞句**: `generate_stream`, `response_to_result`
2. **変数名はドメイン概念**: `chunk`, `delta_content`, `model_stream`, `result_stream`
3. **一関数一責務**: ストリーム変換とエラーハンドリングは明確に分離
4. **エラーは `?` で伝播**: `unwrap()` 不使用、`map_err`/`match` で適切に変換
5. **コメントは「なぜ」**: ライフタイム問題とチャンネルラッパーの設計判断を日本語で説明

## Acceptance Criteria

- [ ] `inference/stream.rs` が作成され、`generate_stream` が実装されている
- [ ] mistralrs のストリームが正しくチャンク単位の文字列出力に変換される
- [ ] ストリームエラー（ModelError, InternalError）が適切にハンドリングされる
- [ ] `generate.rs` の `generate_stream` STUB が除去されている
- [ ] `inference/mod.rs` に `pub mod stream;` が追加されている
- [ ] 既存テストが全て通過している
- [ ] 新規テストが全て通過している

## Notes

- mistralrs の `Stream<'a>` は `&Model` を借用するため、`'static` な `dyn Stream` に変換するにはチャンネルラッパーが必要
- `tokio_stream` クレートを依存に追加するか、`futures::stream::unfold` で代替する（後者が望ましい）
- 依存: M2-1 ✅、M2-2 ✅、M3-2 ✅
- 後続: M3-4（send_raw）、M3-5（lib.rs 統合）、M4-1（サーバー）

### 成果物

- 計画: context/0147-m3-3-inferenceengine-generate-stream-inferencestreamrs/plan.md（未作成）
- 実装サマリ: context/0147-m3-3-inferenceengine-generate-stream-inferencestreamrs/implementation.md（未作成）
- レビュー報告書: context/0147-m3-3-inferenceengine-generate-stream-inferencestreamrs/review.md（未作成）
