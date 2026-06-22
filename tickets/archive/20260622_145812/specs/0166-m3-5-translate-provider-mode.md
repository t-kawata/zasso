---
ticket_id: 166
title: M3-5: Translate provider mode
slug: m3-5-translate-provider-mode
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/shyme01/shyme/zasso/tickets/context/0166-m3-5-translate-provider-mode/implementation.md
review_report_path: /Users/shyme01/shyme/zasso/tickets/context/0166-m3-5-translate-provider-mode/review.md
---
# M3-5: Translate provider mode

> **参照設計書:** crates/anthropx/RFC.md (§5.2 Translate mode, §1.3 bridge interface, §6 Lossy Translation)
> **生成元:** Tickets.md L403-435

## Summary

`llm-bridge-core` crate のプロトコル変換能力を活用し、Anthropic ↔ OpenAI 間の翻訳（translate）モードを実装する。non-stream は anthropic_to_openai → upstream → openai_to_anthropic の 3step、stream は anthropic_to_openai → upstream → transform_stream で SSE 変換を行う。handle_messages に残された最後の `[::STUB::]` を解決する。

## Background

handle_messages の provider 分岐で、translate モード（`provider_config.transparent=false`）は `[::STUB::]` として保留されている。llm-bridge-core（crates.io に v0.2.6 公開済み）は Anthropic ↔ OpenAI のリクエスト/レスポンス/SSE 変換を提供する。本チケットでは薄いアダプタ層を実装し、translate provider のリクエスト処理を完成させる。

## Scope

### 実装対象

1. **`provider/translate.rs`** (新規)
   - `handle_translate(state, provider, resolved, api_key, body, is_stream)` — translate エントリポイント
   - Non-stream 3step:
     1. `llm_bridge_core::transform::anthropic_to_openai(body)` → TransformRequest
     2. upstream POST + 応答
     3. `llm_bridge_core::transform::openai_to_anthropic(resp)` → Anthropic 変換
   - Stream 3step:
     1. `anthropic_to_openai()` で request 変換
     2. upstream に stream 送信
     3. `transform_stream()` で SSE 変換 + Axum 応答
   - `translate_stream(upstream_resp, stream_state)` — SSE ストリーム変換
   - `resolve_api_format()` 呼び出し（OpenAiWireApi → ApiFormat）

2. **`provider/mod.rs`** (修正)
   - `pub mod translate;` 追加（`#[cfg(feature = "server")]`）

3. **`http/routes.rs`** (修正)
   - handle_messages の `[::STUB::]` Translate 分岐を `handle_translate` 呼び出しに置き換え

4. **`Cargo.toml`** (修正)
   - `llm-bridge-core = "0.2"` 追加（optional、server feature で有効化）

### 非対象（別チケット）

- Transparent mode（M3-4 — 完了済み）
- E2E 結合テスト（M4-3, M4-4）

## Investigation

### 既存コードの状態

```
crates/anthropx/src/
├── provider/
│   ├── mod.rs          ✅ pub mod limiter; pub mod transparent;
│   ├── limiter.rs      ✅ ConcurrencyLimiter
│   └── transparent.rs  ✅ handle_transparent（M3-4 完了）
├── http/routes.rs       ✅ handle_messages — 🔴 [::STUB::] Translate mode
├── routing/mod.rs       ✅ resolve_api_format（OpenAiWireApi → ApiFormat）
└── config/mod.rs        ✅ OpenAiWireApi enum, ProviderConfig
```

### llm-bridge-core v0.2.6

`crates.io` に公開済み。主要な公開 API:
- `ApiFormat::OpenaiChat` / `ApiFormat::OpenaiResponses`
- `anthropic_to_openai(TransformRequest)` / `openai_to_anthropic(TransformResponse)`
- `anthropic_to_openai_responses()` / `responses_to_anthropic()`
- `transform_stream()`
- `TransformRequest { path, body, header }` / `TransformResponse { body }`

### 依存チケット

| ID | 関係 | 状態 |
|----|------|------|
| M3-4 (ticket 165) | 先行実装必須: Transparent I/F パターン | ✅ done |
| M4-3 (ticket 167) | 後続: Mock server integration tests | ⏳ 未着手 |

## Test Plan

### ユニットテスト計画

#### 1. handle_translate — 翻訳中継
- Non-stream: anthropic_to_openai → mock upstream → openai_to_anthropic の 3step
- Stream: anthropic_to_openai → mock SSE upstream → transform_stream

#### 2. OpenAiWireApi 分岐
- ChatCompletions / Responses / Auto の 3 モードで正しく分岐

#### 3. Lossy
- allow_lossy=false + lossy → TransformLossy エラー
- allow_lossy=true + error_lossy_continue=true → 続行 + metrics

### ユニットテスト不可能な項目
実 llm-bridge-core との結合は M4-4 で実施。

## Acceptance Criteria

- [ ] translate non-stream が 3step 変換中継される
- [ ] translate stream が SSE 変換中継される
- [ ] lossy 発生時、allow_lossy 設定に従って動作する
- [ ] handle_messages の `[::STUB::]` が解決されている
- [ ] `make check-be` 通過
- [ ] 全テスト通過
- [ ] clippy 警告ゼロ

## Notes

### スタブの点検
`routes.rs:142` に 1 件の `[::STUB::]` — 本チケットで解決（M3 最後のスタブ）

### 成果物

- 計画: context/0166-m3-5-translate-provider-mode/plan.md（未作成）
- 実装サマリ: context/0166-m3-5-translate-provider-mode/implementation.md（未作成）
- レビュー報告書: context/0166-m3-5-translate-provider-mode/review.md（未作成）
