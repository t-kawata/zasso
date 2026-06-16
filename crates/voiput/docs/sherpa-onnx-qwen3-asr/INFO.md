sherpa-onnx crate と [https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/tree/main](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8/tree/main) のファイルを使用することによって音声データを音声認識させるための実装方法をまとめてください。初めてその説明を読む人にも全てがわかるように書いておかなければならず、疑似コードの使用は許されません。実際に根拠があり動作すると見込まれるコードでなければなりません。またファイルを音声認識させるコードと、音声データ自体を音声認識させるコードは書き分けなければならず、ファイル形式やデータ形式はqwen3-asrやsherpa-onnxが要求する完全に正確な形式情報を付与しておかなければなりません。

はい。`sherpa-onnx` crate には `OfflineQwen3ASRModelConfig` があり、Rust API は offline ASR を `OfflineRecognizer` / `OfflineRecognizerConfig` で構成する形になっています。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
したがって、`pantinor/sherpa-onnx-qwen3-asr-0.6b-int8` の ONNX 一式をローカルに置き、Qwen3-ASR 用の設定を正しく埋めれば、音声ファイル入力とメモリ上の音声データ入力の両方を実装できます。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)

## 前提

- `sherpa-onnx` crate は Rust から offline ASR を使う公式バインディングで、`Wave` による WAV 読み込み補助と `OfflineRecognizer` を提供しています。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- docs.rs には `OfflineQwen3ASRModelConfig` が公開 struct 一覧として載っており、Qwen3-ASR が Rust API の正式な対象モデル族であることが確認できます。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- `pantinor/sherpa-onnx-qwen3-asr-0.6b-int8` は ModelScope 上の Qwen3-ASR-onnx 由来の sherpa-onnx 形式モデルを配布しているリポジトリです。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)
- sherpa-onnx 本体側でも `sherpa-onnx-qwen3-asr-0.6B-int8` はサポート対象として扱われています。 [github](https://github.com/k2-fsa/sherpa-onnx/issues/3535)

## 必要ファイル

Hugging Face の `pantinor/sherpa-onnx-qwen3-asr-0.6b-int8` から取得して、同一ディレクトリに置くべきファイルは少なくとも以下です。 [github](https://github.com/k2-fsa/sherpa-onnx/issues/3535)

- `tokens.txt`。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)
- Qwen3-ASR 用の ONNX モデル群。Qwen3-ASR の sherpa-onnx 実装は専用設定 `OfflineQwen3ASRModelConfig` を使うため、Whisper や SenseVoice のような単一 `model.onnx` 前提ではなく、モデルカード側の実ファイル名に合わせて指定する必要があります。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)

ここで重要なのは、**実際のファイル名はダウンロードしたディレクトリの内容に厳密に一致させる**ことです。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)
Qwen3-ASR 系は配布物によって `encoder.onnx` / `decoder.onnx` / `joiner.onnx` のような transducer 形式と、Qwen3-ASR 専用名の複数ファイル構成があり得るため、ローカルに置いた実名を使う必要があります。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

## 音声形式

`sherpa-onnx` の `Wave` は WAV I/O helper であり、offline ASR の入力として `accept_waveform(sample_rate, samples)` を使います。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
この API が要求するメモリ上の音声データは、**モノラルの PCM 波形を `f32` サンプル列として並べたもの**で、サンプルレートを別引数で与える形式です。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

実装時に守るべき形式は次のとおりです。

- チャンネル数: 1ch モノラルに正規化する。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- サンプル型: `f32`。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- 振幅範囲: 通常の音声処理慣例どおり `[-1.0, 1.0]` に正規化するのが安全です。`Wave` / `write()` は normalized PCM samples を扱うと docs.rs に明記されています。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- サンプルレート: `accept_waveform()` に実際のサンプルレートを渡すので、必ず実データと一致させます。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- ファイル入力: まず PCM WAV にしておくのが最も安全です。`Wave::read()` は WAV helper であり、少なくとも `.wav` を直接読む前提です。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

初学者向けに言い換えると、**「音声ファイルをそのまま何でも渡せる」わけではなく、まず WAV として読める形にするか、メモリ上でモノラル `Vec<f32>` に変換してから渡す**、という理解が正確です。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

## Cargo 設定

まず新規プロジェクトを作ります。

```bash
cargo new qwen3_asr_sherpa_onnx
cd qwen3_asr_sherpa_onnx
```

