# mistral.rs crate で Gemma 4 E2B/E4B を使った音声認識後テキスト補正

> 対象: mistralrs v0.8.x / Gemma 4 E2B・E4B (UQFF Q4K)  
> 用途: CPU のみで動作する音声認識後テキスト補正パイプライン  
> 更新: 2026-06-18

---

## 前提知識

Gemma 4 E2B/E4B はマルチモーダルモデルのため、mistral.rs では `VisionModelBuilder` / `UqffVisionModelBuilder` を使って読み込みます。テキストのみの補正タスクでも `VisionMessages` ではなく `TextMessages` を渡すだけで純テキスト推論が可能です。

> **CPU 推論について**  
> デフォルト feature（`default`）は純 Rust ビルドで、C コンパイラや GPU ドライバ不要です。  
> CPU 最適化が必要な場合は `features = ["mkl"]`（Intel）または `features = ["accelerate"]`（Apple）を追加してください。

---

## 1. モデルファイルのダウンロード

### E2B (Q4K ≈ 3.1 GB)

```bash
# huggingface-cli を使う場合（推奨）
pip install -q huggingface_hub
huggingface-cli download \
  mistralrs-community/gemma-4-E2B-it-UQFF \
  q4k-0.uqff \
  --local-dir ./models/gemma4-e2b-uqff

# curl で直接ダウンロードする場合
# (HF_TOKEN が必要な場合は -H "Authorization: Bearer $HF_TOKEN" を追加)
curl -L \
  "https://huggingface.co/mistralrs-community/gemma-4-E2B-it-UQFF/resolve/main/q4k-0.uqff" \
  -o ./models/gemma4-e2b-uqff/q4k-0.uqff
```

### E4B (Q4K ≈ 5.0 GB)

```bash
huggingface-cli download \
  mistralrs-community/gemma-4-E4B-it-UQFF \
  q4k-0.uqff \
  --local-dir ./models/gemma4-e4b-uqff

# curl で直接ダウンロード
curl -L \
  "https://huggingface.co/mistralrs-community/gemma-4-E4B-it-UQFF/resolve/main/q4k-0.uqff" \
  -o ./models/gemma4-e4b-uqff/q4k-0.uqff
```

> **注意**: UQFF ファイル 1 つに全量子化バリアントが含まれます。  
> `q4k-0.uqff` が Q4_K_M 相当（バランス型）です。  
> Apple Silicon では `afq4-0.uqff` の方が Metal 最適化されており高速です。

---

## 2. Cargo.toml

```toml
[package]
name    = "asr-text-corrector"
version = "0.1.0"
edition = "2021"

[dependencies]
# CPU-only デフォルトビルド（GPU なし）
mistralrs  = { version = "0.8", default-features = true }
tokio      = { version = "1", features = ["full"] }
anyhow     = "1"

# Intel MKL を使う場合は以下に差し替え（Linux/Windows）
# mistralrs = { version = "0.8", default-features = false, features = ["mkl"] }

# Apple Accelerate を使う場合（macOS）
# mistralrs = { version = "0.8", default-features = false, features = ["accelerate"] }
```

---

## 3. 推論コード例

### 3-1. HuggingFace Hub から自動ダウンロード + 推論

```rust
use anyhow::Result;
use mistralrs::{
    TextMessageRole, TextMessages,
    UqffVisionModelBuilder,
};

#[tokio::main]
async fn main() -> Result<()> {
    let model = UqffVisionModelBuilder::new(
        "mistralrs-community/gemma-4-E2B-it-UQFF",
        mistralrs::UqffSource::HuggingFace {
            filename: "q4k-0.uqff".to_string(),
        },
    )
    .build()
    .await?;

    let asr_text = "えー、本日はですね、システムのアーキテクチャーについて説明したいとおもいます";

    let messages = TextMessages::new()
        .add_message(
            TextMessageRole::System,
            "あなたは日本語テキストの校正アシスタントです。音声認識で生成されたテキストの誤字・句読点・表記ゆれを修正し、自然な書き言葉に整えてください。修正後のテキストのみ出力してください。",
        )
        .add_message(TextMessageRole::User, asr_text);

    let response = model.send_chat_request(messages).await?;

    println!(
        "補正結果: {}",
        response.choices[0]
            .message
            .content
            .as_ref()
            .unwrap()
    );

    eprintln!(
        "Prompt: {:.1} tok/s  |  Completion: {:.1} tok/s",
        response.usage.avg_prompt_tok_per_sec,
        response.usage.avg_compl_tok_per_sec,
    );

    Ok(())
}
```

### 3-2. ローカルファイルから読み込む場合

