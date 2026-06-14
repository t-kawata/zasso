# voiput crate 実装チケット分解設計書

> **生成元:** docs/rfc-stt-portable-crate.md
> **生成日:** 2026-06-11
> **分析済みセクション:** §1〜§12, 付録A〜F
> **参照実装元:** ~/shyme/mycute/

---

## 基本方針

この crate は **MYCUTE ですでに動作している実装を、独立した crate に移植する** プロジェクトである。
新規設計は原則として行わない。

各チケットで行う作業は以下の3種類のみ：

1. **抽出** — MYCUTE の密結合コードから voiput crate に必要な部分を切り出す（パス変更, cfg ガード追加）
2. **依存置換** — `tauri::async_runtime` → `tokio`, `LmgwClient` → `async_openai::Client` 等の crate 独立化に必要な最小限の置換
3. **test-run.rs 統合** — 抽出したコードを呼び出して動作確認するデモセクションを test-run.rs に追加

**「動くことが確認できているコードを、フォルダ分けしてビルドを通す」** が全作業の本質である。

### Cargo.toml 依存関係のルール

依存クレートの追加は **必ず `cargo add` コマンドを使用する** こと。Cargo.toml への直接手書きは禁止（CLAUDE.md プロジェクトルール準拠）。

```bash
cd crates/voiput && cargo add <crate-name>
cd crates/voiput && cargo add <crate-name> --features <feature1>,<feature2>  # features 指定時
```

**対象チケット一覧（フェーズ進行に伴う依存追加）:**

| フェーズ | 追加する依存 | cargo add コマンド |
|---------|------------|------------------|
| M0-1 | 初期依存9つ＋コメントアウト6つ | 以下の「M0-1 作業内容」参照 |
| M2-1 | sherpa-rs, sherpa-rs-sys（コメントアウト解除） | `cargo add sherpa-rs && cargo add sherpa-rs-sys` |
| M2.5 | sherpa-rs, sherpa-rs-sys → sherpa-onnx へ移行 | `cargo rm sherpa-rs && cargo rm sherpa-rs-sys && cargo add sherpa-onnx --no-default-features --features shared` |
| M2-3 | lindera, lindera-ipadic（コメントアウト解除） | `cargo add lindera --features embed-ipadic && cargo add lindera-ipadic` |
| M2-4 | rodio（コメントアウト解除） | `cargo add rodio` |
| M3-1 | hound（新規追加） | `cargo add hound` |
| M4-2 | async-openai（コメントアウト解除） | `cargo add async-openai --features audio` |
| M6-1 | winapi（コメントアウト解除） | `cargo add winapi --features fileapi,winbase` |
| M6-1 | libs/ 収集（全ランタイムDLL/dylib） | build.rs 内で sherpa-onnx-sys の OUT_DIR からコピー |

---

## test-run.rs — 開発の中核

`cargo run --bin test-run` で常に実行可能。各チケット完了時に test-run.rs の該当デモが増えていく。

```
test-run (Stage N/6)
├── [CONFIG]       VoiputConfig 構築テスト       ← MYCUTE の SttSettings 構築を模倣
├── [RESAMPLER]    SincResampler 正弦波テスト      ← MYCUTE src/tools/resampler.rs のコードを直接実行
├── [POST_CORRECT] PostCorrectionProcessor デモ   ← MYCUTE src/tools/post_correction_processor.rs を呼び出し
├── [SIGNAL_FILTER] 信号品質フィルタテスト          ← MYCUTE pseudo_asr_streamer.rs の is_worthy_to_run_asr を抽出
├── [INTERCEPTOR]  置換辞書テスト                  ← MYCUTE src/stt/recognizer.rs の apply_replaces_from_map を抽出
├── [VAD]          VAD モデル検出とテスト           ← MYCUTE src/tools/vad_processor.rs を直接実行
├── [PUNCTUATION]  句読点挿入デモ                  ← MYCUTE src/tools/punctuation_machine.rs を直接実行
├── [AUDIO]        効果音再生デモ                  ← MYCUTE src/tools/audio.rs を直接実行
├── [STREAMER]     MockBackend パイプライン動作    ← MYCUTE pseudo_asr_streamer.rs の PseudoAsrStreamer を直接実行
├── [OPENAI]       OpenAI バックエンド接続         ← MYCUTE src/stt/openai.rs を移植して接続確認
├── [MACOS] / [WINDOWS] OSネイティブ認識          ← MYCUTE src/stt/mac.rs / win.rs を移植
└── [Voiput]     Voiput フル音声入力           ← MYCUTE MycuteManager の音声入力制御を移植
                   └── バッファ＆フラッシュ           ← MYCUTE MycuteManager::request_flush のロジックを移植
```

各デモセクションは、MYCUTE の該当コードが voiput crate 内で正しく動作することを確認するためのもの。
test-run.rs のコードも MYCUTE の各モジュールの呼び出し方に従う（新規設計不要）。

**test-run.rs の成長ルール:**
- 各チケットは test-run.rs に新しい関数を追加し、`main()` にその呼び出しを追加する
- 「未実装のセクションを表示するスタブ」は事前に作らない
- つまり M0-1 時点の test-run.rs は `test_config()` の呼び出しのみを持ち、他のセクション関数は存在しない
- M1-1 で `test_resampler()` が追加されるのと同時に `main()` の呼び出しも追加される
- これによりコンパイルエラーが発生しない

---

## ファイル構成（移植先）

```
crates/voiput/
├── Cargo.toml              ← MYCUTE Cargo.toml から不要な依存を削ったもの + sherpa-rs 等
├── build.rs                ← モデル自動DL + ネイティブライブラリ自動ビルド + ランタイムDLL収集
├── prebuilt/               ← MYCUTE native/ からビルド済み静的自リンク用ライブラリ
│   ├── macos/libspeech_helper.a
│   └── windows/{speech_helper.lib, SpeechHelper.dll}
├── libs/                   ← build.rs が収集した全ランタイムDLL/dylib（アプリケーションがバンドルに使用）
│   ├── macOS/              ← sherpa-onnx の shared 配布物 + SpeechHelper
│   │   ├── libsherpa-onnx-c-api.dylib    ← k2-fsa/sherpa-onnx
│   │   ├── libsherpa-onnx-cxx-api.dylib  ← k2-fsa/sherpa-onnx（必要な場合のみ）
│   │   ├── libonnxruntime.1.17.1.dylib   ← k2-fsa/sherpa-onnx（version は変わりうる）
│   │   └── libonnxruntime.dylib          ← @rpath 解決用シンボリックリンク（必要な場合）
│   │   ※ Swift ランタイムは macOS 15+ のシステムライブラリ (usr/lib/swift/) のため同封不要
│   └── windows/
│       ├── sherpa-onnx-c-api.dll         ← k2-fsa/sherpa-onnx
│       ├── onnxruntime.dll               ← k2-fsa/sherpa-onnx（version は変わりうる）
│       ├── SpeechHelper.dll              ← C# Native AOT ビルド出力
│       ├── vcruntime140.dll              ← VC++ 再頒布可能パッケージ
│       ├── vcruntime140_1.dll            ← VC++ 再頒布可能パッケージ
│       └── msvcp140.dll                  ← VC++ 再頒布可能パッケージ
│       ※ concrt140.dll / vcomp140.dll は onnxruntime がリンクしていないため不要（MYCUTE で実績）
├── native/                 ← MYCUTE native/ からコピー（リビルド用ソース）
│   ├── swift/SpeechHelper.swift + build.sh
│   └── cs/SpeechHelper/{SpeechHelper.cs, Check.cs, SpeechHelper.csproj} + build.ps1
├── src/
│   ├── lib.rs              ← MYCUTE にはない。crate としての公開APIを定義
│   ├── bin/test-run.rs     ← 新規。各 MYCUTE モジュールを呼び出すデメコマンド
│   ├── error.rs            ← RFC 定義 + MYCUTE のエラー処理を参考に新規
│   ├── types.rs            ← MYCUTE src/types.rs（SttEvent） + src/mycute_settings.rs（enum 類）を統合
│   ├── config.rs           ← MYCUTE src/mycute_settings.rs（SttSettings）を多段 Config に分解。新規
│   ├── constants.rs        ← MYCUTE src/constants.rs から STT 関連定数のみ抽出
│   ├── voiput.rs        ← 新規。MYCUTE MycuteManager の STT 制御部分を参考に Voiput として独立
│   ├── recognizer.rs       ← MYCUTE src/stt/recognizer.rs を移植（LmgwClient → OpenAiConfig）
│   ├── audio.rs            ← MYCUTE src/tools/audio.rs を完全移植
│   ├── lindera_util.rs     ← MYCUTE src/tools/lindera_util.rs を完全移植
│   ├── wav/{piro.wav,commit.wav}  ← MYCUTE src/wav/ からコピー
│   ├── pipeline/
│   │   ├── mod.rs
│   │   ├── streamer.rs     ← MYCUTE src/tools/pseudo_asr_streamer.rs を移植（Denoiser分離）
│   │   ├── vad.rs          ← MYCUTE src/tools/vad_processor.rs を完全移植
│   │   ├── denoiser.rs     ← MYCUTE pseudo_asr_streamer.rs から SpeechDenoiser を抽出
│   │   ├── resampler.rs    ← MYCUTE src/tools/resampler.rs を完全移植
│   │   ├── post_correct.rs ← MYCUTE src/tools/post_correction_processor.rs を移植（定数参照のみ変更）
│   │   ├── punctuation.rs  ← MYCUTE src/tools/punctuation_machine.rs を移植（LocaeCode 参照変更のみ）
│   │   └── signal_filter.rs← MYCUTE pseudo_asr_streamer.rs から is_worthy_to_run_asr を抽出
│   ├── backends/
│   │   ├── mod.rs
│   │   ├── openai.rs       ← MYCUTE src/stt/openai.rs を移植（LmgwClient → async-openai::Client）
│   │   ├── mac.rs          ← MYCUTE src/stt/mac.rs を移植（FFI移動＋インポート変更）
│   │   └── win.rs          ← MYCUTE src/stt/win.rs を移植（FFI移動＋インポート変更）
│   └── native/
│       ├── mod.rs
│       ├── mac_ffi.rs      ← MYCUTE src/stt/mac.rs から FFI 宣言のみ抽出
│       └── win_ffi.rs      ← MYCUTE src/stt/win.rs から FFI 宣言＋ヘルスチェック状態を抽出
│   ├── tests/
│   │   └── integration_test.rs
│   └── README.md
```