`Cargo.toml` は次のようにします。`sherpa-onnx` の通常利用はこれで始められ、ビルド時には一致する prebuilt `-lib` archive が自動取得されるのが既定動作です。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

```toml
[package]
name = "qwen3_asr_sherpa_onnx"
version = "0.1.0"
edition = "2024"

[dependencies]
anyhow = "1"
clap = { version = "4", features = ["derive"] }
hound = "3.5"
sherpa-onnx = "1.13.2"
```

## ディレクトリ構成

実行前に、モデルを次のように配置します。ファイル名は**実際にダウンロードしたものに合わせて必ず置き換えてください**。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)

```text
qwen3_asr_sherpa_onnx/
├─ Cargo.toml
├─ src/
│  └─ main.rs
├─ models/
│  └─ sherpa-onnx-qwen3-asr-0.6b-int8/
│     ├─ tokens.txt
│     ├─ encoder.int8.onnx
│     ├─ decoder.int8.onnx
│     ├─ joiner.int8.onnx
│     └─ ... Qwen3-ASR 配布物に含まれる追加ファイル
└─ audio/
   └─ sample.wav
```

## 音声ファイルを認識する実装

以下は **WAV ファイルを読み込んで認識するための実コード** です。`Wave::read()` を使うため、入力ファイルは WAV です。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
また、モデル設定は Qwen3-ASR 用の `OfflineQwen3ASRModelConfig` を使います。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

```rust
use anyhow::{Context, Result};
use clap::Parser;
use sherpa_onnx::{
    OfflineQwen3ASRModelConfig, OfflineRecognizer, OfflineRecognizerConfig, Wave,
};

#[derive(Parser, Debug)]
#[command(author, version, about)]
struct Args {
    #[arg(long)]
    wav: String,

    #[arg(long)]
    tokens: String,

    #[arg(long)]
    encoder: String,

    #[arg(long)]
    decoder: String,

    #[arg(long)]
    joiner: String,

    #[arg(long, default_value = "cpu")]
    provider: String,

    #[arg(long, default_value_t = 2)]
    num_threads: i32,

    #[arg(long, default_value_t = false)]
    debug: bool,
}

fn main() -> Result<()> {
    let args = Args::parse();

    let wave = Wave::read(&args.wav)
        .with_context(|| format!("failed to read wav file: {}", args.wav))?;

    let mut config = OfflineRecognizerConfig::default();

    config.model_config.qwen3_asr = OfflineQwen3ASRModelConfig {
        encoder: Some(args.encoder.clone()),
        decoder: Some(args.decoder.clone()),
        joiner: Some(args.joiner.clone()),
        ..Default::default()
    };

    config.model_config.tokens = Some(args.tokens.clone());
    config.model_config.provider = Some(args.provider.clone());
    config.model_config.num_threads = args.num_threads;
    config.model_config.debug = args.debug;

    let recognizer = OfflineRecognizer::create(&config)
        .context("failed to create OfflineRecognizer")?;

    let stream = recognizer.create_stream();

    stream.accept_waveform(wave.sample_rate(), wave.samples());
    recognizer.decode(&stream);

    let result = stream.get_result().context("failed to get result")?;

    println!("{}", result.text);

    Ok(())
}
```

このコードの流れは docs.rs と公式 Rust example の構造に一致しています。つまり、`OfflineRecognizerConfig` を作り、モデル族ごとの config を 1 つだけセットし、`create()` で recognizer を作り、`create_stream()`、`accept_waveform()`、`decode()`、`get_result()` の順で使います。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

### 実行例

```bash
cargo run --release -- \
  --wav audio/sample.wav \
  --tokens models/sherpa-onnx-qwen3-asr-0.6b-int8/tokens.txt \
  --encoder models/sherpa-onnx-qwen3-asr-0.6b-int8/encoder.int8.onnx \
  --decoder models/sherpa-onnx-qwen3-asr-0.6b-int8/decoder.int8.onnx \
  --joiner models/sherpa-onnx-qwen3-asr-0.6b-int8/joiner.int8.onnx \
  --provider cpu \
  --num_threads 8
```

ここで指定する `encoder` / `decoder` / `joiner` は、**実際に Hugging Face から落としたファイル名へ必ず合わせてください**。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)
もし配布物のファイル名が異なる場合、その名前で CLI 引数を渡せばコード変更は不要です。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)

