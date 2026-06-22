# 実装計画: M6-7 inference/stream.rs 全書き換え

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/inference/stream.rs` | 全書き換え | mistralrs 依存コード削除 → `run_inference_stream_blocking()` + `generate_stream_inner()` |
| `src/inference/generate.rs` | 修正 | `InferenceParams` を `pub(crate)` に変更。`GgufEngine::generate_stream` スタブ差し替え |
| `src/inference/mod.rs` | 修正 | `DummyEngine::generate_stream` の `todo!()` → `futures::stream::iter` |
| `Cargo.toml` | 追加 | `tokio-stream` 依存追加 |

## 実装手順

1. `cargo add tokio-stream`
2. `InferenceParams` → `pub(crate)` (generate.rs L50)
3. `stream.rs` 全書き換え + テスト
4. `generate.rs` の `GgufEngine::generate_stream` 差し替え
5. `mod.rs` の `DummyEngine::generate_stream` 差し替え
6. テスト実行 + 検証
