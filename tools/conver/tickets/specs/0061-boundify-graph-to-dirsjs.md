---
ticket_id: 61
title: boundify-graph-to-dirs.js メインスクリプト統合
slug: boundify-graph-to-dirsjs
status: draft
created_at: 2026-07-07
updated_at: 2026-07-07
---
# boundify-graph-to-dirs.js メインスクリプト統合

## Summary

P17〜P20 で実装された全下位層（boundify-helpers.js、boundify-tree.js、validate-dirs-tree-schema.js、generate-dir-template.js）を統合し、単一の CLI エントリポイント `boundify-graph-to-dirs.js` を完成させる。引数パース・グラフ読込・3言語ツリー生成・エッジ投影・循環検出・Dirs-Tree.json 構築・ファイル書き出しを一貫したパイプラインとして結合する。3つの出力モード（--json／--quiet／デフォルトMarkdown）を制御する。

## Background

RFC-BOUNDIFY.md §4.2「boundify-graph-to-dirs.js — メインスクリプト」に基づく。

Boundify パイプラインの全工程を統括するメインスクリプトが必要である。既存の下位層は以下の通り独立して実装済み：

| チケット | 実装物 | 役割 |
|---------|--------|------|
| P17-1 | boundify-helpers.js | 純粋関数群（inferLanguage, graphToLangJson, tarjanSCC, titleToFileName, deduplicateFileNames, SCHEMA） |
| P18-1 | boundify-tree.js | ディレクトリツリー生成（buildDomainHierarchy, buildDirectoryTree, generateReport） |
| P19-1 | validate-dirs-tree-schema.js | Dirs-Tree.json スキーマ検証 |
| P20-1 | generate-dir-template.js | 実ディレクトリ/ファイル生成（dry-run兼） |

これらのモジュールを一つのスクリプトに統合し、CLI として動作可能にする。なお、RFC §4.2 の擬似実装は単一ファイルとして記述されているが、本実装では既存の下位層モジュールを `require()` で読み込む方式を採用する。

**注意**: `boundify-helpers.js` と `boundify-tree.js` の全関数は既に P17-1/P18-1 で実装済みである。RFC §4.2 のコードは設計上の参考実装であり、本メインスクリプトは既存の下位層を require して利用する。**RFC をそのままコピーせず、既存モジュールを import して使用すること。**

## Scope

1. `boundify-graph-to-dirs.js` スクリプトの新規作成（配置先: `.claude/scripts/rfc-graph/`）
2. `parseArguments(testArgs?)` — 引数パース（graphPath, graphDir, basename, flags の抽出）
3. `loadGraph(graphPath)` — グラフJSONの読み込みとバリデーション（nodes/edges 必須チェック）
4. `main(testArgs?)` — 全工程統合:
   - 既存 `boundify-helpers.js` からの `inferLanguage()` 適用 → GRAPH-LANG 拡張
   - 既存 `boundify-tree.js` からの `buildDirectoryTree()` を3言語（rust/go/typescript）で実行
   - 既存 `boundify-helpers.js` からの `projectEdgesToDirectories()` + `tarjanSCC()` で依存解析
   - Dirs-Tree.json 構築（schemaVersion, generatedAt, analysis, trees, dependencyDirections, warnings）
   - スキーマ検証（validate-dirs-tree-schema.js の関数を require して呼び出し）
   - 3ファイル出力: `<basename>-Dirs-Tree.json`, `<basename>-GRAPH-LANG.json`, `<basename>-BOUNDIFY-Status.json`
   - 3出力モード: `--json`（JSONのみstdout）、`--quiet`（stdout抑制）、デフォルト（.en.md + Markdown + JSONブロック）
5. `module.exports` で全関数を露出（テストから呼び出し可能に）
6. テストファイルの作成（boundify-graph-to-dirs.test.cjs）

## Non-scope

- P17-1（boundify-helpers.js）、P18-1（boundify-tree.js）の関数定義修正
- P19-1（validate-dirs-tree-schema.js）、P20-1（generate-dir-template.js）の修正
- P21-2（update-step-status.js --status= フラグ拡張 + スラッシュコマンド定義）
- crud.js, verify.js, query.js 等の既存グラフ管理スクリプト
- 既存のテストファイル（boundify-helpers.test.cjs, boundify-tree.test.cjs）

## Investigation

RFC-BOUNDIFY.md §4.2 より、メインスクリプトの完全な実装仕様を確認した。

### RFC §4.2 と既存下位層の対応関係

