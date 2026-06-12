# 計画: #64 内部設計整合 — SpeechRecognizer 引数整理 + VoiputError 型修正 + 非対応OSバリデーション

## 要件
1. SpeechRecognizer::new() の引数を6個から (tx, &config, replaces_map) の3個に整理
2. validate_config() に OS 非対応チェックを追加

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| crates/voiput/src/recognizer.rs | 修正 | new() 3引数化 + build_vad_processor移植 + validate_config OSチェック + テスト |
| crates/voiput/src/voiput.rs | 修正 | Config 分解ロジック削除 + build_vad_processor関数移動 |

## 実装手順
1. recognizer.rs: build_vad_processor_config/resolve_vad_model_path 追加
2. recognizer.rs: SpeechRecognizer::new() 引数変更
3. voiput.rs: Config 分解削除 + 不要関数削除
4. recognizer.rs: validate_config OS チェック実装 + テスト追加
5. cargo test 確認

## 検証方法
- cargo test --package voiput 全通過
- SpeechRecognizer::new の呼び出しが1箇所のみ（voiput.rs）
- validate_config に _engine（無視）がないこと
- 品質チェック issues 0