**削除する MYCUTE ファイル（voiput には移植しない）:**
- `~/shyme/mycute/src/stt/stats.rs`（`UsageStats` — MYCUTE 固有の利用統計。voiput では `record_asr_usage()` を no-op にする）
- `~/shyme/mycute/src/stt/resampler.rs`（`stt/` 側のリサンプラ — `tools/resampler.rs` が正本）
- `~/shyme/mycute/src/types.rs` の `TargetPlatform` / `HotkeyAction`（MYCUTE 固有型）
- `~/shyme/mycute/src/mycute_settings.rs` 全体（設定構造体は config.rs + types.rs に分解）

---

## 全チケット一覧

### Phase 1: 型定義 + 純粋関数の移植（非同期・Sherpa不要）

#### M0: Crate 骨組み + 型定義 + test-run.rs 初版

##### ✅ チケット M0-1: Crate 骨組み（Cargo.toml / build.rs / lib.rs / error.rs / constants.rs）

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.2, §8, §4.5, §7.3
* **移植元:**
  - ~/shyme/mycute/src/constants.rs（STT 定数のみ抽出）
  - ~/shyme/mycute/src/error.rs（のパターンを参考に RFC 定義の VoiputError を実装）
  - ~/shyme/mycute/Cargo.toml（voiput 用に絞る）
  - ~/shyme/mycute/build.rs（Tauri 依存削除）
* **作業内容:**
  1. `Cargo.toml`: `cargo add` で初期依存を追加。その後 `cargo add --dev tempfile` で dev 依存も追加。build.rs でリンクが必要なライブラリ（sherpa-rs-sys等）はコメントアウト行として残す（`cargo add` 後に version のみ手動修正でも可）。`[[bin]]` セクションは `cargo add` では生成されないため手動で追記する。
  2. `build.rs`: target_os 分岐のスケルトン。プリビルドライブラリ不在は warning（後で本実装）。
  3. `src/lib.rs`: 全モジュール宣言 + 公開 re-export（Voiput, VoiputConfig, VoiputError, types::*）。
  4. `src/error.rs`: VoiputError（thiserror）。docs/rfc-stt-portable-crate.md §4.5 の定義。
  5. `src/constants.rs`: MYCUTE の STT 関連定数 11 個を抽出。
  6. `src/bin/test-run.rs`: 骨組み。Stage 表示 + ビルド成功確認の最小表示のみ。`test_config()` は M0-2 で追加、以降のセクションも各チケットで順次追加。
* **test-run.rs 確認:** `cargo build` が通り、`cargo run --bin test-run` で Stage 1/6 表示とエラー型の基本確認が表示されること。

##### ✅ チケット M0-2: 公開型定義（types.rs + config.rs）

* **参照設計書:** docs/rfc-stt-portable-crate.md §4.3, §4.4
* **移植元:**
  - ~/shyme/mycute/src/types.rs（SttEvent — 完全互換）
  - ~/shyme/mycute/src/mycute_settings.rs（SttEngine, LocaleCode, VadType, SttSettings — Config群に分解）
* **作業内容:**
  1. `src/types.rs`: SttEvent を MYCUTE からコピー。SttEngine（OpenAi/Os）, LocaleCode（Ja/En + メソッド）, OpenAiConfig, VadModelPaths, VadConfig, VadType, PostCorrectionConfig, DenoiserConfig, SignalFilterConfig を定義。
  2. `src/config.rs`: VoiputConfig（全フィールド）+ VoiputConfigBuilder（build() でバリデーション）。docs/rfc-stt-portable-crate.md §4.4 のマッピング表に従い SttSettings を分解。
  3. test-run.rs `[CONFIG]`: VoiputConfig をビルドして内容を表示。docs/rfc-stt-portable-crate.md §4.2 のサンプルコードと同様の呼び出し。
* **test-run.rs 確認:** 正常系 Config 構築→内容表示。異常系 Config 構築→エラー表示。

※ 内部トレイトの定義は各トレイトの最初の実装チケットで同時に行う（M0-3 は独立チケットとしては存在しない）：
  - `InternalResampler` / `ResamplerError` → M1-1（resampler.rs 内で定義＋実装）
  - `PostCorrectionBackend` / `SttModelType` / `ProcessorOutput` → M1-2（post_correct.rs 内で定義＋実装）
  - `AsrBackend` / `BackendWrapper` / `StreamerEvent` / `StreamerLocale` / `StreamerConfig` → M3-1（streamer.rs 内で定義＋実装）
  - Pipeline内部 `VadConfig` / `VadType` / `VAD_SAMPLE_RATE` → M2-1（vad.rs 内で定義＋実装）

#### M1: 純粋関数の移植 + test-run.rs デモ

##### ✅ チケット M1-1: SincResampler + test-run.rs [RESAMPLER]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.7
* **移植元:** ~/shyme/mycute/src/tools/resampler.rs — 完全移植（変更不要）
* **作業内容:**
  1. `pipeline/resampler.rs` に SincResampler（rubato ラッパー）をコピー。テストもコピー。
  2. test-run.rs `[RESAMPLER]`: MYCUTE のテストコード（48kHz 正弦波→16kHz リサンプリング）をそのまま流用してデモ表示。

##### ✅ チケット M1-2: PostCorrectionProcessor + test-run.rs [POST_CORRECT]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.8, §5.4
* **移植元:** ~/shyme/mycute/src/tools/post_correction_processor.rs
  - 変更点: `crate::constants::POST_CORRECTION_SILENCE_WAIT_MS` 参照のみ
  - MockBackend を使ったテストも移植
* **作業内容:**
  1. `pipeline/post_correct.rs` に PostCorrectionProcessor をコピー。内部の PostCorrectionConfig は `crate::types` のものを使うよう変更。
  2. test-run.rs `[POST_CORRECT]`: MockBackend で OfflineModel/OnlineModel の動作をデモ。MYCUTE の test_offline_model_appends / test_online_model_overwrites を流用。

##### ✅ チケット M1-3: 信号品質フィルタ + test-run.rs [SIGNAL_FILTER]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.10
* **移植元:** ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs の `is_worthy_to_run_asr()` メソッド
* **作業内容:**
  1. `pipeline/signal_filter.rs` に `is_worthy_to_run_asr()` を独立関数として抽出。
  2. test-run.rs `[SIGNAL_FILTER]`: MYCUTE のシグナルフィルタロジックを直接呼び出すデモ。各種条件での判定結果表示。

##### ✅ チケット M1-4: 置換辞書インターセプター + test-run.rs [INTERCEPTOR]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.4
* **移植元:** ~/shyme/mycute/src/stt/recognizer.rs の `apply_replaces_from_map()` 関数
* **作業内容:**
  1. `recognizer.rs`（先に作り始める）に `apply_replaces()` を移植。
  2. test-run.rs `[INTERCEPTOR]`: 単一置換・複数置換・最長一致優先のデモ。MYCUTE のテストデータを流用。

### Phase 2: ネイティブ依存コンポーネントの移植（Sherpa / Lindera / rodio）

#### M2: パイプライン基盤

##### ✅ チケット M2-1: VadProcessor + test-run.rs [VAD]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.6
* **移植元:** ~/shyme/mycute/src/tools/vad_processor.rs — 完全移植
* **作業内容:**
  1. `pipeline/vad.rs` に VadProcessor をコピー。Windows の resolve_ascii_path も含む。
  2. test-run.rs `[VAD]`: モデルファイルが存在すれば初期化→accept_waveform→reset の一連テスト。なければスキップ。

##### ✅ チケット M2-2: SpeechDenoiser

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.5
* **移植元:** ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs の SpeechDenoiser struct を抽出
* **作業内容:**
  1. `pipeline/denoiser.rs` に SpeechDenoiser を独立ファイルとして抽出。
  2. test-run.rs: 単体テストは難しい（モデルファイル依存）ため、test-run.rs `[STREAMER]`（M3-1）の中でパイプライン統合時に自動的に呼ばれる形で確認する。`[DENOISER]` セクションは用意せず、モデルファイルが存在すれば M3-1 のデモ内部で動作。

##### ✅ チケット M2-3: PunctuationMachine + test-run.rs [PUNCTUATION]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.9, §7.16
* **移植元:**
  - ~/shyme/mycute/src/tools/lindera_util.rs（完全移植）
  - ~/shyme/mycute/src/tools/punctuation_machine.rs（LocaleCode 参照先を `crate::types::LocaleCode` に変更）
* **作業内容:**
  1. `lindera_util.rs` / `pipeline/punctuation.rs` にコピー。
  2. test-run.rs `[PUNCTUATION]`: "こんにちは元気ですか" に句読点を挿入するデモ。

##### ✅ チケット M2-4: 効果音再生 + test-run.rs [AUDIO]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.15, §6.4
* **移植元:** ~/shyme/mycute/src/tools/audio.rs — 完全移植（include_bytes! パスのみ変更）
* **作業内容:**
  1. `audio.rs` にコピー（rodio Actor パターン）。WAV ファイルもコピー。
  2. test-run.rs `[AUDIO]`: init → play_ready_sound → play_commit_sound の一連デモ。
