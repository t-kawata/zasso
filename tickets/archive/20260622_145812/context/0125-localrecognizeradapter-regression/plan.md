# 実装計画: LocalRecognizerAdapter イベント中継 regression 修正

## 要件
チケット#124 の修正で混入した regression を修正する。
streamer_rx を Arc<Mutex<>> でラップし、スレッド内イベント中継に戻す。

## 変更ファイル
| ファイル | 内容 |
|---------|------|
| crates/voiput/src/recognizer.rs | streamer_rx を Arc<Mutex> 化、スレッド内イベント中継、tick 削除 |

## 実装手順
1. struct: streamer_rx を Arc<Mutex<Option<>>> に変更
2. new(): Arc::new(Mutex::new(Some(rx_streamer))) でラップ
3. start(): スレッド内で rx を clone + イベント中継実装
4. tick() メソッドを削除
5. SpeechRecognizer::tick() の Local 分岐を no-op に戻す
6. 未使用インポートの削除確認

## リスク
なし（1ファイルのみ、既存バックエンド不変）