| RFC §4.2 の関数 | 実際の実装 | 呼び出し方式 |
|----------------|-----------|-------------|
| `inferLanguage(node)` | `boundify-helpers.js` `inferLanguage` (L136) | 直接 require |
| `buildDomainHierarchy(graph)` | `boundify-tree.js` `buildDomainHierarchy` (L59) | 直接 require |
| `buildDirectoryTree(graph, lang)` | `boundify-tree.js` `buildDirectoryTree(graph, lang, helpers)` (L175) | アダプター経由（helpers 注入） |
| `projectEdgesToDirectories(graph, nodeToDir)` | `boundify-helpers.js` `projectEdgesToDirectories(graphEdges, nodeToDirMap)` (L234) | アダプター経由（graph.edges 抽出） |
| `tarjanSCC(dirEdges)` | `boundify-helpers.js` `tarjanSCC(dirEdges)` (L271) | 直接 require |
| `validateDirsTree(dirsTree, graph)` | `validate-dirs-tree-schema.js` 検証ロジック | require して関数呼び出し |
| `generateReport(graph, dirsTree, lang)` | `boundify-tree.js` `generateReport` (L405) | 直接 require |
| `generateDeclarationStub(dirNode, lang)` | `boundify-tree.js` `generateDeclarationStub` (L359) | 直接 require |

### RFC §4.2 の main() フロー（RFC 1222〜1322行目）

```
1. parseArguments(testArgs) → {graphPath, graphDir, basename, flags}
2. loadGraph(graphPath) → graph
3. 全ノードに inferLanguage を適用 → langGraph
4. 3言語（rust/go/typescript）ループ:
   a. buildDirectoryTree(langGraph, lang) → {tree, nodeToDir}
   b. projectEdgesToDirectories(graph, nodeToDir) → dirEdges
   c. tarjanSCC(dirEdges) → cycles
5. Dirs-Tree.json 構築（schemaVersion/generatedAt/analysis/trees/dependencyDirections/warnings）
6. validateDirsTree(dirsTree, langGraph) → スキーマ検証
7. 3ファイル出力
8. stdout 3分岐（--json / --quiet / デフォルト）
```

### 既存モジュールの関数シグネチャ差異（アダプター必要箇所）

- **`boundify-tree.js` の `buildDirectoryTree(graph, lang, helpers)`**: 第3引数 `helpers` に `{titleToFileName, deduplicateFileNames}` を渡す必要がある。RFC のシグネチャ `buildDirectoryTree(graph, lang)` とは異なる。
- **`boundify-helpers.js` の `projectEdgesToDirectories(graphEdges, nodeToDirMap)`**: 第1引数がエッジ配列（`graph.edges`）。RFC の `projectEdgesToDirectories(graph, nodeToDir)` と異なる。
- **`boundify-helpers.js` の `graphToLangJson(graph, inferFn?)`**: `{nodes, edges, languageMap}` を返す。RFC §4.2 main() では手動で `inferLanguage` を全ノードに適用している。どちらを採用するか設計判断。
- **`SAFE_BOUNDARIES_EN_TEXT`**: 既に `boundify-helpers.js` (L112) に定義済み。RFC §4.2 の main() 内でも使用されているので、既存定数を require して流用する。

### 統合設計判断

| 判断項目 | 決定 | 理由 |
|---------|------|------|
| GRAPH-LANG 生成方式 | `graphToLangJson(graph)` を使用 | 既存実装を流用、DRY |
| `buildDirectoryTree` 呼び出し | アダプター関数で `helpers` を注入 | P18-1 のシグネチャを尊重 |
| `projectEdgesToDirectories` 呼び出し | アダプター関数で `graph.edges` を抽出 | P17-1 のシグネチャを尊重 |
| SAFE_BOUNDARIES_EN_TEXT | `boundify-helpers.js` の定数を require | 一元管理、重複防止 |
| スキーマ検証 | `validate-dirs-tree-schema.js` を require して関数呼び出し | 子プロセスより高速、エラー伝播が容易 |

## Test Plan

### ユニットテスト計画

`tests/rfc-graph/boundify-graph-to-dirs.test.cjs` に以下のテストを実装する。

テスト対象関数：

| 関数 | テストケース |
|------|-------------|
| `parseArguments(testArgs)` | 正常系: graphPath + 各種フラグのパース<br>正常系: グラフパスの絶対パス変換<br>正常系: basename から -GRAPH 接尾辞除去<br>正常系: basename に -GRAPH がない場合のフォールバック<br>正常系: 全フラグ（--json, --quiet, --dry-run, --force）の組み合わせ<br>異常系: 引数なし → process.exit<br>異常系: --help/-h → usage 表示後に exit<br>異常系: 存在しないパス → エラー後に exit |
| `loadGraph(graphPath)` | 正常系: 有効 JSON のパース<br>正常系: nodes/edges 存在チェック通過<br>異常系: ファイル読込エラー → exit<br>異常系: JSON パースエラー → exit<br>異常系: nodes 配列欠落 → exit<br>異常系: edges 配列欠落 → exit |
| `main(testArgs)` | 正常系: 3ファイル出力（Dirs-Tree.json, GRAPH-LANG.json, BOUNDIFY-Status.json）<br>正常系: デフォルト出力（.en.md + Markdown + JSONブロック）<br>正常系: --json フラグで JSON のみ stdout<br>正常系: --quiet フラグで stdout 抑制<br>正常系: 3言語のツリーが正しく生成される<br>正常系: 循環依存を検出し warnings に記録<br>異常系: 引数なし → エラー終了<br>異常系: 破損JSON → エラー終了 |

