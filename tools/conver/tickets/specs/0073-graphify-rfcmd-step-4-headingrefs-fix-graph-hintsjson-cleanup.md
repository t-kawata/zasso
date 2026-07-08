---
ticket_id: 73
title: graphify-rfc.md — Step 4 全headingRefs解決確認ゲート導入と_fix_graph_hints.json cleanup対象化
slug: graphify-rfcmd-step-4-headingrefs-fix-graph-hintsjson-cleanup
status: draft
created_at: 2026-07-08
updated_at: 2026-07-08
---
# graphify-rfc.md — Step 4 全headingRefs解決確認ゲート導入と_fix_graph_hints.json cleanup対象化

## Summary

`/graphify-rfc` スラッシュコマンドの Step 4（自己検証）を書き換え、全 headingRefs の解決可能性を検証する `test-query-all.js`（PX-32）の通過を必須ゲートとして追加する。あわせて、`test-query-all.js` が出力する `_fix_graph_hints.json` を `update-step-status.js` の `cleanup` サブコマンドの削除対象に追加する。

## Background

**問題の根本原因**: graphify-rfc.md の Step 4 は、AI が最低5ノードに対して `query.js` を実行して目視確認するのみで、**全 headingRefs の解決可能性を保証する仕組みがなかった**。その結果、AI が headingRefs の不整合を軽視し、品質問題を残したまま次工程に進んでしまった。

**解決策**: PX-32 で `test-query-all.js` を新設し、PX-33 で `query.js` から headingRefs 警告を削除した上で、graphify-rfc.md の Step 4 に以下のゲートを導入する:

1. Step 4 の先頭で `test-query-all.js` を実行する
2. exit 0 の場合のみ後続のクエリ実行に進む
3. exit 1 の場合は AI が指示に従って headingRefs を修正し、再実行する
4. Step 5 の完了条件にも `test-query-all.js` の通過を追加する

あわせて、`test-query-all.js` がエラー時に生成する `_fix_graph_hints.json` を `update-step-status.js` cleanup の削除対象に加えることで、後始末を確実にする。

## Scope

1. **graphify-rfc.md Step 4 の全面書き換え**:
   - 現在の「最低5ノード以上実行」を廃止
   - Step 4 先頭に以下を追加:
     ```bash
     # 全 headingRefs の解決可能性を検証する（通過必須ゲート）
     node .claude/scripts/rfc-graph/test-query-all.js --graph="$graphPath" --source="$1"
     ```
   - `test-query-all.js` が exit 1 の場合のエラー時分岐:
     - エラー出力（stderr）を確認
     - 必要に応じて `query-fix-hints.js`（PX-32）で詳細情報を取得
     - `crud.js update-node` で headingRefs を修正
     - 再実行ループ:
       ```bash
       node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
       node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" reset-to-step 4
       ```
   - `test-query-all.js` が exit 0 の場合のみ後続の任意クエリに進む:
     ```bash
     # 全 headingRefs 解決確認完了。以下は必要に応じて構造クエリを実行
     node .claude/scripts/rfc-graph/query.js --graph="$graphPath" --source="$1" --id=N0001 --hops=2
     ```
   - 従来の「最低5ノード以上」の制約は削除（全 headingRefs 解決が保証された後は、AI が必要と判断したノードのみクエリすればよい）
   - AI による品質点検の5観点に以下を追加:
     - **6. headingRefs が全ノードでソースファイルに対して解決可能であるか（test-query-all.js が exit 0 であること）**

2. **graphify-rfc.md Step 5 の完了条件に test-query-all.js 通過を追加**:
   - 完了報告に以下を追加:
     ```
     - **headingRefs 解決率**: test-query-all.js が全 N 件解決確認済み
     ```

3. **update-step-status.js cleanup サブコマンドに _fix_graph_hints.json を追加**:
   - cleanup の削除対象ファイルパターンに `_fix_graph_hints.json` を追加
   - `update-step-status.js` の cleanup 実装を確認し、該当箇所を特定して追記

