---
ticket_id: 39
title: find-omissions ワークフローへの Goal Gate 統合
slug: find-omissions-goal-gate
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# find-omissions ワークフローへの Goal Gate 統合

## Summary

P9-1 で実装した Step 4（機械的フィルタリング）パイプラインを既存の find-omissions ワークフローに統合する。
create-omissions.js の steps 配列への Step 4 追加、find-omissions-for-next-rfc.md への Step 4 セクション追記は
P9-1 の過程で既に実施済みである。本チケットでは残る結合テストと Makefile 統合を完了する。

## Background

P9-1 で 3 つの決定論的フィルタリングスクリプト（dedup → materiality → diminishing）と
パイプライン結合（run-step-3.5.js）が実装された。これらのスクリプトは find-omissions ワークフローの
Step 4 として機能する。調査の結果、create-omissions.js の steps 配列への Step 4 追加と
find-omissions-for-next-rfc.md への Step 4 セクション追記は P9-1 の過程で既に実施済みであることが確認された。
本チケットでは残る結合テストと Makefile 統合に集中する。

## Scope

1. ✅ ~~scripts/tickets/create-omissions.js: steps 配列に 4 を追加（3c-2 と 5 の間）~~ → 既に P9-1 で実施済み
2. ✅ ~~.claude/commands/find-omissions-for-next-rfc.md: Step 4 セクション追記 + Step 5 注記修正~~ → 既に P9-1 で実施済み
3. **tests/goal-gate-integration.test.cjs**: パイプライン + find-omissions ワークフローの結合テスト（新規）
4. **Makefile: test-conver ターゲットに結合テスト追加**

## Non-scope

- スクリプト本体（dedup, materiality, diminishing）の変更 — P9-1 で完了
- run-step-3.5.js 自体の変更 — P9-1 で完了
- find-omissions-for-next-rfc.md への追記 — 既に実施済み
- create-omissions.js の変更 — 既に実施済み

## Investigation

### 証拠 1: create-omissions.js は既に Step 4 を含む

`create-omissions.js:29`:
```javascript
const SKELETON_STEPS = [
  ...
  {"id":"4","label":"機械的フィルタリング","status":"todo"},  // ← 既に存在
  {"id":"5","label":"発見漏れ確認","status":"todo"},
  ...
];
```

`create-omissions.js:57`（SKELETON_STEPS_CHECK_FINAL も同様）:
```javascript
  {"id":"4","label":"機械的フィルタリング","status":"todo"},  // ← 既に存在
```

### 証拠 2: find-omissions-for-next-rfc.md は既に Step 4 セクションを含む

`find-omissions-for-next-rfc.md:266-283`:
```markdown
### Step 4: 機械的フィルタリング

全比較ステップ完了後、発見・記録された全 omission に対して機械的フィルタリングを実行する。
3つの決定論的スクリプトが直列パイプラインとして動作し、重複排除・Goal阻害度評価・発散傾向判定を自動処理する。

```bash
# B-1: 過去との重複排除
node .claude/scripts/tickets/dedup-omissions-by-history.js "$OMISSIONS_PATH"
# B-2: Goal 阻害度評価
node .claude/scripts/tickets/materiality-filter.js "$OMISSIONS_PATH" "$RFC_PATH"
# B-3: 発散傾向判定
node .claude/scripts/tickets/diminishing-returns.js "$OMISSIONS_PATH"
```
```

Step 5（発見漏れ確認）も既に機械的フィルタリングを参照している:
```
Step 4 の機械的フィルタリングによる出力（pendingForAI に分類された omission）を制約として受け入れる
```

### 証拠 3: 結合テストファイルは未作成

```bash
$ ls tests/goal-gate-integration.test.cjs
ls: tests/goal-gate-integration.test.cjs: No such file or directory
```

### 証拠 4: Makefile の test-conver ターゲットにパイプライン関連テストが未追加

`Makefile:21`:
```makefile
test-conver:
	npx tsc && node --experimental-test-module-mocks --test dist/error.test.js ... tests/merge-omissions-into-root-rfc.test.cjs
```

