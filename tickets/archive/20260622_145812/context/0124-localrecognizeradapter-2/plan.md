# 実装計画: LocalRecognizerAdapter 音声パイプライン修正

## 要件
1. 二重イベント修正: Adapter の start()/stop() から Started/Stopped 送信を削除
2. 音声パイプライン実装: PseudoAsrStreamer + マイクキャプチャ追加

## 変更ファイル
| ファイル | 内容 |
|---------|------|
| crates/voiput/src/recognizer.rs | Adapter に streamer 追加、二重イベント削除 |
| crates/voiput/backends/openai.rs | build_streamer_config を pub(crate) 化 |

## Boy Scout
- build_streamer_config() を公開して reuse 可能にする

## テスト計画
- cargo test --lib 160件
- cargo test --test qwen3_asr_test 2件
- 手動テスト: make run-local

## 実装手順
1. build_streamer_config を pub(crate) 化
2. LocalRecognizerAdapter に streamer フィールド追加
3. 二重イベント削除 + start/stop 実装

## リスク
なし（プロダクションコード不変、バックエンド追加のみ）
