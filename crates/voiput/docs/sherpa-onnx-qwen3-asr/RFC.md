# RFC: trate 抽象化層の導入と Qwen3-ASR ローカル音声認識バックエンドの実装

## Abstract

本 RFC は、voiput crate の音声認識パイプラインにおいて、音声認識エンジンへのリクエスト送出部分のみを abstract 化する新規 workspace crate `trate` の設計、および同抽象化を利用した Qwen3-ASR ローカル音声認識バックエンド（sherpa-onnx OfflineRecognizer）の実装を定義する。既存の OpenAI Whisper API を用いた疑似ストリーミング認識機構との整合性を保ちつつ、VAD / PostCorrection / デコレーション等の共通パイプラインはすべて維持し、認識エンジンの差し替えのみを trate を介して行うアーキテクチャを提供する。

## Motivation

### 現状のアーキテクチャ

voiput は現在、以下の音声認識パイプラインを持つ：

```
AudioCapture → VAD → SignalFilter → Denoiser → Resampler
    → PseudoAsrStreamer<OpenAIBackend>
        → AsrBackend::transcribe() → OpenAI Whisper API
        → PostCorrection → Interceptor(Replace) → SttEvent
```

`PseudoAsrStreamer<B: AsrBackend>` は既にバックエンドを型パラメータとするジェネリック設計だが、`AsrBackend` トレイトは `pipeline/streamer.rs` に voiput 内部の非公開トレイトとして定義されており、外部クレートからの実装や差し替えができない。また、`OpenAIBackend` のみが `AsrBackend` を実装している唯一のバックエンドである。

`SttEngine` 列挙型は `OpenAI` と `Os`（OS ネイティブ認識）の 2 バリアントを持ち、両者は全く異なるパイプライン（前者は PseudoAsrStreamer、後者は OS 固有 API）として実装されている。

### 問題点

1. **トレイトの可視性**: `AsrBackend` が voiput 内部に閉じており、外部クレートはこのトレイトを実装できない。
2. **1 バックエンドのみ**: OpenAI Whisper API のみが AsrBackend の実装であり、ローカル認識（sherpa-onnx 等）が選択肢にない。
3. **SttEngine 拡張性**: 新たな認識エンジンを追加するたびに SpeechRecognizer の全分岐（start/stop/tick/set_locale/update_config）に新しい arm を追加する必要がある。
4. **モデル管理の不在**: ローカル認識では ONNX モデルファイルのダウンロード・配置・検証が必要だが、現状の voiput にその機構が存在しない（VAD モデルは build.rs で対応済みだが、ASR モデルは未対応）。

### 解決目標

1. 単一の `AsrBackend` トレイト（デフォルト実装付き）を `trate` crate に抽出し、外部クレートから実装可能にする。`transcribe()` は `sample_rate` パラメータを追加せず既存シグネチャを維持する。
2. `Qwen3AsrBackend` を実装し、sherpa-onnx OfflineRecognizer によるローカル音声認識を提供する。
3. `LocalRecognizer` を導入し、将来のローカル ASR モデル追加（Whisper / SenseVoice 等）に備えた拡張可能な設計とする。
4. `SttEngine::Local` バリアントを追加し、SpeechRecognizer の dispatch ロジックを単一の分岐で完結させる。
5. モデル管理（build.rs ダウンロード + 実行時検出 + エラーハンドリング）を既存の VAD モデルパターンと一貫した方法で実装する。

## Design

### 1. 全体アーキテクチャ

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
        ├── config.rs               # VoiputConfig::qwen3_asr_config フィールド
        ├── pipeline/
        │   └── streamer.rs         # PseudoAsrStreamer は trate へ移行（再公開でも可）
        ├── backends/
        │   ├── openai.rs           # OpenAIBackend: impl AsrBackend（既存シグネチャ維持）
        │   └── mod.rs
        ├── local/
        │   ├── mod.rs              # mod 宣言, Qwen3AsrModelPaths 解決等
        │   ├── recognizer.rs       # LocalRecognizer: Box<dyn LocalAsrBackend> + impl AsrBackend
        │   └── qwen3.rs            # Qwen3AsrBackend: impl LocalAsrBackend
        ├── recognizer.rs           # SpeechRecognizer: Local 分岐追加
        └── config.rs               # validate() に Local 時の必須チェック
```

### 2. trate crate のトレイト設計

トレイトは Core/Ext に分割せず、単一の `AsrBackend` トレイトとする。`transcribe()` は既存のシグネチャ `(&mut self, samples: &[f32])` を維持する（sample_rate パラメータは追加しない）。Qwen3AsrBackend は内部でサンプリングレート 16000 を固定値として保持し、PseudoAsrStreamer から渡される音声データは常に 16kHz モノラル f32 に正規化されているという設計不変条件に依存する。

`post_correct()` や `insert_punctuation()` などの付加機能はデフォルト実装を持ち、実装が不要なバックエンドは `transcribe()` のみを実装すればよい。これにより既存の `OpenAIBackend` のシグネチャ変更がゼロになる（既存の `BackendWrapper` パターンも維持される）。

```rust
// crates/trate/src/lib.rs

use anyhow::Result;

/// 音声認識バックエンドが実装すべきトレイト。
///
/// `transcribe()` のみが必須。その他のメソッドはデフォルト実装を持ち、
/// 必要に応じてオーバーライドする。
pub trait AsrBackend: Send {
    /// 音声データを認識し、テキスト結果を返す（唯一の必須メソッド）。
    ///
    /// `samples`: モノラル f32 PCM、振幅範囲 [-1.0, 1.0]
    /// PseudoAsrStreamer から渡される音声は常に 16kHz に正規化されている。
    fn transcribe(&mut self, samples: &[f32]) -> Result<String>;

