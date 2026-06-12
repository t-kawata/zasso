---
ticket_id: 53
title: M4-4: WinSpeechBackend + test-run.rs [WINDOWS]
slug: m4-4-winspeechbackend-test-runrs-windows
status: reviewed
created_at: 2026-06-12
updated_at: 2026-06-12
plan_path: /Users/kawata/shyme/zasso/tickets/context/0053-m4-4-winspeechbackend-test-runrs-windows/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0053-m4-4-winspeechbackend-test-runrs-windows/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0053-m4-4-winspeechbackend-test-runrs-windows/review.md
---
# M4-4: WinSpeechBackend + test-run.rs [WINDOWS]

## Summary

MYCUTE の Windows ネイティブ音声認識バックエンド（`src/stt/win.rs` 944行）を voiput `backends/win.rs` に移植する。
FFI 宣言 + ヘルスチェック状態管理は既に `native/win_ffi.rs` として分離済み。
MacSpeechBackend（M4-3）と共通の構造が多いが、Windows 固有の要素（IME制御、PunctuationMachine による句読点挿入、タイムアウト句読点、ヘルスチェック）がある。

## Background

M4-1 で FFI 宣言（`native/win_ffi.rs`）は既に分離済み。M4-3（MacSpeechBackend）とほぼ同一の構造を持つが、以下の Windows 固有要素がある：
- `PunctuationMachine` によるリアルタイム句読点挿入（M2-3 で実装済み）
- IME 制御（開始時 OFF / 終了時 復元）
- 初期化時ヘルスチェック
- 無音タイムアウト時（500ms）の強制句読点挿入（STT_TIMEOUT_PUNCTUATION_MS）

## Scope

### 1. `backends/win.rs` — 移植（MYCUTE ~/shyme/mycute/src/stt/win.rs 944行 → 削減予定）

**移植不要（既存）:**
- FFI extern "C" ブロック + ヘルスチェック状態管理 → `native/win_ffi.rs` に分離済み（M4-1）
- `PunctuationMachine` → `crate::pipeline::punctuation::PunctuationMachine`（M2-3）

**移植して voiput 用に修正する要素:**

| 要素 | MYCUTE | voiput |
|------|--------|--------|
| グローバルチャネル（lazy_static） | WIN_GLOBAL_TX, WIN_GLOBAL_SEQ, WIN_GLOBAL_PUNCH, WIN_CURRENT_LOCALE, WIN_AUDIO_SENDER | 同一。WIN_DEBUG_COUNTER は削除 |
| FFI コールバック（4関数） | win_audio_data_callback, win_result_callback, win_error_callback, win_ready_callback | 同一内容で移植 |
| IME 制御 (2関数) | `disable_ime()`, `restore_ime()` | `pub(crate)` で移植 |
| Native capture (2関数) | `start_native_audio_capture()`, `stop_native_audio_capture()` | `pub(crate)` で移植 |
| `WinSpeechBackend` struct | 10フィールド（Mac と類似） | 同構造。`stt_settings: Option<SttSettings>` → `vad_config: Option<VadConfig>` |
| `WinSpeechBackend::new()` | init + health check + PunctuationMachine初期化 | init + health check + punctuation。FFIは native::win_ffi 経由 |
| `start()` | VAD + native capture + ticker spawn | 同様 |
| `set_locale()` / `update_pc_config()` / `cleanup()` / `tick()` | アクセサ | 同一 |
| `Drop` impl | stop + cleanup + グローバルチャネルクリア | 同一 |
| ticker task | 音声収集→VAD / Coalescing / Watermark / PunctuationMachine / PostCorrection / タイムアウト句読点 | 同一ロジック + タイムアウト句読点（macOS にない差分） |

**Windows ticker task の macOS との差分:**
1. `WIN_GLOBAL_PUNCH` を介した PunctuationMachine による句読点挿入
2. タイムアウト監視（`last_received_time` + `STT_TIMEOUT_PUNCTUATION_MS`）
3. タイムアウト発火時: 未確定テキストの有無で PartialResult / FinalResult を動的選択
4. 句読点挿入は `analyze_and_insert_punctuation()` 関数として分離

