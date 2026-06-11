---
ticket_id: 43
title: M2-3: PunctuationMachine + test-run.rs [PUNCTUATION]
slug: m2-3-punctuationmachine-test-runrs-punctuation
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0043-m2-3-punctuationmachine-test-runrs-punctuation/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0043-m2-3-punctuationmachine-test-runrs-punctuation/review.md
---
# M2-3: PunctuationMachine + test-run.rs [PUNCTUATION]

## Summary

MYCUTE の PunctuationMachine と lindera_util を voiput に移植する。
`cargo add lindera --features embed-ipadic && cargo add lindera-ipadic` で依存追加。
test-run.rs に `[PUNCTUATION]` セクションを追加する。

## Background

音声認識結果のテキストに、形態素解析（Lindera/IPADIC）を用いて日本語の句読点（。、？）を自動挿入する。Windows バックエンド専用だが、移植は全プラットフォームで行う。

MYCUTE `~/shyme/mycute/src/tools/lindera_util.rs`（完全移植）と
`~/shyme/mycute/src/tools/punctuation_machine.rs`（LocaleCode 参照先変更）を移植。

## Scope

### 0. 依存追加

```bash
cargo add lindera --features embed-ipadic && cargo add lindera-ipadic
```

### 1. `src/lindera_util.rs`

MYCUTE から完全移植（変更不要）:
```rust
pub fn get_tokenizer() -> Result<Tokenizer>
```
embedded IPADIC をロードする。

### 2. `src/pipeline/punctuation.rs`

MYCUTE `punctuation_machine.rs` を移植。変更点:
- `use crate::mycute_settings::LocaleCode` → `use crate::types::LocaleCode`

移植する全要素:
- `TokenInfo` struct
- `PunctuationMachine` struct + `new()` → Lindera tokenizer を保持
- `tokenize_to_info()` → 形態素解析
- `insert()` / `insert_with_context()` → 句読点挿入
- `is_sentence_starter()` / `should_insert_period_ja()` / `should_insert_question_ja()`

### 3. `src/pipeline/mod.rs`

- `pub(crate) mod punctuation;` 追加

### 4. `src/lib.rs`

- `mod lindera_util;` のコメントアウト解除
- `pub use lindera_util::get_tokenizer;` 追加（test-run.rs アクセス用）
- `pub use pipeline::punctuation::PunctuationMachine;` 追加

### 5. `src/bin/test-run.rs`

- `test_punctuation()` 関数追加:
  1. Lindera tokenizer の初期化確認
  2. 日本語テキスト "こんにちは元気ですか" → 句読点挿入デモ
  3. 英語テキスト → パススルー確認
- 結果を PASS/FAIL で表示
- Stage 5/6 維持（Phase 2 中）

## Non-scope

- 効果音再生（M2-4）— 別チケット
- Windows バックエンドへの統合 — M4-4

## Investigation

### 証拠1: lindera_util.rs

`~/shyme/mycute/src/tools/lindera_util.rs`（15行）:
```rust
pub fn get_tokenizer() -> Result<Tokenizer> {
    let dictionary = load_dictionary("embedded://ipadic")?;
    let segmenter = Segmenter::new(Mode::Normal, dictionary, None);
    let tokenizer = Tokenizer::new(segmenter);
    Ok(tokenizer)
}
```

完全移植。変更不要。

### 証拠2: punctuation_machine.rs

`~/shyme/mycute/src/tools/punctuation_machine.rs`（331行）:
- PunctuationMachine::new() で Lindera tokenizer を保持
- insert_with_context(text, context, locale, allow_terminal) が主処理
- 日本語ロケールでのみ句読点挿入。英語はパススルー
- should_insert_period_ja: 丁寧語(ですます)の終止、終助詞、自立語遡及
- should_insert_question_ja: 疑問終助詞(か、かい、だい、かな、かしら)
- ライブエッジ（末尾トークン）には打たない（allow_terminal_punctuation 時は例外）

### 証拠3: Cargo.toml

lindera + lindera-ipadic はコメントアウト済み。
`cargo add lindera --features embed-ipadic && cargo add lindera-ipadic` で有効化。

## Test Plan

### ユニットテスト計画

**lindera_util.rs（1テスト）**:
1. get_tokenizer() が embedded IPADIC を正常にロードできること

**punctuation.rs（4テスト）**:
1. 日本語テキスト "こんにちは元気ですか" → "こんにちは。元気ですか？"
2. 英語テキスト "hello world" → パススルー（句読点追加なし）
3. 疑問符優先: "それですか" → "それですか？"
4. allow_terminal_punctuation: 最終トークンにも句読点可

テストは lindera の embed-ipadic によりモデルファイル不要（ビルド内蔵）。

既存65 + 新規5 = 計70テスト PASS 見込み

### ユニットテスト不可能な項目

なし（embed-ipadic により辞書内蔵のため）。

## Boy Scout Rule

- MYCUTE の LocaleCode 参照を `crate::types::LocaleCode` に変更（唯一の変更点）
- 関数名: `insert()` / `insert_with_context()` / `tokenize_to_info()` — 動詞句
- コメントは日本語で「なぜ」を説明

## Acceptance Criteria

- [ ] `cargo add lindera --features embed-ipadic && cargo add lindera-ipadic` 成功
- [ ] `cargo test` 全70テスト PASS
- [ ] `cargo run --bin test-run` で `[PUNCTUATION]` が日本語句読点デモを表示
- [ ] Lindera tokenizer が embedded IPADIC を正常にロード

## Notes

- lindera の embed-ipadic により辞書がバイナリに内蔵されるため、外部モデルファイル不要
- lindera-ipadic は ~15MB のビルド依存となる（初回ビルドが長くなる）
- `lindera_util.rs` は独立モジュール（pipeline 配下ではない）

### 成果物

- 計画: context/0043-m2-3-punctuationmachine/plan.md（未作成）
- 実装サマリ: context/0043-m2-3-punctuationmachine/implementation.md（未作成）
- レビュー報告書: context/0043-m2-3-punctuationmachine/review.md（未作成）