    /// 事後補正を実行する（任意）。デフォルト: 入力をそのまま返す。
    fn post_correct(&mut self, text: &str) -> Result<String> {
        Ok(text.to_string())
    }

    /// モデル名またはバックエンドの識別子を返す。
    fn backend_name(&self) -> &'static str {
        "unknown"
    }

    /// ASR API の使用時間を記録する（任意）。
    fn record_asr_usage(&mut self, _duration_ms: u64) {}

    /// 句読点を挿入する（任意）。デフォルト: 入力をそのまま返す。
    fn insert_punctuation(&mut self, text: &str, _locale: &str) -> Result<String> {
        Ok(text.to_string())
    }
}
```

`PseudoAsrStreamer<B: AsrBackend + Send + Sync + 'static>` はこのトレイトを型パラメータとし、`BackendWrapper<B: AsrBackend + Send + 'static>` も同トレイトを実装境界とする。既存の `AsrBackend` トレイトのシグネチャが維持されるため、既存コード（`OpenAIBackend`、`PseudoAsrStreamer`、`BackendWrapper`）の修正は移設先のパス変更のみで済む。

#### 2.1 将来のローカルASRモデル追加に備えた LocalAsrBackend

`LocalAsrBackend` はローカル ASR バックエンドが追加で実装すべきトレイトであり、`AsrBackend` を継承する。`Qwen3AsrBackend` がこれを実装し、将来的に `WhisperAsrBackend` や `SenseVoiceAsrBackend` も同トレイトを実装する。

```rust
// crates/trate/src/local.rs

use crate::AsrBackend;

/// ローカル ASR バックエンドが実装すべきトレイト。
///
/// AsrBackend に加えて、ローカルモデルに固有の情報（モデルパス等）を提供する。
/// 将来のモデル追加（Whisper / SenseVoice 等）はこのトレイトを実装する。
pub trait LocalAsrBackend: AsrBackend {
    /// 使用中のモデルファイルへのパスを返す（エラーメッセージ等で使用）。
    fn model_path(&self) -> &str;

    /// バックエンドが正常に初期化されているかを確認する。
    fn is_healthy(&self) -> bool;
}
```

#### 2.2 既存 AsrBackend トレイトからの移行

現在の `streamer.rs::AsrBackend`（5 メソッド）は、そのまま `trate::AsrBackend` に移設する。`transcribe()` のシグネチャは変更しない。`OpenAIBackend` の実装は `use` パスを `trate::AsrBackend` に変更するのみで、実装内容は一切変更不要。

### 3. SttEngine::Local バリアント

```rust
// crates/voiput/src/types.rs

use trate::LocalAsrBackend;

/// ローカル ASR バックエンドの種別
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalAsrKind {
    Qwen3Asr,
    // 将来追加: Whisper, SenseVoice 等
}

/// 音声認識エンジンの種別
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SttEngine {
    /// OpenAI Whisper API（疑似ストリーミング）
    OpenAI,
    /// OS ネイティブ認識（macOS: SFSpeechRecognizer / Windows: WinRT）
    #[default]
    Os,
    /// ローカル ASR モデル（sherpa-onnx 経由）
    Local { backend: LocalAsrKind },
}
```

### 4. Qwen3-ASR 設定構造体

VAD モデル管理パターン（`VadModelPaths` + `resolve_vad_model_path()` + `constants.rs`）と一貫した設計とする。

```rust
// crates/voiput/src/types.rs

/// Qwen3-ASR モデルファイルへのパス群
#[derive(Debug, Clone)]
pub struct Qwen3AsrModelPaths {
    /// encoder.onnx のパス
    pub encoder: String,
    /// decoder.onnx のパス
    pub decoder: String,
    /// joiner.onnx のパス
    pub joiner: String,
    /// tokens.txt のパス
    pub tokens: String,
}

/// Qwen3-ASR 推論パラメータ
#[derive(Debug, Clone)]
pub struct Qwen3AsrConfig {
    /// モデルファイルへのパス
    pub model_paths: Qwen3AsrModelPaths,
    /// ONNX Runtime のプロバイダ（"cpu", "cuda" 等）
    pub provider: String,
    /// Sherpa-ONNX の推論スレッド数
    pub num_threads: i32,
    /// デバッグモード
    pub debug: bool,
}
```

```rust
// crates/voiput/src/constants.rs

/// Qwen3-ASR モデルファイル名
pub(crate) const MODEL_FILENAME_QWEN3_ENCODER: &str = "encoder.int8.onnx";
pub(crate) const MODEL_FILENAME_QWEN3_DECODER: &str = "decoder.int8.onnx";
pub(crate) const MODEL_FILENAME_QWEN3_JOINER: &str = "joiner.int8.onnx";
pub(crate) const MODEL_FILENAME_QWEN3_TOKENS: &str = "tokens.txt";

/// Qwen3-ASR モデルファイルが配置されるサブディレクトリ（models/ からの相対）
pub(crate) const QWEN3_MODEL_SUBDIR: &str = "qwen3-asr";
```

```rust
// crates/voiput/src/recognizer.rs — パス解決（VAD の resolve_vad_model_path を流用）

fn resolve_qwen3_model_paths(
    model_dir: &Option<String>,
) -> Qwen3AsrModelPaths {
    let subdir = resolve_vad_model_path(QWEN3_MODEL_SUBDIR, model_dir);
    Qwen3AsrModelPaths {
        encoder: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_ENCODER),
        decoder: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_DECODER),
        joiner: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_JOINER),
        tokens: format!("{}/{}", subdir, MODEL_FILENAME_QWEN3_TOKENS),
    }
}
```

### 5. Qwen3AsrBackend 実装

```rust
// crates/voiput/src/local/qwen3.rs

use std::sync::Mutex;