* **注意:** ~/shyme/mycute で実際に使用されている音声ファイルを完全に移植すること。

#### M2.5: sherpa-rs → sherpa-onnx 移行

> **参照ドキュメント:** https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/
>
> `sherpa-rs`（v0.6.8, コミュニティメンテナンス）は非推奨状態。
> 後継の `sherpa-onnx`（v1.13.2, k2-fsa公式メンテナンス）に移行する。
>
> **移行による改善点:**
> - `unsafe` コード削減（生ポインタ → RAII）
> - 手動 `Drop`・手動リソース解放が不要に
> - `unsafe impl Send/Sync` が不要に（`sherpa-onnx` が自動実装）
> - 安全な `Option<Self>` ベースのコンストラクタ
> - 公式チームによる継続的メンテナンス

##### ✅ チケット M2.5-1: Cargo.toml 依存置き換え

* **参照ドキュメント:** https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/
* **作業内容:**
  1. `cargo rm sherpa-rs && cargo rm sherpa-rs-sys` で削除
  2. `cargo add sherpa-onnx --no-default-features --features shared` で追加（動的リンク）
  3. build.rs の `cargo:rustc-link-lib` 関連を確認・調整
  4. `cargo check` でコンパイルエラーの一覧を取得（M2.5-2, M2.5-3 のスコープ確定用）
* **注意（atomicity）:** M2.5-1 実行後、`vad.rs` と `denoiser.rs` が `sherpa_rs_sys` を参照しているため **ビルドが確実に壊れる**。M2.5-2 と M2.5-3 を同一セッション内で連続実行し、M2.5-4 でビルド回復を確認すること。分離して実行するとビルドが通らない期間が発生する。
* **依存置き換えの影響範囲:**
  - 削除: `sherpa-rs`, `sherpa-rs-sys`
  - 追加: `sherpa-onnx`（`shared` feature）
  - feature `shared`: 動的リンク（DLL/dylib を libs/ に収集可能に）
  - feature 未指定（デフォルト）: 静的リンク（巨大なバイナリになる）
* **参考:** sherpa-onnx-sys（低レベルFFI）は `sherpa-onnx` の内部依存として自動解決される

##### ✅ チケット M2.5-2: VadProcessor の safe API 書き換え

* **参照ドキュメント:** https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/struct.VoiceActivityDetector.html
* **移植元:** ~/shyme/mycute/src/tools/vad_processor.rs（API 置き換え）
* **変更点（sherpa-rs-sys → sherpa-onnx）:**

| 旧（sherpa_rs_sys as sys） | 新（sherpa_onnx） |
|---|---|
| `sys::SherpaOnnxVadModelConfig` | `VadModelConfig` |
| `sys::SileroVadModelConfig` の埋め込み | `SileroVadModelConfig` 構造体 |
| `unsafe { sys::SherpaOnnxCreateVoiceActivityDetector(&c, dur) }` — 生ポインタ | `VoiceActivityDetector::create(&config, dur)` — `Option<Self>` |
| `unsafe { sys::SherpaOnnxVoiceActivityDetectorAcceptWaveform(v, p, l) }` | `vad.accept_waveform(&samples)` |
| `sys::SherpaOnnxVoiceActivityDetectorDetected(v) == 1` | `vad.detected()` |
| `unsafe { sys::SherpaOnnxVoiceActivityDetectorReset(v) }` | `vad.reset()` |
| `*const sys::SherpaOnnxVoiceActivityDetector` — 生ポインタ | `VoiceActivityDetector` — safe value |
| `unsafe impl Send for VadProcessor {}` | 不要（sherpa-onnx が保証） |
| 手動 `Drop` impl | 不要（RAII） |
| `anyhow::Result<Self>` （nullチェック） | `Option<VoiceActivityDetector>` → `Self` 変換 |

* **作業内容:**
  1. `pipeline/vad.rs` の全 `sherpa_rs_sys as sys` 参照を `sherpa_onnx` の safe API に置き換え
  2. 生ポインタフィールド `vad: *const sys::SherpaOnnxVoiceActivityDetector` → `Option<VoiceActivityDetector>`
  3. `unsafe impl Send/Sync` 削除
  4. 手動 `Drop` impl 削除
  5. `VadProcessor::new()` の戻り値を `anyhow::Result<Self>` に維持（`Option` を `anyhow!` でラップ）
  6. テスト調整（if `cfg(windows)` の resolve_ascii_path は維持）
* **テスト:** `cargo test --lib pipeline::vad` が全テスト PASS

##### ✅ チケット M2.5-3: SpeechDenoiser の safe API 書き換え

* **参照ドキュメント:**
  - https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/struct.OfflineSpeechDenoiser.html
  - https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/struct.DenoisedAudio.html
* **移植元:** ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs（API 置き換え）
* **変更点（sherpa-rs-sys → sherpa-onnx）:**

| 旧（sherpa_rs_sys as sys） | 新（sherpa_onnx） |
|---|---|
| `sys::SherpaOnnxOfflineSpeechDenoiserConfig` | `OfflineSpeechDenoiserConfig` |
| `sys::SherpaOnnxOfflineSpeechDenoiserModelConfig` | `OfflineSpeechDenoiserModelConfig` |
| `sys::SherpaOnnxOfflineSpeechDenoiserGtcrnModelConfig` | `OfflineSpeechDenoiserGtcrnModelConfig` |
| `unsafe { sys::SherpaOnnxCreateOfflineSpeechDenoiser(&c) }` — nullチェック | `OfflineSpeechDenoiser::create(&config)` — `Option<Self>` |
| `unsafe { sys::SherpaOnnxOfflineSpeechDenoiserRun(p, s, n, r) }` → 生ポインタ | `denoiser.run(&samples, sample_rate)` → `DenoisedAudio` |
| `unsafe { sys::SherpaOnnxDestroyDenoisedAudio(p) }` | 不要（`DenoisedAudio` の Drop が自動処理） |
| `unsafe { sys::SherpaOnnxDestroyOfflineSpeechDenoiser(p) }` | 不要（RAII） |
| `*const sys::SherpaOnnxOfflineSpeechDenoiser` | `OfflineSpeechDenoiser` — safe value |
| `unsafe impl Send/Sync` | 不要 |
| 手動 `Drop` | 不要 |

* **作業内容:**
  1. `pipeline/denoiser.rs` の全 `sherpa_rs_sys as sys` 参照を `sherpa_onnx` の safe API に置き換え
  2. `DenoisedAudio` の `samples` フィールドに直接アクセス（`result.samples` → `audio.samples` 等）
  3. `unsafe impl Send/Sync` 削除
  4. 手動 `Drop` impl 削除
  5. `SpeechDenoiser::new()` → `OfflineSpeechDenoiser::create()` のラッパーに簡略化
* **注意（DenoisedAudio のフィールド名）:** 実装時に https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/struct.DenoisedAudio.html で `.samples` フィールドの有無と名前を確認すること。C API の `SherpaOnnxDenoisedAudio` と同じ構造なら `.samples` だが、Rust ラッパーで異なる名前になっている可能性がある（例: `.data` や `.samples()` メソッド）。
* **テスト:** `cargo test --lib pipeline::denoiser` が PASS

##### ✅ チケット M2.5-4: 移行後の動作確認

* **作業内容:**
  1. `cargo test` 全78テスト PASS（M3-1 完了後は 78、それ以前は 72）
  2. `cargo run --bin test-run` で `[VAD]` が実モデル初期化に成功すること
  3. build.rs の依存クリーンアップ（`cargo:rustc-link-lib` 重複・過不足の確認）
  4. Cargo.toml のコメントアウト行整理

### Phase 3: パイプライン統合（PseudoAsrStreamer）

#### M3: ストリーミングパイプライン

##### ✅ チケット M3-1: PseudoAsrStreamer + test-run.rs [STREAMER]

* **依存関係:** M2.5（sherpa-onnx 移行）が完了していること
* **参照設計書:** docs/rfc-stt-portable-crate.md §7.5
* **移植元:** ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs
  - SpeechDenoiser 参照を `crate::pipeline::denoiser` に変更
  - インポートパス変更（crate::tools → crate::pipeline）
  - それ以外は完全移植
* **実モデルに関する注意:**
  Silero VAD や GTCRN は実声紋・実環境音で学習された ML モデルである。
  人工的な正弦波やノイズでは正しい判定が得られないため、test-run.rs での実モデルテストは行わない。
  実モデルを使った確認は M4（実マイク入力が得られるバックエンド）まで待つ。
  VAD/Denoiser の「モデルが初期化できること」は test-run.rs `[VAD]` で既に確認済み。
* **作業内容:**
  1. `pipeline/streamer.rs` に PseudoAsrStreamer を移植。
  2. `cargo test --lib pipeline::streamer` で以下を確認するユニットテストを実装：
     - MockBackend による push_samples → tick → StreamerEvent の一連フロー
     - 空データでの start/stop 正常終了
     - start → stop → start の再起動サイクル
     - 信号品質フィルタが ASR 実行をスキップする条件
     - 発話キューが複数チャンクを正しく処理する順序
     - 最大発話時間超過時の自動分割
  3. test-run.rs `[STREAMER]`: **MockBackend モードのみ**。
     push_samples で疑似的な音声データを投入し、tick ごとに StreamerEvent の流れを表示。

### Phase 4: バックエンド移植 + 認識器統括

#### M4: 各バックエンド

