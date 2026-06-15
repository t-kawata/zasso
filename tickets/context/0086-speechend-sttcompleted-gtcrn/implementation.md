# 実装サマリ: チケット#86

## 変更ファイル

| ファイル | 変更内容 | 変更量 |
|---------|---------|--------|
| `crates/voiput/src/backends/openai.rs` | SpeechEnd の buffered PartialResult フラッシュ後に SttCompleted 追加 | +2行 |
| `crates/voiput/src/binary/test-run.rs` | gtcrn パスを空文字から model_path("gtcrn.onnx") に変更 | 5箇所 |

## 修正1: SpeechEnd に SttCompleted
SpeechEnd ハンドラ内で buffered PartialResult 送信後に SttCompleted を try_send。
#85 で PartialResult 非デコレーション時の SttCompleted は復活したが、SpeechEnd 経由のフラッシュでも同様に is_stt_pending が解放される必要があった。

## 修正2: GTCRN パス修正
test-run.rs 内の全5箇所の `gtcrn: String::new()` を `gtcrn: model_path("gtcrn.onnx")` に変更。
これにより OpenAI モード起動時に GTCRN デノイザーがモデルファイル（models/gtcrn.onnx）を読み込み、
発話単位でノイズ除去が適用される。

## 動作確認
- cargo check: 警告ゼロ ✅
- cargo test: 全170件パス ✅
- 品質チェック: totalIssues=0 ✅
