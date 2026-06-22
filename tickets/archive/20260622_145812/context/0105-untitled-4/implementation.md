# 実装サマリ: パス解決の純粋関数群 (M2-5 / #105)

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/src/recognizer.rs` | EDIT | 2 関数 + 5 テスト + import 追加 |

## 追加した関数
| 関数 | 引数 | 戻り値 |
|------|------|--------|
| `resolve_qwen3_model_paths` | `model_dir: &Option<String>` | `Qwen3AsrModelPaths` |
| `resolve_qwen3_asr_config` | `config: &VoiputConfig` | `Option<Qwen3AsrConfig>` |

## テスト結果
| テスト | 結果 |
|--------|------|
| test_resolve_qwen3_model_paths_with_dir | ✅ ok |
| test_resolve_qwen3_model_paths_without_dir | ✅ ok |
| test_resolve_qwen3_model_paths_absolute_subdir | ✅ ok |
| test_resolve_qwen3_asr_config_none | ✅ ok |
| test_resolve_qwen3_asr_config_with_relative_paths | ✅ ok |
| 既存テスト (149件) | ✅ all ok |

## 次工程
M2 マイルストーン完了。次は M3 (voiput → trate 移行) に進む。