##### ✅ チケット M4-1: Native FFI（native/mac_ffi.rs / win_ffi.rs）

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.14, 付録E, 付録F
* **移植元:** ~/shyme/mycute/src/stt/mac.rs の extern "C" ブロック, ~/shyme/mycute/src/stt/win.rs の extern "C" ブロック
* **作業内容:** FFI 宣言のみを独立ファイルに抽出。Windows はヘルスチェック状態管理（AtomicU32 + AtomicBool）も移動。

##### ✅ チケット M4-2: OpenAIBackend + OpenAIRecognizer + test-run.rs [OPENAI]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.11
* **移植元:** ~/shyme/mycute/src/stt/openai.rs
  - LmgwClient → OpenAiConfig + async-openai::Client の直接構築
  - `tauri::async_runtime` → `tokio`
  - `SttSettings` → `VoiputConfig`
* **作業内容:**
  1. `backends/openai.rs` に移植。
  2. test-run.rs `[OPENAI]`: OpenAiConfig が設定されていれば初期化→transcribe テスト可能。なければスキップ。

##### ✅ チケット M4-3: MacSpeechBackend + test-run.rs [MACOS]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.12
* **移植元:** ~/shyme/mycute/src/stt/mac.rs
  - FFI 宣言 → `crate::native::mac_ffi`
  - インポートパス変更（crate::mycute_settings → crate::types/config, crate::tools → crate::pipeline）
* **作業内容:**
  1. `backends/mac.rs` に移植。
  2. test-run.rs `[MACOS]`: `cfg(target_os="macos")` かつライブラリ存在時のみ実行。それ以外はスキップ。

##### ✅ チケット M4-4: WinSpeechBackend + test-run.rs [WINDOWS]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.13
* **移植元:** ~/shyme/mycute/src/stt/win.rs
  - FFI 宣言 → `crate::native::win_ffi`
  - ヘルスチェック状態 → `crate::native::win_ffi`
  - インポートパス変更（mac と同様）
* **作業内容:**
  1. `backends/win.rs` に移植。
  2. test-run.rs `[WINDOWS]`: `cfg(target_os="windows")` かつライブラリ存在時のみ実行。

#### M5: 認識器統括 + Voiput 公開API

##### ✅ チケット M5-1: SpeechRecognizer

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.4
* **移植元:** ~/shyme/mycute/src/stt/recognizer.rs
  - LmgwClient → OpenAiConfig ベースの OpenAIBackend
  - SttSettings → VoiputConfig
  - インターセプタータスクはそのまま
* **作業内容:** `recognizer.rs` に移植。すでに M1-4 で一部作成済みの場合は統合。

##### ✅ チケット M5-2: Voiput 公開API + test-run.rs [Voiput]（バッファ＆フラッシュ）

* **参照設計書:** docs/rfc-stt-portable-crate.md §4.2, §4.5
* **移植元:**
  - MYCUTE MycuteManager の STT 制御部分（start/stop 認識、エンジン切替、ロケール変更）
  - MYCUTE MycuteManager::request_flush のロジック → Voiput::flush() に移植
* **flush() の移植内容（docs/rfc-stt-portable-crate.md §4.5 より）:**
  ```rust
  pub async fn flush(&mut self) -> Result<String, VoiputError> {
      self.recognizer.stop();
      let mut final_text = String::new();
      while let Ok(event) = self.event_rx.try_recv() {
          match event {
              SttEvent::FinalResult(text, _) | SttEvent::PartialResult(text, _) => {
                  final_text = text;
              }
              _ => {}
          }
      }
      self.recognizer.start();
      Ok(final_text)
  }
  ```
* **作業内容:**
  1. `voiput.rs` に Voiput を実装。MYCUTE MycuteManager の該当部分を参照。
  2. test-run.rs `[Voiput]`: 全デモセクションを統合。Ctrl+Enter で flush してテキストを表示するリアルタイム音声入力モードに移行可能にする。

### Phase 5: ビルド最終調整

#### M6: ビルド・ドキュメント

##### ✅ チケット M6-1: プリビルドライブラリ自動ビルド

* **参照設計書:** docs/rfc-stt-portable-crate.md §6, §9
* **移植元:** ~/shyme/mycute/native/ の Swift / C# コード
* **build.rs の動作（M2-1 完了時点で既に実装済み）:**
  - 起動時に `prebuilt/<platform>/<lib>` の存在確認
  - 不在 → `native/<platform>/build.sh` または `native/<platform>/build.ps1` を自動実行
  - 自動ビルド失敗 → `panic!` でビルド停止
  - `cargo:rerun-if-changed=native/` で全ネイティブソースファイルの変更を1バイト単位で検出し、変更があれば再ビルド、なければスキップ
  - ビルド後、`libs/<platform>/` にランタイムDLL/dylib を収集（ファイル一覧は「ファイル構成」セクション参照）
    - macOS: sherpa-onnx の build 出力（OUT_DIR）から `*.dylib` をコピー
    - Windows: sherpa-onnx の build 出力（OUT_DIR）から `*.dll` をコピー + SpeechHelper.dll + VC++ 再頒布可能 DLL
    - `cargo:rerun-if-changed=libs/` で DLL/dylib の変更を検出
  - `libs/` の全ファイルが揃っていることを cargo build 完了時に確認。1つでも欠けていれば `panic!`。
* **作業内容:**
  1. `~/shyme/mycute/native/swift/SpeechHelper.swift` を `native/swift/` にコピー。
  2. `~/shyme/mycute/native/cs/SpeechHelper/*` を `native/cs/SpeechHelper/` にコピー。
  3. `native/swift/build.sh` を作成（RFC §6.1 の内容）。
  4. `native/cs/build.ps1` を作成（RFC §6.2 の内容）。
  5. build.rs に `libs/<platform>/` 収集ロジックを追加:
     - macOS: `OUT_DIR` (sherpa-onnx) から `libsherpa-onnx-c-api.dylib`, `libonnxruntime.1.17.1.dylib` (version は変わりうる) を `libs/macos/` にコピー。
       `libsherpa-onnx-cxx-api.dylib` は不要な場合はスキップしてよい。
     - Windows: `OUT_DIR` (sherpa-onnx) から `sherpa-onnx-c-api.dll`, `onnxruntime.dll` を `libs/windows/` にコピー。
       `sherpa-onnx-cxx-api.dll` は不要な場合はスキップ。
     - Windows: `SpeechHelper.dll` を C# Native AOT ビルド出力から `libs/windows/` にコピー。
     - Windows: VC++ 再頒布可能 DLL（`vcruntime140.dll`, `vcruntime140_1.dll`, `msvcp140.dll`）を
       Visual Studio の再頒布可能ディレクトリまたはシステムからコピー。
       `concrt140.dll` / `vcomp140.dll` は onnxruntime がリンクしていないため不要（MYCUTE で実績あり）。
  7. Tauri バンドル用の設定サンプルを README に記載。

##### ✅ チケット M6-1.5 macOS: `libs/macos/` ランタイムライブラリ収集

* **参照ドキュメント:**
  - https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/
  - docs/rfc-stt-portable-crate.md §6.1（Swift ビルド手順）
* **目的:** macOS で音声入力が動作するために必要な全ランタイム dylib を `libs/macos/` に揃え、voiput crate が `libs/` を開けば全て揃っていることを保証する。
* **収集対象:**

| # | ファイル | 入手元 | 必須 |
|---|---------|--------|------|
| 1 | `libsherpa-onnx-c-api.dylib` | sherpa-onnx shared 配布物 | ✅ |
| 2 | `libonnxruntime.1.17.1.dylib` | sherpa-onnx shared 配布物（version 可変） | ✅ |
| 3 | `libonnxruntime.dylib` | 上記のシンボリックリンク (@rpath 解決用) | ⚠️ |
| 4 | `libsherpa-onnx-cxx-api.dylib` | sherpa-onnx shared 配布物（必要な場合のみ） | ⚠️ |

※ Swift SpeechHelper は静的リンク (`-static`) のためランタイム dylib 不要。
※ macOS 15+ では Swift ランタイム (`/usr/lib/swift/`) はシステムライブラリのため同封不要。
* **build.rs の処理（`models/` と同じパターン）:**

  ```
  build.rs 起動
    ├─ libs/macos/ が存在しなければ mkdir
    │
    ├─ [要収集ファイルの存在確認]
    │  for each (ファイル名, 入手元) in 収集対象:
    │    ├─ ファイルが既に libs/macos/ にある → OK
    │    └─ ファイルがない → 入手元から libs/macos/ にコピー
    │
    ├─ [最終確認]
    │  for each (ファイル名) in 収集対象（必須のみ）:
    │    ├─ libs/macos/ に存在 → OK
    │    └─ 存在しない → panic!("必須ライブラリが不足")
    │
    ├─ [変更検出]
    │  println!("cargo:rerun-if-changed=libs/macos/");
    │  // libs/ は target/ 下ではなく crate ルート直下のため cargo clean では削除されない
    │  // ファイルが既に存在する場合、build.rs は即座にスキップされる
    ```

* **作業内容:**
  1. sherpa-onnx の shared 出力ディレクトリ（sherpa-onnx-sys の OUT_DIR）を build.rs から特定する方法を確立
  2. 上記アルゴリズムを build.rs に実装
  3. `libs/macos/` の existence check を実装（必須ファイル1つでも欠け → `panic!`）
  4. `cargo clean` 後も `libs/` が残ることを確認（設計動作）
  5. macOS 実機で過不足なくロードされることを確認（`DYLD_PRINT_LIBRARIES=1` で確認）

##### ✅ チケット M6-1.6 Windows: `libs/windows/` ランタイムライブラリ収集

* **参照ドキュメント:**
  - https://docs.rs/sherpa-onnx/1.13.2/sherpa_onnx/
  - docs/rfc-stt-portable-crate.md §6.2（C# Native AOT ビルド手順）
