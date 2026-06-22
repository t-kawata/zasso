# M8-3: Voiput 拡張 実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `src/types.rs` | 変更 | InputMode enum (RealTime/Buffered) + SttEvent::Flushed(String) variant + テスト3件 |
| `src/voiput.rs` | 変更 | 6フィールド追加 (mode/buffer/current_text/is_post_correcting/flush_tx/hotkey_rx)、新規メソッド (enable_hotkeys/handle_hotkey_events/process_hotkey_action/build_flush_text/request_flush/try_send_flush_text/paste_at_cursor/input_mode/getters)、next_event内flush_tx発火、テスト13件 |
| `src/hotkey/mod.rs` | 変更 | start_hotkey_monitor() cfg dispatcher 追加 |

## 新規メソッド一覧
- `enable_hotkeys()` — cfg-gated HotkeyMonitor起動
- `handle_hotkey_events()` — ホットキーアクションを一括処理（イベントループ内で定期呼び出し）
- `process_hotkey_action()` — Start→録音+Ready音, BufferFlush→flush+ペースト+Commit音, OrchestratorInput→モード切替
- `build_flush_text()` — buffer/current_text 重複除去ロジック
- `request_flush()` — flush_tx事前セット→recognizer.stop() の安全順序
- `try_send_flush_text()` — 4段階発火共通ロジック（空テキスト時は温存）
- `paste_at_cursor()` — clipboard::save_paste_and_restore 委譲

## Boy Scout 改善
- プロダクションコードに unwrap() なし ✅
- static mut ゼロ ✅
- 非対応OSで enable_hotkeys が no-op（cfg 分岐を関数内部で完結）

## テスト実績
- 全 155 テスト通過 (139 unit + 14 integration + 2 doc)
- 新規テスト 16 件すべて通過
