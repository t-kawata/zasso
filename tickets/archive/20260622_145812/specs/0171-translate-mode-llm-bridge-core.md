---
ticket_id: 171
title: Translate mode 本実装 — llm-bridge-core 変換
slug: translate-mode-llm-bridge-core
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
plan_path: /Users/shyme01/shyme/zasso/tickets/context/0171-translate-mode-llm-bridge-core/plan.md
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0171-translate-mode-llm-bridge-core/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0171-translate-mode-llm-bridge-core/review.md
---

# チケット #171: Translate mode 本実装 — llm-bridge-core 変換

## Summary

`provider/translate.rs` の `handle_translate()` スタブを、llm-bridge-core の実際のプロトコル変換 API を呼び出す本実装に置き換える。Anthropic Messages ↔ OpenAI Chat/Responses 間の変換を実現する。

## Background

M3-5 で `provider/translate.rs` のファイル構造とスタブ関数は作成されたが、llm-bridge-core の実際の変換 API を呼び出すロジックが未実装のまま完了扱いになっていた。

現在の `handle_translate()` は全ての引数を無視して `Err(ProxyError::Internal("translate not yet implemented"))` を返すスタブ。anthropx の本来の目的（Claude Code からの Anthropic 形式リクエストを OpenAI 互換 API にプロトコル変換して中継）を果たせていない。

## Scope

### 実装するもの

1. **`provider/translate.rs`**: `handle_translate()` の本実装
   - 引数に `resolved: &ResolvedModel` を追加
   - non-stream 3step: `anthropic_to_openai()` → upstream POST → `openai_response_to_anthropic_message()`
   - stream 3step: `anthropic_to_openai()` → upstream SSE → `transform_stream()` でチャンク単位変換
   - `translate_stream()` — 生 SSE チャンクをチャンク単位で受信→累積→`transform_stream()`→Anthropic SSE 中継
   - Lossy 検出時のエラー/続行判定（`allow_lossy` + `error_lossy_continue` 設定の統合）
   - `TransformError` → `ProxyError` マッピング（全6 variant を網羅）

2. **`routing/mod.rs`**: llm-bridge-core の `ApiFormat` との統合
   - ローカル `ApiFormat` → `llm_bridge_core::model::ApiFormat` 変換関数 `to_llm_api_format()` を追加

3. **`http/routes.rs`**: translate 呼び出しの修正
   - `handle_translate()` に `resolved` を渡すよう変更
   - スタブ応答フォールバック（`or_else`）を削除

### スコープ外

- ProviderClient の導入（M5-2）
- ConcurrencyLimiter の接続（M5-2）
- 観測可能性・メトリクス（M5-3）
- integration-test feature（M5-4）

## Investigation

### 現在のスタブ状態

`crates/anthropx/src/provider/translate.rs`:
```rust
pub async fn handle_translate(
    state: Arc<AppState>,
    provider_name: &str,
    body: serde_json::Value,
    is_stream: bool,
) -> Result<Response, ProxyError> {
    let _ = state; let _ = provider_name; let _ = body; let _ = is_stream;
    Err(ProxyError::Internal("translate not yet implemented".to_string()))
}
```

`handle_translate()` のシグネチャは `resolved: &ResolvedModel` を受け取っていない。`handle_messages()` では `resolved` を取得しているが translate 呼び出し時に渡していないため、シグネチャ変更が必要。

### llm-bridge-core v0.2.6 API（確認済み）

提供される変換関数:

| 関数 | シグネチャ | 用途 |
|------|-----------|------|
| `anthropic_to_openai` | `(&TransformRequest) -> Result<TransformResponse, TransformError>` | Anthropic Messages → OpenAI Chat Completions |
| `anthropic_to_openai_responses` | `(&TransformRequest) -> Result<TransformResponse, TransformError>` | Anthropic Messages → OpenAI Responses |
| `openai_response_to_anthropic_message` | `(&TransformResponse) -> Result<TransformResponse, TransformError>` | OpenAI Chat 応答 → Anthropic Messages |
| `responses_to_anthropic` | `(&TransformResponse) -> Result<TransformResponse, TransformError>` | OpenAI Responses 応答 → Anthropic Messages |
| `transform_stream` | `(&[u8], ApiFormat, &mut StreamState) -> Result<Vec<u8>, TransformError>` | SSE バッファ → Anthropic SSE イベント列 |

変換要求/応答型:
- `TransformRequest { headers: HashMap<String,String>, path: String, body: Bytes }`
- `TransformResponse { headers: HashMap<String,String>, path: String, body: Bytes }`
- `ApiFormat`: `AnthropicMessages | OpenaiChat | OpenaiResponses`
- `StreamState`: default-constructible, per-connection 状態

エラー型:
- `TransformError::InvalidFormat(String)` → `ProxyError::Internal`
- `TransformError::MissingRequiredField(String)` → `ProxyError::MissingField`
- `TransformError::BufferLimitExceeded(String)` → `ProxyError::Internal`
- `TransformError::StreamInterrupted(String)` → `ProxyError::UpstreamError`
- `TransformError::UpstreamError(String)` → `ProxyError::UpstreamError`
- `TransformError::LossyDowngrade(String)` → `ProxyError::TransformLossy`

