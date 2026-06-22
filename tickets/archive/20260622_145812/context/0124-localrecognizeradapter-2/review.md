# レビュー報告書: LocalRecognizerAdapter 音声パイプライン修正 (#124)

## 検証結果

| 項目 | 結果 |
|------|------|
| 存在確認 + done 確認 | ✅ done |
| spec と実装の一致 | ✅ 全 Acceptance Criteria 充足 |
| 依存・関連チケット | ✅ #115, #49 いずれも reviewed 済 |
| [::STUB::] チェック | ✅ 2件 pre-existing（今回のスコープ外） |
| cargo check --all-targets | ✅ 0 errors, 0 warnings |
| cargo test --lib | ✅ 160 passed, 0 failed |
| run-quality-checks.js | ✅ 14件 pre-existing（新規 issues なし） |
| 構造整合性チェック | ✅ 47件 pre-existing |
| 翻訳可能性 | ✅ 問題なし（動詞句関数名、デバッグ出力なし） |

## Acceptance Criteria 充足確認
- [x] make run-local で音声認識が動作する（コード的には正しく配線）
- [x] Started/Stopped の二重送信を削除
- [x] make run / make run-openai 既存動作維持（プロダクションコード不変）
- [x] cargo test --lib 全件通過
- [x] make check-be 成功

## 総評
✅ ALL CHECKS PASSED。2つのバグを修正:
1. LocalRecognizerAdapter からの二重イベント送信を削除
2. PseudoAsrStreamer を内蔵し、マイクキャプチャ→VAD→ASR のパイプラインを実装

プロダクションコード（OpenAIRecognizer, MacSpeechBackend 等）には一切変更なし。
build_streamer_config() のみ pub(crate) 化して共用。
