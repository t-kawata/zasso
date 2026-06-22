# 実装サマリ: チケット#89

## 変更ファイル
| ファイル | 変更内容 | 変更量 |
|---------|---------|--------|
| `crates/voiput/src/voiput.rs` | OrchestratorInput 自動開始 + pending_flush 種別追跡 | +20行 |

## 修正内容
1. **OrchestratorInput 非録音時自動開始**: is_running ガードを削除し、非録音時は BufferFlush Start と同様の録音開始処理を実行
2. **pending_flush_is_orchestrator フラグ追加**: 遅延フラッシュの由来を追跡し、execute_pending_flush 内で paste / Flushed を正しく分岐

## 動作確認
- cargo check: 警告ゼロ ✅
- cargo test: 全170件パス ✅
- 品質チェック: totalIssues=0 ✅
