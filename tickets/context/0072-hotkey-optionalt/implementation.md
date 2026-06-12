# M8-1: hotkey/ モジュール実装サマリ

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|----------|------|------|
| `crates/voiput/Cargo.toml` | 変更 | rdev + winapi features 拡張 (winuser, libloaderapi, processthreadsapi) |
| `crates/voiput/src/constants.rs` | 変更 | HOTKEY_DOUBLE_TAP_MIN_MS(10)/MAX_MS(500) 追加 + テスト2件 |
| `crates/voiput/src/hotkey/mod.rs` | 新規 | HotkeyAction enum (Start/Correct/Summarize/BufferFlush/OrchestratorInput) + Debug/Clone/Send/PartialEq/Eq + テスト2件 |
| `crates/voiput/src/hotkey/mac.rs` | 新規 | CGEventTap macOS 実装。event_tap_callback → handle_flags_changed → handle_key_down の3段階処理。Atomic 型で static mut を最小化。全 unsafe に SAFETY コメント。テスト3件 |
| `crates/voiput/src/hotkey/win.rs` | 新規 | rdev + GetAsyncKeyState ポーリング Windows 実装。デュアルパス・二重発火防止。関数名動詞始まり化。テスト6件 |
| `crates/voiput/src/hotkey/win_hook.rs` | 新規 | WH_KEYBOARD_LL 低レベルフック。Atomic 型で static mut 排除。SendInput Alt UP 注入。テスト4件 |
| `crates/voiput/src/lib.rs` | 変更 | pub mod hotkey 宣言追加 |

## Boy Scout 改善実績
- static mut: mac.rs の RUN_LOOP / HOTKEY_SENDER のみに削減。他は AtomicBool/AtomicU64/AtomicU8 に置き換え
- lazy_static!: win.rs の HOTKEY_SENDER のみ（voiput 既存依存で追加依存なし）
- 関数名: alt_monitor_thread → run_alt_monitoring（動詞始まり）
- 全 unsafe に // SAFETY: コメント付与

## テスト実績
- 全 131 テスト通過 (115 unit + 14 integration + 2 doc)
- 新規ホットキーテスト 15 件すべて通過
  - mod.rs: (2) Debug+Clone+Send, variant distinctness
  - constants.rs: (2) HOTKEY_DOUBLE_TAP_MIN_MS, MAX_MS
  - mac.rs: (3) set_recording_active, new, stop_monitoring_twice
  - win.rs: (6) bit_ops, set_recording_active, stop_monitoring, parse_hotkey, hotkey_def_matches, check_orchestrator_combo
  - win_hook.rs: (4) is_double_tap_detected, is_alt_repeat, vk_code_to_str, current_time_ms (win_hook の追加関数)
