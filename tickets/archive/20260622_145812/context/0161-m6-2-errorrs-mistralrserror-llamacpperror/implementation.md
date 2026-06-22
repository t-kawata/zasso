# 実装サマリ: M6-2: error.rs 修正 — MistralrsError → LlamaCppError

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/ggufrs/src/error.rs` | MODIFY | バリアントリネーム + メッセージ + doc + テスト（約20行） |
| `crates/ggufrs/src/server/router.rs` | MODIFY | パターンマッチ行50 + テスト行129 のバリアント名更新 |
| `crates/ggufrs/src/inference/generate.rs` | MODIFY | 4箇所の `MistralrsError` → `LlamaCppError` + [::STUB::] マーカー追記 |

## 実装内容

### error.rs
- `MistralrsError(#[from] mistralrs::error::Error)` → `LlamaCppError(#[from] mistralrs::error::Error)`
- `#[error("mistralrs エラー: {0}")]` → `#[error("llama-cpp エラー: {0}")]`
- `#[from]` ターゲットは `mistralrs::error::Error` のまま維持。3箇所に `[::STUB::]` マーカーで M6-11 での差し替え予定を明記
- doc コメントの "mistralrs" → "llama-cpp" 更新（モジュールdoc・バリアントdoc・ModelLoadFailed doc）
- テスト3関数を更新（関数名・バリアント名・アサーション文字列）

### router.rs
- 行50: `GgufError::MistralrsError(_)` → `GgufError::LlamaCppError(_)`
- テスト: `mistralrs_error_returns_500` → `llama_cpp_error_returns_500`

### generate.rs
- 4箇所の `GgufError::MistralrsError(...)` → `GgufError::LlamaCppError(...)`
- 各箇所に `[::STUB::]` マーカーを追記（M6-6 で全削除予定）

## 検証結果
- `cargo check`: ✅ 警告0
- `cargo test --lib error::tests`: ✅ 16/16 passed
- `cargo test`（全187+1テスト）: ✅ 188/188 passed
- 品質チェック: 24件の unwrap — 全テストコード内（許容範囲）
- mistralrs 参照: 全件が `#[from]` ターゲット（意図的維持）または `[::STUB::]` マーカー内
- 旧バリアント名 `MistralrsError`: 0件（完全除去）
