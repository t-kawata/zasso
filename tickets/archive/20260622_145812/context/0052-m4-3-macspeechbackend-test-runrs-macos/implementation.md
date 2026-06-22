# M4-3: MacSpeechBackend + test-run.rs [MACOS]

## 変更ファイル

| ファイル | 種別 | 内容 |
|---------|------|------|
| `src/backends/mac.rs` | 新規 (449行) | macOS ネイティブ音声認識バックエンド。グローバルチャネル、FFIコールバック4関数、MacSpeechBackend構造体（new/start/stop/tick/Drop）、ticker task、coalescing/watermark純粋関数、10ユニットテスト |
| `src/backends/mod.rs` | 変更 | `#[cfg(target_os = "macos")] pub(crate) mod mac;` 有効化 |
| `src/lib.rs` | 変更 | `#[cfg(target_os = "macos")] pub use backends::mac::MacSpeechBackend;` 追加 |
| `src/binary/test-run.rs` | 変更 | `[MACOS]` セクション追加（cfg条件付き） |

## 実装サマリ

- **MYCUTE `mac.rs` 818行 → voiput 449行**（FFI分離・改善により削減）
- **Boy Scout 改善**:
  - `coalesce_stt_events()` / `extract_unconfirmed_slice()` を純粋関数として抽出 — テスト可能に
  - エラーコード（-10, -11, -12, -13）を名前付き定数に抽出
  - `MAC_DEBUG_COUNTER` 削除
- **移植のポイント**:
  - `SttSettings` → `Option<VadConfig>` に変更（必要な設定値のみ保持）
  - `crate::mycute_settings::*` → `crate::types` / `crate::pipeline::*`
  - グローバルチャネルは `std::sync::Mutex`、構造体フィールドは `parking_lot::Mutex`
  - FFI 呼び出しは `crate::native::mac_ffi` 経由
- **10ユニットテスト**: InternalMacEngine(1), Coalescing(4), Watermark(3), エラーコード(2)