4. **エラー時の復帰手順の追記**:
   - 現行の「エラー時の復帰」セクションに、test-query-all.js 失敗時の具体的な復帰手順を追加:
     ```
     ### test-query-all.js 失敗時の復帰
     stderr に出力された解決不能 headingRefs の一覧を確認し、_fix_graph_hints.json の remedyHint に従って crud.js で修正する。修正後、cleanup → reset-to-step 4 で再実行する。
     ```

## Non-scope

- `test-query-all.js` / `query-fix-hints.js` の実装は含まない（PX-32）
- `query.js` の改修は含まない（PX-33）
- `update-step-status.js` の cleanup サブコマンド以外の動作変更は含まない
- 他の Step（0〜3, 5）の内容変更は含まない
- グラフスキーマの変更は含まない

## Investigation

**証拠1: graphify-rfc.md の現行 Step 4 記述**

graphify-rfc.md #L330-383:
- 「全ノードそれぞれに対して --hops=2 のマルチホップ検索を実行する。ノード数が多くとも、最低5ノード以上は実行すること。」
- 品質点検の5観点（#L352-358）に headingRefs 解決確認は含まれていない
- エラー時の復帰に「原因不明の場合、Step 4 自体を再実行」とあるが、headingRefs 解決不能の specific な手順はない

**証拠2: update-step-status.js の cleanup サブコマンド**

cleanup サブコマンドは一時ファイル（`_temp_nodes.json`, `_temp_edges.json`, `_patch_*.json` 等）を削除する。`_fix_graph_hints.json` は現在の cleanup 対象に含まれていない。

```bash
# 現在の cleanup 実行例
node .claude/scripts/rfc-graph/update-step-status.js --graphify-status="$statusPath" cleanup
```

cleanup の実装を確認し、ファイル削除パターンに `_fix_graph_hints.json` を追加する。

**証拠3: PX-32 で設計された _fix_graph_hints.json のファイルパス**

`_fix_graph_hints.json` は `test-query-all.js` がエラー時にカレントディレクトリに出力する一時ファイル。cleanup 実行時に確実に削除される必要がある。

## Test Plan

### ユニットテスト計画

1. **cleanup 対象追加のテスト**:
   - update-step-status.js cleanup 実行後に `_fix_graph_hints.json` が削除されていること
   - cleanup 実行後も他の必須ファイル（グラフJSON、ステータスJSON）は削除されないこと
   - `_fix_graph_hints.json` が存在しない状態で cleanup を実行してもエラーにならないこと（冪等性）

2. **graphify-rfc.md の可読性テスト**:
   - 新 Step 4 の手順を読んで、test-query-all.js → exit 分岐 → 任意クエリ の流れが一意に理解できること
   - エラー時の復帰手順が具体的で、AI が即座に行動に移せること

### ユニットテスト不可能な項目（例外）

- AI が test-query-all.js の出力を正しく解釈して修正できるかの動作確認は E2E（/graphify-rfc の実実行が必要）
- cleanup 統合後の /graphify-rfc 全体の動作確認は手動 E2E

## Boy Scout Rule — 翻訳可能性計画

- graphify-rfc.md の Step 4 記述は「test-query-all.js を実行する」→「exit コードで分岐する」→「修正する」→「再実行する」の流れが日本語の逐語訳として読めるように段落構成する
- エラーメッセージ例や復帰手順は具体的なコードブロックとして提示し、AI がコピペ実行できるようにする
- update-step-status.js の cleanup 実装に、削除対象ファイルパターンを定数として定義する

## Acceptance Criteria

- [ ] graphify-rfc.md Step 4 の先頭で `test-query-all.js` が実行される
- [ ] test-query-all.js が exit 1 の場合、修正手順を経て再実行ループに入ることが明記されている
- [ ] test-query-all.js が exit 0 の場合のみ後続の任意クエリに進むことが明記されている
- [ ] AI 品質点検の6観点に headingRefs 解決確認が追加されている
- [ ] Step 5 完了条件に headingRefs 解決率が追加されている
- [ ] update-step-status.js cleanup が `_fix_graph_hints.json` を削除する
- [ ] cleanup の冪等性が維持されている（存在しないファイルの削除試行でエラーにならない）
- [ ] 全テストが通過している

## Notes

- 依存関係: PX-32 と PX-33 の完了を前提とする
- 実装順序: PX-32 → PX-33（並行可能）→ PX-34（直列、上記2つの完了後）
