---
ticket_id: 187
title: M6-7: inference/stream.rs 全書き換え — TokenCallback + mpsc + ReceiverStream
slug: m6-7-inferencestreamrs-tokencallback-mpsc-receiverstream
status: reviewed
created_at: 2026-06-22
updated_at: 2026-06-22
plan_path: /Users/kawata/shyme/zasso/tickets/context/0187-m6-7-inferencestreamrs-tokencallback-mpsc-receiverstream/plan.md
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0187-m6-7-inferencestreamrs-tokencallback-mpsc-receiverstream/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0187-m6-7-inferencestreamrs-tokencallback-mpsc-receiverstream/review.md
---

# M6-7: inference/stream.rs 全書き換え — TokenCallback + mpsc + ReceiverStream

## Summary

llama-cpp-2 バックエンド移行の一環として、`inference/stream.rs` を mistralrs 依存から llama-cpp-2 の `TokenCallback` + `tokio::sync::mpsc` + `tokio_stream::wrappers::ReceiverStream` パターンで全書き換えする。併せて `generate.rs` の `GgufEngine::generate_stream` スタブ、`mod.rs` の `DummyEngine::generate_stream` スタブを本実装に差し替える。

## Background

### 現状

現在の `src/inference/stream.rs`（133行）は以下の構成：

- `ResponseItem` 列挙型 — mistralrs `Response` を抽象化
- `convert_response()` — mistralrs `Response` → `ResponseItem` 変換
- テストコード — mistralrs `ChatCompletionChunkResponse` 型に依存

`generate.rs` の `GgufEngine::generate_stream()` は `[::STUB::]` 状態で、常にエラーを返す。
`mod.rs` の `DummyEngine::generate_stream()` も `[::STUB::]` 状態で `todo!()` のまま。

### llama-cpp-2 のストリーミング方式

llama-cpp-2 は非同期ストリーム API を直接提供せず、同期的なコールバック API（`infer_with_callback`）を提供する。以下の変換パターンが必要：

```
TokenCallback (sync) → mpsc::Sender (sync) → mpsc::Receiver (async) → ReceiverStream (Stream)
```

チャネル容量 64 を設定し、背圧として機能させる。

### 参照設計書

RFC.md §4.5 に疑似コードあり。`generate.rs` の `run_inference_blocking()` のロジック（プロンプトトークン化、コンテキスト作成、サンプリングチェーン）をストリーミング版に流用する。

## Scope

### 実装範囲

1. **`src/inference/stream.rs` 全書き換え**:
   - mistralrs 依存コード（`Response`, `ResponseItem`, `convert_response`）を全削除
   - `run_inference_stream_blocking()`: `spawn_blocking` 内で同期ストリーミング推論を実行し、トークンを mpsc チャネルに送信する関数
   - `generate_stream_inner()`: mpsc チャネル作成 → `spawn_blocking` + `ReceiverStream` → `Pin<Box<dyn Stream>>` を返す非公開関数
   - テストコードを全面的に書き換え（futures::stream ベースのユニットテスト）

2. **`src/inference/generate.rs` — `GgufEngine::generate_stream` スタブ差し替え**:
   - 現在の `Err(InferenceFailed(...))` を `crate::inference::stream::generate_stream_inner()` 呼び出しに変更
   - `InferenceParams` 構造体は `pub(crate)` に visibility 変更（stream.rs から参照可能にするため）

3. **`src/inference/mod.rs` — `DummyEngine::generate_stream` スタブ差し替え**:
   - `todo!()` を `futures::stream::iter` を使用した適切なダミー実装に置き換え

### 非対象

- `server/openai.rs` のストリーミングエンドポイント修正 → M6-9
- `Cargo.toml` 依存関係追加（`tokio-stream` が不足している場合） → M6-11（ただし当チケットで確認し、必要な場合は `cargo add` する）
- `build.rs` モデルダウンロード → M6-11
- 結合テスト（test-run バイナリ）→ M6-13

