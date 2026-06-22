# #81 PostCorrection 必須化 実装サマリ

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| config.rs | 変更 | post_correction_openai_config フィールド + ビルダーメソッド追加 |
| recognizer.rs | 変更 | SpeechRecognizer に pc_openai_config フィールド追加。rebuild_pc_backend が pc_openai_config を参照。認識用 openai_config と補正用 pc_openai_config を分離 |
| test-run.rs | 変更 | --openai-key 必須化。build_voiput_config が post_correction_openai_config を常に設定 |

## 動作
- `--engine os --openai-key=sk-xxx`: OS 認識 + PC バックエンド有効
- `--engine openai --openai-key=sk-xxx`: OpenAI 認識 + PC バックエンド有効
- `--openai-key` 未指定: exit(1) でエラー表示

## テスト
- 全 161 テスト通過
- エンジン=Os でも PC バックエンドが初期化されることを確認
