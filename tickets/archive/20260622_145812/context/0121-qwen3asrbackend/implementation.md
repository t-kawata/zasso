# 実装サマリ: Qwen3AsrBackend 結合テスト (M8-1 / #121)

## 🎉 音声認識成功！
認識結果: 「こんにちは今日はいい天気ですね。こんな日はお散歩に行きたくなりますね。」
元発話:   「こんにちは。今日はいい天気ですね。こんな日はお散歩に行きたくなりますね。」
→ 句点1文字の差異でほぼ完璧な認識精度

## 変更ファイル一覧
| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/tests/qwen3_asr_test.rs` | NEW | 結合テスト（2 tests） |
| `crates/voiput/src/types.rs` | EDIT | Qwen3AsrModelPaths のフィールド修正 |
| `crates/voiput/src/constants.rs` | EDIT | 定数更新（joiner/tokens→conv_frontend/tokenizer） |
| `crates/voiput/src/local/qwen3.rs` | EDIT | tokenizer 設定対応、テスト修正 |
| `crates/voiput/src/recognizer.rs` | EDIT | path解決関数・テスト修正 |
| `crates/voiput/build.rs` | EDIT | 正しいモデルファイルURLに修正 |

## 判明した事実
1. Qwen3-ASR v0.6b には joiner.onnx / tokens.txt は存在しない
2. 実際のファイル構成: encoder.onnx + decoder.onnx + conv_frontend.onnx + tokenizer/ (vocab.json + merges.txt + tokenizer_config.json)
3. OfflineQwen3ASRModelConfig に tokens フィールドは不要（tokenizer ディレクトリで代用）

## 検証結果
| 項目 | 結果 |
|------|------|
| cargo test --lib | ✅ 160 passed |
| cargo test --test qwen3_asr_test | ✅ 2 passed |
| 認識キーワード検証 | ✅ 天気, 散歩, こんにちは すべて確認 |