```rust
use anyhow::Result;
use mistralrs::{
    TextMessageRole, TextMessages,
    UqffVisionModelBuilder,
};

#[tokio::main]
async fn main() -> Result<()> {
    let model = UqffVisionModelBuilder::new(
        "mistralrs-community/gemma-4-E4B-it-UQFF",
        mistralrs::UqffSource::LocalFile {
            path: "./models/gemma4-e4b-uqff/q4k-0.uqff".into(),
        },
    )
    .build()
    .await?;

    let messages = TextMessages::new()
        .add_message(
            TextMessageRole::System,
            "あなたは日本語テキストの校正アシスタントです。音声認識で生成されたテキストの誤字・句読点・表記ゆれを修正し、自然な書き言葉に整えてください。修正後のテキストのみ出力してください。",
        )
        .add_message(
            TextMessageRole::User,
            "えー本日はシステムのアーキテクチャについて説明したいとおもいます",
        );

    let response = model.send_chat_request(messages).await?;
    println!("{}", response.choices[0].message.content.as_ref().unwrap());

    Ok(())
}
```

### 3-3. ストリーミングで出力する場合

```rust
use anyhow::Result;
use futures::StreamExt;
use mistralrs::{
    ChatCompletionChunkResponse, ChunkChoice, Delta,
    Response, TextMessageRole, TextMessages,
    UqffVisionModelBuilder,
};

#[tokio::main]
async fn main() -> Result<()> {
    let model = UqffVisionModelBuilder::new(
        "mistralrs-community/gemma-4-E2B-it-UQFF",
        mistralrs::UqffSource::HuggingFace {
            filename: "q4k-0.uqff".to_string(),
        },
    )
    .build()
    .await?;

    let messages = TextMessages::new()
        .add_message(
            TextMessageRole::System,
            "音声認識テキストを校正してください。修正後のテキストのみ出力してください。",
        )
        .add_message(
            TextMessageRole::User,
            "えー先ほどのかいぎでけつろんがでまして次回のすぷりんとからてきようするとのことです",
        );

    let mut stream = model.stream_chat_request(messages).await?;
    print!("補正結果: ");

    while let Some(chunk) = stream.next().await {
        if let Response::Chunk(ChatCompletionChunkResponse { choices, .. }) = chunk {
            if let Some(ChunkChoice {
                delta: Delta { content: Some(content), .. },
                ..
            }) = choices.first()
            {
                print!("{}", content);
                use std::io::Write;
                std::io::stdout().flush().ok();
            }
        }
    }
    println!();

    Ok(())
}
```

---

## 4. ISQ（In-Situ Quantization）を使う場合

```rust
use anyhow::Result;
use mistralrs::{
    IsqType, TextMessageRole, TextMessages, VisionModelBuilder,
};

#[tokio::main]
async fn main() -> Result<()> {
    let model = VisionModelBuilder::new(
        "google/gemma-4-E4B-it",
        mistralrs::VisionLoaderType::Gemma4,
    )
    .with_isq(IsqType::Q4K)
    .build()
    .await?;

    let messages = TextMessages::new()
        .add_message(
            TextMessageRole::System,
            "音声認識テキストを校正してください。",
        )
        .add_message(TextMessageRole::User, "てすとのてきすとです");

    let response = model.send_chat_request(messages).await?;
    println!("{}", response.choices[0].message.content.as_ref().unwrap());

    Ok(())
}
```

---

## 5. 量子化バリアント選択ガイド

| ファイル名 | 相当 | メモリ目安(E2B/E4B) | 推奨環境 |
|---|---|---|---|
| `q4k-0.uqff` | Q4_K_M | 3.1 GB / 5.0 GB | **CPU のみ（推奨）** |
| `q5k-0.uqff` | Q5_K_M | 3.6 GB / 5.8 GB | CPU 高精度 |
| `q8_0-0.uqff` | Q8_0 | 5.5 GB / 8.9 GB | CPU 最高精度 |
| `afq4-0.uqff` | AFQ4 | 3.1 GB / 5.0 GB | **Apple Silicon（Metal）** |
| `afq6-0.uqff` | AFQ6 | 4.1 GB / 6.6 GB | Apple Silicon 高精度 |

> CPU only の場合、AFQ 系は現時点では q4k 系より遅いケースがあります。

---

## 6. HF_TOKEN の設定（必要な場合）

Gemma 4 は Google の利用規約への同意が必要なモデルです。HuggingFace でアクセス権を取得後、トークンを環境変数に設定してください。

```bash
export HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxx
```

コード内で明示的に指定する場合:

```rust
use mistralrs::TokenSource;

let model = UqffVisionModelBuilder::new(...)
    .with_token_source(TokenSource::EnvVar("HF_TOKEN".to_string()))
    .build()
    .await?;
```

---

## 7. モデル選択の判断基準（E2B vs E4B）

| 条件 | 推奨 |
|---|---|
| RAM 4 GB 以下、レイテンシ最優先 | E2B (q4k) |
| RAM 8 GB、補正精度を高めたい | E4B (q4k) |
| RAM 8 GB、Apple Silicon | E4B (afq4) |
| RAM 16 GB+、精度最優先 | E4B (q8_0) または ISQ Q5K |

音声認識後テキスト補正のような単純なテキスト整形タスクでは **E2B (q4k)** で十分なケースがほとんどです。
