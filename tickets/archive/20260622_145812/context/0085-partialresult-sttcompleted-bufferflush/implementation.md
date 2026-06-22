# 実装サマリ: チケット#85

## 変更ファイル

| ファイル | 変更内容 | 変更量 |
|---------|---------|--------|
| `crates/voiput/src/backends/openai.rs` | PartialResult 非デコレーション時に SttCompleted を追加送信 | +3行（コード1+コメント2） |

## 修正内容
StreamerEvent::PartialResult が非デコレーション中に届いた場合、PartialResult 送信後に SttCompleted も送信するようにした（mycute 準拠）。これにより is_stt_pending が各発話単位で解放され、PostCorrection 前でも Option ダブルタップによる BufferFlush が機能する。

## 動作確認
- cargo check: 警告ゼロ ✅
- cargo test: 全170件パス ✅
- 品質チェック: totalIssues=0 ✅
