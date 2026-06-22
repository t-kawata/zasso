# 実装サマリ: チケット#83（最終版）

## 変更ファイル一覧

| # | ファイル | 種別 | 変更内容 |
|---|---------|------|---------|
| 1 | `crates/voiput/src/recognizer.rs` | 修正 | OpenAIRecognizer の Started/Stopped 発行を削除、stop() アクティブエンジンのみ、実 config 化 |
| 2 | `crates/voiput/src/voiput.rs` | 拡張 | is_stt_pending/pending_flush/last_stt_seq 追加、next_event() 全variant対応、BufferFlush 遅延フラッシュ機構 |
| 3 | `crates/voiput/src/backends/openai.rs` | 全面的書き換え | PseudoAsrStreamer<OpenAIBackend>統合、デコレーション機構、3タスク、複数 start/stop サイクル対応 |
| 4 | `crates/voiput/src/binary/test-run.rs` | 拡張 | 全 SttEvent variant の表示ハンドラ追加 |

## 修正されたバグ

| # | 問題 | 修正内容 |
|---|------|---------|
| 1 | ハードコード 48000Hz（macOS 実機は 44100Hz） | キャプチャタスクが実際のサンプルレートを共有 AtomicU32 に書き込み、ticker が読み取る |
| 2 | 2回目の start/stop サイクルが silent failure | rebuild_streamer() を追加、streamer_rx 消費後に再生成 |
| 3 | SttCompleted が PartialResult 後にも発行 | FinalResult 後にのみ送信するよう修正 |
| 4 | execute_pending_flush 後、try_send_flush_text が flush_tx を再アーム | pending_flush 時は try_send_flush_text をスキップ |
| 5 | デコレーションタイムアウトが 30s 固定 | vad_max_speech_duration + 5s を設定値から計算 |
| 6 | ForceClearDecoration が未発行（定義のみ） | デコレーション異常復帰パスで発行するよう修正 |
| 7 | Ticker の Mutex ロック範囲が過剰 | push_samples と tick で別々にロック |

## 動作確認

- `cargo check` — 警告ゼロ ✅
- `cargo test` — lib 154件 + integration 14件 + doc 2件 = 全170件パス ✅
- スタブ — 3件すべて解決 ✅
- 品質チェック — totalIssues=0 ✅
- OS モード — MacSpeechBackend/WinSpeechBackend 未変更 ✅
