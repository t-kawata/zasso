---
ticket_id: 35
title: M0-1: Crate 骨組み（Cargo.toml / build.rs / lib.rs / error.rs / constants.rs）
slug: m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/review.md
---
# M0-1: Crate 骨組み（Cargo.toml / build.rs / lib.rs / error.rs / constants.rs）

## Summary

voiput crate の最小限の骨組みを作成する。以下の5ファイルを新規作成し、`cargo build` が通る状態にする：

- `crates/voiput/Cargo.toml` — RFC 定義の依存関係＋ binary target (test-run) 宣言
- `crates/voiput/build.rs` — プリビルドライブラリリンクのスケルトン
- `crates/voiput/src/lib.rs` — 全モジュール宣言＋公開 API の re-export
- `crates/voiput/src/error.rs` — VoiceKitError 列挙型（thiserror）
- `crates/voiput/src/constants.rs` — MYCUTE から抽出した STT 関連定数 10 個

## Background

このチケットは全マイルストーンの土台となる。他のすべてのチケットはこれらのファイルに依存する：
- Cargo.toml がなければ依存解決ができない
- lib.rs のモジュール宣言がなければ各 .rs ファイルがコンパイルされない
- error.rs がなければ VoiceKitError を返す関数が書けない
- constants.rs がなければマジックナンバーが各所に散逸する

MYCUTE ではこれらの設定が Tauri アプリケーションに密結合していた（`src/constants.rs` は MYCUTE 全体の定数500行+、build.rs は `tauri_build::build()` を含む、Cargo.toml は 170行のアプリ全体依存）。voiput では **STT 機能に必要な部分のみを抽出** し、独立した crate としてビルド可能にする。

## Scope

以下の5ファイルを作成する。各ファイルの内容は RFC と MYCUTE 参照実装に基づく。

### 1. `crates/voiput/Cargo.toml`

- package メタデータ: name = "voiput", version = "0.1.0", edition = "2021"
- `[lib]`: name = "voice_kit", crate-type = ["lib"]
- `[[bin]]`: name = "test-run", path = "src/bin/test-run.rs"
- 依存関係は `cargo add` で追加する（Cargo.toml への直接手書き禁止）。**以下のコマンドを順次実行:**
  ```bash
  cd crates/voiput
  cargo add tokio --features full
  cargo add serde --features derive
  cargo add parking_lot
  cargo add thiserror
  cargo add async-trait
  cargo add rubato
  cargo add indexmap --features serde
  cargo add log
  cargo add anyhow
  cargo add --dev tempfile
  ```
- 上記以外の RFC §8 記載の依存（sherpa-rs, sherpa-rs-sys, hound, lindera, lindera-ipadic, async-openai, rodio, winapi, lazy_static）は **Cargo.toml にコメントアウト行として手動追加する**（`cargo add` ではコメントアウト追加ができないため）。形式:
  ```toml
  # Phase 2 で有効化: cargo add sherpa-rs
  # sherpa-rs = "latest"
  ```

### 2. `crates/voiput/build.rs`

- target_os 分岐のスケルトン構造（macos / windows / その他）
- 各分岐でプリビルドライブラリの存在確認とリンク設定（ライブラリ不在時は warning、panic! は後で）
- `cargo:rerun-if-changed=prebuilt/` を含める
- MYCUTE build.rs（169行）から Tauri 関連（tauri_build::build()）を削除

### 3. `crates/voiput/src/lib.rs`

- 全モジュール宣言（16モジュール）: audio, backends, config, constants, error, lindera_util, native, pipeline, recognizer, types, voice_kit
- 公開 re-export: VoiceKit, VoiceKitConfig, VoiceKitConfigBuilder, VoiceKitError, types::*
- 内部トレイト re-export: PostCorrectionBackend, InternalResampler, SincResampler
- ドキュメント例示コード（RFC §4.2 の main() サンプル）

### 4. `crates/voiput/src/error.rs`

- `VoiceKitError` 列挙型（thiserror 使用）、6 variant:
  - `InvalidConfig(String)` — 設定値のバリデーションエラー
  - `UnsupportedEngine { engine: SttEngine, reason: String }` — 非対応プラットフォーム
  - `PermissionDenied(String)` — マイク/音声認識権限不足
  - `InitError(String)` — 各種初期化失敗
  - `RuntimeError(String)` — 実行時エラー
  - `Io(std::io::Error)` — I/O エラー（透過）

### 5. `crates/voiput/src/constants.rs`

- MYCUTE `src/constants.rs` から STT 関連定数のみ抽出。以下10個：