use anyhow::{anyhow, Result};
use sherpa_onnx::{
    OfflineQwen3ASRModelConfig, OfflineRecognizer, OfflineRecognizerConfig,
};
use trate::{AsrBackend, LocalAsrBackend};

use crate::types::Qwen3AsrConfig;

/// Qwen3-ASR バックエンドが使用する内部サンプリングレート。
/// PseudoAsrStreamer のパイプラインは常に 16kHz に正規化されており、
/// この固定値を accept_waveform() に渡す。
const QWEN3_SAMPLE_RATE: i32 = 16000;

pub struct Qwen3AsrBackend {
    /// OfflineRecognizer は Mutex で保護する（内部状態を持つため）
    recognizer: Mutex<OfflineRecognizer>,
    /// 設定（エラーメッセージ等で使用）
    config: Qwen3AsrConfig,
}

impl Qwen3AsrBackend {
    /// Qwen3AsrBackend を構築する。
    ///
    /// OfflineRecognizer::create() でモデルをロードする。この時点で
    /// モデルファイルが存在しない、または破損している場合はエラーを返す。
    ///
    /// # Errors
    ///
    /// - `OfflineRecognizer::create()` が `None` を返した場合（モデル不在/破損）
    pub fn new(config: &Qwen3AsrConfig) -> Result<Self> {
        let mut recognizer_config = OfflineRecognizerConfig::default();

        recognizer_config.model_config.qwen3_asr = OfflineQwen3ASRModelConfig {
            encoder: Some(config.model_paths.encoder.clone()),
            decoder: Some(config.model_paths.decoder.clone()),
            joiner: Some(config.model_paths.joiner.clone()),
            ..Default::default()
        };

        recognizer_config.model_config.tokens = Some(config.model_paths.tokens.clone());
        recognizer_config.model_config.provider = Some(config.provider.clone());
        recognizer_config.model_config.num_threads = config.num_threads;
        recognizer_config.model_config.debug = config.debug;

        let recognizer = OfflineRecognizer::create(&recognizer_config)
            .ok_or_else(|| anyhow!(
                "Qwen3-ASR OfflineRecognizer の作成に失敗しました。\
                 モデルファイルが存在するか確認してください:\n  encoder={}\n  decoder={}\n  joiner={}\n  tokens={}",
                config.model_paths.encoder,
                config.model_paths.decoder,
                config.model_paths.joiner,
                config.model_paths.tokens,
            ))?;

        Ok(Self {
            recognizer: Mutex::new(recognizer),
            config: config.clone(),
        })
    }
}

impl AsrBackend for Qwen3AsrBackend {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        let mut recognizer = self.recognizer.lock().unwrap();
        let stream = recognizer.create_stream();
        // PseudoAsrStreamer は常に 16kHz で音声データを渡す。
        // Qwen3-ASR の accept_waveform() は sample_rate を要求するため、
        // 固定値 QWEN3_SAMPLE_RATE を使用する。
        stream.accept_waveform(QWEN3_SAMPLE_RATE, samples);
        recognizer.decode(&stream);

        let result = stream.get_result()
            .ok_or_else(|| anyhow!("Qwen3-ASR 認識結果の取得に失敗しました"))?;
        Ok(result.text)
    }

    fn backend_name(&self) -> &'static str {
        "qwen3-asr"
    }
}

impl LocalAsrBackend for Qwen3AsrBackend {
    fn model_path(&self) -> &str {
        &self.config.model_paths.encoder
    }

    fn is_healthy(&self) -> bool {
        // OfflineRecognizer が Mutex 内部に存在する = create() 成功済み = healthy
        true
    }
}
```

`sherpa-onnx` の `OfflineRecognizer` について：

- `create(config) -> Option<Self>`: `None` の場合はモデルロード失敗。`ok_or_else` で明示的なエラーに変換する。
- `create_stream(&self) -> OfflineStream`: ストリームを作成する。`&self` を取るため複数スレッドからの `decode()` 呼び出しは排他的にシリアライズする必要がある（`Mutex` の根拠）。
- `accept_waveform(sample_rate: i32, samples: &[f32])`: 音声データをストリームに投入する。サンプリングレートは常に 16000 固定（PseudoAsrStreamer のパイプライン不変条件）。
- `decode(&self, stream)`: 認識を実行する。
- `get_result(&self) -> Option<OfflineResult>`: 認識結果を取得。`None` の場合は認識失敗。

#### 入力音声データ形式

`transcribe()` が受け取るデータは以下の形式に従う：

| 項目 | 値 | 備考 |
|------|-----|------|
| チャンネル数 | 1（モノラル） | パイプラインのリサンプラー/デノイザー出力をそのまま渡す |
| サンプル型 | `f32` | 振幅範囲 `[-1.0, 1.0]` に正規化済み |
| 実効サンプリングレート | 16000（固定） | PseudoAsrStreamer 内部で 16kHz に正規化済み |
| データ長 | 無制限 | VAD で区切られた発話セグメント単位で渡される |

PseudoAsrStreamer は内部で VAD → SignalFilter → Denoiser → Resampler を経由しており、`AsrBackend::transcribe()` に渡されるタイミングでは常に 16kHz モノラル f32 に正規化されている。

### 6. LocalRecognizer 統合

`LocalRecognizer` はローカル ASR バックエンドへの Facade であり、`Box<dyn LocalAsrBackend>` を内部に保持して `AsrBackend` を実装する。`PseudoAsrStreamer` からは通常の `AsrBackend` 実装として透過的に扱われる。

```rust
// crates/voiput/src/local/recognizer.rs

use std::sync::Arc;

use anyhow::Result;
use trate::{AsrBackend, LocalAsrBackend};

use crate::types::LocalAsrKind;

