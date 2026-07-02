---
ticket_id: 12
title: translate.rs: Responses 逆変換を responses_response_to_anthropic に差し替え
slug: translaters-responses-responses-response-to-anthropic
status: draft
created_at: 2026-07-02
updated_at: 2026-07-02
---

# translate.rs: Responses 逆変換を responses_response_to_anthropic に差し替え

## Summary

`translate_non_stream()` 内の逆変換分岐で、`LlmApiFormat::OpenaiResponses` 時に誤って `responses_to_anthropic()`（Request→Request 変換）を呼んでいたのを、`responses_response_to_anthropic()`（Response→Response 変換）に差し替える。同関数は P7-1/P7-2 で llm-bridge-core 側に既に実装・re-export 済みであり、anthropx 側の import 追加と呼び出し差し替えのみで完了する。

## Background

translate mode の非ストリーミングパスでは、upstream（OpenAI）からのレスポンス JSON を Anthropic Messages 形式のレスポンスに逆変換する必要がある。

Chat Completions パスは `anthropic_to_openai()`（リクエスト変換）＋ `openai_response_to_anthropic_message()`（レスポンス逆変換）の正しい対称ペアを持つ。

Responses パスではリクエスト変換（`anthropic_to_openai_responses()`）は正しいが、レスポンス逆変換は誤って `responses_to_anthropic()`（Request→Request 変換関数）が使われている。その結果、`#[serde(deny_unknown_fields)]` がないため unknown fields がサイレント無視され、`{messages:[], model:...}` のような Anthropic Request 形式の JSON が出力されていた（Anthropic Response 形式ではない）。

このバグにより `openai_wire_api = "responses"` の全非ストリーミングリクエストが実質的に使用不可能だった。

## Scope

- `src/provider/translate.rs` の import ブロックに `responses_response_to_anthropic` を追加（`responses_to_anthropic` は削除せず保持）
- `src/provider/translate.rs` L414 の `LlmApiFormat::OpenaiResponses => responses_to_anthropic(&response_req)` を `responses_response_to_anthropic(&response_req)` に変更
- コンパイル確認（`cargo check`）
- 既存テストが全てパスすることを確認

## Non-scope

- `responses_to_anthropic` の削除（呼び出し箇所1箇所のみを差し替え、削除は不要）
- llm-bridge-core 側の変更（P7-1/P7-2 で完了済み）
- ストリーミングパスの変更（別の専用実装 `transform_responses_stream_to_anthropic` が使用されており、本件とは無関係）
- テスト追加（テストは P9-1 で対応予定）

## Investigation

### 証拠1: ソースコード解析結果

**translate.rs の import ブロック**（`src/provider/translate.rs:33-36`）:

```rust
use llm_bridge_core::transform::{
    anthropic_to_openai, anthropic_to_openai_responses, openai_response_to_anthropic_message,
    responses_to_anthropic,  // ← これのみ。responses_response_to_anthropic がない
};
```

**translate_non_stream() の逆変換分岐**（`src/provider/translate.rs:410-420`）:

```rust
let anthropic_resp = match llm_format {
    LlmApiFormat::OpenaiChat | LlmApiFormat::AnthropicMessages => {
        openai_response_to_anthropic_message(&response_req)
    }
    LlmApiFormat::OpenaiResponses => responses_to_anthropic(&response_req),
    //                              ^^^^^^^^^^^^^^^^^^^^^^^^ ← BUG: Request→Request 変換を使用
    _ => {
        return Err(ProxyError::Internal(format!(
            "unsupported API format: {llm_format:?}"
        )));
    }
};
```

### 証拠2: llm-bridge-core 側の実装確認

`responses_response_to_anthropic()` は既に実装・re-export 済み。

**関数定義**（`crates/llm-bridge-rust-v0.5.0/crates/core/src/transform/response_transforms.rs:551`）:

```rust
pub fn responses_response_to_anthropic(
    req: &TransformRequest,
) -> Result<TransformResponse, TransformError> { ... }
```

**re-export**（`crates/llm-bridge-rust-v0.5.0/crates/core/src/transform/mod.rs:41`）:

```rust
pub use response_transforms::{
    ...
    responses_response_to_anthropic,
    ...
};
```

### 証拠3: スタブ（dead_code 許容）の存在