**インポートマッピング:**
| MYCUTE | voiput |
|--------|--------|
| `crate::mycute_settings::SttSettings` | `crate::VoiputConfig` / `VadConfig` |
| `crate::mycute_settings::LocaleCode` | `crate::LocaleCode` |
| `crate::tools::post_correction_processor::*` | `crate::pipeline::post_correct::*` |
| `crate::tools::punctuation_machine::PunctuationMachine` | `crate::pipeline::punctuation::PunctuationMachine` |
| `crate::tools::resampler::*` | `crate::pipeline::resampler::*` |
| `crate::tools::vad_processor::*` | `crate::pipeline::vad::*` |
| `crate::constants::STT_TIMEOUT_PUNCTUATION_MS` | `crate::constants::STT_TIMEOUT_PUNCTUATION_MS`（同一） |
| `crate::constants::SPEECH_TIMEOUT_SEC` | `crate::constants::SPEECH_TIMEOUT_SEC`（同一） |
| `crate::types::SttEvent` | `crate::SttEvent` |
| FFI `speech_helper_*` | `crate::native::win_ffi::speech_helper_*` |

### 2. `backends/mod.rs` — Windows モジュール公開

```rust
#[cfg(target_os = "windows")]
pub(crate) mod win;
```

### 3. `lib.rs` — re-export（cfg 条件付き）

```rust
#[cfg(target_os = "windows")]
pub use backends::win::WinSpeechBackend;
```

### 4. `test-run.rs` — `[WINDOWS]` セクション追加

```rust
#[cfg(target_os = "windows")]
fn test_windows() {
    show_section("WINDOWS");
    // WinSpeechBackend::new() を呼び出し、結果を表示
    // build.rs が生成するスタブによりリンクは成功する
}
```

## Non-scope

- Windows ネイティブライブラリ（SpeechHelper.lib）のビルド方法 — M6-1
- macOS バックエンド — M4-3（完了済み）
- PseudoAsrStreamer との統合 — M5-1

## Investigation

### 証拠1: 移植元ファイルサイズと構造

`~/shyme/mycute/src/stt/win.rs` = **944行**。
内訳:
- FFI extern "C" ブロック（25〜41行、17行）→ M4-1 で分離済み
- IME制御関数（44〜55行、12行）
- グローバルチャネル（58〜67行、10行）
- ヘルスチェック（70〜87行、18行）→ M4-1 で分離済み
- FFI コールバック（90〜230行、141行）
- WinSpeechBackend struct + impl（233〜935行、703行）
  - new()（256〜352行、97行）
  - start()（355〜869行、515行）← 最大。ticker task を含む
  - stop()（872〜910行、39行）
  - set_locale / cleanup / tick（912〜930行、19行）
  - Drop impl（933〜942行、10行）

### 証拠2: FFI は既に分離済み

`native/win_ffi.rs`（102行）に以下が完了:
- `#[link(name = "SpeechHelper", kind = "static")] extern "C"` ブロック（12関数）
- ヘルスチェック状態管理（AtomicU32 + AtomicBool + 4アクセサ関数）
- 3ユニットテスト

### 証拠3: Windows 固有のグローバルチャネル

```rust
lazy_static! {
    static ref WIN_GLOBAL_TX: Mutex<Option<Sender<SttEvent>>> = ...;
    static ref WIN_GLOBAL_SEQ: AtomicU64 = ...;
    static ref WIN_GLOBAL_PUNCH: Mutex<Option<PunctuationMachine>> = ...; // ← macOS にない
    static ref WIN_CURRENT_LOCALE: Mutex<LocaleCode> = ...;               // ← macOS にない
    static ref WIN_AUDIO_SENDER: Mutex<Option<UnboundedSender<...>>> = ...;
}
```

`WIN_GLOBAL_PUNCH` は ticker task 内で句読点挿入に使用される（コールバックスレッドからは触らない）。
`WIN_CURRENT_LOCALE` は FFI コールバック内でのロケール参照用。

### 証拠4: ticker task の macOS との差分

Windows ticker は macOS と以下の点が異なる:

