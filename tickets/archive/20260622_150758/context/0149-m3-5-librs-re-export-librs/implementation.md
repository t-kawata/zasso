# 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/lib.rs` | 🔧 変更 | STUB削除3件 + pub use拡充 |

## 実装内容

### 削除した STUB（3件）
1. `[::STUB::] M2-1 で InferenceEngine トレイトを実装` (L25) → 削除 ✅
2. `[::STUB::] M2-2 で ModelRegistry を実装` (L28) → 削除 ✅
3. `[::STUB::] M3-5 で残りの型を追加` (L39) → 削除 ✅

### 残存 STUB（2件）— 別チケット
- `[::STUB::] M4-1 で server モジュールを実装` (L28) — M4-1
- `[::STUB::] M4-2 で start_server() 実装時に使用` (L64) — M4-2

### mistralrs re-export（拡充）
前: `Constraint, RequestBuilder, Response` (3型)
後: `ChatCompletionResponse, Constraint, Model, RequestBuilder, Response, SamplingParams, TextMessages, TextMessageRole` (8型)

### ggufrs 公開型 re-export（新規）
`ConfigLayer, GgufConfig, GpuConfig, GpuProvider, ModelConfig, ServerConfig, GgufError, GenerateParams, InferenceEngine, ModelInfo, ModelRegistry`

## 検証結果
- `cargo check --lib`: ✅ PASS
- `cargo test --lib`: 136 passed, 0 failed
- `cargo clippy --lib`: ✅ 新規警告なし
- `cargo doc --no-deps`: ✅ 成功
- STUB確認: 残り2件（M4-1, M4-2）— 期待通り
