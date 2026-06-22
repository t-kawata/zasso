# 実装サマリ: チケット#88

## 変更ファイル
| ファイル | 変更内容 | 変更量 |
|---------|---------|--------|
| `crates/voiput/src/voiput.rs` | `flush_and_cleanup(paste)` 抽出、BufferFlush/OrchestratorInput から呼び出し、モード切替削除 | ±10行 |

## 修正内容
- BufferFlush のフラッシュ＋後処理部分を `flush_and_cleanup(bool)` として共通化
- BufferFlush → `flush_and_cleanup(true)`（クリップボードペースト）
- OrchestratorInput → `flush_and_cleanup(false)`（Flushed イベント発行）
- 無意味な InputMode モード切替を削除
- OrchestratorInput にも defer チェック（is_stt_pending / is_post_correcting）を追加

## 動作確認
- cargo check: 警告ゼロ ✅
- cargo test: 全170件パス ✅
- 品質チェック: totalIssues=0 ✅
