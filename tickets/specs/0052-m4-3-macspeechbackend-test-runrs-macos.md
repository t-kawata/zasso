---
ticket_id: 52
title: M4-3: MacSpeechBackend + test-run.rs [MACOS]
slug: m4-3-macspeechbackend-test-runrs-macos
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/kawata/shyme/zasso/tickets/context/0052-m4-3-macspeechbackend-test-runrs-macos/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0052-m4-3-macspeechbackend-test-runrs-macos/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0052-m4-3-macspeechbackend-test-runrs-macos/review.md
---
# M4-3: MacSpeechBackend + test-run.rs [MACOS]

## Summary

MYCUTE の macOS ネイティブ音声認識バックエンド（`src/stt/mac.rs`）を voiput `backends/mac.rs` に移植する。
FFI 宣言は既に `native/mac_ffi.rs` として分離済み。グローバルチャネル、コールバック関数、
MacSpeechBackend のライフサイクル（new/start/stop/tick/Drop）、および ticker タスク内部の
ウォーターマーク同期・Coalescing・PostCorrection 連携を移植する。

## Background

M4-1 で FFI 宣言（`native/mac_ffi.rs`）は既に分離済み。本チケットでは実際のバックエンドロジックを移植する。
MYCUTE との差分は以下：
- `crate::mycute_settings::*` → `crate::types` / `crate::VoiceKitConfig`
- `crate::tools::*` → `crate::pipeline::*`
- `tauri::async_runtime` → `tokio`
- `SttSettings` → `VoiceKitConfig`（VAD設定・モデルパスを Config 経由で取得）

## Scope

### 1. `backends/mac.rs` — 移植（MYCUTE ~/shyme/mycute/src/stt/mac.rs 818行 → 削減予定）

**移植不要（既存）:**
- FFI extern "C" ブロック → `native/mac_ffi.rs` に分離済み（M4-1）

**移植して voiput 用に修正する要素:**

| 要素 | MYCUTE | voiput |
|------|--------|--------|
| `InternalMacEngine` enum | 同一ファイル内で定義 | `backends/mac.rs` 内で定義（内部enum、非公開） |
| グローバルチャネル（lazy_static） | `MAC_GLOBAL_TX`, `MAC_GLOBAL_SEQ`, `MAC_AUDIO_SENDER` | 同一。`MAC_DEBUG_COUNTER` は削除 |
| FFI コールバック（4関数） | `mac_audio_data_callback`, `result_callback`, `error_callback`, `mac_ready_callback` | 同一内容で移植 |
| 公開関数（2つ） | `start_native_audio_capture()`, `stop_native_audio_capture()` | `pub(crate)` で移植 |
| `MacSpeechBackend` struct | 18フィールド | 同構造で移植。`stt_settings: Option<SttSettings>` → `vad_config: Option<VadConfig>` に変更し、設定値だけ保持 |
| `MacSpeechBackend::new()` | SttSettings → init + Tahoe検出 | VoiceKitConfig から VAD設定値を抽出。FFI呼び出しは native::mac_ffi の公開関数を使用 |
| `handle_error(code)` | エラーコードマッピング | 同一 |
| `start()` | VAD初期化 + native capture起動 + ticker spawn | 同様。VAD設定は config から取得、`vad_model_paths` からパス解決 |
| `stop()` | キャプチャ停止 + プロセッサリセット + ticker abort | 同一 |
| `set_locale()` / `update_pc_config()` / `cleanup()` / `tick()` | アクセサ | 同一 |
| `Drop` impl | stop + cleanup + グローバルチャネルクリア | 同一 |
| ticker task（tokio::spawn） | 音声収集→リサンプル→VAD / Coalescing / Watermark / PostCorrection | 同一ロジック。`current_raw_char_count`/`current_seq` 保持と PostCorrection pending 処理を含む |

