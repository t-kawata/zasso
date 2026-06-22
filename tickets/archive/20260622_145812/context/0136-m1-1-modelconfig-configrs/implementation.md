# 実装サマリ: M1-1 — ModelConfig ビルトインコンストラクタ (config.rs)

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/ggufrs/src/config.rs` | **修正** | impl ModelConfig ブロック追加（3コンストラクタ）＋ テスト11件追加 |

## 追加したメソッド

| メソッド | name | model_path | context_size |
|---------|------|-----------|-------------|
| `qwen3_5_0_8b()` | "qwen3.5-0.8b" | models/Qwen3.5-0.8B-Q4_K_M.gguf | Some(32768) |
| `qwen3_5_2b()` | "qwen3.5-2b" | models/Qwen3.5-2B-Q4_K_M.gguf | Some(32768) |
| `custom(name, path)` | 引数 | 引数 | None |

全コンストラクタで `lazy_load = true`, オプションフィールドは `None`

## 検証結果

| 検証項目 | 結果 |
|---------|------|
| `make check-ggufrs` | ✅ 通過 (0 warnings, 0 errors) |
| `cargo test` (ggufrs) | ✅ **57 passed** (+11), 0 failed |
| 品質チェック | ⚠️ unwrap類はテスト内で正当。単一文字変数 `a`/`b` を `first`/`second` に修正 |

## 残課題

次は M1-2（GpuProvider メソッド実装）に進むこと。
