---
ticket_id: 157
title: "M5-2.3: デフォルトモデルの Gemma4 への切り替え（test-run.rs / ドキュメント）"
slug: m5-23-gemma4-test-runrs
status: reviewed
created_at: 2026-06-19
updated_at: 2026-06-19
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0157-m5-23-gemma4-test-runrs/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0157-m5-23-gemma4-test-runrs/review.md
---

# M5-2.3: デフォルトモデルの Gemma4 への切り替え（test-run.rs / ドキュメント）

## Summary

test-run.rs のデフォルトモデルを Qwen3.5 から Gemma4 E2B/E4B に切り替える。
あわせて `GenerateParams` に `enable_thinking` フィールドを追加し、
全3メソッド（generate / generate_structured / generate_stream）で
mistralrs の `RequestBuilder::enable_thinking()` を呼び出す。

## Background

### 経緯

M5-2.2 までで以下の準備が完了した：
- ModelConfig の Gemma4 コンストラクタ追加（M5-2.1）
- build.rs の Gemma4 ダウンロード定義追加 + registry.rs の UQFF 分岐（M5-2.2）

本チケットでは test-run.rs のモデル設定と推論パラメータを Gemma4 向けに最適化する。
また、従来 `send_raw()` 経由でしか制御できなかった `enable_thinking` を
`GenerateParams` のフィールドとして追加し、高レベルAPIからも制御可能にする。

### 現在の実装状況

- `test-run.rs`: Qwen3.5-0.8B + Qwen3.5-2B を使用。GenerateParams はデフォルト
- `inference/mod.rs`: GenerateParams に `enable_thinking` フィールドなし
- `inference/generate.rs`: RequestBuilder に enable_thinking を設定していない
- `server/openai.rs`: list_models が qwen3.5 のみ、ハンドラのデフォルトモデルが qwen3.5

### このチケットの必要性

test-run が Gemma4 を使用して正常動作するには、モデル設定の切り替えと
推論パラメータの最適化（thinking 無効化等）の両方が必要。
また `enable_thinking` を `send_raw()` に頼らず制御できるようにすることで、
今後の高速化チューニングが容易になる。

## Scope

### 実装するもの

1. **`GenerateParams` に `enable_thinking: Option<bool>` 追加**
   - Default は `None`（mistralrs のデフォルト動作に委譲）
   - PartialEq / Clone / Debug は derive で自動対応

2. **`inference/generate.rs` の3メソッドで `enable_thinking` を反映**
   - `generate()`: RequestBuilder チェーンに enable_thinking を条件付き追加
   - `generate_structured()`: 同上
   - `generate_stream()`: 同上
   - 各メソッドで `params.enable_thinking` が `Some(val)` の場合のみ設定

3. **test-run.rs の Gemma4 切り替え**
   - `GgufConfig.models`: Qwen3.5 → Gemma4 E2B のみ（E4B は test-run では不要）
   - 全3パターンの `model_name`: `"qwen3.5-0.8b"` → `"gemma4-e2b"`
   - `GenerateParams` を高速化設定で最適化（下記参照）
   - 出力メッセージ: `Qwen3.5` → `Gemma4 E2B` に更新

4. **`server/openai.rs` のモデル一覧更新**
   - `list_models_handler`: Gemma4 E2B / E4B を追加（Qwen3.5 は維持）
   - `openai_chat_handler` / `anthropic_messages_handler`:
     デフォルトモデルを `"gemma4-e2b"` に変更

5. **推論パラメータ最適化（高速化の設計判断）**:

   | パターン | model | temperature | max_tokens | enable_thinking | top_p |
   |---------|-------|-------------|------------|-----------------|-------|
   | Structured Output | gemma4-e2b | 0.1 | 128 | false | None |
   | Text Generation | gemma4-e2b | 0.3 | 256 | false | None |
   | Streaming | gemma4-e2b | 0.5 | 128 | false | None |

6. **テスト追加**
   - `generate_params_default_uses_constants` — デフォルト値テストに enable_thinking 確認追加
   - `generate_params_enable_thinking_true` — 設定可能であることの確認

### 実装しないもの

- RFC.md の更新 — 別途対応（本チケットでは test-run 実装に集中）
- M5-2.4 の実動作確認 — 本チケットでは test-run のコード修正まで
- E4B モデルの test-run 設定 — E2B のみで十分

## Investigation

### enable_thinking API

mistralrs v0.8.1 の `RequestBuilder` に `enable_thinking()` メソッドが存在する:

```rust
// mistralrs crate の messages.rs:121
impl RequestBuilder {
    /// Enable extended thinking (chain-of-thought) for models that support it.
    pub fn enable_thinking(mut self, enable_thinking: bool) -> Self { ... }
}
```