/// ローカル ASR バックエンドの統括 Facade。
///
/// 複数のローカル ASR モデル（Qwen3-ASR, Whisper, SenseVoice 等）を
/// Box<dyn LocalAsrBackend> として内部に保持し、PseudoAsrStreamer に対して
/// 単一の AsrBackend 実装として振る舞う。
pub struct LocalRecognizer {
    backend: Box<dyn LocalAsrBackend>,
    kind: LocalAsrKind,
    /// ロケール（将来のモデル用に保持。Qwen3-ASR は使用しない）
    locale: LocaleCode,
}

impl LocalRecognizer {
    /// LocalRecognizer を構築する。
    ///
    /// 将来のモデル追加時はここに新しい分岐を追加する。
    pub fn new(kind: LocalAsrKind, config: &crate::VoiputConfig) -> Result<Self> {
        let backend: Box<dyn LocalAsrBackend> = match kind {
            LocalAsrKind::Qwen3Asr => {
                let qwen3_config = config.qwen3_asr_config
                    .as_ref()
                    .ok_or_else(|| anyhow::anyhow!(
                        "SttEngine::Local(Qwen3Asr) には qwen3_asr_config が必須です"
                    ))?;
                Box::new(super::qwen3::Qwen3AsrBackend::new(qwen3_config)?)
            }
        };

        Ok(Self { backend, kind, locale: config.locale })
    }

    pub fn kind(&self) -> LocalAsrKind {
        self.kind
    }
}

impl AsrBackend for LocalRecognizer {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        self.backend.transcribe(samples)
    }

    fn backend_name(&self) -> &'static str {
        match self.kind {
            LocalAsrKind::Qwen3Asr => "qwen3-asr",
        }
    }
}
```

`LocalRecognizer` が必要な理由：将来 Whisper 等のローカル ASR モデルが追加された場合、`PseudoAsrStreamer` は `AsrBackend` トレイトに対してのみプログラミングされており、内部のバックエンドが Qwen3 から Whisper に変わっても一切の修正が不要になる。`SpeechRecognizer` 側で `LocalRecognizer::new(LocalAsrKind::Whisper, config)` と生成するだけで切り替えが完了する。

### 7. SpeechRecognizer ディスパッチ

`SpeechRecognizer` は `SttEngine` に応じて `PseudoAsrStreamer` の型パラメータを切り替える。`SttEngine::Local` の場合、`LocalRecognizer` が `AsrBackend` 実装として動作する。

```rust
// crates/voiput/src/recognizer.rs — start() の分岐

impl SpeechRecognizer {
    pub fn start(&mut self) {
        if self.is_running.load(Ordering::SeqCst) {
            return;
        }
        self.is_running.store(true, Ordering::SeqCst);
        let _ = self.tx.try_send(SttEvent::Started);

        match &self.engine {
            SttEngine::OpenAI => {
                if let Some(ref mut backend) = self.openai_recognizer {
                    backend.start();
                } else {
                    log::error!("[SpeechRecognizer] OpenAI backend not initialized");
                    self.is_running.store(false, Ordering::SeqCst);
                }
            }
            SttEngine::Local { backend } => {
                // PseudoAsrStreamer<LocalRecognizer> を起動
                // 実装詳細: voiput.rs の OrchestratorInput を介して
                // LocalRecognizer をラップした PseudoAsrStreamer を開始する
                if let Some(ref mut local) = self.local_recognizer {
                    local.start();
                } else {
                    log::error!("[SpeechRecognizer] Local backend not initialized");
                    self.is_running.store(false, Ordering::SeqCst);
                }
            }
            SttEngine::Os => {
                // ... 既存の Os 分岐 ...
            }
        }
    }
}
```

`SpeechRecognizer` 構造体に `local_recognizer: Option<LocalRecognizerAdapter>` フィールドを追加する。ただし、OpenAI バックエンドは `OpenAIRecognizer`（3タスク構成）として既存の複雑な初期化フローを持つため、Local バックエンドも同程度の複雑さを持つ可能性がある。アダプター構造体で抽象化する：

```rust
// crates/voiput/src/recognizer.rs — LocalRecognizerAdapter

/// LocalRecognizer を PseudoAsrStreamer と統合するアダプター。
///
/// OpenAIRecognizer と同様の構造（ticker + capture + streamer の3タスク）を
/// 持つが、AsrBackend の実装のみが異なる。
struct LocalRecognizerAdapter {
    streamer: Arc<Mutex<Option<PseudoAsrStreamer<LocalRecognizer>>>>,
    // ... 他のフィールド（OpenAIRecognizer と同様） ...
}

impl LocalRecognizerAdapter {
    fn new(tx: mpsc::Sender<SttEvent>, config: &VoiputConfig) -> Result<Self> {
        let local_recognizer = LocalRecognizer::new(
            match config.engine {
                SttEngine::Local { backend } => backend,
                _ => unreachable!("LocalRecognizerAdapter は Local エンジン専用"),
            },
            config,
        )?;

        // PseudoAsrStreamer<LocalRecognizer> を構築
        // OpenAIRecognizer と同様の init_audio / capture タスクを起動
        // ...
    }
}
```

##### Local バックエンドの tick() / set_locale() / update_config()

各メソッドの Local バックエンドにおける動作方針を以下に定義する。

| メソッド | 動作 | 理由 |
|----------|------|------|
| `tick()` | **no-op** | OpenAIRecognizer と同様、バックグラウンドの PseudoAsrStreamer タスクが処理を行うため、`SpeechRecognizer::tick()` では何もしない。 |
| `set_locale(locale)` | `LocalRecognizerAdapter` 内部のロケールを更新する。ローカルバックエンドの `self.language` に保存する。 | Qwen3-ASR はロケールを使用しないが、将来のモデル（Whisper の language hint 等）が使用する可能性があるため、インターフェースとして保持する。 |
| `update_config()` | ① 動作中の場合は `stop()` ② `LocalRecognizer` を再生成（古いインスタンスの Drop で OfflineRecognizer が解放される）③ `start()` で再開する | モデル設定やエンジン種別の変更を反映するため。`unimplemented!()` や `todo!()` の使用は禁止。 |
| `validate_config(engine)` | `SttEngine::Local` の場合は常に `Ok(())`。設定構造体の詳細検証は `VoiputConfigBuilder::validate()` に委譲する。 | SpeechRecognizer の validate は OS 対応確認のみ。設定値の検証は ConfigBuilder の責務。 |

`unimplemented!()` / `todo!()` は panic の原因となるため、Local バックエンドの各メソッドに使用してはならない。未対応の操作は早期 return または `log::warn!` の出力で対応する。

## 8. モデルファイルのライフサイクル

#### 8.1 build.rs によるダウンロード

既存の VAD モデルダウンロードパターン（`build.rs`）を踏襲し、Qwen3-ASR モデルファイルもビルド時にダウンロードする。

```rust
// crates/voiput/build.rs — 追加するモデル定義

