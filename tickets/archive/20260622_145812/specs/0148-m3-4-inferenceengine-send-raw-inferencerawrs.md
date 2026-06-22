---
ticket_id: 148
title: "M3-4: InferenceEngine send_raw 実装 (inference/raw.rs)"
slug: "m3-4-inferenceengine-send-raw-inferencerawrs"
status: reviewed
created_at: 2026-06-18
updated_at: 2026-06-18
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0148-m3-4-inferenceengine-send-raw-inferencerawrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0148-m3-4-inferenceengine-send-raw-inferencerawrs/review.md
---
# M3-4: InferenceEngine send_raw 実装 (inference/raw.rs)

## Summary

`InferenceEngine::send_raw()` を実装する。mistralrs の `RequestBuilder` をそのまま受け取り、
モデル名でモデルを解決して mistralrs に委譲する純粋なパススルーメソッド。

## Background

### 設計上の位置づけ

高レベル3メソッド（`generate`, `generate_structured`, `generate_stream`）の限界を超えた
mistralrs の全機能（tools, web search, code execution, embedding 等）にアクセスするための
パススルーメソッド。mistralrs が新機能を追加した場合も、`RequestBuilder` の拡張のみで
対応でき、`InferenceEngine` トレイト自体の変更は不要。

### 現在の実装状況

- `InferenceEngine` トレイト定義 (`inference/mod.rs`): ✅ M2-1 完了
- `send_raw` 定義 (`inference/mod.rs:155`): `async fn send_raw(&self, model_name: &str, request: RequestBuilder) -> Result<Response, GgufError>`
- `send_raw` 実装 (`inference/generate.rs:197`): 🔧 **STUB** — `todo!("M3-4")`
- `ModelRegistry::get()` (`registry.rs`): ✅ M3-2 完了
- `Model::send_chat_request()` (mistralrs 0.8.1): ✅ 利用可能
- `RequestBuilder` / `Response` / `ChatCompletionResponse` (mistralrs): ✅ 全て re-export 済み

### このチケットの必要性

M4-1（サーバー実装）で `send_raw` が OpenAI 互換エンドポイントからの呼び出しに使用される。
現状 STUB のままだとサーバー実装の前提が満たせない。

## Scope

### 実装するもの

1. **`inference/raw.rs` 作成**
   - `send_raw()` の実装（`RequestBuilder` → `Model::send_chat_request` → `Response::Done` ラップ）

2. **`inference/generate.rs` の `send_raw` STUB 更新**
   - STUB → 実際の実装に置き換え

3. **`inference/mod.rs` の更新**
   - `pub mod raw;` 宣言

### 実装しないもの

- `RequestBuilder` の内容検証・加工 — 純粋なパススルー
- tools/web search/embedding 等の機能自体のテスト — mistralrs の責務
- M4-1（サーバーからの send_raw 呼び出し）

## Investigation

### ソースコード調査結果

#### 実装の単純さ

`send_raw` は `InferenceEngine` の4メソッド中で最も実装が単純：
- 引数: `(model_name, RequestBuilder)` — RequestBuilder は既に完全に構築されたリクエスト
- 処理: `registry.get(model_name)` → `model.send_chat_request(request)`
- 戻り値: `Response::Done(ChatCompletionResponse)` でラップ

```rust
async fn send_raw(
    &self,
    model_name: &str,
    request: RequestBuilder,
) -> Result<Response, GgufError> {
    let model = self.registry.get(model_name).await?;
    let response = model.send_chat_request(request).await
        .map_err(GgufError::MistralrsError)?;
    Ok(Response::Done(response))
}
```

#### 型の確認

- `RequestBuilder`: mistralrs から re-export 済み ✅
- `Response` (mistralrs): 既存の `inference/mod.rs` で `use mistralrs::{..., Response}` 済み ✅
- `ChatCompletionResponse`: mistralrs から re-export 済み ✅

#### 関連する STUB

- `inference/generate.rs:197`: `// [::STUB::] M3-4 で send_raw を実装する` — M3-4 で解決

### 依存チケット状態

- M2-1 (InferenceEngine トレイト): ✅ 完了
- M2-2 (ModelRegistry::get): ✅ 完了
- M3-2 (generate): ✅ 完了 (#146)
- M3-3 (generate_stream): ✅ 完了 (#147)

## Test Plan

### ユニットテスト計画

`send_raw` の核となるロジックは非常に単純（モデル解決 + 委譲）であり、
実際の mistralrs 推論を含むテストは結合テスト（M5-3）に委ねる。
ユニットテストでは以下をカバーする:

| # | ケース | 種別 | 内容 |
|---|--------|------|------|
| 1.1 | モックによる send_raw インターフェース確認 | 正常系 | `MockEngine::expect_send_raw()` がコンパイル可能で期待値を返す |
| 1.2 | モデル未登録時のエラー | 異常系 | `ModelNotFound` の伝播を確認 |

**既存のモックテスト** (`inference/mod.rs`):
```rust
#[tokio::test]
async fn mock_send_raw_exists() {
    let mut mock = MockEngine::new();
    mock.expect_send_raw()
        .returning(|_, _| Err(GgufError::ModelNotFound("not implemented".into())));
    let _ = mock;
}
```
これは既存 (M2-4) で実装済み。M3-4 でさらに拡張する必要はない。

#### カバレッジ目標

- `raw.rs`: ラインカバレッジ 100%（2行の委譲ロジック）
- エラーハンドリングパス: 100%

### ユニットテスト不可能な項目（例外）

1. **`Model::send_chat_request` の実際の推論**: mistralrs ランタイムとモデルファイルが必要。M5-3（結合テスト）で検証する。

## Boy Scout Rule — 翻訳可能性計画

### 新規コードで遵守すべきルール

1. **関数名は動詞句**: `send_raw` — トレイト定義のメソッド名をそのまま使用
2. **変数名はドメイン概念**: `model`, `response`, `request`
3. **コメントは「なぜ」**: コードが「何を」しているかは関数名と構造で自明

## Acceptance Criteria

- [ ] `inference/raw.rs` が作成されている
- [ ] `send_raw()` STUB が実際の実装に置き換わっている
- [ ] `inference/mod.rs` に `pub mod raw;` が追加されている
- [ ] 既存テストが全て通過している

## Notes

- `send_raw` は最も単純なパススルーメソッド
- `RequestBuilder` の内容は一切解釈/加工しない
- 依存: M2-1 ✅, M2-2 ✅, M3-2 ✅, M3-3 ✅
- 後続: M3-5（lib.rs 統合）、M4-1（サーバー）

### 成果物

- 計画: context/0148-m3-4-inferenceengine-send-raw-inferencerawrs/plan.md（未作成）
- 実装サマリ: context/0148-m3-4-inferenceengine-send-raw-inferencerawrs/implementation.md（未作成）
- レビュー報告書: context/0148-m3-4-inferenceengine-send-raw-inferencerawrs/review.md（未作成）
