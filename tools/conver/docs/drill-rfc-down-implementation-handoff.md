# drill-rfc-down 実装引き継ぎガイド（勘所）

> このドキュメントは、`/drill-rfc-down` の完全再実装を **別の AI が引き継いで1ステップずつ丁寧に進めるため** のハンドオフ資料。
> 2026-08-20 時点の状態を記録する。

## 1. 目的と位置づけ

`/drill-rfc-down` は conver の **進化ループ（再投資）の心臓部**。

- 入力: crystalize の RESIDUE（README.md 内 `<::README-RESIDUE::>` / `<::EXAMPLES-RESIDUE::>`）・ユーザーとの自由会話・与えられた資料
- 内部で **grill → graphify → boundify → split を「差分」として実行**
- 正典 RFC ・ `*-GRAPH.json` ・ `*-Dirs-Tree.json` ・ `Tickets.json` を **矛盾なくロックステップで進化**させ、積み増しチケットを実装ループへ渡す
- **5つの整合性**（正典RFC / GRAPH / Dirs-Tree / 実装 / テスト）を壊さないことが絶対条件

旧版 `drill-rfc-down.md` は「grill で RFC に追記するだけ」であり README の進化ループ要件を満たさないため **完全廃止予定**。旧版は `.claude/commands/drill-rfc-down-old.md` にバックアップ済み（grill 手続きの参照用として残す）。

## 2. 現状（2026-08-20 時点）

| ファイル | 状態 |
|----------|------|
| `.claude/commands/drill-rfc-down.md` | 骨格完成。YAML / Role / Arguments / Workflow（Step 0〜5 見出し＋説明） |
| `.claude/commands/drill-rfc-down-old.md` | 旧版バックアップ |
| `.claude/scripts/drill-rfc-down/preflight.cjs` | **Step 0 実装済み・テスト済み**（PX-157 で ESM 共存のため `.cjs` にリネーム） |
| `tests/drill-rfc-down/preflight.test.cjs` | 32 テスト Green |
| `Makefile` | `test-drill-rfc-down` ターゲット追加済み |
| `docs/drill-rfc-down-implementation-handoff.md` | 本ドキュメント |

**残タスク**: Step 1（grill）→ Step 2（graphify）→ Step 3（boundify）→ Step 4（split）→ Step 5（verify）→ Script List 記入。

## 3. 開発の進め方（最重要）

1. **一度に1ステップのみ**。一気に完成させようとしない。急がない。
2. 各ステップで **設計計画をユーザーに提示 → 承認 → TDD 実装 → 検証報告**。ユーザーは設計判断（特に安全策・フォールバック方針）を確認する。
3. **TDD Red → Green → Refactor 厳守**（Supreme Law）。テストが先、実装が後。
4. **コマンドファイルは簡潔に**。Step 0 の流儀＝「実行は1行のスクリプト呼び出し＋短い説明」だけを書き、詳細仕様はスクリプト本体＋JSDoc＋テスト＋本ドキュメントに置く。
5. **車輪の再発明禁止**。既存スクリプト（grill-me-for-rfc / rfc-graph / crystalize-readme / tickets）を最大限再利用する（第4節）。
6. 検証コマンド（毎ステップ実施）:

   ```bash
   node --test "tests/drill-rfc-down/*.test.cjs"
   node .claude/scripts/tickets/review/run-quality-checks.js <対象js>
   node .claude/scripts/tickets/review/find-all-stubs.js <対象dir>
   .claude/scripts/tickets/scan-crimes.sh
   ```

7. **品質チェッカー指摘はコード修正のみで解決**（ゼロトレランス）。`totalIssues: 0` まで。
8. `[::STUB::]` マーカー絶対義務・犯罪ゼロ維持。不完全実装を残さない。
9. 言語: チャット＝日本語 / コードコメント・設計＝英語（技術用語は英語のまま）/ 本ドキュメント＝日本語。

## 4. 再利用すべき既存部品

