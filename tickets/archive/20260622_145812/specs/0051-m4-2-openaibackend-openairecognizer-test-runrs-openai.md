---
ticket_id: 51
title: M4-2: OpenAIBackend + OpenAIRecognizer + test-run.rs [OPENAI]
slug: m4-2-openaibackend-openairecognizer-test-runrs-openai
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-12
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0051-m4-2-openaibackend-openairecognizer-test-runrs-openai/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0051-m4-2-openaibackend-openairecognizer-test-runrs-openai/review.md
---
# M4-2: OpenAIBackend + OpenAIRecognizer + test-run.rs [OPENAI]

## Summary

MYCUTE の OpenAI バックエンド（`src/stt/openai.rs`）を voiput `backends/openai.rs` に移植する。
最大の変更点は `LmgwClient` 依存を排除し、`OpenAiConfig` + `async-openai::Client` の直接構築に置き換える。
`cargo add async-openai --features audio` で依存追加。

## Background

MYCUTE の OpenAIRecognizer は内部で `LmgwClient`（MYCUTE 独自の LLM プロキシ）を介して OpenAI API を呼び出していた。
voiput では `OpenAiConfig`（base_url, api_key, model）から直接 `async-openai::Client` を構築する。

これにより MYCUTE 依存（LmgwClient, JWT認証, LMGWプロキシ）を完全に排除する。

## Scope

### 0. 依存追加

```bash
cargo add async-openai --features audio
```

### 1. `src/backends/mod.rs`

```rust
pub(crate) mod openai;
```

### 2. `src/backends/openai.rs`

MYCUTE `~/shyme/mycute/src/stt/openai.rs` を移植。以下の変更点:

**依存置換（最大の変更）:**
| MYCUTE | voiput |
|--------|--------|
| `crate::llm::client::LmgwClient` | 削除（async-openai::Client に置き換え） |
| `LMGW (LLM Proxy)` → JWT認証経由 | `OpenAiConfig.base_url` に直接接続 |
| `tauri::async_runtime` | `tokio` |
| `SttSettings` | `VoiputConfig` |
| `crate::tools::*` | `crate::pipeline::*` |
| `crate::stt::mac/win` の native capture | `crate::native::mac_ffi / win_ffi` |

**移植する全要素:**
- `OpenAIBackend` struct — OpenAiConfig + language を保持
- `AsrBackend for OpenAIBackend` — transcribe（f32→WAV→async-openai→text）, post_correct（LLM補正）, model_name, record_asr_usage, insert_punctuation（pass through）
- `OpenAIRecognizer` struct — streamer, ticker_task, decoration_task, is_running 等
- `init_audio()`, `start()`, `stop()`, `tick()`, `set_locale()`, `is_running()`
- イベントリスナー: SpeechStart/End 装飾タスク管理、PartialResult バッファリング
- 音声キャプチャ開始/停止（macOS: `native::mac_ffi`, Windows: `native::win_ffi`）

**transcribe の実装（f32 PCM → WAV → async-openai → text）:**
```rust
fn transcribe(&mut self, samples: &[f32]) -> Result<String> {
    // 1. f32 PCM → メモリ上 WAV（hound）
    let mut buffer = Cursor::new(Vec::new());
    let spec = WavSpec { channels: 1, sample_rate: 16000, bits_per_sample: 32, sample_format: Float };
    let mut writer = WavWriter::new(&mut buffer, spec)?;
    for sample in samples { writer.write_sample(*sample)?; }
    writer.finalize()?;

    // 2. async-openai Client を OpenAiConfig から構築
    let oa_config = OpenAIConfig::new()
        .with_api_base(&self.openai_config.base_url)
        .with_api_key(&self.openai_config.api_key);
    let client = Client::with_config(oa_config);

    // 3. リクエスト実行（block_in_place + block_on で同期コンテキストから非同期呼び出し）
    let audio = AudioInput::from_vec_u8("input.wav".into(), buffer.into_inner());
    let request = CreateTranscriptionRequestArgs::default()
        .file(audio).model(&self.openai_config.model)
        .build()?;
    let result = block_in_place || Handle::current().block_on(async {
        client.audio().transcription().create(request).await
    })?;
    Ok(result.text)
}
```

### 3. `src/lib.rs`

- `mod backends;` 有効化
- `pub use backends::openai::{OpenAIBackend, OpenAIRecognizer};`

### 4. `src/bin/test-run.rs`

- `test_openai()` 関数追加:
  1. OpenAiConfig の構築と表示
  2. `cargo run --bin test-run -- --openai-key sk-xxx` で API キーを指定可能に
  3. キー未設定時は `[SKIP]`
- Stage 6/6 維持

## Non-scope

- macOS/Windows ネイティブバックエンド — M4-3, M4-4

## Investigation

### 証拠1: MYCUTE openai.rs の構造

`~/shyme/mycute/src/stt/openai.rs`（約500行）:
- OpenAIRecognizer のコンストラクタは LmgwClient を受け取る
- transcribe() は internal channel 経由で OpenAI API を呼び出す
- 2つのバックグラウンドタスクを tokio::spawn（ticker + event_listener）
- ネイティブ音声キャプチャ（macOS/Windows）の開始/停止を含む

### 証拠2: async-openai クレート

`cargo add async-openai --features audio` で依存追加。
OpenAIConfig::new().with_api_base(url).with_api_key(key) で安全にクライアント構築。

### 証拠3: hound（既に M3-1 で追加済み）

hound は既に M3-1 で追加済み。f32 PCM → WAV 変換に使用。

## Test Plan

### ユニットテスト不可能な項目

- transcribe() の実際の API 呼び出し → 実際の OpenAI API キーが必要なため。
  test-run.rs で OpenAiConfig が設定されている場合のみテスト可能。

## Boy Scout Rule

- LmgwClient（MYCUTE の密結合プロキシ）を完全排除し、OpenAiConfig + async-openai::Client に置き換え
- これにより voiput crate は MYCUTE の認証基盤から完全独立

## Acceptance Criteria

- [ ] `cargo add async-openai --features audio` 成功
- [ ] `cargo check` がエラーなく通ること
- [ ] `cargo test` 全テスト PASS
- [ ] 依存置換（LmgwClient → OpenAiConfig）が完了していること
- [ ] test-run.rs `[OPENAI]` が表示されること（実際の API 呼び出しはスキップ可能）

## Notes

- このチケットで初めて「音声→テキスト」変換の実パスが voiput 内に構築される
- 実際の認識テストには OpenAI API キーとネットワーク接続が必要
- macOS/Windows のネイティブキャプチャ呼び出しは cfg ガード済みのため、全プラットフォームでコンパイル可能

### 成果物

- 計画: context/0051-m4-2-openaibackend/plan.md（未作成）
- 実装サマリ: context/0051-m4-2-openaibackend/implementation.md（未作成）
- レビュー報告書: context/0051-m4-2-openaibackend/review.md（未作成）
