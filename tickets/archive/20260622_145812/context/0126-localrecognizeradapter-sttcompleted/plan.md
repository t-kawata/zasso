# 実装計画: LocalRecognizerAdapter 不足機能追加 (#126)

## 要件
OpenAIRecognizer と同等のイベント処理を LocalRecognizerAdapter に追加

## 変更ファイル
| ファイル | 内容 |
|---------|------|
| crates/voiput/src/recognizer.rs | イベント中継拡張 + フィールド追加 |

## 実装手順
1. struct にデコレーションフィールド追加 (seq_counter, is_decorating, etc.)
2. new() で初期化
3. イベント中継 match 式を OpenAIRecognizer 相当に拡張
4. デコレーションタスク起動 (tokio::spawn)
5. stop() でデコレーションタスク abort
6. インポート追加 (AtomicU64, Instant, JoinHandle, strip_decoration_artifacts)

## リスク
低（追加のみ、既存コード削除なし）
