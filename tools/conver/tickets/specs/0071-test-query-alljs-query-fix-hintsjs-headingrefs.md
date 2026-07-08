---
ticket_id: 71
title: test-query-all.js + query-fix-hints.js — 全headingRefs解決検証スクリプト新設
slug: test-query-alljs-query-fix-hintsjs-headingrefs
status: draft
created_at: 2026-07-08
updated_at: 2026-07-08
---
# test-query-all.js + query-fix-hints.js — 全headingRefs解決検証スクリプト新設

## Summary

グラフ内の全ノードの全 headingRefs がソースファイルに対して解決可能であることを検証する `test-query-all.js` と、解決不能な参照の詳細情報を _fix_graph_hints.json から Markdown 整形して検索表示する `query-fix-hints.js` を新設する。

## Background

graphify-rfc の Step 4（自己検証）は、AI が最低5ノードに対して query.js のマルチホップ検索を実行し目視確認するのみで、**全 headingRefs の解決可能性を保証していなかった**。その結果、headingRefs がソースファイルの実際の見出しと不一致のまま放置され、AI が「グラフ構造自体には影響しない」と誤って判断して次工程に進む事例が発生した（RFC GRAPHIFY-001 実装時）。

起因となった問題点:

1. **query.js は headingRefs 解決失敗を WARN（exit 0）として扱う設計**: スクリプトのヘルプに「正常終了（マーカー欠損時も0、警告はstderr）」と明記されており、解決不能が exit 1 として上位に伝搬しない。
2. **headingRefs はスキーマ上必須フィールド**: node.schema.json で `headingRefs` は required かつ「1件以上」と定義されている。これは単なる表示用メタデータではなく、ノードと設計書のトレーサビリティを担保する最重要フィールドである。
3. **Step 4 の検証基準に headingRefs 解決確認が含まれていない**: graphify-rfc.md の 5つの検証観点は「孤立ノード」「依存関係」「kind 分類」「sourceRanges カバレッジ」「formulate 連携時の情報不足」であり、headingRefs の完全解決は含まれていない。

本チケットでは、`resolveByHeading()`（resolve-by-heading.js の公開関数）を直接利用して全 headingRefs を一括検証する専用スクリプトを新設し、graphify-rfc のパイプラインに「headingRefs 解決不能 = 通過不可」のゲートを設ける。

## Scope

- **test-query-all.js の作成**: `.claude/scripts/rfc-graph/test-query-all.js`
  - `--graph=<path> --source=<path>` を入力として受け取る
  - グラフ内の全ノードの全 headingRefs を `resolveByHeading()` で解決
  - 解決不能な参照を収集し、重複排除（nodeId + refId の組み合わせでユニーク判定）
  - 解決不能が1件でもあれば exit 1、全件解決なら exit 0
  - 成功時の stdout: 「全 N 件の headingRefs が正常解決しました」
  - 失敗時の stderr: 解決不能な参照の一覧を最大25件まで詳細出力 + 「その他 X 件」の件数
  - 失敗時に詳細情報を `_fix_graph_hints.json` に書き出す（後述の診断情報構造）

- **query-fix-hints.js の作成**: `.claude/scripts/rfc-graph/query-fix-hints.js`
  - `--hints=<path>` を入力として受け取る
  - フィルタオプション: `--id=<nodeId>`, `--diagnosis=<M0〜M10>`, `--refId=<refId>`
  - `_fix_graph_hints.json` から該当エントリを検索し、Markdown 整形して stdout に出力
  - 各エントリに診断ラベル・スコア・トークン別一致状況・示唆・修正コマンド例を含める

- **`_fix_graph_hints.json` の出力構造設計**:
  - `generatedAt`: ISO8601 タイムスタンプ
  - `totalBroken`: 総解決不能件数
  - `uniqueBroken`: 重複排除後の件数
  - `nodes[]`: 各エントリの配列（最大25件の詳細 + 残りは件数のみ）
  - 各エントリは以下を含む:
    - `nodeId`, `nodeTitle`, `refId`
    - `diagnosis`: M0〜M10 の診断ラベル
    - `score`: 一致率（0〜100%）
    - `heading`: 現在の見出しレベル
    - `texts`: 現在のトークン配列
    - `details.tokenMatches[]`: トークン別一致状況
    - `details.candidateLines[]`: ソース内の候補見出し行
    - `summary`: 1行の診断メッセージ
    - `remedyHint`: 推奨アクションの説明文
    - `remedyCommand`: crud.js の修正コマンド例（推測ベース、自動実行しない）
  - cleanup 対象として `update-step-status.js` の cleanup サブコマンドが削除するファイルパターンに `_fix_graph_hints.json` を追加するよう設計（本チケットでは設計まで、実際の cleanup 追加は PX-34）

