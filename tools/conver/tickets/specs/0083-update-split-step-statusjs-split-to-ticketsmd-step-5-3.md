---
ticket_id: 83
title: update-split-step-status.js改修 + split-to-tickets.md Step 5-3追記
slug: update-split-step-statusjs-split-to-ticketsmd-step-5-3
status: draft
created_at: 2026-07-13
updated_at: 2026-07-13
---
# update-split-step-status.js改修 + split-to-tickets.md Step 5-3追記

## Summary

Step 5-3 追加に伴うインフラ整備。`update-split-step-status.js` に `5-3` を `STEP_ORDER` に追加し、`prune-phases` / `renumber-phases` の2サブコマンドを新設する。`split-to-tickets.md` に Step 5-3 の全セクションを追記し、既存の分割パイプラインに統合する。

## Background

設計議論の結果、`split-to-tickets.md` のパイプラインに Step 5-3（フェーズ統合）を追加することが決定した。この Step 5-3 を正しく動作させるためには以下が必要：

1. **step tracking の拡張**: `update-split-step-status.js` の `STEP_ORDER` に `5-3` を追加し、start-step / end-step / fail-step / reset-to-step の全操作で 5-3 を認識できるようにする
2. **prune-phases サブコマンド**: `consolidate-phase-tickets.js` がフェーズを削除した後、status.json の孤立エントリを除去するためのコマンド
3. **renumber-phases サブコマンド**: フェーズID振り直し後に status.json のフェーズキーを一括更新するためのコマンド
4. **パイプライン文書の更新**: `split-to-tickets.md` に Step 5-3 の開始・終了・エラー時復帰の手順を追記

**既存コードの参照箇所**:
- `update-split-step-status.js` (`tools/conver/.claude/scripts/rfc-graph/update-split-step-status.js:45-52`) — `STEP_ORDER` の定義
- `update-split-step-status.js:233-245` — `executeStartStep()` / `executeEndStep()` の実装パターン
- `split-to-tickets.md:451-470` — Step 6 のセクション構成（追記のテンプレートとする）

## Scope

### 1. `update-split-step-status.js` の改修

**1-a. `STEP_ORDER` に "5-3" を追加**
```javascript
const STEP_ORDER = [
  '0-1', '0-2', '1', '2', '3', '4-1', '4-2', '5-1', '5-2', '5-3', '6',
];
```
これにより `5-3` が `validateStepId()`, `executeStartStep()`, `executeEndStep()`, `executeFailStep()`, `executeResetToStep()` の全対象に含まれる。
- `end-step "5-3"` 実行時、次のStepは `6` に進む（既存の `executeEndStep` ロジックがそのまま機能する）

**1-b. `ALLOWED_SUBCOMMANDS` に "prune-phases" と "renumber-phases" を追加**
```javascript
const ALLOWED_SUBCOMMANDS = [
  'start-step', 'end-step', 'fail-step', 'reset-to-step',
  'status', 'cleanup', 'backup', 'prune-phases', 'renumber-phases',
];
```

**1-c. `executePrunePhases(status, phaseIdsToRemove)` 関数の実装**
- 引数: `status.steps` オブジェクトから、指定されたフェーズID配列に対応するStep状態エントリを除去
- 削除対象: `status.steps` 内のキーが `P{id}-...` 形式で、指定された phaseId で始まるエントリ全て
- 呼び出し方法: 標準入力から JSON 配列 `["P0", "P3"]` を受け取る
- 操作後: `status.currentStep` が削除対象に含まれる場合は最初の残存 Step に設定
- 出力: `"prune-phases: {count} phase steps removed"`

**1-d. `executeRenumberPhases(status, phaseIdMapping)` 関数の実装**
- 引数: `status.steps` オブジェクト内のフェーズID接頭辞を、指定されたマッピングに従って置換
- 呼び出し方法: 標準入力から JSON オブジェクト `{"0":"0","3":"1","5":"2"}`（旧ID→新ID）を受け取る
- 変換対象: `status.steps` の全キーと `status.currentStep`
- 出力: `"renumber-phases: {count} phase keys updated"`

