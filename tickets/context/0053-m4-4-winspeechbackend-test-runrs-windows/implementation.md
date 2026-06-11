# M4-4: WinSpeechBackend + test-run.rs [WINDOWS]

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/backends/win.rs` | 新規 | Windows ネイティブ音声認識バックエンド。グローバルチャネル、FFIコールバック4関数、IME制御、WinSpeechBackend（new/start/stop/tick/Drop）、ticker task（タイムアウト句読点含む）、pure関数、9ユニットテスト |
| `src/backends/mod.rs` | 変更 | `#[cfg(target_os = "windows")] pub(crate) mod win;` 追加 |
| `src/lib.rs` | 変更 | `#[cfg(target_os = "windows")] pub use backends::win::WinSpeechBackend;` 追加 |
| `src/binary/test-run.rs` | 変更 | `[WINDOWS]` セクション追加（cfg条件付き） |
| `build.rs` | 変更 | `link_windows()` に C スタブ生成（cl.exe + lib.exe）処理を追加 |

## 実装サマリ

- **MYCUTE `win.rs` 944行 → voiput 〜480行**（FFI分離・改善により削減）
- **macOS との差分**: IME制御、PunctuationMachine句読点挿入、タイムアウト句読点（500ms）、ヘルスチェック
- **Boy Scout 改善**: coalescing/watermark/has_unconfirmed を純粋関数抽出、WIN_DEBUG_COUNTER削除
- **9ユニットテスト**: Coalescing(4), Watermark(3), has_unconfirmed(2)
