# 実装サマリ: チケット#84

## 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `crates/voiput/src/backends/openai.rs` | SpeechStart で `last_speech_end_time` クリア追加 + デコレーションタスク abort 後に await 完了待ち追加 |
| `crates/voiput/src/types.rs` | VadConfig デフォルト値変更（min_speech_duration: 0.25→0.05, pre_padding_ms: 100→200）+ テスト期待値更新 |

## 各修正の詳細

### 修正1: last_speech_end_time クリア
- `*listener_speech_end_time.lock() = None;` を SpeechStart ハンドラに追加
- 前発話の SpeechEnd 時刻が残っていることで第2発話以降のデコレーションが ForceClearDecoration されるバグを解消

### 修正2: abort + await
- `task.abort()` の後に `let _ = task.await;` を追加
- 旧デコレーションタスクの完全終了を待ってから新タスクを起動することでタスク競合を解消
- MutexGuard が await 境界をまたがないよう `guard.take()` をスコープ外に移動

### 修正3: VAD パラメータ
- `min_speech_duration: 0.25` → `0.05`（mycute 実績値と一致）
- `pre_padding_ms: 100` → `200`（同上）
- テスト期待値も同時更新

## 動作確認

- `cargo check`: 警告ゼロ ✅
- `cargo test`: 全170件パス（lib 154 + integration 14 + doc 2） ✅
- 品質チェック: totalIssues=0 ✅
- スタブ: なし ✅
