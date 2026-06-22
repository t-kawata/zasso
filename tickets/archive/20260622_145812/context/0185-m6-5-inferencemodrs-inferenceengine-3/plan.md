# 実装計画: M6-5 inference/mod.rs 修正 — InferenceEngine トレイト3メソッド化

## 要件の再確認

`inference/mod.rs` の `InferenceEngine` トレイトから `send_raw()` メソッドを削除し4→3メソッド化する。`GenerateParams` から `enable_thinking` フィールドを削除する。これにより mistralrs 依存型（`RequestBuilder` / `Response`）がトレイト定義から完全に除去される。

**注意**: 本チケットの変更後、`server/openai.rs` が `send_raw` 呼び出しでコンパイルエラーになるが、Tickets.md で許容された状態である（M6-9 で解消）。

## 変更ファイル一覧

| ファイル | 種別 | 内容 |
|---------|------|------|
| `crates/ggufrs/src/inference/mod.rs` | MODIFY | 1ファイルのみ。9箇所の最小差分 |

## 変更詳細（全9箇所、記載順はソースコードの出現順）

1. **L14**: `use mistralrs::{RequestBuilder, Response};` 行を削除
2. **L60-65**: `GenerateParams` の `enable_thinking` フィールド + doc コメント（5行）を削除
3. **L76**: `GenerateParams::default()` 内の `enable_thinking: None,` 行を削除
4. **L84**: トレイト先頭の doc コメント「4メソッドのうち3つが高レベルAPI、1つ（`send_raw`）が低レベルAPIとして設計され」→「3メソッド全てが高レベルAPIとして設計され」に修正
5. **L155-172**: `InferenceEngine` トレイトの `send_raw()` メソッド定義 + doc コメントを全削除
6. **L215-221**: `DummyEngine` の `send_raw()` 実装（5行）を削除
7. **L248-255**: `generate_params_enable_thinking_true` テスト（8行）を削除
8. **L268-269**: `MockEngine` の `send_raw()` モック定義（2行）を削除
9. **L362-372**: `mock_send_raw_exists` テスト（11行）を削除
10. **L236-246**: `generate_params_default_uses_constants` テストの `assert!(params.enable_thinking.is_none())` 行（L245）を削除

## Boy Scout 改善（スコープ外の翻訳可能性修正）

| ファイル | 内容 |
|---------|------|
| `crates/ggufrs/src/inference/mod.rs` | トレイトの doc コメントを更新：「4メソッド」→「3メソッド」、`send_raw` への言及削除 |

## テスト計画

### ユニットテスト

本チケットは新規テストの追加を必要としない（spec に定義済みのテスト削除・修正のみ）。各操作の検証は以下の通り：

| 検証項目 | 方法 |
|---------|------|
| L14 mistralrs import 削除 | 当該行が存在しないことの確認（grep `use mistralrs` / `crates/ggufrs/src/inference/mod.rs`） |
| enable_thinking 削除 | フィールド定義が存在しないことの確認（grep `enable_thinking` が mod.rs 内で0件） |
| send_raw メソッド削除 | トレイト定義に `send_raw` が存在しないことの確認（grep `send_raw` が mod.rs 内で0件） |
| generate_params_default_uses_constants | テストが enable_thinking アサートなしでコンパイルできること |
| 残存テストが変更前と同等 | 削除対象外のテスト中に send_raw や enable_thinking への参照がないこと |

### テスト不可能な項目（例外）

1. **クレート全体のコンパイル検証**: `server/openai.rs` が `send_raw` 呼び出しでコンパイルエラー。M6-9 まで検証不可。
2. **単一ファイルの `cargo check`**: `inference/mod.rs` は `lib.rs` 経由でコンパイルされるため、単独では `cargo check` できない。

## 実装手順

```
Step 1: import 行削除（L14）
  → use mistralrs::{RequestBuilder, Response}; を削除

Step 2: GenerateParams の enable_thinking フィールド削除（L60-65）
  → フィールド定義 + doc コメント5行を削除

Step 3: default() の enable_thinking 初期化削除（L76）
  → enable_thinking: None, 行を削除

Step 4: トレイト doc コメント更新（L84）
  → 「4メソッドのうち3つが高レベルAPI、1つ（send_raw）が低レベルAPI」→「3メソッド全てが高レベルAPI」

Step 5: send_raw() メソッド定義削除（L155-172）
  → メソッド全体 + doc コメントを削除

Step 6: DummyEngine の send_raw 実装削除（L215-221）
  → 5行を削除

Step 7: generate_params_enable_thinking_true テスト削除（L248-255）
  → テスト関数丸ごと削除

Step 8: MockEngine の send_raw モック定義削除（L268-269）
  → 2行を削除

Step 9: mock_send_raw_exists テスト削除（L362-372）
  → テスト関数丸ごと削除

Step 10: generate_params_default_uses_constants から enable_thinking アサート削除（L245）
  → assert!(params.enable_thinking.is_none()); 行のみ削除

Step 11: 検証
  → 削除対象の各行を grep で確認（すべて 0 件であること）
  → 削除対象外のテストに send_raw / enable_thinking の参照がないことを確認
  → 全ての不完全実装パターンに [::STUB::] が付与されていることを確認
```

## 物理的レビュー方法

本チケットはファイル単位のコンパイルがクレート全体の依存関係から不可能であるため、以下の方法でレビューを実施する：

1. **`run-quality-checks.js` の実行**:
   ```bash
   node ".claude/scripts/tickets/review/run-quality-checks.js" \
     "/Users/kawata/shyme/zasso/crates/ggufrs/src/inference/mod.rs"
   ```

2. **翻訳可能性 grep**:
   ```bash
   # send_raw が mod.rs 内で完全に削除されていること
   grep -n "send_raw" /Users/kawata/shyme/zasso/crates/ggufrs/src/inference/mod.rs || echo "OK: send_raw 削除完了"
   
   # enable_thinking が mod.rs 内で完全に削除されていること
   grep -n "enable_thinking" /Users/kawata/shyme/zasso/crates/ggufrs/src/inference/mod.rs || echo "OK: enable_thinking 削除完了"
   
   # mistralrs の import が mod.rs 内で削除されていること
   grep -n "mistralrs" /Users/kawata/shyme/zasso/crates/ggufrs/src/inference/mod.rs || echo "OK: mistralrs import 削除完了"
   ```

3. **不完全実装パターンの確認（新たな `[::STUB::]` 漏れがないこと）**:
   ```bash
   grep -nE "todo!\(\)|unimplemented!\(\)|panic!\(" \
     /Users/kawata/shyme/zasso/crates/ggufrs/src/inference/mod.rs | \
     grep -v "\[::STUB::\]" || echo "OK: 新たなスタブ漏れなし"
   ```

4. **Malfeasance.json の新規犯罪確認**:
   ```bash
   bash ".claude/scripts/tickets/scan-crimes.sh"
   ```

## リスク

| リスク | 影響 | 対策 |
|-------|------|------|
| `server/openai.rs` が `send_raw` 呼び出しでコンパイルエラー | 中 | 許容範囲。M6-9 で解消 |
| 変更対象行番号が作業開始時にズレている | 低 | 各 Edit 前にファイルを再Readして行番号を確認する |
| `send_raw` の参照がテストコード以外にも残っている | 低 | grep で全削除確認 |
| `DummyEngine` の `generate_stream` の `todo!()` を誤って削除してしまう | 低 | 変更対象外のため操作しない |
