# 実装サマリ: #82 STATUS_ACCESS_VIOLATION修正

## 変更内容

| ファイル | 変更 |
|---------|------|
| `crates/voiput/src/native/win_ffi.rs` | `SPEECH_HELPER_INITIALIZED` AtomicBool ガード追加。`try_acquire_init_token()` (compare_exchange) + 補助関数群 |
| `crates/voiput/src/backends/win.rs` | `WinSpeechBackend::new()` を init guard 対応に変更。`ensure_speech_helper_initialized()` 関数を抽出（初回のみ FFI init + health check、2回目以降はスキップ）。`Drop` にリセット禁止コメント追加 |
| `crates/voiput/src/hotkey/mod.rs` | `stop_hotkey_monitor()` 公開関数追加（cfg ゲートで win::stop_monitoring + win_hook::stop_hook / mac へ委譲） |
| `crates/voiput/src/voiput.rs` | `Voiput::drop()` に `crate::hotkey::stop_hotkey_monitor()` 呼び出し追加。コメントで理由を説明 |
| `crates/voiput/src/binary/test-run.rs` | `test_voiput()` の最小構成テストを `build_voiput_config(args)` から分離し、直接 builder で構築 |

## 修正効果の測定

- 変更前: `[Win/SpeechHelper] Initialized` がテスト実行中に **22回** 出力されていた
- 変更後: 同一プロセス内で **1回のみ** 出力（2つのテストバイナリで各1回 = 計2回）
- `compare_exchange` による TOCTOU 対策により、並行テスト実行時も1回のみ保証

## 検証結果

- `cargo test --manifest-path crates/voiput/Cargo.toml`: 154 passed, 0 failed, 3 ignored
- 3 ignored は既知の `native::win_ffi::tests`（CompileConstraintsAsync ハング問題。本チケットのスコープ外）
- Build warning: なし
- Quality check issues: 全て既存コード由来（新規導入なし）