const QWEN3_MODEL_FILES: &[(&str, &str)] = &[
    (
        "qwen3-asr/encoder.int8.onnx",
        "https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/resolve/main/encoder.int8.onnx",
    ),
    (
        "qwen3-asr/decoder.int8.onnx",
        "https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/resolve/main/decoder.int8.onnx",
    ),
    (
        "qwen3-asr/joiner.int8.onnx",
        "https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/resolve/main/joiner.int8.onnx",
    ),
    (
        "qwen3-asr/tokens.txt",
        "https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/resolve/main/tokens.txt",
    ),
];
```

`models/` ディレクトリの構造（build.rs 実行後）：

```
crates/voiput/models/
├── silero_vad.onnx              # VAD（既存）
├── silero_vad.int8.onnx         # VAD（既存）
├── ten_vad.onnx                 # VAD（既存）
├── ten-vad.int8.onnx            # VAD（既存）
├── gtcrn.onnx                   # VAD デノイザー（既存）
├── tokens.txt                   # VAD（既存）
├── qwen3-asr/                   # NEW: Qwen3-ASR モデルサブディレクトリ
│   ├── encoder.int8.onnx
│   ├── decoder.int8.onnx
│   ├── joiner.int8.onnx
│   └── tokens.txt
```

`tokens.txt` の重複を回避するため、Qwen3-ASR のモデルファイルは `models/qwen3-asr/` サブディレクトリに配置する。これは VAD モデルがフラット配置であるのと異なるが、`tokens.txt` という同名ファイルが VAD 側と Qwen3-ASR 側で衝突するため、サブディレクトリによる分離が唯一の現実的な解決策である。

#### 8.2 実行時のモデル検出とエラーハンドリング

実行時のモデルファイル検証は、ファイル存在チェックのみ行う。`OfflineRecognizer::create()` のエラーは `anyhow::Result` として上位に伝播し、そこでユーザーに通知する。SHA256 チェックサム検証等の追加検証は行わない（`OfflineRecognizer::create()` 自体がモデルファイルの整合性を検証するため、二重の検証は不要）。

```rust
/// モデルファイルの存在を検証する。
///
/// ファイルが存在しない場合、エラーメッセージとともにユーザーに
/// `make download-models` の実行を促す。
fn validate_qwen3_model_files(config: &Qwen3AsrConfig) -> Result<()> {
    let paths = [
        (&config.model_paths.encoder, "encoder.onnx"),
        (&config.model_paths.decoder, "decoder.onnx"),
        (&config.model_paths.joiner, "joiner.onnx"),
        (&config.model_paths.tokens, "tokens.txt"),
    ];

    for (path, name) in &paths {
        if !std::path::Path::new(path).exists() {
            anyhow::bail!(
                "Qwen3-ASR モデルファイルが見つかりません: {} ({})\n\
                 ビルド時に自動ダウンロードされます。\n\
                 手動でダウンロードする場合: https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8",
                name, path
            );
        }
    }

    Ok(())
}
```

### 9. PostCorrection 戦略

PostCorrection（LLM による事後補正）はエンジン非依存であり、VAD パイプラインと同様にすべての認識エンジンで共通して使用される。`AsrBackend::post_correct()` は `BackendWrapper` を介して PostCorrectionProcessor から呼び出されるが、Qwen3-ASR のようなローカルモデルは `post_correct()` を持たない（デフォルト実装の素通しになる）。

実際の PostCorrection 処理は、`SpeechRecognizer` 内のインターセプター層で行われる。インターセプターは各バックエンドからの認識結果に対してテキスト置換を適用するものであり、バックエンドの種別に関係なく同一のロジックが動作する。

```
Backend → transcribe() → SttEvent::FinalResult(text)
                                      ↓
                          Interceptor(apply_replaces)
                                      ↓
                          PostCorrectionProcessor(LLM)
                                      ↓
                          tx.send(SttEvent::FinalResult(corrected))
```

つまり、PostCorrection は ASR エンジンの選択とは完全に独立して動作する。ユーザー設定で PostCorrection の ON/OFF を指定できるが、そのデフォルト値はエンジンごとに異なっていてもよい（OpenAI: OFF / Local: ON など）。ただしその判断は RFC の対象外であり、アプリケーション層（zasso の設定画面）で制御される。

### 10. VoiputConfigBuilder バリデーション

```rust
// crates/voiput/src/config.rs

impl VoiputConfigBuilder {
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();

        match self.engine {
            SttEngine::Local { backend: LocalAsrKind::Qwen3Asr } => {
                if self.qwen3_asr_config.is_none() {
                    errors.push(
                        "SttEngine::Local(Qwen3Asr) を選択する場合、\
                         qwen3_asr_config の設定が必須です。\
                         モデルファイルのパスと推論パラメータを設定してください。".into()
                    );
                }
            }
            SttEngine::OpenAI => {
                if self.openai_config.is_none() {
                    errors.push(
                        "SttEngine::OpenAI を選択する場合、\
                         openai_config の設定が必須です。\
                         API キーとベース URL を設定してください。".into()
                    );
                }
            }
            SttEngine::Os => {
                // OS ネイティブ認識は追加設定不要
            }
        }