1. **タイムアウト句読点**: `last_received_time` を保持し、`STT_TIMEOUT_PUNCTUATION_MS`（500ms）の無音を検出したら、PunctuationMachine で保留テキストに句読点を挿入する。
   - 未確定文字あり → `PartialResult`（仮置き、次の入力で上書き可）
   - 未確定文字なし → `FinalResult`（確定）
   - `processed_timeout_seq` でワンショット制御（同じ seq で複数回発火しない）

2. **PunctuationMachine**: テキスト処理の前後で `WIN_GLOBAL_PUNCH` の `insert_with_context(text, "", locale, allow_terminal)` を呼び出す。

### 証拠5: コールバック引数型の違い

macOS と Windows で FFI コールバックの引数型が一部異なる:
- macOS: `count: i32, sample_rate: i32`
- Windows: `count: u32, sample_rate: u32`
- macOS: `result_callback(text: *const c_char, is_final: i32)`
- Windows: `result_callback(text: *const c_char, is_final: c_int)`（`c_int` = `i32`、同一）

### 証拠6: build.rs の Windows スタブ

Windows スタブ（`SpeechHelper.lib`）は `link_windows()` 関数で自動生成される。
M4-3 で修正した macOS スタブと同様の課題があるため、対応する C ソーススタブをビルド時に生成する必要がある。

## Test Plan

### ユニットテスト計画

- `backends/win.rs` 内の `#[cfg(test)] mod tests`:
  - Coalescing ロジック（macOS と同一、`coalesce_stt_events` を共用する形でも可だが、win.rs 内に分離して移植）
  - Watermark ロジック（macOS と同一）
  - タイムアウト句読点ロジックの分離テスト（前回受信時刻と現在時刻の比較、未確定文字有無による Partial/Final 振り分け）
  - IME 関数の呼び出し確認（コンパイル時）

### ユニットテスト不可能な項目

- **FFI 呼び出し全般**: SpeechHelper.lib が必要。スタブでは init が -1 を返す
- **実際の音声認識**: マイクと Windows 権限が必要
- **PunctuationMachine 結合テスト**: 日本語辞書（Lindera IPADIC embedded）が必要だが、ユニットテストレベルでモック可能

## Boy Scout Rule — 翻訳可能性計画

- M4-3 と同様、coalescing/watermark/タイムアウト句読点を純粋関数として抽出
- `WIN_DEBUG_COUNTER` は削除（macOS と同様）
- FFI コールバック型（`c_int` vs `i32`）に注意。MYCUTE からの変更は最小限に
- タイムアウト句読点の条件分岐（`has_unconfirmed` による Partial/Final 振り分け）はコメントと関数名で意図を明確にする

## Acceptance Criteria

- [ ] `cfg(target_os = "windows")` 条件下で `cargo check` がエラーなく通ること
- [ ] FFI コールバック4関数が正しく移植されていること
- [ ] WinSpeechBackend の new/start/stop/Drop ライフサイクルが正しいこと
- [ ] Coalescing + Watermark + タイムアウト句読点の分離テストが通ること
- [ ] test-run.rs `[WINDOWS]` が cfg 条件付きでコンパイル可能なこと
- [ ] 既存全テストが通過すること

## Notes

- 移植元は `~/shyme/mycute/src/stt/win.rs`（944行）。MacSpeechBackend（M4-3、818行）より126行多い
- 差分の主要原因はタイムアウト句読点ロジック（約100行）と PunctuationMachine 連携
- `WIN_GLOBAL_PUNCH` は macOS にない Windows 固有のグローバル。`WIN_CURRENT_LOCALE` も同様
- M4-3 で抽出した `coalesce_stt_events()` / `extract_unconfirmed_slice()` が windows でも全く同じロジックで使える。`backends/win.rs` 内に同じ関数を移植するか、共通モジュールに抽出するかは実装時判断
- `build.rs` の `link_windows()` は macOS と同様に C スタブを生成するよう修正が必要

### 成果物

- 計画: context/0053-m4-4-winspeechbackend-test-runrs-windows/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0053-m4-4-winspeechbackend-test-runrs-windows/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0053-m4-4-winspeechbackend-test-runrs-windows/review.md（未作成、/review-ticket 全チェック通過後に作成）