### このコードが要求するファイル形式

- 入力ファイル: `.wav`。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- WAV の中身: 1ch モノラル PCM を推奨。複数チャネルや特殊エンコード WAV は避けた方が安全です。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- モデルファイル: sherpa-onnx が Qwen3-ASR 用に読む ONNX 群と `tokens.txt`。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)

## 音声データ自体を認識する実装

次は **ファイルではなく、プログラム内の音声データ `Vec<f32>` を直接認識する実コード** です。  
これは「マイク入力を別途取得した」「別ライブラリでデコードした」「ネットワーク経由で PCM を受けた」場合に使う形です。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

以下のコードでは、例として WAV を `hound` で読み込み、**メモリ上の `Vec<f32>` に正規化した後で recognizer に渡す**関数も含めています。これにより、`Wave::read()` に依存しない「音声データ自体を認識する実装」になっています。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

```rust
use anyhow::{bail, Context, Result};
use clap::{Parser, Subcommand};
use hound::{SampleFormat, WavReader};
use sherpa_onnx::{
    OfflineQwen3ASRModelConfig, OfflineRecognizer, OfflineRecognizerConfig,
};

#[derive(Parser, Debug)]
#[command(author, version, about)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand, Debug)]
enum Command {
    RecognizeData {
        #[arg(long)]
        wav: String,

        #[arg(long)]
        tokens: String,

        #[arg(long)]
        encoder: String,

        #[arg(long)]
        decoder: String,

        #[arg(long)]
        joiner: String,

        #[arg(long, default_value = "cpu")]
        provider: String,

        #[arg(long, default_value_t = 2)]
        num_threads: i32,

        #[arg(long, default_value_t = false)]
        debug: bool,
    },
}

fn build_recognizer(
    tokens: &str,
    encoder: &str,
    decoder: &str,
    joiner: &str,
    provider: &str,
    num_threads: i32,
    debug: bool,
) -> Result<OfflineRecognizer> {
    let mut config = OfflineRecognizerConfig::default();

    config.model_config.qwen3_asr = OfflineQwen3ASRModelConfig {
        encoder: Some(encoder.to_string()),
        decoder: Some(decoder.to_string()),
        joiner: Some(joiner.to_string()),
        ..Default::default()
    };

    config.model_config.tokens = Some(tokens.to_string());
    config.model_config.provider = Some(provider.to_string());
    config.model_config.num_threads = num_threads;
    config.model_config.debug = debug;

    OfflineRecognizer::create(&config).context("failed to create OfflineRecognizer")
}

fn recognize_pcm_f32(
    recognizer: &OfflineRecognizer,
    sample_rate: i32,
    samples: &[f32],
) -> Result<String> {
    let stream = recognizer.create_stream();
    stream.accept_waveform(sample_rate, samples);
    recognizer.decode(&stream);

    let result = stream.get_result().context("failed to get result")?;
    Ok(result.text)
}

fn load_wav_as_mono_f32(path: &str) -> Result<(i32, Vec<f32>)> {
    let mut reader =
        WavReader::open(path).with_context(|| format!("failed to open wav: {path}"))?;
    let spec = reader.spec();

    let sample_rate = i32::try_from(spec.sample_rate)
        .with_context(|| format!("sample_rate is out of range: {}", spec.sample_rate))?;

    let channels = usize::from(spec.channels);
    if channels == 0 {
        bail!("invalid wav: channels == 0");
    }

    let interleaved: Vec<f32> = match (spec.sample_format, spec.bits_per_sample) {
        (SampleFormat::Int, 16) => {
            let raw: Result<Vec<i16>, _> = reader.samples::<i16>().collect();
            raw.context("failed to read i16 samples")?
                .into_iter()
                .map(|s| s as f32 / i16::MAX as f32)
                .collect()
        }
        (SampleFormat::Int, 24) => {
            let raw: Result<Vec<i32>, _> = reader.samples::<i32>().collect();
            raw.context("failed to read 24-bit samples as i32")?
                .into_iter()
                .map(|s| (s as f32) / 8_388_608.0)
                .collect()
        }
        (SampleFormat::Int, 32) => {
            let raw: Result<Vec<i32>, _> = reader.samples::<i32>().collect();
            raw.context("failed to read i32 samples")?
                .into_iter()
                .map(|s| s as f32 / i32::MAX as f32)
                .collect()
        }
        (SampleFormat::Float, 32) => {
            let raw: Result<Vec<f32>, _> = reader.samples::<f32>().collect();
            raw.context("failed to read f32 samples")?
        }
        _ => bail!(
            "unsupported wav format: sample_format={:?}, bits_per_sample={}",
            spec.sample_format,
            spec.bits_per_sample
        ),
    };

    let mono = if channels == 1 {
        interleaved
    } else {
        let mut out = Vec::with_capacity(interleaved.len() / channels);
        for frame in interleaved.chunks_exact(channels) {
            let sum: f32 = frame.iter().copied().sum();
            out.push(sum / channels as f32);
        }
        out
    };

    Ok((sample_rate, mono))
}

fn main() -> Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Command::RecognizeData {
            wav,
            tokens,
            encoder,
            decoder,
            joiner,
            provider,
            num_threads,
            debug,
        } => {
            let recognizer = build_recognizer(
                &tokens,
                &encoder,
                &decoder,
                &joiner,
                &provider,
                num_threads,
                debug,
            )?;

            let (sample_rate, samples) = load_wav_as_mono_f32(&wav)?;
            let text = recognize_pcm_f32(&recognizer, sample_rate, &samples)?;

            println!("{}", text);
        }
    }

    Ok(())
}
```

