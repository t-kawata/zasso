# 実装サマリ: Qwen3AsrModelPaths + Qwen3AsrConfig 構造体の定義 (M2-3 / #103)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/types.rs` | EDIT | Qwen3AsrModelPaths + Qwen3AsrConfig 構造体追加 |
| `crates/voiput/src/config.rs` | EDIT | VoiputConfig フィールド + Builder メソッド + build() 更新 + import |

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo check (voiput) | ✅ 成功 |
| cargo check (src-tauri) | ✅ 成功 |
| quality checks | ✅ 新規 issue なし（10件は既存コード） |

## 追加した API
```rust
// types.rs
pub struct Qwen3AsrModelPaths { encoder, decoder, joiner, tokens }
pub struct Qwen3AsrConfig { model_paths, provider, num_threads, debug }

// config.rs — 既存 openai_config パターンに準拠
VoiputConfig { qwen3_asr_config: Option<Qwen3AsrConfig>, ... }
VoiputConfigBuilder::qwen3_asr_config(c) -> Self
```

## 次工程
M2-4 (Constants) または M2-5 (Path resolution) に進む。いずれも並行可能。
