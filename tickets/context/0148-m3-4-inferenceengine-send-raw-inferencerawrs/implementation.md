# 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `inference/generate.rs` | 🔧 変更 | send_raw STUB(L197) → 3行のパススルー実装に置き換え |

## 実装内容

```rust
async fn send_raw(&self, model_name: &str, request: RequestBuilder) -> Result<Response, GgufError> {
    let model = self.registry.get(model_name).await?;
    let response = model.send_chat_request(request).await
        .map_err(GgufError::MistralrsError)?;
    Ok(Response::Done(response))
}
```

`inference/raw.rs` は作成せず、既存の `generate.rs` 内の impl ブロックに直接記述。

## 解決した STUB
- `inference/generate.rs:197` → REMOVED ✅（残存STUB: 0）

## 検証結果
- `cargo check --lib`: ✅ PASS
- `cargo test --lib`: 136 passed, 0 failed