| 用途 | 場所 | 備考 |
|------|------|------|
| grill 機構 | `.claude/scripts/grill-me-for-rfc/`（`init.js`, `init-for-drill-rfc-down.js`, `update-tree.js`, `update-status.js`, `validate-question-format.js`, `generate-checklist.js`, `check-all-schema.js`, `tree-query.js`, `list-files.js`, `extract-io-boundary.js`, `insert-io-boundary-template.js`, `check-io-stubs.js`） | Step 1 で必須 |
| グラフ CRUD | `.claude/scripts/rfc-graph/crud.js` | **唯一の書き込み経路**。Step 2 で必須 |
| graphify 検証 | `.claude/scripts/rfc-graph/`（`verify.js`, `deduplicate-headings.js`, `resolve-by-heading.js`, `query.js`, `validate-slug.js`, `show-graph-summary-markdown.js` 等） | Step 2 |
| boundify | `.claude/scripts/rfc-graph/`（`boundify-graph-to-dirs.js`, `validate-dirs-tree-schema.js`, `verify-graph-integrity.js`, `generate-all-dir-templates.js`, `generate-dir-template.js` 等） | Step 3 |
| split / phasify | `.claude/scripts/rfc-graph/`（`phasify-graph-and-dirs-files-tree.js`, `consolidate-phase-tickets.js`, `update-split-step-status.js` 等） | Step 4 |
| パス解決 | `.claude/scripts/tickets/resolve-ticket-context.js` の `resolveRfcPaths` ／ `.claude/scripts/drill-rfc-down/preflight.cjs` の `resolvePipelinePaths` | resolvedPaths 優先 → metadata.source フォールバック |
| テストパターン | `tests/crystalize-readme/derive-output-paths.test.cjs`（spawnSync CLI + 関数直叩き）／ `tests/drill-rfc-down/preflight.test.cjs`（Step 0 の実例） | 全ステップの型 |

## 5. Step 1: grill（勘所）

**目的**: 資料・README.md 内の RESIDUE・事前会話を**完全に理解**し、grill 方式の質問攻めで進化内容を確定する。**このステップで RFC ファイルへの編集が完了する**。実装済み（PX-157/158/159）。

**構造**: Step 1 は **1-1〜1-12 のサブステップ**として `.claude/commands/drill-rfc-down.md` に定義済み。各サブステップは目的＋1行スクリプト呼び出し＋`update-status.js set-step` で構成され、AI が次にすべき行動を英語で常時把握できる。

**スクリプト対応**（全て `$DRILL_DIR` 配下・drill 自己完結）:

| サブステップ | スクリプト | 役割 |
|---|---|---|
| 1-1 | `session-init.js` | `$SESSION_DIR` 生成・Status/DesignTree/CheckList 初期化/継続 |
| 1-2 | `rfc-evolution.js capture` | RFC 編集前スナップショット（baseline.json） |
| 1-4 | `update-tree.js add` | DesignTree 初期ノード生成 |
| 1-5 | `validate-question-format.js` + `update-tree.js resolve` | 厳密 grill（4点構造質問・ゲート必須） |
| 1-6 | `update-tree.js open-count` + set-state | 終了判定 |
| 1-7 | `generate-checklist.js` | CheckList 生成・承認 |
| 1-11 | `rfc-evolution.js verify` | **安全策**: append-only ゲート・delta 抽出・well-formedness・矛盾候補 |
| 1-12 | `check-all-schema.js` + `rfc-evolution.js clean` | 完了宣言 |

**RFC 編集の安全策**: `rfc-evolution.js`（PX-158）が機械検証する。
- **append-only ゲート**: baseline 全行が現在の RFC に順序部分列として存在（削除・改変・並べ替え=違反）
- **delta 抽出**: `$SESSION_DIR/delta.json`（heading+lineRange 付きセクション）を Step 2 が消費
- **well-formedness**: TBD/TODO/スタブ/`[::IO-INFO-STUB::]` 残0・I/O 境界情報必須
- **矛盾候補**: 新セクション見出し × GRAPH/Dirs-Tree/Tickets のトークン重複（AI が最終判断）

**進捗管理**: `update-status.js`（PX-158）が Step 1〜5 全体のステップ定義テーブル（`STEP_DEFINITIONS`）でサブステップを管理。常に currentStep + 英語 nextAction を出力。Step 2〜5 はプレースホルダとして登録済み（次フェーズのチケットで gate を埋める）。

## 6. Step 2: graphify（勘所）

**目的**: Step 1 で確定した進化を既存 `*-GRAPH.json` に反映し、GRAPH を完全に正しい状態に**保証**する。

- `crud.js` 経由のみでノード・エッジを追加・編集（唯一の書き込み経路を守る）。
- グラフ検証（`verify.js` 等）を実行し**全項目通過**させる（孤立ノード・未カバー行・headingRefs 解決・一意性）。
- 破壊・矛盾・危険ゼロをスクリプトで保証する安全策を設計。

## 7. Step 3: boundify（勘所）

**目的**: 確定した進化を `*-Dirs-Tree.json` と `src` 内のディレクトリ・ファイルに反映。**この時点で GRAPH / Dirs-Tree 間の全矛盾・破壊を解消**する。

