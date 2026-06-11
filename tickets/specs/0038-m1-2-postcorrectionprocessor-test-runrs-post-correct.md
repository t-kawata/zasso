---
ticket_id: 38
title: M1-2: PostCorrectionProcessor + test-run.rs [POST_CORRECT]
slug: m1-2-postcorrectionprocessor-test-runrs-post-correct
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0038-m1-2-postcorrectionprocessor-test-runrs-post-correct/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0038-m1-2-postcorrectionprocessor-test-runrs-post-correct/review.md
---
# M1-2: PostCorrectionProcessor + test-run.rs [POST_CORRECT]

## Summary

MYCUTE の PostCorrectionProcessor 実装を voiput `src/pipeline/post_correct.rs` に移植する。
test-run.rs に `[POST_CORRECT]` セクションを追加し、OfflineModel/OnlineModel の動作デモを表示する。

## Background

音声認識の最終段階では、ASR の生テキストを LLM で補正する。PostCorrectionProcessor はそのための状態機械で、以下の責務を持つ：

- テキストバッファリング（OfflineModel＝追記、OnlineModel＝上書き）
- 補正条件判定（文数・文字数・経過時間）
- LLM 補正の実行と結果反映
- 発話沈黙タイマーによる猶予期間管理

MYCUTE `~/shyme/mycute/src/tools/post_correction_processor.rs` から完全移植する。
**変更点は `crate::constants::POST_CORRECTION_SILENCE_WAIT_MS` のパスのみ**。

## Scope

### 1. `src/pipeline/post_correct.rs`

MYCUTE から完全移植。以下の変更のみ：
- `use crate::constants::POST_CORRECTION_SILENCE_WAIT_MS` — 同一パスのため変更不要（voiput にも同名定数がある）
- `PostCorrectionConfig` の参照先を `crate::types::PostCorrectionConfig` に変更（voiput では public types として定義済み）
- コメントの参照先パスを更新

移植する全要素：
- `PostCorrectionBackend` trait（async fn post_correct）— `pub(crate)`
- `SttModelType` enum（UseOfflineModel / UseOnlineModel）
- `ProcessorOutput` enum（Partial(String) / Final(String)）
- `ProcessorBuffer` struct（target_text / completed_text / org_text）
- `PostCorrectionProcessor` struct 全メソッド：
  - `new()` / `with_model_type()` — コンストラクタ
  - `process_input()` → Option<ProcessorOutput> — テキスト投入
  - `check_and_start_silence_timer()` → bool — 沈黙タイマー
  - `get_text_to_correct()` → String
  - `commit_correction()` → ProcessorOutput — 補正確定
  - `will_execute_now()` → bool
  - `should_trigger_correction()` → bool — 条件判定
  - `count_sentences_in_text()` → usize — 純粋関数
  - `reset()` / `get_display_text()` / `get_confirmed_len()`
- `#[cfg(test)] mod tests` — MockBackend + 全テストケース

### 2. `src/pipeline/mod.rs`

- `pub(crate) mod post_correct;` を追加（コメントアウト解除）

### 3. `src/lib.rs`

- `pub use pipeline::post_correct::PostCorrectionBackend;` を追加（`pub(crate)` では test-run.rs からアクセス不可のため）

### 4. `src/bin/test-run.rs`

- `use voiput::PostCorrectionBackend;` — Backend を impl した MockBackend を定義
- `test_post_correct()` 関数を新規追加：
  1. OfflineModel デモ: "hello" → "world" の2回入力で "helloworld" の Partial が得られること
  2. OnlineModel デモ: "hello" → "hello world" の2回入力で "hello world" の Partial が得られること
  3. commit_correction デモ: 補正実行後のバッファクリア確認
  4. 結果を "PASS" / "FAIL" で表示
- `main()` から `test_post_correct()` を呼び出し
- Stage は 3/6 のまま（RESAMPLER と同じ Phase 1）

## Non-scope

- 信号品質フィルタ（M1-3）、置換辞書（M1-4）— それぞれ別チケット
- AsrBackend trait + BackendWrapper — M3-1 で移植
- 実際の LLM API 呼び出し — 本チケットでは MockBackend のみ

## Investigation

### 証拠1: MYCUTE PostCorrectionProcessor の構造