`responses_response_to_anthropic` が内部で呼び出す2つの補助関数に `#[allow(dead_code)]` が付与されており、P8-1 を参照する `[::STUB::]` マーカーが存在する：

- `response_transforms.rs:653-654`: `responses_output_to_content_blocks()` — `[::STUB::] P8-1`
- `response_transforms.rs:756-757`: `map_responses_status_to_anthropic_stop_reason()` — `[::STUB::] P8-1`

これらの `#[allow(dead_code)]` は、本チケット（P8-1）が完了して `responses_response_to_anthropic` が実際に translate.rs から呼び出されれば自動的に解決される（dead code ではなくなる）。

### 証拠4: エラー連鎖の検証

RFC-X-001.md の Root Cause Analysis により、3段階のエラー連鎖が確認されている：

| 段階 | ファイル | 行 | 問題 |
|------|----------|----|------|
| ① 呼び出し | `anthropx/translate.rs` | 414 | upstream の **レスポンス** を `TransformRequest` に包んで `responses_to_anthropic()` に渡している |
| ② パース | llm-bridge-core | 89-95 | Request スキーマで JSON を解釈。`#[serde(deny_unknown_fields)]` がないため unknown フィールドがサイレント無視される |
| ③ 逆変換 | llm-bridge-core | 156-168 | `input = None` → 空メッセージ → Anthropic REQUEST 形式を出力。本来は Anthropic RESPONSE 形式が必要 |

## Test Plan

### ユニットテスト計画

本チケットは **コンパイルが通ればバグが修正される** ことが確定している。理由：

1. import 追加と呼び出し関数名の差し替えのみ（ロジック変更なし）
2. 差し替え先の `responses_response_to_anthropic()` は P7-1 で実装・単体テスト済み
3. 既存のテストスイートで translate mode 全体の動作が検証される

従って以下をテスト計画とする：

- **正常系（コンパイル確認）**: `cargo check --all-features` で型検査が通ること
- **正常系（回帰テスト）**: `cargo test --lib` で既存テストが全てパスすること（201件想定）
- **正常系（リント確認）**: `cargo clippy -- -D warnings` で新しい警告が発生しないこと

### ユニットテスト不可能な項目（例外）

- 理由: 実際の OpenAI Responses API との結合テストは本チケットのスコープ外。統合テスト（P9-1）でカバー予定。

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るコードは既に翻訳可能性を満たしている：

- 関数名 `responses_to_anthropic → responses_response_to_anthropic`:
  元の関数名は「Responses を Anthropic に変換」と読み取れるが、実際は Request→Request 変換であり名前と動作に乖離があった。差し替え先の `responses_response_to_anthropic` は「Responses **Response** を Anthropic に変換」であり、正確に動作を表現している。
- コードブロックは `match` 分岐の1アームのみの変更で、翻訳可能性を損なわない
- コメントの更新は不要（該当行に日本語コメントなし）
- ハードコード値の定数化も不要（該当範囲にマジックナンバーなし）

## Acceptance Criteria

- [ ] `responses_response_to_anthropic` が import ブロックに追加されている
- [ ] L414 の `LlmApiFormat::OpenaiResponses` 分岐が `responses_response_to_anthropic(&response_req)` を呼び出している
- [ ] `cargo check` が通ること
- [ ] 既存テストが全て通過すること
- [ ] `cargo clippy` で新たな警告が発生しないこと
- [ ] `responses_output_to_content_blocks()` と `map_responses_status_to_anthropic_stop_reason()` の `#[allow(dead_code)]` が不要になること（dead_code 警告が解消されること）

## Notes

### 依存関係

- **前提チケット（完了済み）**:
  - P7-1: `responses_response_to_anthropic()` 関数の実装 ✅
  - P7-2: `transform/mod.rs` での re-export 追加 ✅
- **後続チケット（未着手）**:
  - P9-1: Responses レスポンス逆変換の統合テスト追加（現在 `todo`）

### 実装手順

1. `src/provider/translate.rs` の import ブロック（L33-36）に `responses_response_to_anthropic` を追加
2. 同ファイル L414 の関数呼び出しを `responses_response_to_anthropic` に変更
3. `cargo check` でコンパイル確認
4. `cargo test --lib` で回帰テスト実行
5. `cargo clippy -- -D warnings` でリント確認
6. 犯罪スキャンで `[::STUB::]` マーカーの状態を確認