**1-e. サブコマンドディスパッチ switch への追加**
`main()` 関数内の switch 文（現状 L485-548）に `prune-phases` / `renumber-phases` の case を追加

**1-f. モジュール exports の追加**
```javascript
module.exports = {
  // 既存の全エクスポート + 以下を追加
  executePrunePhases,
  executeRenumberPhases,
};
```

### 2. `split-to-tickets.md` の改修

**2-a. Step 5-2 終了直後（Step 6 の直前）に新セクション「Step 5-3: フェーズ統合」を挿入**

構造（既存の Step 5 と同じパターン）:

````markdown
### Step 5-3: フェーズ統合

#### 5-3-1. チケット数によるフェーズ統合

```bash
# Step 5-3 を開始
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" start-step "5-3"
```

`consolidate-phase-tickets.js` が全フェーズのチケット数を確認し、3未満のフェーズを後方のフェーズにマージする。

```bash
node .claude/scripts/tickets/consolidate-phase-tickets.js \
  "$TICKETS_PATH" \
  "$STATUS_PATH"
```

出力末尾のサマリー行でパス（✅）を確認する。

```bash
# Step 5-3 正常終了（5-3 完了）
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" end-step "5-3"
```

#### 5-3-2. エラー時の復帰

```bash
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$STATUS_PATH" reset-to-step "5-3"
```
````

**2-b. Step 6 の番号を維持する（5-3 が 5-2 と 6 の間に入る）**

## Non-scope

- **consolidate-phase-tickets.js の実装**: PX-44 のスコープ。PX-46 は update-split-step-status.js に prune-phases/renumber-phases を追加しておくのみ（呼び出しは PX-44 の責任）
- **relatedTicketIds 生成ロジック**: PX-45 のスコープ
- **その他のサブコマンド追加**: cleanup/backup 以外の新規サブコマンドは本チケットのスコープ外

## Investigation

### 証拠1: 現在の STEP_ORDER 定義

`tools/conver/.claude/scripts/rfc-graph/update-split-step-status.js:45-52`:

```javascript
const STEP_ORDER = [
  '0-1', '0-2', '1', '2', '3', '4-1', '4-2', '5-1', '5-2', '6',
];
```

`end-step "5-2"` 実行時、`executeEndStep()`（同:254-265）は次の Step を `6` に進める。`5-3` 追加後は正しく `5-3` に進むために `STEP_ORDER` に `'5-3'` を追加する必要がある。

### 証拠2: ALLOWED_SUBCOMMANDS 定義

同:54-63:
```javascript
const ALLOWED_SUBCOMMANDS = [
  'start-step', 'end-step', 'fail-step', 'reset-to-step',
  'status', 'cleanup', 'backup',
];
```

ここに `'prune-phases'`, `'renumber-phases'` を追加する。

### 証拠3: サブコマンドディスパッチの switch 文

同:485-548 の switch 文のパターン:
```javascript
case 'cleanup':
  executeCleanup(status);
  process.exit(0);
```

prune-phases も同様に、stdin から JSON 入力を受け取るパターンで実装する。

### 証拠4: split-to-tickets.md の既存セクション構造

同:451-470 の Step 6 セクション:
- `# Step 6: ...` の見出し
- start-step のコードブロック
- 処理内容の説明（list-phases-and-tickets.js の実行）
- end-step のコードブロック
- エラー時復帰のコードブロック

この構造を Step 5-3 でも踏襲する。

## Test Plan

### ユニットテスト計画

`tools/conver/tests/` 配下に CommonJS（`.test.cjs`）形式で作成する。

**update-split-step-status.js 改修分**（`tests/update-split-step-status-5-3.test.cjs`）:

