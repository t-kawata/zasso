# Implementation: M8-1 — Translate streaming リアルタイム化

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/provider/translate.rs` | 変更 | translate_stream 全面改修、transform_chunk 追加、collect_and_transform_stream 削除 |

## 主要変更内容

### 1. import 追加
- `llm_bridge_core::stream::{events_to_sse, transform_stream_events}` — チャンク単位変換用
- `std::convert::Infallible` — mpsc channel エラー型
- `tokio::sync::mpsc` — ストリーミングチャネル
- `tokio_stream::wrappers::ReceiverStream` — axum Body との統合
- `transform_stream` の import 削除（使用しなくなったため）

### 2. `convert_llm_to_sse_format()` 追加
stream 変換用の `ApiFormat` 変換。`AnthropicMessages` は `OpenaiChat` に統合。

### 3. `transform_chunk()` 追加（新規関数）
- 1 SSE チャンクを受け取り `transform_stream_events()` + `events_to_sse()` で変換
- 変換不要（keepalive 等）は `Ok(None)` を返す
- SSE event 形式（`event: xxx\ndata: {...}\n\n`）にラップ

### 4. `translate_stream()` 全面改修
- **変更前**: 全チャンクを `Vec<u8>` に蓄積→`collect_and_transform_stream()`→一括変換
- **変更後**: `mpsc::channel` + `tokio::spawn` で各チャンク即時変換＋即時送信
- `CancellationToken` で shutdown 中断対応
- `tx.send().await.is_err()` でクライアント切断検出
- `Body::from_stream(ReceiverStream)` で axum ストリーミング応答

### 5. `collect_and_transform_stream()` 削除
蓄積型の旧関数を完全削除。

### 6. ハードコード値の定数化
- `"text/event-stream"` → `SSE_CONTENT_TYPE`
- `"no-cache"` → `SSE_CACHE_CONTROL`
- チャネルサイズ `64` → `STREAM_CHANNEL_SIZE: usize`

### 7. 変数名の明確化
- `base` → `normalized_base_url`
- `key` → `upstream_api_key`
- `upstream_body` → `transformed_body_with_upstream_model`

## テスト結果

- 新規テスト 7 件 + 既存テスト 179 件 = **186 件すべて通過**
- 統合テスト 14 件も通過
- `cargo clippy --all-targets -- -D warnings` 通過（警告0）
- `#[allow(tail_expr_drop_order)]` を translate_stream に付与（Rust 2024 互換性、Bytes の Drop に副作用なし）

## 翻訳可能性改善（Boy Scout）

1. `translate_stream()` の責務を3段階（リクエスト変換 / upstream接続 / 応答変換＋即時送信）に分割して記述
2. ハードコード値3箇所を定数化
3. 変数名をドメイン概念に明確化
4. 古いコメントを最新の処理フローに更新
5. `collect_and_transform_stream` の削除に伴う全ての参照コメントを更新