| 定数名 | 型 | 値 | MYCUTE での出典行 |
|--------|-----|-----|-----------------|
| SPEECH_TIMEOUT_SEC | f64 | 30.0 | 66行目 |
| STT_TIMEOUT_PUNCTUATION_MS | u64 | 500 | 69行目 |
| POST_CORRECTION_SILENCE_WAIT_MS | u64 | 850 | 100行目 |
| STT_DECORATION_INTERVAL_MS | u64 | 180 | 103行目 |
| OPENAI_READY_DELAY_MS | u64 | 250 | 106行目 |
| MODEL_FILENAME_SILERO_VAD | &str | "silero_vad.onnx" | 495行目 |
| MODEL_FILENAME_SILERO_VAD_INT8 | &str | "silero_vad.int8.onnx" | 496行目 |
| MODEL_FILENAME_TEN_VAD | &str | "ten_vad.onnx" | 497行目 |
| MODEL_FILENAME_TEN_VAD_INT8 | &str | "ten-vad.int8.onnx" | 498行目 |
| MODEL_FILENAME_GTCRN | &str | "gtcrn.onnx" | 494行目 |

### 6. `crates/voiput/src/bin/test-run.rs`（最小骨組み）

- main() 関数のみ。Stage 1/6 表示と「このセクションは M0-2 以降のチケットで追加」の表示。
- まだ `test_config()` は呼ばない（M0-2 で追加）。
- これにより、M0-1 単体で `cargo build` が通り、`cargo run --bin test-run` で実行可能。

## Non-scope

- 型定義（types.rs, config.rs）— M0-2 で追加
- 内部トレイト定義（AsrBackend, BackendWrapper 等）— M1-1 以降で追加
- パイプラインコンポーネント（resampler, vad, denoiser 等）— M1-1 以降で追加
- test-run.rs の各機能セクション — 各担当チケットで追加
- ユニットテスト（`#[cfg(test)]`）— このチケットのファイルはテスト対象がない（error.rs の Display テストは追加してもよい）
- prebuilt/ ディレクトリの実体 — M6-1 で追加
- wav/ ファイル — M2-4 で追加

## Investigation

### 証拠1: MYCUTE constants.rs から抽出すべき STT 定数の範囲

MYCUTE `src/constants.rs` は全 660+ 行あり、STT 関連は以下のみ。他はすべて MYCUTE 固有（ポート番号、JWT設定、HTTPパス、DB設定、P2P設定等）。

```
66:  SPEECH_TIMEOUT_SEC: f64 = 30.0
69:  STT_TIMEOUT_PUNCTUATION_MS: u64 = 500
100: POST_CORRECTION_SILENCE_WAIT_MS: u64 = 850
103: STT_DECORATION_INTERVAL_MS: u64 = 180
106: OPENAI_READY_DELAY_MS: u64 = 250
494: MODEL_FILENAME_GTCRN: &str = "gtcrn.onnx"
495: MODEL_FILENAME_SILERO_VAD: &str = "silero_vad.onnx"
496: MODEL_FILENAME_SILERO_VAD_INT8: &str = "silero_vad.int8.onnx"
497: MODEL_FILENAME_TEN_VAD: &str = "ten_vad.onnx"
498: MODEL_FILENAME_TEN_VAD_INT8: &str = "ten-vad.int8.onnx"
```

これらの定数は MYCUTE の `src/stt/recognizer.rs`, `src/stt/openai.rs`, `src/stt/mac.rs`, `src/stt/win.rs`, `src/tools/vad_processor.rs`, `src/tools/post_correction_processor.rs` で使用されている。

### 証拠2: MYCUTE Cargo.toml から見る依存関係の構成

MYCUTE の依存のうち、voiput に必要なもの：
- tokio = "1.49.0"（features = ["full"]）← 共通
- parking_lot = "0.12.1" ← 共通
- lazy_static = "1.4" ← M2〜（audio.rs, mac.rs, win.rs のグローバルチャネルで使用）
- sherpa-rs = "0.6.8" ← M2〜（VAD, Denoiser）
- rubato = "0.16" ← M1〜（Resampler）
- sherpa-rs-sys = "0.6.8" ← M2〜（VAD, Denoiser の低レベルFFI）
- lindera = "2.0.1" + "embed-ipadic" ← M2〜（句読点挿入）
- hound = "3.5.1" ← M3〜（WAV出力）
- async-openai = "0.36.1" + "audio" ← M4〜（OpenAI API）
- indexmap = "2.13.0" + "serde" ← M1〜（置換辞書）
- lindera-ipadic = "2.0.0" ← M2〜
- thiserror = "2.0.18" ← M0〜（エラー型）
- async-trait = "0.1.89" ← M1〜（PostCorrectionBackend）
- rodio = "0.21.1" ← M2〜（効果音再生）