* **目的:** Windows で音声入力が動作するために必要な全ランタイム DLL を `libs/windows/` に揃え、voiput crate が `libs/` を開けば全て揃っていることを保証する。
* **収集対象:**

| # | ファイル | 入手元 | 必須 |
|---|---------|--------|------|
| 1 | `sherpa-onnx-c-api.dll` | sherpa-onnx shared 配布物 | ✅ |
| 2 | `onnxruntime.dll` | sherpa-onnx shared 配布物（version 可変） | ✅ |
| 3 | `SpeechHelper.dll` | C# Native AOT ビルド出力 | ✅ |
| 4 | `vcruntime140.dll` | VC++ 再頒布可能パッケージ | ✅ |
| 5 | `vcruntime140_1.dll` | 同上（VS 2019+） | ✅ |
| 6 | `msvcp140.dll` | 同上（C++ 標準ライブラリ） | ✅ |
| 7 | `sherpa-onnx-cxx-api.dll` | sherpa-onnx shared 配布物（必要な場合のみ） | ⚠️ |
| 8 | `concrt140.dll` | VC++ 再頒布可能（onnxruntime がリンクしている場合のみ） | ❌ |
| 9 | `vcomp140.dll` | 同上（MYCUTE 実績では不要） | ❌ |

* **build.rs の処理（`models/` と同じパターン）:**

  ```
  build.rs 起動
    ├─ libs/windows/ が存在しなければ mkdir
    │
    ├─ [要収集ファイルの存在確認]
    │  for each (ファイル名, 入手元) in 収集対象:
    │    ├─ ファイルが既に libs/windows/ にある → OK
    │    └─ ファイルがない → 入手元から libs/windows/ にコピー
    │       ├─ sherpa-onnx-c-api.dll / onnxruntime.dll
    │       │  → sherpa-onnx-sys の OUT_DIR から
    │       ├─ SpeechHelper.dll
    │       │  → C# Native AOT ビルド出力から
    │       └─ vcruntime140.dll / vcruntime140_1.dll / msvcp140.dll
    │          → VS インストール先の redist/ からコピー
    │
    ├─ [最終確認]
    │  for each (ファイル名) in 収集対象（必須のみ）:
    │    ├─ libs/windows/ に存在 → OK
    │    └─ 存在しない → panic!("必須ライブラリが不足")
    │
    ├─ [変更検出]
    │  println!("cargo:rerun-if-changed=libs/windows/");
    │  // libs/ は target/ 下ではなく crate ルート直下のため cargo clean では削除されない
    │  // ファイルが既に存在する場合、build.rs は即座にスキップされる
    ```

* **作業内容:**
  1. sherpa-onnx の shared 出力ディレクトリ（sherpa-onnx-sys の OUT_DIR）を build.rs から特定
  2. VC++ 再頒布可能 DLL の自動検出（VS インストール先の `redist/` 探索）を実装
  3. SpeechHelper.dll の C# Native AOT ビルド出力先特定とコピー
  4. 上記アルゴリズムを build.rs に実装
  5. `libs/windows/` の existence check 実装
  6. `cargo clean` 後も `libs/` が残ることを確認（設計動作）
  7. Windows 実機での動作確認（プロセスモニタで不足なくロードされることを確認）

##### ✅ チケット M6-2: 統合テスト

* **参照設計書:** docs/rfc-stt-portable-crate.md §10
* **作業内容:** `tests/integration_test.rs` — config バリデーションの結合テスト。

##### ✅ チケット M6-3: README

* **参照設計書:** docs/rfc-stt-portable-crate.md §12
* **作業内容:** 使い方、Voiput API、OS権限設定、test-run.rs の説明。

### Phase 6: RFC 準拠修正（矛盾・未実装の解消）

> **背景:** docs/rfc-stt-portable-crate.md と実装の比較検査で発見された 🔴矛盾4件・🟡未実装3件を解消する。

#### M7: Voiput 公開API 完全準拠

> **参照:** RFC §4.2, §4.4, §4.5 — Voiput エントリポイントのシグネチャと振る舞い

##### ✅ チケット M7-1: Voiput API — async/await 完全対応 + request_permissions 実装

* **修正する RFC との矛盾／未実装:**
  1. `start()` / `stop()` が同期関数になっている（RFC §4.2 では `async fn`）→ `async fn` に修正
  2. `request_permissions()` が未実装（RFC §4.2 で定義、利用者が権限フローを自力実装する必要あり）→ `Voiput` に追加
* **参照設計書:** docs/rfc-stt-portable-crate.md §4.2, §4.5
* **対象不変条件:**
  - `voiput.start().await?` がコンパイル可能であること
  - `voiput.request_permissions().await?` が macOS で `SFSpeechRecognizer.requestAuthorization()` を呼ぶこと
  - `request_permissions()` が Windows で `health_check()` の bit 2 を確認すること
  - 非対応OS では `request_permissions()` が `Ok(false)` を返すこと
* **実装スコープ:**
  - `src/voiput.rs` — `start()` / `stop()` を `async fn` に変更、`request_permissions()` を新規実装
  - `src/binary/test-run.rs` — `test_voiput()` で `voiput.start().await` / `request_permissions().await` を使用
  - `tests/integration_test.rs` — async 対応テストに更新（`#[tokio::test]`）
* **テストコードによる検証:**
  1. `Voiput::request_permissions()` → macOS で i32 を返すこと（権限ダイアログは表示されず、戻り値のみ）
  2. `start().await` → `request_permissions()` を呼んだ後に正常に start できること
  3. `stop().await` → 正常終了 + 冪等
  4. `flush().await` → 既存動作が壊れないこと
  5. 非同期コンテキスト外で start/stop を呼ぶとコンパイルエラーになること（型チェック）
* **計装方法:** `#[tokio::test]` の導入（`dev-dependencies` に `tokio = { features = ["rt", "macros"] }` があれば使用可能）

##### ✅ チケット M7-2: 内部設計整合 — SpeechRecognizer 引数整理 + VoiputError 型修正 + 非対応OSバリデーション

* **修正する RFC との矛盾／未実装:**
  1. `SpeechRecognizer::new()` の引数が RFC §7.4 の設計（`&VoiputConfig` を受け取る）と異なり、6個の個別引数に分解されている → `&VoiputConfig` ベースに統一
  2. `VoiputError::UnsupportedEngine` が RFC §4.4 の `{ engine: SttEngine, reason: String }` と異なり `(String)` 単一文字列 → 名前付きフィールドに修正
  3. `validate_config()` が `SttEngine::Os` 選択時の OS 非対応チェックをしていない（RFC 付録B）→ バリデーション追加
* **参照設計書:** docs/rfc-stt-portable-crate.md §4.4, §7.4, 付録B
* **対象不変条件:**
  - `SpeechRecognizer::new(tx, &config, replaces_map)` がコンパイル可能であること（3引数）
  - `Voiput::new()` 内の不要な Config 分解処理が削除されること
  - `VoiputError::UnsupportedEngine { engine, reason }` でパターンマッチが可能であること
  - Linux 等で `VoiputConfig { engine: SttEngine::Os }` を構築後 `Voiput::new()` が `Err(UnsupportedEngine { ... })` を返すこと
* **実装スコープ:**
  - `src/voiput.rs` — `Voiput::new()` から Config 分解ロジックを削除、`SpeechRecognizer::new()` に `&config` を直接渡す
  - `src/recognizer.rs` — `SpeechRecognizer::new()` のシグネチャを変更し、内部で `config` から必要なパラメータを取り出す
  - `src/error.rs` — `UnsupportedEngine(String)` → `UnsupportedEngine { engine: SttEngine, reason: String }`
  - `src/recognizer.rs` — `validate_config()` に OS チェックを追加（`#[cfg(not(any(target_os = "macos", target_os = "windows")))]` で `Os` → `Err`）
* **テストコードによる検証:**
  1. `SpeechRecognizer::new()` が `&VoiputConfig` で呼べること
  2. `VoiputError::UnsupportedEngine { engine: SttEngine::Os, reason: _ }` でパターンマッチできること
  3. 非 macOS/Windows 環境で `SttEngine::Os` → `UnsupportedEngine` エラー（cfg テスト）
  4. macOS 環境で `SttEngine::Os` → `Ok`
  5. 既存の全テストが通ること（回帰確認）
* **計装方法:** 既存 `#[cfg(test)] mod tests` の拡張

##### ✅ チケット M7-3: health_check 完全実装 + Cargo.toml 配布設定

* **修正する RFC との矛盾／未実装:**
  1. `Voiput::health_check()` が `return 0` のハードコードで WinRT SpeechRecognizer の実際の状態を返していない → `SpeechRecognizer::health_check()` に委譲し、Windows では `native::win_ffi::health_check_result()` を経由
  2. Cargo.toml に `include = [...]` 設定がなく、`cargo publish` 時にプリビルドライブラリが含まれない（RFC §6.3, §8）
* **参照設計書:** docs/rfc-stt-portable-crate.md §4.5, §6.3, §8
* **対象不変条件:**
  - Windows 実機で `health_check()` が音声認識モデル・プライバシー・マイクの状態をビットマスクで返すこと
  - macOS では `health_check()` が 0 を返すこと
  - `cargo package` でプリビルドライブラリが同梱されること
* **実装スコープ:**
  - `src/voiput.rs` — `health_check()` の `return 0` を `self.recognizer.health_check()` に置き換え
  - `src/recognizer.rs` — `health_check()` に `#[cfg(target_os = "windows")]` で `native::win_ffi::health_check_result()` を呼ぶ分岐を追加
  - `Cargo.toml` — `[package]` セクションに `include = [...]` 追加
