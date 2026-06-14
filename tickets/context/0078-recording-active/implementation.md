# M8-3fix: ホットキー制御修正 実装サマリ

## 変更ファイル
| ファイル | 種別 | 内容 |
|----------|------|------|
| src/voiput.rs | 変更 | process_hotkey_action 3分岐修正 + update_recording_state helper追加 + テスト3件 |

## 修正内容

1. **update_recording_state() helper 追加**: cfg-gated で mac/win の set_recording_active を呼ぶ共通関数
2. **Start ハンドラ修正**: is_running() チェック追加（録音中は無視）+ update_recording_state(true)
3. **BufferFlush ハンドラ修正**: is_running() チェック追加（非録音中は無視）+ update_recording_state(false)
4. **OrchestratorInput ハンドラ修正**: update_recording_state(false) 追加

## テスト実績
- 全 158 テスト通過 (142 unit + 14 integration + 2 doc)
- 新規テスト 3 件: update_recording_state_toggle, buffer_flush_idle, orchestrator_input
- 品質チェック 0 issues