        if errors.is_empty() { Ok(()) } else { Err(errors) }
    }
}
```

既存のバリデーションは `SttEngine` に対して常に OpenAI 設定を要求していたが、`SttEngine::Local` の場合は Qwen3-ASR 設定を要求するように分岐を追加する。エラーメッセージは日本語で記述し、ユーザーが即座に何を設定すべきか理解できるようにする。

### 11. テスト戦略

#### 11.1 trate クレートのテスト（モックベース）

`AsrBackend` トレイトに対するモック実装を用いて、トレイトの契約が正しく機能することを検証する。`PseudoAsrStreamer` のロジックテストもモックバックエンドで行う。

```rust
// crates/trate/src/core.rs — テスト

#[cfg(test)]
mod tests {
    use super::*;

    struct MockBackend;

    impl AsrBackend for MockBackend {
        fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
            if samples.is_empty() {
                Ok(String::new())
            } else {
                Ok("mock recognition result".to_string())
            }
        }

        fn backend_name(&self) -> &'static str {
            "mock"
        }
    }

    #[test]
    fn test_mock_backend_transcribe_empty() {
        let mut backend = MockBackend;
        let result = backend.transcribe(&[]).unwrap();
        assert_eq!(result, "");
    }

    #[test]
    fn test_mock_backend_transcribe_non_empty() {
        let mut backend = MockBackend;
        let samples = vec![0.0f32; 16000]; // 1秒の無音
        let result = backend.transcribe(&samples).unwrap();
        assert_eq!(result, "mock recognition result");
    }
}
```

#### 11.2 Qwen3AsrBackend のテスト（実モデル + 実音声）

`Qwen3AsrBackend` のテストは実際のモデルファイルとサンプル音声ファイルを使用して実行する。`#[cfg(feature = "integration-tests")]` または `#[cfg(test)]` 内で直接動作するが、モデルファイルが存在しない場合はテストをスキップする。

```rust
// crates/voiput/src/local/qwen3.rs — テスト

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::QWEN3_MODEL_SUBDIR;
    use crate::types::{Qwen3AsrConfig, Qwen3AsrModelPaths};

    /// モデルディレクトリが存在する場合のみテストを実行するヘルパー。
    fn qwen3_config_or_skip() -> Option<Qwen3AsrConfig> {
        let model_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("models")
            .join(QWEN3_MODEL_SUBDIR);

        if !model_dir.join("encoder.int8.onnx").exists() {
            // モデルファイルが存在しない場合はスキップ
            return None;
        }

        Some(Qwen3AsrConfig {
            model_paths: Qwen3AsrModelPaths {
                encoder: model_dir.join("encoder.int8.onnx").to_string_lossy().to_string(),
                decoder: model_dir.join("decoder.int8.onnx").to_string_lossy().to_string(),
                joiner: model_dir.join("joiner.int8.onnx").to_string_lossy().to_string(),
                tokens: model_dir.join("tokens.txt").to_string_lossy().to_string(),
            },
            provider: "cpu".to_string(),
            num_threads: 2,
            debug: false,
        })
    }

    #[test]
    fn test_qwen3_backend_new() {
        let config = match qwen3_config_or_skip() {
            Some(c) => c,
            None => {
                eprintln!("SKIP: Qwen3-ASR モデルファイルが見つかりません。build.rs でダウンロードしてください。");
                return;
            }
        };

        let backend = Qwen3AsrBackend::new(&config);
        assert!(backend.is_ok(), "OfflineRecognizer の作成に失敗: {:?}", backend.err());
    }

    #[test]
    fn test_qwen3_backend_transcribe() {
        let config = match qwen3_config_or_skip() {
            Some(c) => c,
            None => return,
        };

        // サンプル音声ファイル（テスト用の短い無音 WAV）を使用
        let wav_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("silence_16k_mono.wav");

        if !wav_path.exists() {
            eprintln!("SKIP: テスト用音声ファイルが見つかりません: {:?}", wav_path);
            return;
        }

        let mut backend = Qwen3AsrBackend::new(&config)
            .expect("Qwen3AsrBackend の作成に失敗");

        // WAV ファイルを読み込み、モノラル f32 に変換
        let mut reader = hound::WavReader::open(&wav_path)
            .expect("WAV ファイルを開けません");
        let samples: Vec<f32> = reader.samples::<i16>()
            .filter_map(Result::ok)
            .map(|s| s as f32 / i16::MAX as f32)
            .collect();

        // transcribe() はサンプリングレートを引数に取らない。
        // Qwen3AsrBackend 内部で固定 16000 として扱われる。
        let result = backend.transcribe(&samples);
        assert!(result.is_ok(), "transcribe に失敗: {:?}", result.err());
        // 認識結果が空文字列でないことを確認（無音でも tokens.txt に応じて空か「 」等が返る）
        let text = result.unwrap();
        println!("Qwen3-ASR 認識結果: {:?}", text);
    }
}
```

テスト用のサンプル音声ファイル（`tests/fixtures/silence_16k_mono.wav`）は、OpenAI バックエンドのテスト用にも使用可能な汎用ファイルとする。`make test` で自動的にダウンロードされるか、手動で配置する。無音ファイルの代わりに 1 秒程度の短い発話を含む WAV ファイルを用意してもよい。

### 12. sherpa-onnx 依存関係

`sherpa-onnx` は既に `crates/voiput/Cargo.toml` に依存関係として存在する：

