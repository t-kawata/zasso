# M6-11 実装サマリ

## 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `crates/ggufrs/Cargo.toml` | mistralrs + llm-bridge-core 削除、gbnf = "0.2.7" 追加、metal/cuda 空リスト化、gbnf_integration 削除 |
| `crates/ggufrs/build.rs` | cmake 環境変数設定（LLAMA_METAL / LLAMA_CUDA）追加、MODEL_FILES GGUF 差し替え、コメント更新 |
| `crates/ggufrs/src/consts/settings.rs` | DEFAULT_SW_PORT 定数削除、関連テスト修正 |
| `crates/ggufrs/src/consts/mod.rs` | DEFAULT_SW_PORT re-export 削除 |
| `crates/ggufrs/src/config.rs` | Gemma4 model_path UQFF→GGUF 更新、コメント mistralrs→中立化 |
| `crates/ggufrs/src/inference/generate.rs` | gbnf_integration cfg ゲート削除、API を gbnf::Grammar::from_json_schema_value に修正、2件のスタブ解決 |
| `crates/ggufrs/Cargo.lock` | mistralrs 全 transitives 自動除去（自動生成） |

## 解決したスタブ

- Cargo.toml:61 `[::STUB::] M6-11: gbnf クレートが...` → gbnf 直接依存 + gbnf_integration feature 削除により解決
- generate.rs:234 `[::STUB::] M6-11: gbnf_integration feature が未定義...` → cfg ゲート削除により解決
- generate.rs:243 `[::STUB::] M6-11: gbnf クレートが未導入のため...` → gbnf 直接依存により解決

## 検証結果

| 項目 | 結果 |
|------|------|
| cargo check --all-targets | ✅ エラー0 警告0 |
| cargo test --lib | ✅ 186 passed 0 failed |
| cargo check --features metal | ✅ 成功 |
| cargo tree (mistralrs/llm-bridge-core) | ✅ 不在確認 |
| cargo tree (gbnf) | ✅ v0.2.7 在確認 |