モック方針:
- `fs.readFileSync`: グラフJSON読み込み
- `fs.writeFileSync`: ファイル書き出しを spied（3ファイルパス確認）
- `process.exit`: スパイしてスローに変換
- `process.argv`: 直接注入のためモック不要

テスト用グラフデータ（3パターン）:
- 最小グラフ: nodes 1件 + edges 0件
- 標準グラフ: nodes 5件 + part_of/depends_on エッジ数件
- 循環依存グラフ: nodes 3件 + 循環エッジ

カバレッジ目標: 80%（main() の3出力モード分岐 + アダプター関数をカバー）

### ユニットテスト不可能な項目（例外）

- 巨大グラフ（1000ノード級）のパフォーマンス: 実運用時に測定
- generate-dir-template.js との連携（Step 5 ファイル生成）: P21-2 のスコープ
- 実 TTY での実行体験: E2E で確認

## Boy Scout Rule — 翻訳可能性計画

1. **関数名は動詞句**: RFC の命名 `parseArguments()`, `loadGraph()`, `main()` を踏襲。内部アダプター関数は処理内容を語る命名（`adaptBuildDirectoryTree()`, `adaptProjectEdges()` 等）
2. **一関数一責務**: 引数パース・読込検証・言語推定・ツリー生成・エッジ投影・ファイル書出・stdout制御を独立関数に分割
3. **定数化**: EXIT_SUCCESS/EXIT_FAILURE、言語リスト、エラーメッセージテンプレートは const 定義
4. **既存モジュールの関数シグネチャ差異に対応する薄いアダプター関数**を明示的に設け、変換ロジックを一箇所に集約
5. **エラー握りつぶし禁止**: 全 try-catch でエラーを捕捉し、3段テンプレート（メッセージ+原因+対応）で報告
6. **コメントは「なぜ」**: main() 内の3出力モード分岐の設計意図（人間可読性 vs 機械処理）を説明

## Acceptance Criteria

- [ ] `boundify-graph-to-dirs.js` が新規作成され、CLI 引数で動作する
- [ ] `parseArguments()` が graphPath/graphDir/basename/flags を正しく抽出する
- [ ] `loadGraph()` がグラフJSONを読み込み、nodes/edges をバリデーションする
- [ ] `main()` が3ファイル（Dirs-Tree.json / GRAPH-LANG.json / BOUNDIFY-Status.json）を出力する
- [ ] `--json` フラグで JSON のみを stdout に出力する
- [ ] `--quiet` フラグで stdout を抑制する
- [ ] デフォルトモードで .en.md + Markdown分析 + JSONブロックを出力する
- [ ] 循環依存を検出し、warnings に記録する
- [ ] スキーマ検証エラーで適切に停止する（終了コード1）
- [ ] 既存モジュール（boundify-helpers.js, boundify-tree.js）を require で呼び出す
- [ ] 既存テストに回帰がない
- [ ] ユニットテストが全ケース PASS する（カバレッジ 80% 以上）
- [ ] `[::STUB::]` マーカー未付与の不完全実装がない

## Notes

### 依存関係

- P17-1（先行: boundify-helpers.js — 純粋関数群）
- P18-1（先行: boundify-tree.js — ディレクトリツリー生成）
- P19-1（先行: validate-dirs-tree-schema.js — スキーマ検証）
- P20-1（先行: generate-dir-template.js — テンプレートファイル生成）
- P21-2（後続: update-step-status.js フラグ拡張 + スラッシュコマンド定義）

### 配置先

- スクリプト本体: `.claude/scripts/rfc-graph/boundify-graph-to-dirs.js`
- テストファイル: `tests/rfc-graph/boundify-graph-to-dirs.test.cjs`

### 作業制約

- tools/conver/.claude/ 内に限定して作業
- 既存ファイル（boundify-helpers.js, boundify-tree.js, validate-dirs-tree-schema.js, generate-dir-template.js, crud.js, verify.js, query.js 等）への変更禁止
- P21-2 の update-step-status.js 改修は本チケットのスコープ外
- generate-dir-template.js との連携（Step 5）は P21-2 のスコープ

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