* **テストコードによる検証:**
  1. macOS: `health_check()` == 0
  2. Windows: `health_check()` が `speech_helper_check_health()` の戻り値を返すこと（単体テスト）
* **計装方法:** `#[cfg(test)] + #[cfg(target_os = "windows")]` で Windows 固有テスト

### Phase 7: ホットキー音声入力の完全 crate 内蔵

> **背景:** MYCUTE で完全に動作している Option/Alt ダブルタップによる音声入力バッファ＆フラッシュ機構、および Ctrl+Option/Ctrl+Alt によるオーケストレータモードを voiput crate に内蔵する。
> test-run.rs は crate の「呼び出し」と「イベントのリッスン」だけを行う薄い層に留め、ホットキー検出・クリップボード操作・キーボード注入・事後補正対応 flush の全ロジックは crate 内部に隠蔽する。
>
> **MYCUTE 参照実装（正常動作確認済み）:**
> - `~/shyme/mycute/src/hotkey_mac.rs` (405行) — macOS CGEventTap による Option ダブルタップ検出
> - `~/shyme/mycute/src/hotkey_win.rs` (527行) — Windows rdev + GetAsyncKeyState による Alt ダブルタップ検出
> - `~/shyme/mycute/src/hotkey_win_hook.rs` (511行) — Windows 低レベルキーボードフック（Ctrl+Alt コンボ用）
> - `~/shyme/mycute/src/input/clipboard.rs` (145行) — `save_paste_and_restore` クリップボード保存→Cmd+Vペースト→復元
> - `~/shyme/mycute/src/input/keyboard_mac.rs` (325行) — `KeyboardInjector`（CGEvent キーボード注入）
> - `~/shyme/mycute/src/input/keyboard_win.rs` (404行) — `KeyboardInjector`（SendInput キーボード注入）
> - `~/shyme/mycute/src/types.rs:11-68` — `SttEvent`, `HotkeyAction`, `InputMode` 列挙型
> - `~/shyme/mycute/src/constants.rs:93-97` — ダブルタップ判定定数
> - `~/shyme/mycute/src/mycute_manager.rs:59-106` — `request_flush()`, `build_flush_text()`, `start_recording()`, `stop_recording()`
> - `~/shyme/mycute/src/mode/cl/main_of_cl.rs:545-1001` — `spawn_stt_event_bridge`（post-correction 待機、flush_tx 3段階発火）
> - `~/shyme/mycute/src/tauri_cmd/system.rs:207-246` — HotkeyAction::Start ハンドラ
> - `~/shyme/mycute/src/tauri_cmd/system.rs:316-370` — HotkeyAction::BufferFlush ハンドラ
> - `~/shyme/mycute/src/tauri_cmd/system.rs:372-422` — HotkeyAction::OrchestratorInput ハンドラ

#### M8: ホットキー音声入力の完全 crate 内蔵

> **参照:** RFC §4.2 — Voiput エントリポイント（enable_hotkeys の延長として）

##### ✅ チケット M8-1: `hotkey/` モジュール — Option/Alt ダブルタップ検出 + 録音状態管理

* **移植元（MYCUTE 正常動作確認済み）:**
  - macOS: `~/shyme/mycute/src/hotkey_mac.rs` 全405行
  - Windows: `~/shyme/mycute/src/hotkey_win.rs` 全527行
  - Windows: `~/shyme/mycute/src/hotkey_win_hook.rs` 全511行
  - 定数: `~/shyme/mycute/src/constants.rs:93-97` — `HOTKEY_DOUBLE_TAP_MIN_MS` (10), `HOTKEY_DOUBLE_TAP_MAX_MS` (500)
  - 型: `~/shyme/mycute/src/types.rs:64-71` — `HotkeyAction` enum
* **対象不変条件:**
  - macOS で Option キーを 10ms〜500ms 間隔で2回押下すると `HotkeyAction::Start`（非録音時）または `HotkeyAction::BufferFlush`（録音時）が送出されること
  - macOS で Ctrl+Option 同時押し時に `HotkeyAction::OrchestratorInput` が送出されること
  - ダブルタップの FLAGS_CHANGED イベントがシステムに伝播しないこと（`return ptr::null_mut()`）
  - Windows で Alt キーを 10ms〜500ms 間隔で2回押下し、2回目の KeyRelease でアクションが送出されること
  - Windows で Ctrl+Alt 同時押し時に `HotkeyAction::OrchestratorInput` が送出されること
  - ホットキー監視の開始/停止が可能であること（`enable()` / `disable()`）
  - 録音状態の設定/取得が可能であること（`set_recording_active(bool)`）
* **実装スコープ:**
  - `src/hotkey/mod.rs` — プラットフォーム共通トレイトと `HotkeyMonitor` 構造体、`HotkeyAction` enum(Start/BufferFlush/OrchestratorInput/Correct/Summarize)、`enable()`/`disable()`/`set_recording_active()` 公開API
  - `src/hotkey/mac.rs` — CGEventTap 実装。`FLAGS_CHANGED` (type=12) ハンドラで Option ダブルタップ検出＋Ctrl+Option コンボ検出。`KEY_DOWN` (type=10) ハンドラで Option+H/M 等のコンボ検出。`CG_EVENT_SOURCE_USER_DATA` フィールド(ID 42, value 0x4D594355)による自己生成イベントのフィルタリング（MYCUTE の `hotkey_mac.rs:198-203` 参照）。`HOTKEY_SENDER: Mutex<Option<SyncSender<HotkeyAction>>>`
  - `src/hotkey/win.rs` — rdev `listen()` + `GetAsyncKeyState` ポーリングのデュアルパス。`MOD_ALT`/`MOD_CTRL` ビットマスクによる修飾キー管理。`PENDING_ALT_START`/`PENDING_ALT_FLUSH` フラグによる KeyRelease 遅延発火（MYCUTE の `hotkey_win.rs:377-508` 参照）。`ORCHESTRATOR_COMBO_ACTIVE` による Ctrl+Alt コンボ検出と cooldown（150ms）
  - `src/hotkey/win_hook.rs` — `SetWindowsHookExW(WH_KEYBOARD_LL, ...)` 低レベルフック。rdev が Alt キーを捕捉できない問題に対処（MYCUTE で実際に必要な場合のみ）
  - `src/constants.rs` — `HOTKEY_DOUBLE_TAP_MIN_MS = 10`, `HOTKEY_DOUBLE_TAP_MAX_MS = 500` を追加
  - `Cargo.toml` — macOS: 既存の Framework 依存で対応可能。Windows: `rdev = "0.5"`, `winapi = { features = ["winuser"] }` を追加
* **テストコードによる検証:**
  1. `HotkeyAction` の全 variant が `Debug + Clone + Send` であること
  2. macOS: `HotkeyMonitor::new()` が CGEventTap を作成できること（テストでは Tap を作成後即座に無効化）
  3. macOS: `set_recording_active(true)` 後の `is_recording_active()` が `true` を返すこと
  4. Windows: `CURRENT_MODIFIERS` の MOD_ALT/MOD_CTRL ビット操作が正しいこと
  5. `HOTKEY_DOUBLE_TAP_MIN_MS` / `HOTKEY_DOUBLE_TAP_MAX_MS` の値が RFC と一致すること
  6. ダブルタップ判定ロジックの純粋関数テスト（タイムスタンプ計算の単体テスト）
* **ユニットテスト不可能な項目（例外）:**
  - 実際のキーボードイベントの受信と処理（CGEventTap / rdev の実機依存）
  - OS のアクセシビリティ許可状態（環境依存）
* **計装方法:** `#[cfg(test)] mod tests` — 純粋ロジックの単体テスト + `#[cfg(target_os = "macos")]` で macOS 固有テスト

##### ✅ チケット M8-2: `input/` モジュール — クリップボード操作 + キーボード注入

* **移植元（MYCUTE 正常動作確認済み）:**
  - クリップボード: `~/shyme/mycute/src/input/clipboard.rs` 全145行
    - `save_paste_and_restore(text: &str) -> bool` (line 95-120) — クリップボード保存→Cmd+V→待機→復元の全手順
    - `get_selected_text() -> Result<String>` (line 61-85) — Cmd+C で選択テキスト取得
    - `replace_selected_text(text: &str)` (line 127-145) — 選択テキストを置換
    - `get_clipboard()` / `set_clipboard()` — arboard ラッパー
  - macOS キーボード注入: `~/shyme/mycute/src/input/keyboard_mac.rs` 全325行
    - `KeyboardInjector::send_cmd_v()` (line 285) — CGEvent で Cmd+V キーイベントをポスト
    - `KeyboardInjector::send_cmd_c()` (line 280) — CGEvent で Cmd+C キーイベントをポスト
    - `KeyboardInjector::input_diff(old, new)` (line 231) — 古いテキストと新しいテキストの差分のみを注入（Backspace + Unicode タイピング）
    - `KeyboardInjector::type_text(text: &str)` (line 69) — テキストを1文字ずつ注入
    - `KeyboardInjector::send_backspaces(count)` (line 148) — Backspace キーイベント注入
    - `KeyboardInjector::is_authorized()` (line 56) — Accessibility 権限チェック
    - `INPUT_LOCK: Mutex<()>` — キーボード注入の直列化
  - Windows キーボード注入: `~/shyme/mycute/src/input/keyboard_win.rs` 全404行
    - 同名の全関数（SendInput API を使用）
  - 定数: `~/shyme/mycute/src/constants.rs` — `PASTE_DELAY_MS` (macOS 50, Windows 200)