```toml
# crates/voiput/Cargo.toml（既存）
[dependencies]
sherpa-onnx = { version = "1.13.2", default-features = false, features = ["shared"] }
```

追加の依存は不要。また、`trate` crate は `sherpa-onnx` に依存せず、純粋なトレイト定義のみを持つ軽量クレートとする。

```toml
# crates/trate/Cargo.toml（新規）
[package]
name = "trate"
version = "0.1.0"
edition = "2021"

[dependencies]
anyhow = "1"
```

## Implementation

### 実装順序

各ステップはコンパイルが通る状態を維持しながら進める。

#### Step 1: trate crate の作成

1. `crates/trate/` ディレクトリを作成し、`Cargo.toml` / `src/lib.rs` を配置する。
2. `crates/trate/src/core.rs` に `AsrBackend` トレイトを定義する。
3. `crates/trate/src/ext.rs` に `AsrBackend` トレイトを定義する（デフォルト実装付き）。
4. `crates/trate/src/local.rs` に `LocalAsrBackend` トレイトを定義する。
5. `lib.rs` で全トレイトを再公開する。
6. ワークスペースの `Cargo.toml` に `trate` を追加する。

```bash
mkdir -p crates/trate/src
```

```toml
# Cargo.toml（workspace root）
[workspace]
members = [
    "crates/voiput",
    "crates/siprs",
    "crates/procreg",
    "crates/trate",  # 追加
    "crates/dummy",
]
```

#### Step 2: voiput の trate 依存 + AsrBackend 移行

1. `crates/voiput/Cargo.toml` に `trate = { path = "../trate" }` を追加。
2. `pipeline/streamer.rs` の `AsrBackend` トレイト定義を削除し、代わりに `use trate::AsrBackend` を追加する。
3. `OpenAIBackend` の実装を `impl AsrBackend for OpenAIBackend`（既存のまま、パスのみ変更）。
4. `transcribe` のシグネチャは変更しない（既存の `samples: &[f32]` を維持）。
5. `PseudoAsrStreamer` の型パラメータ制約は既存の `AsrBackend` のまま（変更不要）。
6. `make check-be` でコンパイルを確認する。
6. `make check-be` でコンパイルを確認する。

#### Step 3: 型定義の拡張

1. `types.rs` に `LocalAsrKind`, `Qwen3AsrModelPaths`, `Qwen3AsrConfig` を追加する。
2. `SttEngine::Local { backend: LocalAsrKind }` バリアントを追加する。
3. `constants.rs` に Qwen3-ASR モデルファイル名定数を追加する。
4. `make check-be` でコンパイルを確認する（既存の match が非網羅になるためコンパイルエラーになるが、一旦許容）。

#### Step 4: Qwen3AsrBackend + LocalRecognizer 実装

1. `crates/voiput/src/local/mod.rs` を作成し、モジュール宣言を行う。
2. `crates/voiput/src/local/qwen3.rs` に `Qwen3AsrBackend` を実装する。
3. `crates/voiput/src/local/recognizer.rs` に `LocalRecognizer` を実装する。
4. `lib.rs` に `pub mod local` を追加する。
5. `make check-be` でコンパイルを確認する。

#### Step 5: SpeechRecognizer ディスパッチ追加

1. `recognizer.rs` の `SpeechRecognizer` 構造体に `local_recognizer: Option<LocalRecognizerAdapter>` フィールドを追加する。
2. `SttEngine::Local` をすべての match 式（`start`、`stop`、`tick`、`validate_config`）に追加する。
3. `VoiputConfigBuilder.validate()` に `SttEngine::Local` 時の検証を追加する。
4. `make check-be` でコンパイルを確認する。

#### Step 6: build.rs モデルダウンロード追加

1. `build.rs` に `QWEN3_MODEL_FILES` 定数を追加する。
2. ダウンロードループに Qwen3-ASR ファイルのダウンロードを追加する。
3. `make download-models` 相当の方法でファイルが配置されることを確認する。

#### Step 7: テスト実装

1. `trate` crate にモックベースのユニットテストを追加する。
2. `crates/voiput/tests/fixtures/` にテスト用サンプル音声ファイルを配置する。
3. `Qwen3AsrBackend` に実モデルベースのテストを追加する（モデル不在時はスキップ）。
4. `make test` で全テストが通過することを確認する。

### ファイル変更一覧

| ファイル | 変更種別 | 説明 |
|----------|----------|------|
| `crates/trate/Cargo.toml` | NEW | trate crate 定義 |
| `crates/trate/src/lib.rs` | NEW | `AsrBackend` トレイト定義 + 再公開 |
| `crates/trate/src/local.rs` | NEW | `LocalAsrBackend` トレイト |
| `Cargo.toml` (workspace root) | EDIT | `trate` を members に追加 |
| `crates/voiput/Cargo.toml` | EDIT | `trate` 依存追加 |
| `crates/voiput/src/pipeline/streamer.rs` | EDIT | AsrBackend トレイト削除、trate 参照に変更 |
| `crates/voiput/src/backends/openai.rs` | EDIT | OpenAIBackend の impl を trate トレイトに変更 |
| `crates/voiput/src/types.rs` | EDIT | `LocalAsrKind`, `Qwen3AsrModelPaths`, `Qwen3AsrConfig`, `SttEngine::Local` 追加 |
| `crates/voiput/src/constants.rs` | EDIT | Qwen3 モデルファイル名定数追加 |
| `crates/voiput/src/config.rs` | EDIT | VoiputConfig フィールド追加、validate() 拡張 |
| `crates/voiput/src/recognizer.rs` | EDIT | SpeechRecognizer の Local 分岐追加、Qwen3 パス解決関数追加 |
| `crates/voiput/src/local/mod.rs` | NEW | local モジュール宣言 |
| `crates/voiput/src/local/qwen3.rs` | NEW | Qwen3AsrBackend 実装 + テスト |
| `crates/voiput/src/local/recognizer.rs` | NEW | LocalRecognizer 実装 |
| `crates/voiput/src/lib.rs` | EDIT | `pub mod local` 追加 |
| `crates/voiput/build.rs` | EDIT | Qwen3-ASR モデルファイルのダウンロード追加 |
| `crates/voiput/tests/fixtures/` | NEW | テスト用サンプル音声ファイル配置 |