| # | テストケース | 内容 | 検証方法 |
|---|-------------|------|---------|
| 1 | STEP_ORDER に "5-3" が含まれる | `require()` で読み込み確認 | `STEP_ORDER.includes('5-3')` が true |
| 2 | ALLOWED_SUBCOMMANDS に prune-phases が含まれる | 同上 | `ALLOWED_SUBCOMMANDS.includes('prune-phases')` が true |
| 3 | ALLOWED_SUBCOMMANDS に renumber-phases が含まれる | 同上 | `ALLOWED_SUBCOMMANDS.includes('renumber-phases')` が true |
| 4 | end-step "5-2" の next step が "5-3" | モック status で end-step "5-2" 実行 | `currentStep` が "5-3" になる |
| 5 | end-step "5-3" の next step が "6" | モック status で end-step "5-3" 実行 | `currentStep` が "6" になる |
| 6 | executePrunePhases: 単一フェーズ削除 | status.steps に P0-1, P1-1, P2-1 がある状態で ["P1"] を削除 | P1-1 のみ削除、P0-1/P2-1 は残存 |
| 7 | executePrunePhases: 複数フェーズ削除 | ["P0", "P2"] を削除 | P0-1/P2-1 削除、P1-1 残存 |
| 8 | executePrunePhases: currentStep が削除対象 | currentStep="P1-1" で P1 を削除 | currentStep が最初の残存 Step になる |
| 9 | executeRenumberPhases: 単一マッピング | {"1":"0"} | P1-1 → P0-1 に変換 |
| 10 | executeRenumberPhases: 複数マッピング | {"1":"0","3":"1"} | P1-1→P0-1, P1-2→P0-2, P3-1→P1-1 |
| 11 | executeRenumberPhases: currentStep も変換 | currentStep="P3-1" | "P1-1" に変換 |

**split-to-tickets.md 更新分**: 文書更新のためユニットテスト不要。

**カバレッジ目標**: 新規関数（prune-phases, renumber-phases）は 90%以上。改修部分（STEP_ORDER）は確認テストのみ。

### ユニットテスト不可能な項目（例外）

- split-to-tickets.md の Markdown 文書更新: 書式の正確さは目視確認
- prune-phases / renumber-phases の実ファイル操作: spawnSync 呼び出しは分離しており、関数ロジック自体は純粋関数としてテスト可能

## Boy Scout Rule — 翻訳可能性計画

**改修対象の既存コード**:

1. **`update-split-step-status.js`** の既存コード:
   - `ALLOWED_SUBCOMMANDS`: 現在は説明文なしの単なる文字列配列。prune-phases/renumber-phases 追加時に「なぜこのサブコマンドが必要か」のコメントを追加
   - `executeCleanup` / `executeBackup` のパターンが確立されており、prune-phases/renumber-phases も同パターンに従う
   - 既存の switch 文に case を追加するのみで、リファクタリング不要

2. **`split-to-tickets.md`**:
   - 既存の Step 5（5-1/5-2）のセクション構成を正確に踏襲する
   - 「なぜ Step 5-3 が必要か」をセクション冒頭に日本語コメントで記述

## Acceptance Criteria

- [ ] `update-split-step-status.js` の `STEP_ORDER` に `"5-3"` が追加されている
- [ ] `end-step "5-2"` の次ステップが正しく `"5-3"` になった
- [ ] `end-step "5-3"` の次ステップが正しく `"6"` になった
- [ ] `prune-phases` サブコマンドが実装され、指定フェーズの status エントリを削除できる
- [ ] `renumber-phases` サブコマンドが実装され、status エントリのフェーズID接頭辞を置換できる
- [ ] `split-to-tickets.md` に Step 5-3 の全セクションが追記されている
- [ ] すべてのユニットテストが PASS する
- [ ] PX-44 の `consolidate-phase-tickets.js` から `spawnSync` で呼び出せる
- [ ] 既存の start-step / end-step / fail-step / reset-to-step に影響を与えていない