* **対象不変条件:**
  - `save_paste_and_restore(text)` がクリップボード内容を保存し、`text` を設定し、Cmd+V/Ctrl+V を実行し、PASTE_DELAY_MS 待機後に元のクリップボードを復元すること
  - ペースト後にクリップボードに `text` が残っている場合のみ復元すること（外部変更時は復元しない安全設計）
  - `KeyboardInjector::input_diff(old, new)` が common_prefix を計算し、削除文字数分の Backspace + 新規文字の注入を行うこと
  - 全キーボード注入操作が `INPUT_LOCK` で直列化されること
  - macOS で Accessibility 権限がない場合は `is_authorized()` が `false` を返すこと
* **実装スコープ:**
  - `src/input/mod.rs` — プラットフォーム分岐と公開API（`save_paste_and_restore`, `send_cmd_v`, `send_cmd_c`, `input_diff`, `is_authorized`）
  - `src/input/clipboard.rs` — arboard ラッパー（`get_clipboard`, `set_clipboard`, `save_paste_and_restore`, `get_selected_text`, `replace_selected_text`）。`CLIPBOARD_LOCK: Mutex<()>` による排他制御
  - `src/input/keyboard_mac.rs` — `#[cfg(target_os = "macos")]`。`CGEventCreateKeyboardEvent` + `CGEventPost(kCGHIDEventTap, event)` によるキーボード注入。全関数を MYCUTE から移植
  - `src/input/keyboard_win.rs` — `#[cfg(target_os = "windows")]`。`SendInput` API によるキーボード注入。`INPUT_KEYBOARD` + `KEYBDINPUT` 構造体。全関数を MYCUTE から移植
  - `src/constants.rs` — `PASTE_DELAY_MS_MACOS = 50`, `PASTE_DELAY_MS_WINDOWS = 200` を追加
  - `Cargo.toml` — `arboard = "3"` を追加（全プラットフォーム）。Windows: `winapi = { features = ["winuser"] }`（hotkey と共用）
* **テストコードによる検証:**
  1. `set_clipboard("test")` → `get_clipboard()` == `"test"`（クリップボードの read/write 往復）
  2. Mac: `is_authorized()` が呼び出せること（戻り値は環境依存）
  3. `save_paste_and_restore("test")` がパニックしないこと（実際のペーストはテストしない）
* **ユニットテスト不可能な項目（例外）:**
  - 実際のキーボードイベント注入と他アプリへの影響（実機依存、手動確認）
  - クリップボードの外部アプリとの競合（実機依存）
* **計装方法:** `#[cfg(test)] mod tests` — クリップボード read/write 往復テスト + `#[cfg(target_os = "macos")]` で macOS 固有テスト

##### ✅ チケット M8-3: Voiput 拡張 — ホットキー駆動音声入力の crate 内蔵（全責務隠蔽）

* **移植元（MYCUTE 正常動作確認済み）:**
  - `~/shyme/mycute/src/mycute_manager.rs:59-106` — `request_flush()`, `build_flush_text()`, `start_recording()`, `stop_recording()`
  - `~/shyme/mycute/src/mode/cl/main_of_cl.rs:605-1001` — `spawn_stt_event_bridge`（flush_tx の 4 段階発火: Stopped/PostCorrectionFinished/PartialResult/SttCompleted）
  - `~/shyme/mycute/src/tauri_cmd/system.rs:207-246` — HotkeyAction::Start ハンドラ（start_recording + play_ready_sound）
  - `~/shyme/mycute/src/tauri_cmd/system.rs:316-370` — HotkeyAction::BufferFlush ハンドラ（build_flush_text + save_paste_and_restore + stop_recording + play_commit_sound）
  - `~/shyme/mycute/src/tauri_cmd/system.rs:372-422` — HotkeyAction::OrchestratorInput ハンドラ（orchestrator モード切替 + 通常録音停止）
  - `~/shyme/mycute/src/types.rs:125-130` — `InputMode` enum（RealTime, Buffered）
  - `~/shyme/mycute/src/types.rs:11-68` — `SttEvent` enum（特に PartialResult, FinalResult, Ready, Started, Stopped, PostCorrectionStarted, PostCorrectionFinished, SttPending, SttCompleted）
* **対象不変条件:**
  - `Voiput::enable_hotkeys()` を呼ぶと HotkeyMonitor が開始され、Option/Alt ダブルタップ→録音開始→Ready音、再度のダブルタップ→flush→カーソルペースト→Commit音、Ctrl+Option/Ctrl+Alt→Orchestrator モード切り替えの全動作が crate 内部で完結すること
  - Option/Alt ダブルタップで開始された録音のテキストが、PostCorrection 完了を待ってからカーソル位置にペーストされること（MYCUTE の `pending_flush` + `SttCompleted` ハンドラ相当）
  - Ctrl+Option/Ctrl+Alt モードではテキストがカーソルペーストされず、`SttEvent::Flushed(text)` として利用者に送出されること
  - `build_flush_text()` が `current_text` と `buffer` を重複除去して連結すること（MYCUTE の `mycute_manager.rs:98-106` と同一ロジック）
  - `flush()`（または `request_flush()`）が PostCorrection の完了を待つこと。即座にテキストが得られない場合、flush_tx を保持し後続のイベントで再試行すること
  - ホットキー開始モード（Buffered）と通常 API 呼び出しモード（RealTime）でテキストの流れ方が異なること（前者はカーソルに出さず蓄積、後者は input_diff で逐次注入）
* **実装スコープ:**
  - `src/voiput.rs` — 大規模拡張:
    - **新規フィールド**: `mode: InputMode`（Buffered/RealTime）、`buffer: String`（確定テキスト蓄積）、`current_text: String`（最新の認識テキスト）、`hotkey_monitor: Option<HotkeyMonitor>`、`flush_tx: Option<oneshot::Sender<String>>`、`is_post_correcting: bool`
    - **新規メソッド**:
      - `enable_hotkeys(&mut self) -> Result<(), VoiputError>` — HotkeyMonitor::start() を呼び出し、内部タスクでホットキーイベントを処理する tokio タスクを起動。ホットキー受信→Voiput メソッド呼び出しのディスパッチループ（MYCUTE の `system.rs:207-422` 相当）
      - `disable_hotkeys(&mut self)` — HotkeyMonitor::stop()、内部タスクを停止
      - `paste_at_cursor(&self, text: &str) -> bool` — `input::clipboard::save_paste_and_restore(text)` に委譲
      - `build_flush_text(&self) -> String` — MYCUTE の `mycute_manager.rs:98-106` を移植
      - `request_flush(&mut self) -> oneshot::Receiver<String>` — 内部で `flush_tx` を設定してから `recognizer.stop()` を呼ぶ（順序が重要: MYCUTE の `mycute_manager.rs:59-68` 参照）
    - **拡張メソッド**:
      - `start()` に `mode: InputMode` パラメータを追加（デフォルト: Buffered）
      - `next_event()` のループ内に flush_tx 発火ロジックを追加（MYCUTE の `main_of_cl.rs:605-1001` の4段階発火を移植）
      - `start()` 時に `play_ready_sound()` を自動呼び出し→`SttEvent::Ready` を送出
      - BufferFlush 時に `play_commit_sound()` を自動呼び出し
    - **内部タスク**: ホットキーアクションのディスパッチ（MYCUTE の `system.rs:207-422` 相当のロジックを non-Tauri 化）:
      ```rust
      // ホットキーディスパッチループ（内部タスク）
      while let Some(action) = hotkey_rx.recv().await {
          match action {
              HotkeyAction::Start if idle => {
                  self.start().await;  // mode=Buffered, play_ready_sound on Ready
              }
              HotkeyAction::BufferFlush if recording => {
                  let rx = self.request_flush();
                  if let Ok(text) = rx.await {
                      self.paste_at_cursor(&text);
                      play_commit_sound();
                      self.stop().await;
                  }
              }
              HotkeyAction::OrchestratorInput => {
                  // モード切替: Buffered↔Orchestrator
                  // Orchestratorフラッシュ時は SttEvent::Flushed(text) を送出
              }
          }
      }
      ```
  - `src/types.rs` — `InputMode` enum (RealTime, Buffered) を追加。`SttEvent::Flushed(String)` variant を追加（オーケストレータモードのフラッシュ完了時に送出）
  - `Cargo.toml` — `tokio = { features = ["sync"] }` の追加確認（oneshot 用。既に full で入っているはず）
* **flush_tx 4段階発火の移植詳細**（`src/voiput.rs` の `next_event()` または内部イベントループに実装）:
  ```
  各 SttEvent 処理後の共通チェック:
  1. SttEvent::Stopped:
     - if let Some(tx) = self.flush_tx.take():
         text = self.build_flush_text()
         if text.is_empty():
           self.flush_tx = Some(tx)  // 温存: 後続イベントを待つ
         else:
           tx.send(text)
  2. PostCorrectionFinished:
     - self.is_post_correcting = false
     - if let Some(tx) = self.flush_tx.take():
         tx.send(self.build_flush_text())
  3. 後続の PartialResult/FinalResult 処理後:
     - if self.flush_tx.is_some() && !self.is_post_correcting:
         if let Some(tx) = self.flush_tx.take():
           text = self.build_flush_text()
           if text.is_empty() { self.flush_tx = Some(tx) }
           else { tx.send(text) }
  4. SttCompleted 処理後: （同上）
  ```
* **テストコードによる検証:**
  1. `build_flush_text()` — buffer 空 + current_text あり → current_text を返す
  2. `build_flush_text()` — buffer あり + current_text 空 → buffer を返す
  3. `build_flush_text()` — current_text が buffer で始まる → current_text を返す（重複除去）
  4. `build_flush_text()` — current_text が buffer で始まらない → buffer + current_text 連結
  5. `request_flush()` — oneshot チャネルが作成され、Receiver が返されること
  6. `test_voiput_flush_with_post_correction` — `#[tokio::test]` で flush() が post-correction 完了を待つこと
  7. `InputMode` の `Debug + Clone + Copy + PartialEq` 実装確認
  8. `SttEvent::Flushed("test".into())` が構築可能であること
  9. 既存の全テストが通過すること（回帰確認）