P9-1 で作成された以下のテストファイルが test-conver ターゲットに含まれていない:
- `tests/dedup-omissions-by-history.test.cjs`
- `tests/materiality-filter.test.cjs`
- `tests/diminishing-returns.test.cjs`
- `tests/pipeline-merge.test.cjs`

### 証拠 5: 前提チケット P9-1 は reviewed（完了済み）

P9-1 は全32テスト PASS、品質チェック issues 0、犯罪 0 件で完了している。

## Test Plan

### ユニットテスト計画

#### tests/goal-gate-integration.test.cjs（新規）

既存のパイプラインテスト（pipeline-merge.test.cjs）は runPipeline の内部整合性を検証している。
本結合テストは find-omissions ワークフロー内でのパイプライン呼び出しを想定した統合テストとする：

**Case 1: 正常系 — 全3スクリプトの直列実行と結果の一貫性**
- 入力: テスト用 OMISSIONS JSON（複数の omission を含む）+ テスト用 RFC
- 期待: dedup → materiality → diminishing が順に実行され、各段階の出力が次段階の入力として正しく渡される
- 検証: runPipeline の結果が pipeline-merge.test.cjs と同一のスキーマに従う

**Case 2: ワークフロー通過 — cosmetic のみの omission が Goal Gate を通過**
- 入力: cosmetic のみの omission リスト
- 期待: trend.warning が空または通過可を示す

**Case 3: 異常系 — 空の omissions 配列**
- 入力: omissions: [] の OMISSIONS JSON
- 期待: エラーにならず、空結果を返す

**Case 4: 発散傾向の検出**
- 入力: low 比率が 50% を超える omission 履歴
- 期待: trend.isDiverging === true

#### Makefile 更新
- test-conver ターゲットに以下のテストファイルを追加:
  - `tests/dedup-omissions-by-history.test.cjs`
  - `tests/materiality-filter.test.cjs`
  - `tests/diminishing-returns.test.cjs`
  - `tests/pipeline-merge.test.cjs`
  - `tests/goal-gate-integration.test.cjs`

### ユニットテスト不可能な項目（例外）

なし。すべてのテストは Node.js `node:test` と一時ファイルでの入出力で完結する。

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るコードは以下の 2 ファイルのみ:

1. **tests/goal-gate-integration.test.cjs（新規）**:
   - テスト関数名は動詞句（`runs full pipeline with valid omissions` 等）
   - テストデータ構築はヘルパー関数に抽出（createOmission, setupTestDir 等）
   - マジックナンバー（severity の閾値等）は名前付き定数化
   - 既存の pipeline-merge.test.cjs と同一の命名規則・構造に従う

2. **Makefile（1行追加）**:
   - test-conver ターゲットの行に追加テストファイルを追記するのみ
   - 既存フォーマット（改行区切り）を維持する

## Acceptance Criteria

- [ ] `tests/goal-gate-integration.test.cjs` が作成され、全ケース PASS する
- [ ] `make test-conver` にパイプライン関連テストが含まれ、全 PASS する
- [ ] `create-omissions.js` の Step 4 が正常に動作する（既存のまま）
- [ ] `find-omissions-for-next-rfc.md` の Step 4 セクションが正しく参照されている（既存のまま）
- [ ] 犯罪（Malfeasance）0 件を維持する
- [ ] 新規コードに `[::STUB::]` 漏れがない

## Notes

### 重要な発見: チケットスコープの一部は P9-1 で既に実装済み

P10-1 の Scope 項目 1（create-omissions.js への Step 4 追加）と項目 2（find-omissions-for-next-rfc.md への Step 4 追記）は、
P9-1 の実装過程で既に完了している。残る項目 3（結合テスト）と項目 4（Makefile 統合）のみが未実施である。

### 依存関係

- **P9-1**（前提）: ✅ reviewed（完了済み）
  - 3スクリプト + runPipeline が実装済み
  - 全32テスト PASS、スタブ・犯罪 0 件

### 関連チケット

- **P11-1**: formulate-tickets 改良（P10-1 完了後、P11-1 参照）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
