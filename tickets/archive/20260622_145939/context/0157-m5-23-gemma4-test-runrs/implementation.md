# M5-2.3: デフォルトモデルの Gemma4 切り替え — 実装サマリ

## 変更したファイル

### crates/ggufrs/src/inference/mod.rs
- `GenerateParams` に `enable_thinking: Option<bool>` フィールド追加
- `Default` 実装に `enable_thinking: None` 追加
- 既存テスト更新 + `generate_params_enable_thinking_true` テスト追加

### crates/ggufrs/src/inference/generate.rs
- 3メソッド（generate / generate_structured / generate_stream）全てに
  enable_thinking の条件分岐を追加（`Some(val)` の場合のみ RequestBuilder::enable_thinking() を呼ぶ）
- 値移動問題のため enable_thinking は params.into() の前に抽出

### crates/ggufrs/src/server/openai.rs
- list_models_handler: Gemma4 E2B/E4B を追加（Qwen3.5 は維持）
- openai_chat_handler / anthropic_messages_handler: デフォルトモデルを "gemma4-e2b" に変更

### crates/ggufrs/src/bin/test-run.rs
- モデル設定: Qwen3.5 → Gemma4 E2B（UQFF Q4K）に変更
- 全3パターンの推論パラメータを高速化最適化（thinking OFF, max_tokens抑制）
- 表示メッセージを Gemma4 に更新

## 高速化パラメータ設定

| パターン | temperature | max_tokens | enable_thinking |
|---------|-------------|------------|-----------------|
| Structured Output | 0.1 | 128 | false |
| Text Generation | 0.3 | 256 | false |
| Streaming | 0.5 | 128 | false |

## 検証結果
- cargo clippy -- -D warnings: clean
- cargo test: 175 tests passed（既存174 + 新規1）, 0 failed
- cargo check --bin test-run: 通過
- cargo fmt: clean