* **ユニットテスト不可能な項目（例外）:**
  - ホットキー監視の実機検証（CGEventTap / rdev 依存）
  - クリップボードペーストの実際のカーソル注入（実機依存）
  - PostCorrection の実際の LLM API 呼び出し（ネットワーク依存）
* **計装方法:** `#[cfg(test)] mod tests`（build_flush_text 単体テスト）+ `#[tokio::test]`（非同期 flush テスト）

##### チケット M8-4: test-run.rs 再構成 — 薄い呼び出し層 + CLI エンジン選択

* **目的:** test-run.rs からホットキー検出・クリップボード・flush の全ロジックを削除し、`Voiput` の呼び出しと `SttEvent` の受信・表示だけを行う薄い層に再構成する。
* **対象不変条件:**
  - `cargo run --bin test-run -- --engine os` で全テスト実行後、Option/Alt ダブルタップで録音開始、再度のダブルタップでフラッシュ＆カーソルペーストが動作すること
  - `cargo run --bin test-run -- --engine openai --openai-key=sk-xxx` で OpenAI モードが動作すること
  - テスト失敗時は exit(1) で即時終了すること
  - Ctrl+Option/Ctrl+Alt でオーケストレータモードに移行し、テキストがカーソルではなくコンソールにダンプされること
  - 録音中はコンソールにリアルタイムで認識テキストが表示されること
* **CLI 引数設計:**
  ```
  cargo run --bin test-run -- [OPTIONS]

  OPTIONS:
    --engine <ENGINE>    音声認識エンジン [default: os] [possible values: os, openai]
    --openai-key <KEY>   OpenAI API キー（--engine openai の場合に必須）
    --base-url <URL>     OpenAI API ベース URL [default: https://api.openai.com/v1]
    --locale <LOCALE>    言語ロケール [default: ja] [possible values: ja, en]
  ```
* **実装スコープ:**
  - `src/binary/test-run.rs` — 全関数（`test_config()` 等）は維持しつつ、メインループを再構成:
    ```rust
    fn main() {
        // 1. CLI引数解析
        let args = parse_args();
        
        // 2. 全テスト実行（失敗時 exit(1)）
        if !run_all_tests(&args) { std::process::exit(1); }
        
        // 3. Voiput 構築
        let config = build_config(&args).unwrap();
        let mut voiput = Voiput::new(config).unwrap();
        
        // 4. ホットキー監視開始（内部で全処理）
        voiput.enable_hotkeys().unwrap();
        println!("🔊 Option ダブルタップで録音開始（Ctrl+Option でオーケストレータモード）");
        
        // 5. イベントループ（薄い表示層）
        let rt = tokio::runtime::Runtime::new().unwrap();
        rt.block_on(async {
            while let Some(event) = voiput.next_event().await {
                match event {
                    SttEvent::Ready => println!("🎤 録音準備完了"),
                    SttEvent::Started => println!("🔴 録音中..."),
                    SttEvent::PartialResult(t, _) => print!("\r📝 {}", t),
                    SttEvent::FinalResult(t, _) => println!("\r✅ {}", t),
                    SttEvent::Flushed(t) => println!("\n📋 Flushed: {}", t),
                    SttEvent::Stopped => println!("⏹ 録音停止"),
                    SttEvent::Error(e) => eprintln!("❌ {}", e),
                    _ => {}
                }
            }
        });
    }
    ```
  - `src/binary/test-run.rs` — 既存の `test_*()` 関数群（`test_config`, `test_resampler`, `test_post_correct`, `test_signal_filter`, `test_interceptor`, `test_vad`, `test_punctuation`, `test_audio`, `test_streamer`, `test_openai`, `test_macos`, `test_windows`, `test_voiput`）は維持。`test_voiput()` からホットキー関連の表示を削除し、`Voiput` の基本メソッド呼び出し確認のみに戻す
* **テストコードによる検証:**
  1. `cargo run --bin test-run -- --engine os` でテスト→ホットキー待機に遷移すること
  2. `cargo run --bin test-run -- --engine openai --openai-key=sk-test` で OpenAI モードが選択されること
  3. 引数なしで `--engine os` 相当のデフォルト動作をすること
  4. `test_voiput()` が既存の basic API 呼び出し確認のみを行うこと（ホットキー依存なし）
* **計装方法:** 目視確認 + `cargo run --bin test-run -- --help` のヘルプ出力確認

---

## 依存関係マップ

```
M0-1: Crate骨組み (+ test-run.rs 初版) ──────────────────┐
M0-2: 公開型定義 (+ test-run.rs [CONFIG]) ───────────────┤
M1-1: SincResampler (+ test-run.rs [RESAMPLER]) ────────┤  ← rubato
M1-2: PostCorrectionProcessor (+ [POST_CORRECT]) ──────┤  ← async-trait
M1-3: 信号品質フィルタ (+ test-run.rs [SIGNAL_FILTER]) ──┤
M1-4: 置換辞書 (+ test-run.rs [INTERCEPTOR]) ───────────┤  ← parking_lot, indexmap
                                                           ↓
M2-1: VadProcessor (+ [VAD]) ───────────────────────────┤  ← sherpa-rs-sys
M2-2: SpeechDenoiser ───────────────────────────────────┤  ← sherpa-rs-sys
M2-3: PunctuationMachine (+ [PUNCTUATION]) ─────────────┤  ← lindera
M2-4: 効果音再生 (+ [AUDIO]) ──────────────────────────┤  ← rodio
                                                           ↓
M2.5-1: Cargo.toml依存置換 ────────────────────────────┤  ← sherpa-rs → sherpa-onnx
M2.5-2: VadProcessor safe化 ───────────────────────────┤  ← VoiceActivityDetector
M2.5-3: SpeechDenoiser safe化 ─────────────────────────┤  ← OfflineSpeechDenoiser
M2.5-4: 移行後動作確認 ────────────────────────────────┤
                                                           ↓
M3-1: PseudoAsrStreamer (+ [STREAMER]) ─────────────────┤  ← tokio, hound（M1〜M2全コンポーネント統合）
                                                           ↓
M4-1: Native FFI ──────────────────────────────────────┤  ← プリビルドライブラリ
M4-2: OpenAIBackend (+ [OPENAI]) ──────────────────────┤  ← async-openai, hound
M4-3: MacSpeechBackend (+ [MACOS]) ────────────────────┤  ← macOS only
M4-4: WinSpeechBackend (+ [WINDOWS]) ──────────────────┤  ← Windows only
                                                           ↓
M5-1: SpeechRecognizer ────────────────────────────────┤
M5-2: Voiput (+ [Voiput] バッファ＆フラッシュ) ────┤
                                                           ↓
M6-1: Prebuilt + build.rs ─────────────────────────────┤
M6-2: 統合テスト ──────────────────────────────────────┤
M6-3: README ──────────────────────────────────────────┤
                                                          ↓
M7-1: async start/stop + request_permissions ───────────┤
M7-2: SpeechRecognizer 整理 + error 型 + 非対応OS ─────┤
M7-3: health_check + Cargo.toml include ────────────────┤
                                                          ↓
M8-1: hotkey/ モジュール ────────────────────────────────┤  ← CGEventTap (mac) / rdev + GetAsyncKeyState (win)
M8-2: input/ モジュール ────────────────────────────────┤  ← arboard + CGEvent / SendInput
M8-3: Voiput 拡張 (enable_hotkeys, flush, 2mode) ──────┤  ← M8-1 + M8-2 に依存
M8-4: test-run.rs 再構成 (薄い層 + CLI args) ─────────────┘  ← M8-3 に依存
```

---

## 各マイルストーン完了時の test-run.rs 確認

| ID | コマンド | 期待表示 |
|----|---------|---------|
| ID | コマンド | 存在するセクション |
|----|---------|-----------------|
| M0 | `cargo run --bin test-run` | Stage 1/6 表示 + ビルド成功確認。「次のセクションは各チケットで追加」と表示。`[CONFIG]` は M0-2 で追加 |
| M1 | `cargo run --bin test-run` | Stage 2/6 — `[CONFIG]` `[RESAMPLER]` `[POST_CORRECT]` `[SIGNAL_FILTER]` `[INTERCEPTOR]` の5セクションが各デモを実行 |
| M2 | `cargo run --bin test-run` | Stage 3/6 — 加えて `[VAD]` `[PUNCTUATION]` `[AUDIO]`（VAD/Denoiserは未実モデルならスキップ） |
| M3 | `cargo run --bin test-run` | Stage 4/6 — 加えて `[STREAMER]` が MockBackend パイプラインをデモ |
| M4 | `cargo run --bin test-run` | Stage 5/6 — 加えて `[OPENAI]` `[MACOS]` `[WINDOWS]` が各々使用可否を表示 |
| M5 | `cargo run --bin test-run` | Stage 6/6 — `[Voiput]` が音声入力→バッファ→フラッシュの全機能デモに移行可能 |
| M6 | `cargo run --bin test-run` & `cargo test` | 全セクション表示 + 統合テスト PASS |
| M7 | `cargo run --bin test-run` & `cargo test` | async start/stop 対応、request_permissions 追加、health_check 実装、Config 準拠 |
| M8 | `cargo run --bin test-run -- --engine os` | 全テスト自動実行 → ホットキー待機 → Optionダブルタップで録音開始/フラッシュ → Ctrl+OptionでOrchestrator → コンソールにリアルタイム認識表示 |