- **診断パス（M0〜M10）の実装**:

| 診断 | 条件 | スコア条件 |
|------|------|-----------|
| M0 | 指定見出しレベルの行がソースに0件 | N/A |
| M1 | どのトークンもどの行にもマッチしない | 0% |
| M2 | 1トークンのみ一致 | 1〜25% |
| M3 | 半数未満のトークンが一致 | 26〜49% |
| M4 | 過半数のトークンが一致 | 50〜74% |
| M5 | ほぼ全トークン一致（1トークン不足） | 75〜99% |
| M6 | 全トークン一致する行が複数存在（曖昧） | 100%（複数行） |
| M7 | 全トークン一致かつ1行なのに失敗（不審） | 100%（1行） |
| M8 | 別の見出しレベルの方が高スコア | 指定レベルより別レベルが高い |
| M9 | 同一 refId 内トークンが共存不可能 | texts が排他的 |
| M10 | 上記いずれにも該当せず | — |

  各診断は以下の情報を出力する:
  - **diagnosis**: ラベル
  - **score**: 数値スコア
  - **summary**: 1行メッセージ
  - **reason**: 判断根拠の説明（なぜこの診断に至ったか）
  - **tokenMatches[]**: 各トークンの一致有無
  - **suggestion**: 示唆（状況の解釈）
  - **requiredAction**: 必要なアクション
  - **remedyHint**: crud.js 修正コマンド例

## Non-scope

- `query.js` の改修は含まない（別チケット PX-33）
- `graphify-rfc.md` の Step 4 書き換えは含まない（別チケット PX-34）
- `resolve-by-heading.js` の改修は含まない（既存関数をそのまま利用）
- `crud.js` の改修は含まない
- 既存の `query.js` が出力する headingRefs 関連 WARN の削除は含まない（PX-33）

## Investigation

**証拠1: query.js の headingRefs 解決失敗の動作**

`query.js` 546-560行:
```javascript
for (const vNode of visitedNodes) {
  if (!Array.isArray(vNode.headingRefs)) continue;
  for (const hr of vNode.headingRefs) {
    const resolved = resolveCurrentLines(sourceText, vNode.headingRefs, hr.refId);
    if (!resolved) {
      process.stderr.write(`[WARN] ...`);
      hasHeadingRefWarning = true;
    }
  }
}
```

終了コード: `process.exit(EXIT_SUCCESS)` で終了（582行）。ヘルプ明記: 「正常終了（マーカー欠損時も0、警告はstderr）」。

**証拠2: 現実の障害事例**

2026-07-08、/graphify-rfc 実行中に query.js が `--id=N0113 --hops=2` で複数の headingRefs 解決不能 WARN を出力したが、AI が「グラフ構造自体には影響しません」と判断して次工程に進んだ。実際の出力（抜粋）:
```
[WARN] ノード N0162 の refId REF164 の見出しがソースファイル内に見つかりません。
[WARN] ノード N0001 の refId REF001 の見出しがソースファイル内に見つかりません。
（他多数）
```

**証拠3: headingRefs はスキーマ上必須フィールド**

node.schema.json で `headingRefs` は required フィールドであり、型は `array`、最小1件。トレーサビリティの根幹。

**証拠4: 全 headingRefs が現時点で解決可能であることの確認**

```javascript
// 2026-07-08 確認
const g = require('.../RFC-ROOT-GRAPH.json');
const { resolveByHeading } = require('.../resolve-by-heading.js');
let failCount = 0, total = 0;
for (const node of g.nodes) {
  for (const hr of (node.headingRefs || [])) {
    total++;
    if (!resolveByHeading(sourceLines, hr.heading, hr.texts)) failCount++;
  }
}
// 結果: total=170, failCount=0
```

ただしこれは手動確認であり、パイプラインとして自動検証する仕組みが存在しない。

**証拠5: resolve-by-heading.js の `resolveByHeading()` は公開関数として export 済み**

