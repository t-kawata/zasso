# M8-3fix: ホットキー制御修正 実装計画

## 要件
process_hotkey_action() に RECORDING_ACTIVE 連携を追加。6行の修正。

## 変更ファイル
| ファイル | 種別 | 内容 |
| src/voiput.rs | 変更 | process_hotkey_action() 3分岐修正 + update_recording_state helper追加 |

## 実装手順
1. update_recording_state() helper 追加
2. Start: is_runningチェック + set_recording_active(true)
3. BufferFlush: set_recording_active(false)
4. OrchestratorInput: set_recording_active(false)
5. テスト4件追加
6. cargo check + cargo test
