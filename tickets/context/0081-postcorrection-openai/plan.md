# #81 PostCorrection 必須化 計画

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
| config.rs | 変更 | post_correction_openai_config 追加 |
| recognizer.rs | 変更 | rebuild_pc_backend に pc_openai_config 引数 |
| test-run.rs | 変更 | --openai-key 必須化 |
| tests/integration_test.rs | 変更 | 必要に応じて |

## 実装手順
1. config.rs フィールド追加
2. recognizer.rs PC初期化変更
3. test-run.rs --openai-key 必須化
4. cargo check + cargo test
