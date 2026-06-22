# M4-2: OpenAIBackend + OpenAIRecognizer + test-run.rs [OPENAI]

## 変更ファイル

| ファイル | 種別 | 内容 |
|---|---|---|
| `Cargo.toml` | 依存追加 | async-openai に `chat-completion` feature 追加 |
| `src/backends/openai.rs` | 新規 | OpenAIBackend + OpenAIRecognizer + AsrBackend impl (LmgwClient → async-openai::Client) |
| `src/backends/mod.rs` | 変更 | `pub(crate) mod openai;` 追加 |
| `src/lib.rs` | 変更 | `pub use backends::openai::{OpenAIBackend, OpenAIRecognizer};` 追加 |
| `src/binary/test-run.rs` | 変更 | OpenAIBackend import + test_openai() 関数追加 |

## 実装サマリ

- **OpenAIBackend**: async-openai v0.41.0 を使用した Whisper API 呼び出し。LmgwClient 依存を完全除去。
  - `call_transcribe()`: f32 PCM → WAV (hound) → OpenAI audio transcriptions API → テキスト
  - `call_post_correct()`: OpenAI chat completions API で LLM 補正
  - `AsrBackend` trait 実装: transcribe, post_correct, model_name, record_asr_usage

- **OpenAIRecognizer**: 簡略版の認識器（ticker/decoration タスクは後続チケットで追加予定）
  - イベントチャネル (mpsc), start/stop, set_locale, is_running

- **test-run.rs の test_openai()**: --openai-key 引数または OPENAI_API_KEY 環境変数で OpenAI バックエンドを初期化し表示

- **async-openai v0.41.0 対応**: 
  - TranscriptionModel enum 削除 → model は String に変更
  - chat_completion モジュール → chat モジュールにパス変更
  - ChatCompletionRequestDeveloperMessage.content → enum 型に変更
  - client.chat().completions().create() → client.chat().create() に統合
