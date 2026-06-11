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
| M2-3 | lindera, lindera-ipadic（コメントアウト解除） | `cargo add lindera --features embed-ipadic && cargo add lindera-ipadic` |
| M2-4 | rodio（コメントアウト解除） | `cargo add rodio` |
| M3-1 | hound（新規追加） | `cargo add hound` |
| M4-2 | async-openai（コメントアウト解除） | `cargo add async-openai --features audio` |
| M6-1 | winapi（コメントアウト解除） | `cargo add winapi --features fileapi,winbase` |

---

## test-run.rs — 開発の中核

`cargo run --bin test-run` で常に実行可能。各チケット完了時に test-run.rs の該当デモが増えていく。

```
test-run (Stage N/6)
├── [CONFIG]       VoiceKitConfig 構築テスト       ← MYCUTE の SttSettings 構築を模倣
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
└── [VOICEKIT]     VoiceKit フル音声入力           ← MYCUTE MycuteManager の音声入力制御を移植
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
├── build.rs                ← MYCUTE build.rs から Tauri 依存を削除したもの
├── prebuilt/               ← MYCUTE native/ からビルド済みライブラリを配置
│   ├── macos/libspeech_helper.a
│   └── windows/{speech_helper.lib, SpeechHelper.dll}
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
│   ├── voice_kit.rs        ← 新規。MYCUTE MycuteManager の STT 制御部分を参考に VoiceKit として独立
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
  - ~/shyme/mycute/src/error.rs（のパターンを参考に RFC 定義の VoiceKitError を実装）
  - ~/shyme/mycute/Cargo.toml（voiput 用に絞る）
  - ~/shyme/mycute/build.rs（Tauri 依存削除）
* **作業内容:**
  1. `Cargo.toml`: `cargo add` で初期依存を追加。その後 `cargo add --dev tempfile` で dev 依存も追加。build.rs でリンクが必要なライブラリ（sherpa-rs-sys等）はコメントアウト行として残す（`cargo add` 後に version のみ手動修正でも可）。`[[bin]]` セクションは `cargo add` では生成されないため手動で追記する。
  2. `build.rs`: target_os 分岐のスケルトン。プリビルドライブラリ不在は warning（後で本実装）。
  3. `src/lib.rs`: 全モジュール宣言 + 公開 re-export（VoiceKit, VoiceKitConfig, VoiceKitError, types::*）。
  4. `src/error.rs`: VoiceKitError（thiserror）。docs/rfc-stt-portable-crate.md §4.5 の定義。
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
  2. `src/config.rs`: VoiceKitConfig（全フィールド）+ VoiceKitConfigBuilder（build() でバリデーション）。docs/rfc-stt-portable-crate.md §4.4 のマッピング表に従い SttSettings を分解。
  3. test-run.rs `[CONFIG]`: VoiceKitConfig をビルドして内容を表示。docs/rfc-stt-portable-crate.md §4.2 のサンプルコードと同様の呼び出し。
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

##### チケット M1-4: 置換辞書インターセプター + test-run.rs [INTERCEPTOR]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.4
* **移植元:** ~/shyme/mycute/src/stt/recognizer.rs の `apply_replaces_from_map()` 関数
* **作業内容:**
  1. `recognizer.rs`（先に作り始める）に `apply_replaces()` を移植。
  2. test-run.rs `[INTERCEPTOR]`: 単一置換・複数置換・最長一致優先のデモ。MYCUTE のテストデータを流用。

### Phase 2: ネイティブ依存コンポーネントの移植（Sherpa / Lindera / rodio）

#### M2: パイプライン基盤

##### チケット M2-1: VadProcessor + test-run.rs [VAD]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.6
* **移植元:** ~/shyme/mycute/src/tools/vad_processor.rs — 完全移植
* **作業内容:**
  1. `pipeline/vad.rs` に VadProcessor をコピー。Windows の resolve_ascii_path も含む。
  2. test-run.rs `[VAD]`: モデルファイルが存在すれば初期化→accept_waveform→reset の一連テスト。なければスキップ。

##### チケット M2-2: SpeechDenoiser

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.5
* **移植元:** ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs の SpeechDenoiser struct を抽出
* **作業内容:**
  1. `pipeline/denoiser.rs` に SpeechDenoiser を独立ファイルとして抽出。
  2. test-run.rs: 単体テストは難しい（モデルファイル依存）ため、test-run.rs `[STREAMER]`（M3-1）の中でパイプライン統合時に自動的に呼ばれる形で確認する。`[DENOISER]` セクションは用意せず、モデルファイルが存在すれば M3-1 のデモ内部で動作。

##### チケット M2-3: PunctuationMachine + test-run.rs [PUNCTUATION]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.9, §7.16
* **移植元:**
  - ~/shyme/mycute/src/tools/lindera_util.rs（完全移植）
  - ~/shyme/mycute/src/tools/punctuation_machine.rs（LocaleCode 参照先を `crate::types::LocaleCode` に変更）
* **作業内容:**
  1. `lindera_util.rs` / `pipeline/punctuation.rs` にコピー。
  2. test-run.rs `[PUNCTUATION]`: "こんにちは元気ですか" に句読点を挿入するデモ。

##### チケット M2-4: 効果音再生 + test-run.rs [AUDIO]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.15, §6.4
* **移植元:** ~/shyme/mycute/src/tools/audio.rs — 完全移植（include_bytes! パスのみ変更）
* **作業内容:**
  1. `audio.rs` にコピー（rodio Actor パターン）。WAV ファイルもコピー。
  2. test-run.rs `[AUDIO]`: init → play_ready_sound → play_commit_sound の一連デモ。

### Phase 3: パイプライン統合（PseudoAsrStreamer）

#### M3: ストリーミングパイプライン

##### チケット M3-1: PseudoAsrStreamer + test-run.rs [STREAMER]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.5
* **移植元:** ~/shyme/mycute/src/tools/pseudo_asr_streamer.rs
  - SpeechDenoiser 参照を `crate::pipeline::denoiser` に変更
  - インポートパス変更（crate::tools → crate::pipeline）
  - それ以外は完全移植
* **作業内容:**
  1. `pipeline/streamer.rs` に PseudoAsrStreamer をコピー。
  2. test-run.rs `[STREAMER]`: MockBackend を AsrBackend にセットし、疑似的な push_samples → tick → イベント出力のパイプラインデモ。

### Phase 4: バックエンド移植 + 認識器統括

#### M4: 各バックエンド

##### チケット M4-1: Native FFI（native/mac_ffi.rs / win_ffi.rs）

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.14, 付録E, 付録F
* **移植元:** ~/shyme/mycute/src/stt/mac.rs の extern "C" ブロック, ~/shyme/mycute/src/stt/win.rs の extern "C" ブロック
* **作業内容:** FFI 宣言のみを独立ファイルに抽出。Windows はヘルスチェック状態管理（AtomicU32 + AtomicBool）も移動。

##### チケット M4-2: OpenAIBackend + OpenAIRecognizer + test-run.rs [OPENAI]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.11
* **移植元:** ~/shyme/mycute/src/stt/openai.rs
  - LmgwClient → OpenAiConfig + async-openai::Client の直接構築
  - `tauri::async_runtime` → `tokio`
  - `SttSettings` → `VoiceKitConfig`
* **作業内容:**
  1. `backends/openai.rs` に移植。
  2. test-run.rs `[OPENAI]`: OpenAiConfig が設定されていれば初期化→transcribe テスト可能。なければスキップ。

##### チケット M4-3: MacSpeechBackend + test-run.rs [MACOS]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.12
* **移植元:** ~/shyme/mycute/src/stt/mac.rs
  - FFI 宣言 → `crate::native::mac_ffi`
  - インポートパス変更（crate::mycute_settings → crate::types/config, crate::tools → crate::pipeline）
* **作業内容:**
  1. `backends/mac.rs` に移植。
  2. test-run.rs `[MACOS]`: `cfg(target_os="macos")` かつライブラリ存在時のみ実行。それ以外はスキップ。

##### チケット M4-4: WinSpeechBackend + test-run.rs [WINDOWS]

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.13
* **移植元:** ~/shyme/mycute/src/stt/win.rs
  - FFI 宣言 → `crate::native::win_ffi`
  - ヘルスチェック状態 → `crate::native::win_ffi`
  - インポートパス変更（mac と同様）
* **作業内容:**
  1. `backends/win.rs` に移植。
  2. test-run.rs `[WINDOWS]`: `cfg(target_os="windows")` かつライブラリ存在時のみ実行。

#### M5: 認識器統括 + VoiceKit 公開API

##### チケット M5-1: SpeechRecognizer

* **参照設計書:** docs/rfc-stt-portable-crate.md §7.4
* **移植元:** ~/shyme/mycute/src/stt/recognizer.rs
  - LmgwClient → OpenAiConfig ベースの OpenAIBackend
  - SttSettings → VoiceKitConfig
  - インターセプタータスクはそのまま
* **作業内容:** `recognizer.rs` に移植。すでに M1-4 で一部作成済みの場合は統合。

##### チケット M5-2: VoiceKit 公開API + test-run.rs [VOICEKIT]（バッファ＆フラッシュ）

* **参照設計書:** docs/rfc-stt-portable-crate.md §4.2, §4.5
* **移植元:**
  - MYCUTE MycuteManager の STT 制御部分（start/stop 認識、エンジン切替、ロケール変更）
  - MYCUTE MycuteManager::request_flush のロジック → VoiceKit::flush() に移植
* **flush() の移植内容（docs/rfc-stt-portable-crate.md §4.5 より）:**
  ```rust
  pub async fn flush(&mut self) -> Result<String, VoiceKitError> {
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
  1. `voice_kit.rs` に VoiceKit を実装。MYCUTE MycuteManager の該当部分を参照。
  2. test-run.rs `[VOICEKIT]`: 全デモセクションを統合。Ctrl+Enter で flush してテキストを表示するリアルタイム音声入力モードに移行可能にする。

### Phase 5: ビルド最終調整

#### M6: ビルド・ドキュメント

##### チケット M6-1: プリビルドライブラリ + build.rs 完成

* **参照設計書:** docs/rfc-stt-portable-crate.md §6, §9
* **移植元:** ~/shyme/mycute/native/ の Swift / C# コード + ~/shyme/mycute/build.rs
* **作業内容:**
  1. MYCUTE のネイティブコードを `native/` にコピー。
  2. プリビルドスクリプト（build.sh / build.ps1）を実行して `prebuilt/` にライブラリ配置。
  3. build.rs を完成（Tauri依存削除, macOS: 静的リンク, Windows: 静的リンク＋DLLコピー）。

##### チケット M6-2: 統合テスト

* **参照設計書:** docs/rfc-stt-portable-crate.md §10
* **作業内容:** `tests/integration_test.rs` — config バリデーションの結合テスト。

##### チケット M6-3: README

* **参照設計書:** docs/rfc-stt-portable-crate.md §12
* **作業内容:** 使い方、VoiceKit API、OS権限設定、test-run.rs の説明。

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
M3-1: PseudoAsrStreamer (+ [STREAMER]) ─────────────────┤  ← tokio, hound（M1〜M2全コンポーネント統合）
                                                           ↓
M4-1: Native FFI ──────────────────────────────────────┤  ← プリビルドライブラリ
M4-2: OpenAIBackend (+ [OPENAI]) ──────────────────────┤  ← async-openai, hound
M4-3: MacSpeechBackend (+ [MACOS]) ────────────────────┤  ← macOS only
M4-4: WinSpeechBackend (+ [WINDOWS]) ──────────────────┤  ← Windows only
                                                           ↓
M5-1: SpeechRecognizer ────────────────────────────────┤
M5-2: VoiceKit (+ [VOICEKIT] バッファ＆フラッシュ) ────┤
                                                           ↓
M6-1: Prebuilt + build.rs ─────────────────────────────┤
M6-2: 統合テスト ──────────────────────────────────────┤
M6-3: README ──────────────────────────────────────────┘
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
| M5 | `cargo run --bin test-run` | Stage 6/6 — `[VOICEKIT]` が音声入力→バッファ→フラッシュの全機能デモに移行可能 |
| M6 | `cargo run --bin test-run` & `cargo test` | 全セクション表示 + 統合テスト PASS |