- `boundify-graph-to-dirs.js` / `validate-dirs-tree-schema.js` / `generate-dir-template.js` 等を再利用。
- 宣言スタブ（実装のない空ファイルへの付与）・**Prose 除外**（rationale / glossary / requirement はファイル生成対象外）・**Prune 規則**（子2未満は除去・単一子は平坦化）・循環依存検出に注意。
- 破壊的変更を防ぐスクリプト安全策を設計。

## 8. Step 4: split（勘所）

**目的**: 確定した進化を `Tickets.json` に反映（**チケットの編集・積み増し**）。**この時点で GRAPH / Dirs-Tree / Tickets 間の全矛盾・破壊を解消**する。

- `phasify-graph-and-dirs-files-tree.js` 等を再利用して新規ノード群をフェーズ割当。
- **既存チケットの status を保全**（todo/made/planned/done/reviewed/`R<N>` を壊さない）。ラウンド管理（`R<N>`）・phaseId 採番に注意。
- `tickets-schema.json` でのスキーマ検証＋GRAPH / Dirs-Tree との整合性検証。
- 破壊的変更を防ぐスクリプト安全策を設計。

## 9. Step 5: verify（勘所）

**目的**: 5つの整合性（正典 RFC / GRAPH / Dirs-Tree / 実装 / テスト）を**スクリプト＋AI の厳格な基準による解析**で検査する。

- 検査項目・合格基準を各整合性ごとに定義し、スクリプト検証と AI 解析の両輪で突破する。
- ⚠ **ループバック先は Step 2（ユーザー指定。Step 1 ではない）**。検査を完全に突破できない場合は Step 2 に戻って修正するブロッキングループ。
- ループの収束判定・再実行条件・報告方法を設計。

## 10. Script List 記入（最後に実施）

全 Step 実装完了後、`drill-rfc-down.md` の `## Script List` セクション（現在は「最後に書くので、まだ書かないこと」）に、各 Step で使用するスクリプト一覧を記入する。

## 11. Step 0 実装の実例（次ステップの参考）

Step 0 は「設計計画 → ユーザー承認 → TDD」の流れで完了済み。次のステップの雛形として参照すること。

- **関数分割**（`preflight.js`）: `parseArguments` / `collectMaterialPaths` / `collectFilesRecursive` / `readTickets` / `resolvePipelinePaths` / `verifyExistence` / `formatResolutionErrorMessage` / `formatPreflightMarkdown` / `formatAbortMessage` / `main`。純粋関数を分離して個別テスト可能に。
- **テスト構成**（32 件）:
  `parseArguments` 6 / `collectMaterialPaths` 6 / `readTickets` 3 / `resolvePipelinePaths` 7 /
  `verifyExistence` 1 / `formatPreflightMarkdown` 2 / `formatAbortMessage` 1 / `CLI` 6。
  tmpdir（`os.tmpdir()` + `mkdtempSync`）を `before`/`after` で生成・削除し、
  `spawnSync` で CLI（exit code / stdout / stderr）を検証。
- **品質チェッカー対応例**: 単一文字変数（`f`→`filePath`）/ 多引数関数（`formatPreflightMarkdown` を `pipeline` オブジェクトへ集約）。

## 12. 設計判断の既決定事項（再検討しない）

- **パス解決**: `metadata.resolvedPaths`（rfcPath / graphPath / dirsTreePath）優先 → 欠落時 `metadata.source` から導出フォールバック（`.md`→同名 `-GRAPH.json`/`-Dirs-Tree.json`、`.json`→`-GRAPH` 逆変換）→ 両方不可なら中断。`~/` 展開・Tickets.json ディレクトリ基準。
- **資料ディレクトリ**: 再帰走査して 0 ファイルなら**失敗**。
- **資料 0 個**: **成功**（RESIDUE＋会話のみで進行可能）。
- **README.md**: カレントディレクトリの `README.md` 固定。
- **終了コード**: 0 = 成功 / 1 = 失敗（エラー文言＋中断指示は stderr）。
- **未知フラグ**（`-`/`--` 始まり）: 失敗（Arguments 契約「他の引数種は存在しない」を反映）。

## 13. 参考リソース

- conver 全体設計: `tools/conver/README.md`（特に「進化ループ」「/drill-rfc-down — 進化の扉」「5つの整合性」）
- 旧版 drill（grill 手続きの参照）: `.claude/commands/drill-rfc-down-old.md`
- grill の正式手順: `.claude/commands/grill-me-for-rfc.md`
- graphify / boundify / split の正式手順: `.claude/commands/graphify-rfc.md` / `boundify-graph.md` / `split-to-tickets.md`
