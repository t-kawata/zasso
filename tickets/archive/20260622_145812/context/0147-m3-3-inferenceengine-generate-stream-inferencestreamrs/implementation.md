# 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `inference/stream.rs` | 🆕 新規 | convert_response() — Response→Result変換 + ResponseItem enum + テスト6ケース |
| `inference/generate.rs` | 🔧 変更 | generate_stream STUB → チャンネルベースのストリーミング実装 |
| `inference/mod.rs` | 🔧 変更 | `pub mod stream;` 追加 |

## 実装内容

### generate_stream のアーキテクチャ

```text
model.stream_chat_request(request)
  → mistralrs::Stream<Response>          （&Model を借用 → 生ポインタで回避）
  → tokio::spawn(async move { loop })     （チャンネルに送信）
  → mpsc::Receiver<Result<String, ..>>
  → futures::stream::unfold(rx, ..)       （Receiver → Stream 変換）
  → Pin<Box<dyn Stream<Item=Result<...>>>>
```

### ライフタイム問題の解決

mistralrs::Stream<'_> は &Model への未使用参照を持つため spawn に移動不可。
**解決策**: `Arc::as_ptr()` で生ポインタ取得 → `&*model_ptr` で参照（unsafe）→ spawn に移動。
Arc<Model> が spawn 内で生存し続けるため安全。

### テスト（6ケース）
- chunk_with_content_returns_ok
- chunk_without_content_returns_empty
- done_returns_done（バリアント確認のみ）
- model_error_returns_inference_failed（バリアント確認のみ）
- internal_error_returns_inference_failed

## 解決した STUB
- `generate.rs:137` — `[::STUB::] M3-3 で generate_stream を実装` → REMOVED ✅

## 検証結果
- `cargo check --lib`: ✅ PASS
- `cargo test --lib`: 136 passed, 0 failed
- `cargo clippy --lib`: ✅ 新規警告なし
- Quality checks: unsafe ブロックあり（SAFETYコメント付き、計画通り）