**インポートマッピング（全置換）:**
| MYCUTE | voiput |
|--------|--------|
| `crate::mycute_settings::SttSettings` | `crate::VoiceKitConfig`（または設定値のみ抽出） |
| `crate::mycute_settings::{LocaleCode, SttEngine}` | `crate::{LocaleCode, SttEngine}` |
| `crate::tools::post_correction_processor::*` | `crate::pipeline::post_correct::*` |
| `crate::tools::resampler::{InternalResampler, SincResampler}` | `crate::pipeline::resampler::{InternalResampler, SincResampler}` |
| `crate::tools::vad_processor::{VadConfig, VadProcessor, VAD_SAMPLE_RATE}` | `crate::pipeline::vad::{VadConfig, VadProcessor, VAD_SAMPLE_RATE}` |
| `crate::constants::SPEECH_TIMEOUT_SEC` | `crate::constants::SPEECH_TIMEOUT_SEC`（同一） |
| `crate::types::SttEvent` | `crate::SttEvent`（pub re-export） |
| FFI `speech_helper_*` / `tahoe_helper_*` | `crate::native::mac_ffi::speech_helper_*` |

### 2. `backends/mod.rs` — macOS モジュール公開

```rust
#[cfg(target_os = "macos")]
pub(crate) mod mac;
```

### 3. `lib.rs` — re-export（cfg 条件付き）

```rust
#[cfg(target_os = "macos")]
pub use backends::mac::MacSpeechBackend;
```

### 4. `test-run.rs` — `[MACOS]` セクション追加

```rust
#[cfg(target_os = "macos")]
fn test_macos() {
    show_section("MACOS");
    // cfg(target_os="macos") の場合のみコンパイル
    // 実際のライブラリが存在しない場合は [SKIP]
}
```

## Non-scope

- macOS ネイティブライブラリ（libspeech_helper.a）のビルド — M6-1
- Windows バックエンド — M4-4
- PseudoAsrStreamer との統合 — M5-1

## Investigation

### 証拠1: 移植元ファイルサイズと構造

`~/shyme/mycute/src/stt/mac.rs` = **818行**。
内訳:
- `extern "C"` FFI ブロック（28〜52行、25行）→ M4-1 で native/mac_ffi.rs に分離済み
- グローバルチャネル（54〜59行、6行）
- FFI コールバック 4関数（64〜179行、115行）
- 公開関数 2つ（182〜213行、32行）
- MacSpeechBackend struct + impl（215〜818行、603行）
  - new()（240〜338行、99行）
  - start()（341〜701行、361行）← 最大のブロック。ticker task を含む
  - stop()（723〜758行、36行）
  - set_locale / update_pc_config / cleanup / tick（761〜807行、47行）
  - Drop impl（810〜818行、9行）

### 証拠2: FFI は既に分離済み

`crates/voiput/src/native/mac_ffi.rs`（47行）に全 extern "C" 宣言が完了。
`#[link(name = "SpeechHelper")]` も記述済み。
47行中、16の公開関数が宣言されている。

### 証拠3: MacSpeechBackend のフィールド構成

```rust
pub struct MacSpeechBackend {
    is_running: Arc<AtomicBool>,
    internal_engine: InternalMacEngine,
    locale: Arc<parking_lot::Mutex<LocaleCode>>,
    post_correction_processor: Arc<parking_lot::Mutex<Option<PostCorrectionProcessor>>>,
    is_speaking: Arc<AtomicBool>,
    vad_processor: Arc<parking_lot::Mutex<Option<VadProcessor>>>,
    stt_settings: Option<SttSettings>,           // → Option<VadConfig> に変更
    rx_raw: Arc<parking_lot::Mutex<Option<mpsc::Receiver<SttEvent>>>>,
    tx_app: mpsc::Sender<SttEvent>,
    ticker_task: Option<tokio::task::JoinHandle<()>>,
    resampler: Arc<parking_lot::Mutex<Option<SincResampler>>>,
}
```

### 証拠4: グローバルチャネル

```rust
lazy_static::lazy_static! {
    static ref MAC_GLOBAL_TX: Mutex<Option<mpsc::Sender<SttEvent>>> = ...;
    static ref MAC_GLOBAL_SEQ: AtomicU64 = ...;
    static ref MAC_AUDIO_SENDER: Mutex<Option<mpsc::UnboundedSender<(Vec<f32>, u32)>>> = ...;
}
```

`MAC_DEBUG_COUNTER`（AtomicU64, 行62）はデバッグ用につき削除。

### 証拠5: ticker task の内部ロジック（最重要、361行）