```javascript
module.exports = { resolveByHeading, resolveAllHeadings, parseArguments };
```

test-query-all.js から直接 `require()` して利用可能。

## Test Plan

### ユニットテスト計画

1. **test-query-all.js の単体テスト**:
   - 正常系: 全 headingRefs が解決可能なグラフ → exit 0, stdout に成功メッセージ
   - 異常系: 一部の headingRefs が解決不能なグラフ → exit 1, stderr にエラー一覧
   - 異常系: 全 headingRefs が解決不能なグラフ → exit 1, 最大25件まで詳細表示 + 残り件数
   - 境界値: 解決不能がちょうど25件 → 全件詳細表示、26件 → 25件詳細 + 「その他1件」
   - 境界値: 解決不能が0件 → 正常終了
   - 重複除去: 同一ノード+同一 refId の重複エントリが正しく1件にまとまること
   - 重複除去: 異なる nodeId の同一 heading は別エントリとして扱うこと
   - CLI: `--graph` のみ指定で `--source` なし → エラー終了
   - CLI: `--source` のみ指定で `--graph` なし → エラー終了
   - CLI: 存在しないファイルパス → エラー終了
   - モック不要（fs.readFileSync + resolveByHeading のみ）

2. **query-fix-hints.js の単体テスト**:
   - 正常系: 全件表示（`_fix_graph_hints.json` からの整形出力）
   - フィルタ: `--id=N0100` で特定ノードのみ表示
   - フィルタ: `--diagnosis=M1` で特定診断種別のみ表示
   - フィルタ: `--refId=REF101` で特定 refId のみ表示
   - 空: 空の hints ファイル → 「該当するエントリがありません」
   - 存在しないファイルパス → エラー終了
   - 不正な JSON ファイル → エラー終了

3. **診断ロジック（resolveByHeading のラッパー）の単体テスト**:
   - M0: heading=2, texts=["存在しない見出し"] → 診断 M1（0%一致）
   - M5: heading=2, texts=["34.", "観測性"]（「34. 観測性」が「34. Observability」に変更） → 診断 M5 or M3（1/2一致で50%）
   - M9: heading=2, texts=["34.1 tracing","34.2 metrics"]（2行に分散） → 診断 M9
   - M8: texts がレベル3に完全一致するが heading=2 指定 → 診断 M8

### ユニットテスト不可能な項目（例外）

- 実際の巨大グラフファイルに対する E2E テストは手動（実グラフ読み込みが必要だが、テスト用グラフJSONを手作りすれば単体テストで代用可能）
- cleanup 統合の動作確認は PX-34 の実装完了後に E2E で確認

## Boy Scout Rule — 翻訳可能性計画

- 全関数は動詞句の関数名とし、一関数一責務を徹底する
- 診断分岐（M0〜M10）はそれぞれ独立した関数に分割する（`diagnoseByScore()`, `diagnoseByLevelMismatch()` 等）
- ハードコードされたメッセージ文字列はすべて名前付き定数オブジェクトとして集約する
- 出力フォーマットはテンプレート関数で統一する
- `_fix_graph_hints.json` のファイルパスは定数化し、スクリプト内にベタ書きしない
- 25件の上限値、件数閾値（1/25/50/74/99%）はすべて名前付き定数として定義する

## Acceptance Criteria

- [ ] `test-query-all.js` が全 headingRefs 解決時は exit 0、1件でも解決不能時は exit 1 を返す
- [ ] 解決不能な参照の一覧が重複排除され、最大25件まで詳細表示 + 残り件数表示される
- [ ] 診断（M0〜M10）が適切に分類され、トークン別一致状況・示唆・修正コマンド例を含む
- [ ] 失敗時に `_fix_graph_hints.json` が正しい構造で出力される
- [ ] `query-fix-hints.js` が `_fix_graph_hints.json` からフィルタ検索し Markdown 整形表示できる
- [ ] 全フィルタオプション（--id / --diagnosis / --refId）が正しく動作する
- [ ] テストが新設され、通過している
- [ ] 既存テストがすべて通過している（回帰なし）

## Notes

- 依存関係: PX-33 は本チケットと独立（並行作業可能）、PX-34 は本チケットと PX-33 の完了を前提とする
- cleanup 統合は PX-34 で行う。本チケットでは `_fix_graph_hints.json` のファイルパス定数のみ定義する