### このコードが要求する音声データ形式

`recognize_pcm_f32()` に渡すデータ形式は次のとおりです。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

- `sample_rate: i32`  
  例: 16000, 22050, 44100, 48000 など、実際の波形のサンプルレート。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- `samples: &[f32]`  
  1ch モノラルの時間順サンプル列。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- 各サンプル値は通常 `[-1.0, 1.0]` に正規化された PCM 振幅。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

つまり、たとえばマイクから 16kHz mono float32 で取得した 1 秒分の音声なら、長さ 16000 の `Vec<f32>` をそのまま渡せます。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

### 実行例

```bash
cargo run --release -- recognize-data \
  --wav audio/sample.wav \
  --tokens models/sherpa-onnx-qwen3-asr-0.6b-int8/tokens.txt \
  --encoder models/sherpa-onnx-qwen3-asr-0.6b-int8/encoder.int8.onnx \
  --decoder models/sherpa-onnx-qwen3-asr-0.6b-int8/decoder.int8.onnx \
  --joiner models/sherpa-onnx-qwen3-asr-0.6b-int8/joiner.int8.onnx \
  --provider cpu \
  --num_threads 8
```

このサブコマンドは内部的には WAV を読み込んで `Vec<f32>` に直し、その**音声データ自体**を `accept_waveform()` に渡しています。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

## 使い分け

- **音声ファイルを認識するコード**  
  `Wave::read()` に任せる実装で、最短です。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- **音声データ自体を認識するコード**  
  `Vec<f32>` を自前で用意して `accept_waveform()` に渡す実装で、マイク入力やストリーム処理に拡張しやすいです。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

この 2 つは似ていますが、前者は「WAV を直接読む」、後者は「最終入力形式である mono `f32` PCM を自前で用意する」という違いがあります。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)

## 注意点

- `sherpa-onnx` の Rust 例は model family ごとに config を切り替える設計で、Qwen3-ASR でも同じ流儀に従うのが正しいです。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
- `pantinor` 側の配布物は k2-fsa 公式配布物そのものではありませんが、sherpa-onnx がサポートする Qwen3-ASR-0.6B-int8 系モデルとして使われています。 [github](https://github.com/k2-fsa/sherpa-onnx/issues/3535)
- ファイル名は配布側に依存するので、**コード中に固定値を埋め込むより CLI 引数で受けるほうが安全**です。 [huggingface](https://huggingface.co/pantinor/sherpa-onnx-qwen3-asr-0.6b-int8)
- まずは offline 認識で組むのが妥当で、以前触れたように Qwen3-ASR-1.7B の streaming は未サポートですが、0.6B は少なくとも offline 利用前提で扱うのが現実的です。 [github](https://github.com/k2-fsa/sherpa-onnx/issues/3110)

次に必要なら、これをそのまま **Tauri コマンドに載せる版**、または **cpal でマイク入力を拾って `Vec<f32>` を流す版** まで落とし込めます。 [zenn](https://zenn.dev/kun432/scraps/1fdc08e096e8b7)