ticker task は tokio::spawn で起動され、50ms間隔で以下を実行:

1. **音声データ収集**: `rx_audio.try_recv()` で蓄積された音声を回収
2. **リサンプリング**: 48kHz→16kHz（`SincResampler`を使用、動的再初期化対応）
3. **VAD処理**: リサンプル済みデータを VadProcessor.accept_waveform() に投入
4. **イベント収集**: `rx_raw.try_recv()` で Swift からの認識結果を回収
5. **Coalescing**: 複数の PartialResult/FinalResult から最新の1つのみ保持。古いseqは破棄
6. **制御イベント転送**: Error/Stopped 等は即時アプリへ転送
7. **Watermark同期**: 確定済み文字数（watermark）以降の差分テキストのみを後段へ。バックトラック検出（raw_char_count < watermark_len）時は待機
8. **PostCorrection**: 差分テキストをプロセッサに投入。Pending補正の実行（沈黙タイマー＋LLM）
9. **待機**: tokio::time::sleep(50ms)

### 証拠6: VAD 設定の取得パス

MYCUTE では `settings.get_vad_path()` でモデルパスを取得している。
voiput では `VoiceKitConfig` の `vad_model_paths` から取得する。

```rust
// MYCUTE
let model_path: String = settings.get_vad_path().unwrap_or_default();
// voiput
let model_path = match config.vad_type {
    VadType::Silero => &config.vad_model_paths.silero,
    VadType::Ten => &config.vad_model_paths.ten,
};
```

## Test Plan

### ユニットテスト計画

- `backends/mac.rs` 内の `#[cfg(test)] mod tests`:
  - `InternalMacEngine` の構築テスト（Debug + Clone + PartialEq）
  - Coalescing ロジックの分離テスト（同一seqの古いイベントがドロップされること）
  - Watermark同期ロジックの分離テスト（backtrack時は何も送出しない、forward時は差分のみ送出）
  - `handle_error()` のエラーコードマッピングテスト

### ユニットテスト不可能な項目（例外）

- **FFI 呼び出し全般**: libspeech_helper.a が macOS 実機でないとリンクできない
- **実際の音声認識**: マイクとmacOS権限が必要
- **Ticker taskの完全テスト**: tokio::spawn と実際のチャネル通信が必要。coalescing/watermark のロジック部分はユニットテストで分離検証する

## Boy Scout Rule — 翻訳可能性計画

- MYCUTE の mac.rs は1ファイル818行と大きい。ticker task 内部の coalescing / watermark / post-correction は責務ごとに関数に抽出して可読性を高める
- `MAC_DEBUG_COUNTER` は削除（デバッグログで用が足りる）
- エラーコードマッピングのマジックナンバー（-10, -11, -12, -13）は名前付き定数に抽出
- MYCUTE にあった `#[allow(dead_code)]` は削除（使用されないコードは移植しない）

## Acceptance Criteria

- [ ] `cfg(target_os = "macos")` 条件下で `cargo check` がエラーなく通ること
- [ ] FFI コールバック4関数が正しく移植されていること
- [ ] MacSpeechBackend の new/start/stop/Drop ライフサイクルが正しいこと
- [ ] Coalescing + Watermark の分離テストが通ること
- [ ] test-run.rs `[MACOS]` が `cfg` 条件付きでコンパイル可能なこと
- [ ] 既存全テストが通過すること

## Notes

- 移植元は `~/shyme/mycute/src/stt/mac.rs`。M4-2（OpenAIBackend）と同様に LmgwClient は一切登場しない
- `start_native_audio_capture()` / `stop_native_audio_capture()` は macOS 専用の公開関数。Windows 側（M4-4）にも同名関数が存在するため、モジュール名での区別が必須
- M4-1 で native::mac_ffi.rs が既に分離されているため、移植作業はグローバルチャネル・コールバック・MacSpeechBackend本体・ticker task に集中する

### 成果物

- 計画: context/0052-m4-3-macspeechbackend-test-runrs-macos/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0052-m4-3-macspeechbackend-test-runrs-macos/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0052-m4-3-macspeechbackend-test-runrs-macos/review.md（未作成、/review-ticket 全チェック通過後に作成）
