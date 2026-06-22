# 実装サマリ: M6-7 inference/stream.rs 全書き換え

## 変更ファイル

### `src/inference/stream.rs` — 全書き換え
- mistralrs 依存コード（`Response`, `ResponseItem`, `convert_response`）を全削除
- `run_inference_stream_blocking()`: llama-cpp-2 の同期推論ループ＋mpsc 送信
- `generate_stream_inner()`: mpsc チャネル作成 → spawn_blocking → ReceiverStream
- `STREAM_CHANNEL_CAPACITY = 64` 定数
- テスト: `stream_from_iter_collects_all_chunks`, `empty_stream_ends_immediately`, `receiver_stream_drop_ends_stream`

### `src/inference/generate.rs` — 修正
- `InferenceParams`: 構造体＋全フィールドを `pub(crate)` に visibility 変更
- `decode_token`: `pub(crate)` に変更（stream.rs から参照）
- `GgufEngine::generate_stream` スタブ差し替え: Err 返却 → `crate::inference::stream::generate_stream_inner()` 呼び出し

### `src/inference/mod.rs` — 修正
- `DummyEngine` を関数内ローカル定義からモジュールレベルに抽出
- `DummyEngine::generate_stream` の `todo!()` → `futures::stream::iter` によるダミー実装
- テスト追加: `dummy_generate_stream_returns_ok`, `dummy_generate_stream_collects_chunk`

### `Cargo.toml` — 依存追加
- `tokio-stream` クレート追加（ReceiverStream のため）

## 事前エラー（本チケット非起因）
以下の 7 エラーは M6-5/M6-6/M6-9/M6-12 の未完了による事前エラーで、本チケットの影響ではない：
- `server/openai.rs` — send_raw 未定義 (×2)
- `server/router.rs` — expect_send_raw 未定義 (×4)
- `inference/generate.rs` — gbnf::convert 未解決 (×1)