generate.rs の各メソッドで以下のパターンで適用する:

```rust
let request = {
    let base = RequestBuilder::new()
        .add_message(TextMessageRole::User, prompt)
        .set_sampling(params.into());
    match params.enable_thinking {
        Some(val) => base.enable_thinking(val),
        None => base,
    }
};
```

### GenerateParams の変更

```rust
#[derive(Debug, Clone, PartialEq)]
pub struct GenerateParams {
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub top_p: Option<f32>,
    pub presence_penalty: Option<f32>,
    pub frequency_penalty: Option<f32>,
    // 新規追加:
    pub enable_thinking: Option<bool>,
}
```

Default 実装:
```rust
impl Default for GenerateParams {
    fn default() -> Self {
        Self {
            temperature: Some(DEFAULT_TEMPERATURE),
            max_tokens: Some(DEFAULT_MAX_TOKENS),
            top_p: None,
            presence_penalty: None,
            frequency_penalty: None,
            enable_thinking: None,  // 追加（None = mistralrs デフォルト）
        }
    }
}
```

### 既存テストへの影響

`generate_params_default_uses_constants` テストが `enable_thinking` の
`None` をチェックするよう更新が必要。

mock テストは `generate_params` が `always()` でマッチするため影響なし。

### 依存チケットの状態

- **M5-2.2** (#156): ✅ reviewed — UQFF 読み込み対応完了
- 本チケット（#157）の先行実装必須は完了
- 本チケットは M5-2.4 の先行実装必須

### スタブ状況

本チケットが解決する STUB は存在しない。

## Test Plan

### ユニットテスト計画

| # | テストケース | 種別 | 内容 |
|---|------------|------|------|
| 1 | `generate_params_default_uses_constants`（更新） | 正常系 | `enable_thinking` が `None` であることを追加確認 |
| 2 | `generate_params_enable_thinking_true` | 正常系 | `enable_thinking: Some(true)` が設定可能であること |

### ビルド検証

| # | 検証項目 | 方法 |
|---|---------|------|
| 1 | `cargo check --bin test-run` 通過 | `cargo check` 実行 |
| 2 | `cargo clippy -- -D warnings` | lint 確認 |
| 3 | 既存テスト全通過 | `cargo test` |

### ユニットテスト不可能な項目（例外）

| 項目 | 理由 |
|------|------|
| test-run の全パターン実動作確認 | ≈3.1GB の実モデルが必要。M5-2.4 で検証する |

## Boy Scout Rule — 翻訳可能性計画

### 現在のコードの評価

- `generate.rs`: 各メソッドで RequestBuilder 構築がインライン化されている。
  `enable_thinking` 追加で条件分岐が入るため、可読性に注意する。
- `test-run.rs`: 関数名（`print_separator`）は動詞句。モデル名の文字列のみ置換。

### 翻訳可能性ルール

1. **enable_thinking の適用は match で簡潔に**:
   ```rust
   let request = match params.enable_thinking {
       Some(val) => base.enable_thinking(val),
       None => base,
   };
   ```
   これは「thinking が指定されていれば設定し、なければそのまま」と読める。

## Acceptance Criteria

- [ ] `GenerateParams` に `enable_thinking: Option<bool>` が追加されている
- [ ] Default で `enable_thinking` が `None` である
- [ ] generate.rs の3メソッド全てで `enable_thinking` が RequestBuilder に反映される
- [ ] test-run.rs のモデルが Gemma4 E2B に変更されている
- [ ] test-run.rs の推論パラメータが高速化設定に最適化されている
- [ ] server/openai.rs のモデル一覧とデフォルトモデルが更新されている
- [ ] `cargo check --bin test-run` が通過する
- [ ] `cargo clippy -- -D warnings` が通過する
- [ ] 既存テスト全168件が通過する
- [ ] 新規テスト 2 ケースが追加され全件通過する

## Notes

- `enable_thinking` は `GenerateParams::default()` で `None` になるため、
  既存の全呼び出し元に影響はない
- 将来 `enable_thinking: Some(true)` が必要な場合は呼び出し元で指定するだけでよい
- test-run では `Some(false)` で明示的に無効化する（高速化の設計判断）
- 参照:
  - `crates/ggufrs/docs/mistralrs-gemma4-e2b-e4b/INFO.md`（パフォーマンス推定）
  - `crates/ggufrs/Tickets.md` L642-666

### 成果物

- 計画: context/0157-m5-23-gemma4-test-runrs/plan.md（未作成）
- 実装サマリ: context/0157-m5-23-gemma4-test-runrs/implementation.md（未作成）
- レビュー報告書: context/0157-m5-23-gemma4-test-runrs/review.md（未作成）