### リスクと軽減策

| リスク | 影響 | 軽減策 |
|--------|------|--------|
| sherpa-onnx のライブラリサイズが大きい（数百MB） | ビルド時間増加、バイナリサイズ増加 | 既に voiput が依存しているため追加の影響はない。`shared` feature により動的リンクで運用。 |
| Qwen3-ASR モデルファイル（約600MB）のダウンロード | 初回ビルド時間増加 | build.rs で `cargo:rerun-if-changed=models/` により既存ファイルは再ダウンロードしない。 |
| OfflineRecognizer がメモリを大量消費 | アプリケーションのメモリフットプリント増加 | OfflineRecognizer は Qwen3AsrBackend の生存期間中1インスタンスのみ保持。認識終了後は Drop で解放。 |
| PseudoAsrStreamer<LocalRecognizer> と PseudoAsrStreamer<OpenAIBackend> の型の不一致 | 同一変数に格納できない | SpeechRecognizer 内で enum または Option で保持し、start() 呼び出し時に分岐する。 |
| 既存の AsrBackend トレイトとの互換性 | 影響なし | transcribe のシグネチャは変更しない。既存の OpenAIBackend のコードはゼロ修正で trate に移設可能。 |

## Appendix

### A. 既存コードの AsrBackend → trate 移行パターン

現在の `OpenAIBackend` の `AsrBackend` 実装は、trate 移設後もシグネチャが完全に同一であるため、`impl trate::AsrBackend for OpenAIBackend` へのパス変更のみで移行できる：

```rust
// crates/voiput/src/backends/openai.rs

// 移行前: use crate::pipeline::streamer::AsrBackend;
// 移行後: use trate::AsrBackend;

/// バックエンドの実装内容は一切変更不要
impl AsrBackend for OpenAIBackend {
    fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
        // 既存の実装をそのまま維持
        // sample_rate は内部定数 VAD_SAMPLE_RATE(16000) を引き続き使用
    }
}

impl AsrBackend for OpenAIBackend {
    fn backend_name(&self) -> &'static str { "openai-whisper" }
    fn post_correct(&mut self, text: &str) -> Result<String> { /* 既存の実装 */ }
    fn record_asr_usage(&mut self, duration_ms: u64) { /* 既存の実装 */ }
    fn insert_punctuation(&mut self, text: &str, locale: &str) -> Result<String> { /* 既存の実装 */ }
}
```

### B. PseudoAsrStreamer の型パラメータ制約（変更なし）

`PseudoAsrStreamer` の型パラメータ制約は従来通り `B: AsrBackend + Send + Sync + 'static` を維持する（`AsrBackend` トレイトの移設先が `crate::pipeline::streamer` から `trate` に変わるのみ）：

```rust
// crates/voiput/src/pipeline/streamer.rs

use trate::AsrBackend;

/// 型制約は AsrBackend のまま。トレイトの所在のみ trate に変更。
pub struct PseudoAsrStreamer<B: AsrBackend + Send + Sync + 'static> { ... }
```

### C. resolve_vad_model_path の流用

Qwen3-ASR モデルファイルのパス解決は、既存の `resolve_vad_model_path()` をそのまま流用する。この関数は絶対パス・相対パス＋model_dir の両方を処理できる汎用ユーティリティである。

```rust
// recognizer.rs のヘルパー関数
fn resolve_qwen3_asr_config(config: &VoiputConfig) -> Option<Qwen3AsrConfig> {
    let qwen3_config = config.qwen3_asr_config.as_ref()?;
    let model_dir = &config.model_dir;

    // model_dir が設定されている場合、各モデルファイルの相対パスを解決する
    let resolve = |path: &str| {
        if path.starts_with('/') {
            path.to_string()
        } else {
            match model_dir {
                Some(dir) => {
                    let trimmed = dir.trim_end_matches('/');
                    format!("{}/{}", trimmed, path)
                }
                None => path.to_string(),
            }
        }
    };

    Some(Qwen3AsrConfig {
        model_paths: Qwen3AsrModelPaths {
            encoder: resolve(&qwen3_config.model_paths.encoder),
            decoder: resolve(&qwen3_config.model_paths.decoder),
            joiner: resolve(&qwen3_config.model_paths.joiner),
            tokens: resolve(&qwen3_config.model_paths.tokens),
        },
        provider: qwen3_config.provider.clone(),
        num_threads: qwen3_config.num_threads,
        debug: qwen3_config.debug,
    })
}
```

### D. テスト用サンプル音声ファイルの生成方法

テスト用の短い無音 WAV ファイル（`tests/fixtures/silence_16k_mono.wav`）は以下の方法で生成する：

```bash
# ffmpeg で 0.5 秒の無音 WAV を生成
ffmpeg -f lavfi -i anullsrc=r=16000:cl=mono -t 0.5 \
  -acodec pcm_s16le -ar 16000 -ac 1 \
  crates/voiput/tests/fixtures/silence_16k_mono.wav
```

または、テストコード内でプログラム的に生成する：

```rust
fn generate_silence_wav(path: &str, duration_secs: f32, sample_rate: u32) -> Result<()> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec)?;
    let num_samples = (sample_rate as f32 * duration_secs) as u32;
    for _ in 0..num_samples {
        writer.write_sample(0i16)?;
    }
    writer.finalize()?;
    Ok(())
}
```
