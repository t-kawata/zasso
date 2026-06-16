# RFC: trate 抽象化層の導入と Qwen3-ASR ローカル音声認識バックエンドの実装 — 設計全体マップ

> このファイルは `/formulate-tickets` によって自動生成されました。
> **生成元:** `crates/voiput/docs/sherpa-onnx-qwen3-asr/RFC.md`
> **生成日:** 2026-06-16

## 目的とスコープ

voiput crate の音声認識パイプラインにおいて、音声認識エンジンへのリクエスト送出部分のみを abstract 化する新規 workspace crate `trate` を設計・実装する。同時に、同抽象化を利用した Qwen3-ASR ローカル音声認識バックエンド（sherpa-onnx OfflineRecognizer）を実装する。既存の OpenAI Whisper API を用いた疑似ストリーミング認識機構との整合性を保ちつつ、VAD / PostCorrection / デコレーション等の共通パイプラインはすべて維持し、認識エンジンの差し替えのみを trate を介して行う。

### スコープ内

- `trate` workspace crate の新規作成（`AsrBackend` トレイト + `LocalAsrBackend` トレイト）
- voiput 既存 `AsrBackend` トレイトの trate への移設
- `SttEngine::Local` バリアント追加
- Qwen3-ASR 設定構造体（`Qwen3AsrConfig`, `Qwen3AsrModelPaths`）
- `Qwen3AsrBackend`（sherpa-onnx OfflineRecognizer ラッパー）
- `LocalRecognizer` / `LocalRecognizerAdapter`（Facade + アダプター）
- `SpeechRecognizer` の Local ディスパッチ（start/stop/tick/set_locale/update_config）
- `VoiputConfigBuilder.validate()` の Local 検証
- build.rs による Qwen3-ASR モデルファイルのダウンロード
- モックベース単体テスト + 実モデル結合テスト

### スコープ外

- PostCorrection（LLM による事後補正）のエンジン別デフォルト値制御
- Qwen3-ASR 以外のローカル ASR モデル（Whisper / SenseVoice 等）の実装
- モデルファイルの SHA256 チェックサム検証

## アーキテクチャ概要

### コンポーネント構成

```
crates/
├── trate/                          # NEW: Abstract 化されたトレイト定義
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs                  # AsrBackend トレイト定義 + LocalAsrBackend 再公開
│       └── local.rs                # LocalAsrBackend（ローカルASR用基底トレイト）
│
└── voiput/
    ├── Cargo.toml                  # trate への依存追加
    └── src/
        ├── types.rs                # SttEngine::Local, Qwen3AsrConfig, Qwen3AsrModelPaths
        ├── constants.rs            # モデルファイル名定数
        ├── config.rs               # VoiputConfig::qwen3_asr_config フィールド + validate()
        ├── pipeline/
        │   └── streamer.rs         # AsrBackend トレイト削除 → trate 参照
        ├── backends/
        │   ├── openai.rs           # OpenAIBackend: impl trate::AsrBackend
        │   └── mod.rs
        ├── local/
        │   ├── mod.rs              # mod 宣言
        │   ├── recognizer.rs       # LocalRecognizer: Box<dyn LocalAsrBackend> + impl AsrBackend
        │   └── qwen3.rs            # Qwen3AsrBackend: impl LocalAsrBackend
        ├── recognizer.rs           # SpeechRecognizer: Local 分岐追加
        └── lib.rs                  # pub mod local 追加
```

### パイプライン比較

```text
OpenAI Whisper API 経由:
AudioCapture → VAD → SignalFilter → Denoiser → Resampler
    → PseudoAsrStreamer<OpenAIBackend>
        → AsrBackend::transcribe() → OpenAI Whisper API
        → PostCorrection → Interceptor(Replace) → SttEvent

Qwen3-ASR ローカル経由:
AudioCapture → VAD → SignalFilter → Denoiser → Resampler
    → PseudoAsrStreamer<LocalRecognizer>
        → AsrBackend::transcribe() → Qwen3AsrBackend (sherpa-onnx OfflineRecognizer)
        → PostCorrection → Interceptor(Replace) → SttEvent
```

VAD 以降のパイプラインは完全に共通。`PseudoAsrStreamer<B: AsrBackend>` の型パラメータ B のみが異なる。また、PostCorrection + Interceptor はエンジン非依存であり、バックエンドの種別に関係なく同一ロジックが動作する。

## 主要な型とデータ構造

| 型定義 | 所在 | 種別 | 説明 |
|--------|------|------|------|
| `AsrBackend` | `trate::AsrBackend` | Trait | 音声認識バックエンドの抽象（transcribe が唯一の必須メソッド） |
| `LocalAsrBackend` | `trate::LocalAsrBackend` | Trait | ローカルASR用拡張トレイト（AsrBackend を継承） |
| `LocalAsrKind` | `voiput::types` | Enum | Qwen3Asr / 将来: Whisper, SenseVoice |
| `SttEngine::Local` | `voiput::types` | Variant | 既存 enum に追加するバリアント |
| `Qwen3AsrModelPaths` | `voiput::types` | Struct | encoder/decoder/joiner/tokens へのパス |
| `Qwen3AsrConfig` | `voiput::types` | Struct | 推論パラメータ（provider, num_threads, debug） |
| `Qwen3AsrBackend` | `voiput::local::qwen3` | Struct | Mutex\<OfflineRecognizer\> を保持する実装 |
| `LocalRecognizer` | `voiput::local::recognizer` | Struct | Box\<dyn LocalAsrBackend\> の Facade |
| `LocalRecognizerAdapter` | `voiput::recognizer` | Struct | PseudoAsrStreamer 統合用アダプター |

## 依存関係グラフ（5層モデル）

```
Layer 4（統合・プラットフォーム）:
    build.rs モデルダウンロード
    Qwen3AsrBackend 結合テスト（実モデル + WAV）
        ↑ Layer 3 に依存

Layer 3（ライフサイクル管理）:
    LocalRecognizerAdapter（3タスク構成）
    SpeechRecognizer::dispatch (Local)
    VoiputConfigBuilder::validate()
        ↑ Layer 2 に依存

Layer 2（非同期ランタイム）:
    Qwen3AsrBackend::new() → OfflineRecognizer::create()
    Qwen3AsrBackend::transcribe() → sherpa-onnx FFI
        ↑ Layer 0, 1 に依存（sherpa-onnx は外部FFI）

Layer 1（純粋関数）:
    resolve_qwen3_model_paths()
    resolve_qwen3_asr_config()
    validate_qwen3_model_files()
    モデルファイル名定数
    trate モックベース単体テスト
        ↑ Layer 0 に依存

Layer 0（型定義）:
    AsrBackend trait
    LocalAsrBackend trait
    LocalAsrKind enum
    SttEngine::Local variant
    Qwen3AsrModelPaths struct
    Qwen3AsrConfig struct
    （外部依存なし）
```

## スタブ一覧と解決計画

本設計書に基づく実装では以下のスタブが一時的に発生する可能性がある：

| スタブ箇所 | 内容 | 解決チケット |
|-----------|------|-------------|
| `SpeechRecognizer` の `SttEngine::Local` 未実装時の match 非網羅 | 型追加直後は未実装ブランチが未追加でコンパイルエラー | M6-1 |
| `Qwen3AsrBackend` が未実装の状態での型定義先行追加 | 型は存在するが実装がない | M4-2 |
| `LocalRecognizer` 未実装状態 | Facade 型のみ存在 | M5-1 |

各スタブは該当チケットの実装完了と同時に自動的に解決される。スタブを残したまま次のチケットに進んではならない（コンパイルが通る状態を維持する）。