## Investigation

### 調査日
2026-06-22

### 調査結果

#### ファイル別状況

| ファイル | 行数 | 現状 | M6-7 での作業 |
|---------|------|------|--------------|
| `src/inference/stream.rs` | 133 | mistralrs 依存コード | **全書き換え** |
| `src/inference/generate.rs` | 467 | `GgufEngine::generate_stream` がエラー返却スタブ (274-284行) | スタブ差し替え |
| `src/inference/mod.rs` | 319 | `DummyEngine::generate_stream` が `todo!()` (187行) | スタブ差し替え |
| `src/registry.rs` | 465 | `ModelRegistry::get()` が `Arc<LlamaModel>` を返す ✅ | 変更なし（M6-4 完了済み） |

#### 流用可能な既存コード

`generate.rs` の以下のロジックはストリーミング版でも使用する：

1. **`decode_token()`** (71-86行): `LlamaToken` → `Vec<u8>` 変換。完全に流用可能。
2. **`InferenceParams`** (50-64行): パラメータ構造体。`pub(crate)` に visibility 変更が必要。
3. **プロンプトトークン化ロジック** (115-121行): `model.str_to_token(prompt, AddBos::Always)` の呼び出しパターン。
4. **コンテキスト作成ロジック** (124-129行): `LlamaContextParams` の構築パターン。
5. **サンプリングチェーン構築ロジック** (140-158行): `LlamaSampler` チェーン構築パターン。

#### llama-cpp-2 v0.1.150 のストリーミング API

現状の `generate.rs` の `run_inference_blocking()` は手動ループ（サンプル→デコード→バッチ→デコード）で実装している。
ストリーミング版も同様に手動ループとし、各トークン生成後に mpsc に送信する方式を取る。
`infer_with_callback` が安定して使える場合はそちらを優先するが、v0.1.150 では未確認。

#### 犯罪レコード

- **ID 1** (open): `mod.rs` 187行 `DummyEngine::generate_stream` の `todo!()` に `[::STUB::]` 未付与
  - 実際にはコード上は `// [::STUB::] M6-7` コメント付与済み。レコードのみ open。
  - 当チケット内で `resolved` に変更する。

## Test Plan

### ユニットテスト計画

| # | テストケース | モジュール | 種類 | 内容 |
|---|------------|-----------|------|------|
| 1 | `stream_from_iter_collects_all_chunks` | stream.rs | 正常系 | `futures::stream::iter` で生成したストリームの全チャンクが正しい順序で収集できる |
| 2 | `empty_stream_ends_immediately` | stream.rs | 境界値 | 空のストリームが即座に `None` を返す |
| 3 | `receiver_stream_drop_ends_stream` | stream.rs | 異常系 | sender drop により ReceiverStream が終了する |
| 4 | `generate_stream_inner_returns_pinned_stream` | stream.rs | 正常系 | 内部関数が `Pin<Box<dyn Stream>>` を返す（コンパイル時） |
| 5 | `dummy_generate_stream_returns_ok` | mod.rs | 正常系 | DummyEngine の generate_stream が `Result<Pin<Box<dyn Stream>>>` を返す |
| 6 | `dummy_generate_stream_collects_chunk` | mod.rs | 正常系 | DummyEngine の stream を 1 チャンク消費し内容を確認 |
| 7 | `mock_generate_stream_returns_ok` | mod.rs | 正常系 | MockEngine の stream が正常結果を返す（既存テスト、継続確認） |
| 8 | `mock_generate_stream_returns_error` | mod.rs | 異常系 | MockEngine の stream がエラーを返す（既存テスト、継続確認） |

### ユニットテスト不可能な項目（例外）