### 既存コードの統合点

`crates/anthropx/src/routing/mod.rs` L22-L27:
```rust
pub enum ApiFormat {
    OpenaiChat,
    OpenaiResponses,
}
```
llm-bridge-core の `ApiFormat` に変換する関数が必要。

`crates/anthropx/src/http/routes.rs` L142-L158:
```rust
crate::provider::translate::handle_translate(state, &provider_name, body, is_stream).await
    .or_else(|_| {
        // スタブ応答のフォールバック — 本実装後は不要
        let stub_response = Json(serde_json::json!({...}));
        Ok(stub_response.into_response())
    })
```
スタブフォールバック削除と、`resolved` 引数追加が必要。

### スタブ検出結果

- `translate.rs:4`: `[::STUB::] 実際の API 呼び出しは M3-5 以降で実装。` → **本チケットで解決**
- `translate.rs:19`: `[::STUB::] llm-bridge-core API の探索後に実装する。` → **本チケットで解決**

## Test Plan

### ユニットテスト計画（カバレッジ目標: 85%）

| # | テストケース | 種類 | 検証内容 |
|---|------------|------|---------|
| 1 | Non-stream: 3段変換 roundtrip | 正常系 | mock upstream に対して Anthropic→OpenAI 変換後、応答を OpenAI→Anthropic に逆変換 |
| 2 | Stream: OpenAI SSE → Anthropic SSE | 正常系 | mock SSE チャンクを `transform_stream` で変換 → Anthropic イベントシーケンスが正しい |
| 3 | `OpenAiWireApi` 分岐 | 正常系 | ChatCompletions / Responses / Auto の3モードで正しい upstream URL と変換関数が選択される |
| 4 | TransformError → ProxyError 全 variant | 正常系 | 6 variant 全てが適切な ProxyError variant にマッピングされる |
| 5 | Lossy 拒否 | 異常系 | `allow_lossy=false` + `error_lossy_continue=false` → TransformLossy |
| 6 | Lossy 続行 | 正常系 | `allow_lossy=true` → LossyDowngrade を warning log で通過 |
| 7 | Upstream 4xx エラー | 異常系 | upstream が 400 を返した場合のエラーハンドリング |
| 8 | Upstream 5xx エラー | 異常系 | upstream が 502 を返した場合のエラーハンドリング |
| 9 | 空 body / 不正 JSON | 異常系 | 変換不能な body でのエラー |

### ユニットテスト不可能な項目（例外）

- 実プロバイダー（OpenAI 等）に対する結合テスト → M5-4 の `integration-test` feature で対応
- 長時間ストリームの安定性テスト → M5-4 で対応予定

## Boy Scout Rule — 翻訳可能性計画

- `handle_translate()` を non-stream / stream で内部関数分割:
  - `translate_non_stream()` / `translate_stream_inner()`
  - 関数名で責務を語らせる（「非ストリーム変換を実行する」「ストリーム変換を実行する」）
- `TransformError` の各 variant を `match` で完全網羅し `ProxyError` に明示的マッピング
- `unwrap()` / `expect()` 不使用。upstream からの応答読み取りは `?` 演算子で伝播
- リクエスト body の `serde_json::Value` → `Bytes` 変換は `serde_json::to_vec()` + `Bytes::from()` の組み合わせ

## Acceptance Criteria

- [ ] `handle_translate()` が non-stream リクエストで Anthropic→OpenAI→Anthropic の3段変換を正しく行う
- [ ] `handle_translate()` が stream リクエストで SSE 変換を正しく行う（OpenAI SSE → Anthropic SSE）
- [ ] `OpenAiWireApi` の3モード（Auto / ChatCompletions / Responses）が正しく分岐する
- [ ] Lossy 発生時の動作が `allow_lossy` + `error_lossy_continue` 設定に従う
- [ ] `TransformError` の全6 variant が適切な `ProxyError` にマッピングされる
- [ ] 全ユニットテストが `cargo test` でパスする
- [ ] 既存テストに回帰がない
- [ ] 2箇所の `[::STUB::]` マーカーが本実装により解決される
- [ ] 翻訳可能性の検証が通っている

## Notes

- **重要**: `handle_translate()` のシグネチャ変更（`resolved: &ResolvedModel` 追加）は `http/routes.rs` の呼び出し元も同時に修正する。両ファイルの整合性に注意。
- llm-bridge-core の `transform_stream()` はチャンクを累積する設計。`StreamState` はコネクションごとに1つ生成し、リクエストライフサイクル全体で保持する。
- upstream への送信後、応答の変換前に 4xx/5xx のステータスコードをチェックすること。

### 成果物

- 計画: context/0171-translate-mode-llm-bridge-core/plan.md（未作成）
- 実装サマリ: context/0171-translate-mode-llm-bridge-core/implementation.md（未作成）
- レビュー報告書: context/0171-translate-mode-llm-bridge-core/review.md（未作成）
