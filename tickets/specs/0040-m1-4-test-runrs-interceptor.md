---
ticket_id: 40
title: M1-4: 置換辞書インターセプター + test-run.rs [INTERCEPTOR]
slug: m1-4-test-runrs-interceptor
status: reviewed
created_at: 2026-06-11
updated_at: 2026-06-11
implementation_path: /Users/kawata/shyme/zasso/tickets/context/0040-m1-4-test-runrs-interceptor/implementation.md
review_report_path: /Users/kawata/shyme/zasso/tickets/context/0040-m1-4-test-runrs-interceptor/review.md
---
# M1-4: 置換辞書インターセプター + test-run.rs [INTERCEPTOR]

## Summary

MYCUTE の `apply_replaces_from_map()` 関数を voiput `src/recognizer.rs` に `apply_replaces()` として移植する。test-run.rs に `[INTERCEPTOR]` セクションを追加する。これにより Phase 1 が完了し、Stage が 4/6 に進む。

## Background

置換辞書は「音声認識結果のテキストに対し、事前定義された置換ルールを適用する」機能である。全バックエンド共通のインターセプター層で動作し、ユーザーが発音しにくい単語を正しい表記に自動変換する（例: "mycute" → "MYCUTE"）。

MYCUTE `~/shyme/mycute/src/stt/recognizer.rs` の `apply_replaces_from_map()` 関数を移植。
変更点はなし（パス修正のみ）。

## Scope

### 1. `src/recognizer.rs`

MYCUTE から `apply_replaces_from_map()` を `apply_replaces()` として移植。

```rust
pub fn apply_replaces(
    replaces_map: &RwLock<IndexMap<String, Vec<String>>>,
    text: &str,
) -> String
```

ロジック:
1. マップが空 → 入力をそのまま返す
2. IndexMap { "置換後" → ["置換前1", "置換前2"] } を (before, after) ペアにフラット化
3. 置換前文字列の長い順（最長一致優先）にソート
4. 順次置換を適用

### 2. `src/lib.rs`

- `mod recognizer;` のコメントアウト解除
- `pub use recognizer::apply_replaces;` を追加（test-run.rs アクセス用）

### 3. `src/bin/test-run.rs`

- `test_interceptor()` 関数を新規追加（4ケース）
- `main()` から呼び出し
- Stage 表示を `Stage 4/6` に更新

## Non-scope

- インターセプタースレッド（SpeechRecognizer 内の std::thread）— M5-1
- 以降の Phase 2-5

## Investigation

### 証拠1: MYCUTE の実装

`~/shyme/mycute/src/stt/recognizer.rs` 469〜501行目:

```rust
fn apply_replaces_from_map(
    replaces_map: &RwLock<IndexMap<String, Vec<String>>>,
    text: &str,
) -> String {
    let map = replaces_map.read();
    if map.is_empty() { return text.to_string(); }
    // フラット化 → 最長一致ソート → 順次置換
    ...
}
```

voiput では `pub(crate) fn apply_replaces()` として同一ロジックを移植。

### 証拠2: 依存関係

parking_lot (RwLock) と indexmap は M0-1 で既に追加済み。新規依存不要。

### 証拠3: テストケース

MYCUTE のテスト:
- 空マップ → passthrough
- 単一置換
- 複数置換
- 最長一致優先
- 空beforeスキップ
- 決定論性

## Test Plan

### ユニットテスト計画（6テスト）

1. **test_empty_map_passthrough**: 空の RwLock → 入力そのまま
2. **test_single_replacement**: {"world"→["hello"]} → "hello"→"world"
3. **test_multiple_replacements**: 複数エントリの一括置換
4. **test_longest_match_priority**: "αβ"→["ab"] が "α"→["a"] より優先
5. **test_empty_before_is_skipped**: 空文字列の置換前はスキップ
6. **test_deterministic**: 同一入力+同一マップ→同一出力

既存55 + 新規6 = 計61テスト PASS 見込み

### ユニットテスト不可能な項目

なし。

## Boy Scout Rule

- MYCUTE の関数名 `apply_replaces_from_map` → `apply_replaces` に短縮（`from_map` は自明）
- 変数名（`flat`, `result`）はドメイン概念を表す
- 最長一致ソートのコメントは日本語で「なぜ」を説明

## Acceptance Criteria

- [ ] `cargo test` が全61テスト PASS
- [ ] `cargo run --bin test-run` で `[INTERCEPTOR]` 表示、Stage 4/6 表示
- [ ] Phase 1 完走 — test-run に5セクション（CONFIG/ RESAMPLER/ POST_CORRECT/ SIGNAL_FILTER/ INTERCEPTOR）が全て表示されること

## Notes

- M5-1（SpeechRecognizer）でインターセプタースレッドがこの関数を呼び出す
- `pub(crate)` だが test-run.rs アクセス用に lib.rs から pub re-export する

### 成果物

- 計画: context/0040-m1-4-interceptor/plan.md（未作成）
- 実装サマリ: context/0040-m1-4-interceptor/implementation.md（未作成）
- レビュー報告書: context/0040-m1-4-interceptor/review.md（未作成）