- **`run_inference_stream_blocking` の実モデル結合テスト**: llama-cpp-2 の実際のモデルファイル（GGUF）が必要。M6-13（test-run バイナリ）で目視確認する。
- **`GgufEngine::generate_stream` のエンドツーエンドテスト**: 実際のモデルロードと推論が必要。M6-12（結合テスト）+ M6-13 でカバー。

## Implementation Plan

### Step 1: visibility 変更 — `InferenceParams` を `pub(crate)` に

`generate.rs` の `InferenceParams` 構造体（50行目）を `pub(crate)` に変更：
```rust
// 変更前
struct InferenceParams {
// 変更後
pub(crate) struct InferenceParams {
```

### Step 2: stream.rs 全書き換え

```rust
//! ストリーミング生成ユーティリティ
//!
//! llama-cpp-2 の `TokenCallback` を `tokio::sync::mpsc` チャネルで
//! `futures::Stream` に変換する。
//!
//! データフロー:
//!   TokenCallback (sync) → mpsc::Sender → mpsc::Receiver → ReceiverStream (Stream)

use std::pin::Pin;

use futures::Stream;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;

use crate::error::GgufError;
use crate::inference::generate::InferenceParams;

/// mpsc チャネルのデフォルト容量
///
/// 64: 背圧によるトークン生成の抑制とメモリ使用量のバランスを取る値。
/// チャネルが満杯の場合、`blocking_send` がブロックされ、結果として
/// llama-cpp-2 のコールバックもブロックされる → 背圧として機能する。
const STREAM_CHANNEL_CAPACITY: usize = 64;

/// ストリーミング推論の内部実装
///
/// `spawn_blocking` 内で呼び出される同期関数。llama-cpp-2 の同期推論を実行し、
/// 生成された各トークンを mpsc チャネルに送信する。
///
/// # 処理フロー
/// 1. 推論コンテキスト作成
/// 2. プロンプトトークン化
/// 3. プロンプトバッチデコード
/// 4. トークン生成ループ（サンプル→デコード→送信→次のバッチデコード）
pub(crate) fn run_inference_stream_blocking(
    model: &llama_cpp_2::model::LlamaModel,
    backend: &llama_cpp_2::llama_backend::LlamaBackend,
    prompt: &str,
    params: &InferenceParams,
    tx: mpsc::Sender<Result<String, GgufError>>,
) {
    // generate.rs の run_inference_blocking と同様のロジックで、
    // 各トークン生成後に tx.blocking_send() を呼び出す
    // ...
}

/// 非同期ストリーム生成関数
///
/// mpsc チャネルを作成し、`spawn_blocking` で `run_inference_stream_blocking` を実行、
/// `ReceiverStream` でラップして `Pin<Box<dyn Stream>>` として返す。
///
/// エラーが発生した場合は、ストリームの最初のアイテムとしてエラーが送信される。
pub(crate) async fn generate_stream_inner(
    model: std::sync::Arc<llama_cpp_2::model::LlamaModel>,
    backend: &'static llama_cpp_2::llama_backend::LlamaBackend,
    prompt: String,
    params: InferenceParams,
) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError> {
    let (tx, rx) = mpsc::channel::<Result<String, GgufError>>(STREAM_CHANNEL_CAPACITY);
    let rx_stream = ReceiverStream::new(rx);

    tokio::task::spawn_blocking(move || {
        run_inference_stream_blocking(&model, backend, &prompt, &params, tx);
    });

    Ok(Box::pin(rx_stream))
}
```

### Step 3: generate.rs の GgufEngine::generate_stream 差し替え

現在のエラー返却スタブ（274-284行）を以下の実装に置き換える：

```rust
async fn generate_stream(
    &self,
    model_name: &str,
    prompt: &str,
    params: GenerateParams,
) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError> {
    let model = self.registry.get(model_name).await?;
    let backend = crate::registry::ensure_backend()?;
    let inference_params = InferenceParams::from(params);
    let prompt_owned = prompt.to_string();

    crate::inference::stream::generate_stream_inner(
        model,
        backend,
        prompt_owned,
        inference_params,
    )
    .await
}
```