MYCUTE `~/shyme/mycute/src/tools/post_correction_processor.rs`（471行）には以下が含まれる：
- `PostCorrectionBackend` trait（async fn post_correct）— async-trait 使用
- `SttModelType` enum（UseOfflineModel / UseOnlineModel）— デフォルト UseOfflineModel
- `PostCorrectionConfig` struct（sentence_count_threshold, min_text_length, interval_ms）
- `ProcessorOutput` enum（Partial(String) / Final(String)）
- `ProcessorBuffer` struct（target_text, completed_text, org_text）
- `PostCorrectionProcessor` struct — 14の公開メソッド＋内部ヘルパー
- `#[cfg(test)]` に8テスト（MockBackend 使用）

### 証拠2: voiput との差分

voiput の `PostCorrectionConfig` は既に `src/types.rs` に定義済み（M0-2）。
よって `crate::types::PostCorrectionConfig` を参照する。

MYCUTE の `use crate::constants::POST_CORRECTION_SILENCE_WAIT_MS` は voiput の `crate::constants::POST_CORRECTION_SILENCE_WAIT_MS` と同名のため変更不要。

### 証拠3: テストケース

```rust
// MockBackend: "hello" → Some("[OK] hello")
// test_offline_model_appends: "hello" + "world" → "helloworld"
// test_online_model_overwrites: "hello" + "hello world" → "hello world"
// test_commit_correction_clears_buffer: 補正後クリア確認
// test_empty_input_returns_none: 空文字→None
// test_reset_clears_everything: reset後空
// test_should_trigger_correction: 初期状態→false
// test_commit_prevents_duplicate_on_next_input: 重複防止
// test_deterministic_count_sentences: 文カウント決定論性
```

これらのテストはすべてメモリ内完結・LLM 呼び出し不要（MockBackend 使用）。

### 証拠4: cargo add 不要

async-trait は M0-1 で既に追加済み。
anyhow も既に追加済み。
新たな外部依存の追加は不要。

## Test Plan

### ユニットテスト計画

pipeline/post_correct.rs に9テスト（MYCUTE から移植）：

1. **test_offline_model_appends**: UseOfflineModel で "hello" + "world" → "helloworld" の Partial
2. **test_online_model_overwrites**: UseOnlineModel で "hello" + "hello world" → "hello world" の Partial
3. **test_commit_correction_clears_buffer**: commit_correction 後のバッファクリア確認
4. **test_empty_input_returns_none**: 空文字列 → None
5. **test_reset_clears_everything**: reset 後は全状態クリア
6. **test_should_trigger_correction**: 初期状態では false
7. **test_commit_prevents_duplicate**: 補正後次の入力で重複しない
8. **test_deterministic_count_sentences**: 文カウント関数の決定論性
9. **test_commit_output_format**: Final 出力に corrected_text が含まれる

既存39 + 新規9 = 計48テスト PASS 見込み

### ユニットテスト不可能な項目

なし。MockBackend で全テストがメモリ内完結。

## Boy Scout Rule — 翻訳可能性計画

- MYCUTE からの移植コードは既に翻訳可能性が担保されている：
  - `process_input` / `commit_correction` / `check_and_start_silence_timer` — すべて動詞句
  - `ProcessorOutput::Partial` / `ProcessorOutput::Final` — 状態を名詞で表現
  - `target_text` / `completed_text` / `org_text` — ドメイン概念を表す変数名
- 変更点はパス修正のみ。ロジックは一切変更しない。

## Acceptance Criteria

- [ ] `cargo test` が全48テスト PASS すること
- [ ] `cargo run --bin test-run` で `[POST_CORRECT]` セクションが Offline/Online 両モードのデモを表示すること
- [ ] MockBackend を使用したテストが LLM 呼び出しなしで完結していること
- [ ] 重複防止（commit 後のバッファクリア）のテストが PASS すること（CRITICAL）

## Notes

- `PostCorrectionConfig` は `crate::types` にあるものを使用する（pipeline/post_correct.rs 内では定義しない）
- BackendWrapper（AsrBackend → PostCorrectionBackend 変換）は M3-1 で移植。本チケットでは MockBackend で直接 PostCorrectionBackend を実装する
- `count_sentences_in_text` は純粋関数で、`match` を使用しない独立した実装

### 成果物

- 計画: context/0038-m1-2-postcorrectionprocessor-test-runrs-post-correct/plan.md（未作成）
- 実装サマリ: context/0038-m1-2-postcorrectionprocessor-test-runrs-post-correct/implementation.md（未作成）
- レビュー報告書: context/0038-m1-2-postcorrectionprocessor-test-runrs-post-correct/review.md（未作成）