### 証拠3: MYCUTE build.rs と voiput build.rs の差分

MYCUTE build.rs（169行）のうち、voiput に不要な部分：
- `tauri_build::build()` 呼び出し（Tauri 固有）
- Tauri バンドル用の RPATH（`../Resources`, `../Frameworks`）
- `SPEECH_HELPER_LIB_DIR` 環境変数サポート（プリビルド同封のため不要）

voiput に必要で MYCUTE から移植する部分：
- macOS: Swift ランタイムライブラリパス検出（swiftc -print-target-info）
- macOS: システムフレームワークリンク（Foundation, AVFoundation, Speech, CoreFoundation）
- Windows: 静的リンク設定 + DLLコピー
- Windows: システムライブラリリンク（ole32, kernel32 等）
- 全OS: `cargo:rerun-if-changed=prebuilt/`

### 証拠4: lib.rs で宣言すべき全モジュール

MYCUTE のモジュール構造とは異なり、voiput は独自のディレクトリ構成を持つ。RFC §7.1 のモジュール構成に従う：

```
src/
├── lib.rs          ← 本チケット
├── bin/test-run.rs ← 本チケット（骨組みのみ）
├── error.rs        ← 本チケット
├── constants.rs    ← 本チケット
├── config.rs       ← M0-2
├── types.rs        ← M0-2
├── voice_kit.rs    ← M5-2
├── recognizer.rs   ← M5-1 (+ M1-4)
├── audio.rs        ← M2-4
├── lindera_util.rs ← M2-3
├── backends/mod.rs ← Phase 4
├── pipeline/mod.rs ← Phase 1-3
└── native/mod.rs   ← Phase 4
```

lib.rs ですべての mod 宣言を行う。各 mod の実体が存在しなくてもコンパイルが通るようにするには、空の mod ファイル（`// STUB: Phase X で実装`）を配置するか、`#[cfg(...)]` でガードする。

## Test Plan

### ユニットテスト計画

このチケットでは以下のユニットテストを実装する：

1. **error.rs**: VoiceKitError の Display 実装テスト
   - 全6 variant のエラーメッセージが期待通りに表示されること
   - `UnsupportedEngine` のフォーマットに engine 名と理由が含まれること
   - `Io` が `std::io::Error` を透過すること
   - Send + Sync が実装されていること（コンパイル時検証）

2. **constants.rs**: 定数値の正確性テスト
   - 10個の定数値が MYCUTE の値と一致すること（回帰防止）

3. **lib.rs**: コンパイル時検証
   - 公開 re-export が正しく行われること（`use voice_kit::VoiceKit` 等が可能であること）

### ユニットテスト不可能な項目（例外）

- build.rs の動作確認: 実プリビルドライブラリが必要（M6-1 で確認）
- test-run.rs の完全動作: 各セクションの関数は後続チケットで追加されるため、M0-1 時点では Stage 表示のみ確認

## Boy Scout Rule — 翻訳可能性計画

このチケットで作成するファイルは新規であり、Boy Scout Rule の対象となる既存コードは存在しない。しかし以下の原則に従って記述する：

- `error.rs`: エラーメッセージは日本語で記述（利用者が読むエラーとして意味が伝わること）
- `constants.rs`: 定数名は MYCUTE の命名を踏襲（一貫性のため）。コメントは日本語で「なぜこの値か」を説明
- `lib.rs`: ドキュメントコメントは日本語。公開 API の例示コードは完全なコンパイル可能例とすること
- `Cargo.toml`: コメントアウトした依存には `# Phase X で有効化` の注釈を付けて理由を明確に

## Acceptance Criteria

- [ ] `cargo build` がエラーなく成功する（warning は許可）
- [ ] `cargo test` で error.rs の Display テストが PASS すること
- [ ] `cargo run --bin test-run` で Stage 1/6 表示とビルド成功確認メッセージが表示されること
- [ ] 定数値が MYCUTE の値と一致すること（テストで確認）
- [ ] 翻訳可能性の検証が通っていること（関数名・変数名が散文として読めること）

## Notes

- plan_path: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/plan.md（未作成）
- implementation_path: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/implementation.md（未作成）
- review_report_path: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/review.md（未作成）

### 成果物

- 計画: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0035-m0-1-crate-cargotoml-buildrs-librs-errorrs-constantsrs/review.md（未作成、/review-ticket 全チェック通過後に作成）