### Step 4: mod.rs の DummyEngine::generate_stream 差し替え

現在の `todo!()`（187行）を以下の実装に置き換える：

```rust
async fn generate_stream(
    &self,
    _model_name: &str,
    _prompt: &str,
    _params: GenerateParams,
) -> Result<Pin<Box<dyn Stream<Item = Result<String, GgufError>> + Send>>, GgufError> {
    let stream = futures::stream::iter(vec![Ok("dummy chunk".into())]);
    Ok(Box::pin(stream))
}
```

## Dependencies

### 先行実装必須
- **M6-4** (registry.rs): `ModelRegistry::get()` が `Arc<LlamaModel>` を返す — ✅ 完了済み
- **M6-5** (inference/mod.rs): InferenceEngine トレイト定義（3メソッド）— ✅ 完了済み

### 並行可能
- **M6-6** (inference/generate.rs): 通常生成の実装 — ✅ 完了済み（`run_inference_blocking` のロジックを流用可能）
- **M6-11** (Cargo.toml): `tokio-stream` クレートが必要な場合は当チケットで先に追加する

### 参照
- `crates/ggufrs/RFC.md` §4.5 — generate_stream() 実装の疑似コード
- `crates/ggufrs/RFC.md` §Implementation ファイル別変更要約 (stream.rs 修正)
- `generate.rs` の `run_inference_blocking()` 実装パターン

## Acceptance Criteria

- [ ] `inference/stream.rs` が llama-cpp-2 の TokenCallback + mpsc + ReceiverStream パターンで実装されている
- [ ] mistralrs への依存が `inference/stream.rs` から完全に除去されている
- [ ] `GgufEngine::generate_stream()` がエラースタブではなく本実装で動作する
- [ ] `DummyEngine::generate_stream()` が `todo!()` ではなく `futures::stream::iter` を使った適切な実装になっている
- [ ] `InferenceParams` が `pub(crate)` に変更され、stream.rs から参照可能になっている
- [ ] 既存の全テストがパスする（`make test` が成功）
- [ ] 新しいユニットテストが追加され、ストリームの正常終了とエラー終了を検証する
- [ ] `make check-be` が成功する
- [ ] `cargo clippy -- -D warnings` が成功する
- [ ] 犯罪 ID 1 が `resolved` に変更されている

## Boy Scout Rule — 翻訳可能性計画

- **関数名は動詞句**: `run_inference_stream_blocking`（ストリーミング推論を同期的に実行する）、`generate_stream_inner`（ストリームを生成する内部関数）
- **定数抽出**: チャネル容量 64 を `STREAM_CHANNEL_CAPACITY` 定数として定義
- **エラー握りつぶし禁止**: `blocking_send` の戻り値（`Result<(), SendError>`）を検査し、レシーバがドロップされた場合は早期リターンする
- **責務分離**: 同期推論ロジック（`run_inference_stream_blocking`）と非同期ラッパー（`generate_stream_inner`）を分離
- **コメントは「なぜ」を説明**: チャネル容量の選定理由、背圧の動作原理をコメントで記述
- **既存コード改善**: `generate.rs` の `InferenceParams` が `pub(crate)` にできなかった理由（あった場合）を明確化。ない場合は visibility を上げてコメントを追加

## Notes

### 成果物

- 計画: context/0187-m6-7-inferencestreamrs-tokencallback-mpsc-receiverstream/plan.md（未作成、/plan-ticket 承認後に作成）
- 実装サマリ: context/0187-m6-7-inferencestreamrs-tokencallback-mpsc-receiverstream/implementation.md（未作成、/start-ticket 実装完了後に作成）
- レビュー報告書: context/0187-m6-7-inferencestreamrs-tokencallback-mpsc-receiverstream/review.md（未作成、/review-ticket 全チェック通過後に作成）
