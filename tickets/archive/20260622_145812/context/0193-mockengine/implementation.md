# 実装サマリ: テストコード修正 — MockEngine + 結合テスト

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/registry.rs` | 修正 | `load_model()` に `catch_unwind` 追加 — llama-cpp-2 の panic を捕捉して `ModelLoadFailed` に変換 |
| `src/registry.rs` | 修正 | `get_triggers_load_model_for_unloaded_model` テストの `#[ignore]` 除去 |
| `src/registry.rs` | 削除 | `[::STUB::]` マーカー（L450-451）解決に伴い削除 |

## 実装内容

### 1. llama-cpp-2 panic 問題の修正

`llama_cpp_2::LlamaModel::load_from_file()` は存在しないモデルファイルに対して標準の `Result::Err` ではなく `panic!` を発生させる。この panic は `spawn_blocking` に捕捉され `JoinError` → `InferenceFailed` として伝播していた。

**修正**: `spawn_blocking` クロージャ内で `std::panic::catch_unwind` により `load_from_file` の呼び出しをラップ。panic 時は panic メッセージを `String` に変換し、`std::io::Error` にラップして `ModelLoadFailed` として伝播させる。

### 2. テストの有効化

- `get_triggers_load_model_for_unloaded_model` テストから `#[ignore]` を除去
- テストは `ModelLoadFailed { name: "qwen3.5" }` を正しく受け取る

### 3. `[::STUB::]` マーカー削除

- `registry.rs:450-451` の `[::STUB::]` コメントを削除
- スタブ件数: 5件 → 4件（test-run.rs 3件、settings.rs 1件は別チケット対象）

## 検証結果

- `cargo test --lib`: 187 tests passed, 0 failed, 0 ignored ✅
- `cargo test --test server_integration_test`: 1 passed ✅
- `cargo test --test ggufrs_api_check`: 1 passed ✅
- `cargo check --lib`: 成功 ✅
- 残存 mistralrs 参照: 0件 ✅
- Malfeasance.json 未解決レコード: 0件 ✅
