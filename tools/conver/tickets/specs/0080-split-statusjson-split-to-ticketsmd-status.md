---
ticket_id: 80
title: "SPLIT-Status.json 管理スクリプトと split-to-tickets.md Status管理機構の追加"
slug: split-statusjson-split-to-ticketsmd-status
status: draft
created_at: 2026-07-10
updated_at: 2026-07-10
---
# SPLIT-Status.json 管理スクリプトと split-to-tickets.md Status管理機構の追加

## Summary

`update-boundify-step-status.js` をコピーして `update-split-step-status.js` を作成し（`MAX_STEP = 9`、`-SPLIT-Status.json` サフィックス対応）、`split-to-tickets.md` の全10原子ステップに Status 管理機構を追加する。これにより、各サブステップの開始/完了/異常が `*-SPLIT-Status.json` に永続化され、パイプラインの進行状態を明確に制御できるようになる。

## Background

現在の `split-to-tickets.md` は進行状態を一切管理していない。どのStepが完了し、どこから再開すべきかが不明であり、途中中断やエラー時にAIが迷う。`graphify-rfc.md` と `boundify-graph.md` は `*-Status.json` による進行管理機構を持ち、各Stepの開始時（`start-step`）・終了時（`end-step`）にステータスを記録し、エラー時は `reset-to-step` で復帰可能になっている。`split-to-tickets.md` も同様の機構を持つべきである。

但し `split-to-tickets.md` は **サブステップを含む10個の原子ステップ**（Step 0〜9）から構成されるため、graphify（MAX_STEP=5, 6Step）や boundify（MAX_STEP=3, 4Step）よりも多い。専用スクリプト `update-split-step-status.js` を新規作成し、MAX_STEP=9（10Step）に対応させる。

## Scope

### 1. `update-split-step-status.js` の新規作成

`update-boundify-step-status.js` をコピーし、以下を変更：

**a. 最大Step数の変更**: `MAX_STEP = 9`（10Step構成: 0〜9）

**b. SPLIT サフィックスの追加**: `createDefaultStatus()` に `SPLIT_SUFFIX` 処理を追加

```js
const SPLIT_SUFFIX = '-SPLIT-Status.json';
// filename.endsWith(BOUNDIFY_SUFFIX) の後に追加:
} else if (filename.endsWith(SPLIT_SUFFIX)) {
  basename = filename.slice(0, -SPLIT_SUFFIX.length);
}
```

**c. 全JSDoc・usageメッセージ・コメントの変更**:
- "BOUNDIFY-Status.json" → "SPLIT-Status.json"
- "/boundify-graph" → "/split-to-tickets"
- Step範囲の記述を `0〜9` に更新

**d. `graphFile` の扱い**: split-to-tickets は graphFile を持たない（グラフではなくTickets.jsonが出力先）。`createDefaultStatus()` の graphFile 逆算は現状維持（graphify/boundify との互換性のため）。但し JSDoc では「出力先Tickets.jsonの存在するディレクトリを基準に逆算」と説明を修正する。

### 2. `split-to-tickets.md` への Status管理機構追加

**a. 導出パスの追加**（冒頭、引数パース直後）

`boundify-graph.md` と同じパターンで statusPath を導出する。

```bash
basename="$(basename "$DOC_PATH" .md)"
statusPath="${DOC_DIR}/${basename}-SPLIT-Status.json"
```

**b. 使用スクリプト一覧に `update-split-step-status.js` を追加**

**c. 各Stepの開始・終了時に Status 呼び出しを追加**

**重要：サブステップは独立したStep番号として管理するため、`4-1`, `4-2` 等の見出しは Step 番号と一対一対応にならない。** 代わりに各コードブロックで `start-step N` / `end-step N` を直接記述する。

### Step番号と原子ステップの対応

| Step | サブステップ | 内容 | ループ？ |
|------|-------------|------|---------|
| 0 | 0-1 | 初期化（引数パース + Malfeasance作成） | なし |
| 1 | 0-2 | RFC読込（analyze-source-structure.js） | なし |
| 2 | 1 | I/O境界参考情報の確認 | なし |
| 3 | 2 | グラフ構造確認（show-graph-summary-markdown.js） | なし |
| 4 | 3 | boundifyディレクトリ構造確認（show-dirs-files-tree.js） | なし |
| 5 | 4-1 | phasify（機械的フェーズ分割） | なし |
| 6 | 4-2 | 全フェーズ名・サマリー書き込み（ループ全体） | **全フェーズループ** |
| 7 | 5-1 | フェーズ内ノード詳細表示（ループ全体） | **全フェーズループ** |
| 8 | 5-2 | チケット化 + verify-all-ticket-coverage（ループ全体） | **全フェーズループ** |
| 9 | 6 | フェーズ・チケットチェックリスト出力 | なし |

### Status管理の制御ルール

各Stepの開始時: `start-step N`
各Stepの成功時: `end-step N`（currentStep が N+1 に進む）
異常時: `fail-step N`（currentStep は変更なし）
復帰時: `reset-to-step N`（N+1〜MAX_STEP を pending に戻す）

**ループStep（6, 7, 8）の Status管理**:

ループStep（4-2, 5-1, 5-2）は以下のように管理する：

```
# 開始時: いずれのフェーズ処理を始める前に start-step
node ... update-split-step-status.js --status="$statusPath" start-step 6

# 各フェーズの処理（ループ内）
for each phase:
    5-1 work...
    5-2 work...

# 全フェーズ完了後: end-step（ループ内の全サブ処理を含めて成功）
# Step 7 と Step 8 はループ内で 5-1→5-2 のシーケンスを持つため、Step 7 の end-step 後にすぐ Step 8 の start-step を実行する
node ... update-split-step-status.js --status="$statusPath" end-step 6
```

具体的な 5-1/5-2 の連続ループの Status管理（正確な起動・終了順序を保証するため）：

```
Step 7: start-step 7
for each phase:
    5-1 work...
Step 7: end-step 7
Step 8: start-step 8
for each phase:
    5-2 work...
Step 8: end-step 8
```

これにより 5-1 が完了してから 5-2 が開始されることが Status ファイルで確認できる。

**エラー復帰のパターン**:

```bash
# 現在のStepを異常終了
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$statusPath" fail-step N
# エラー修正後、該当Stepに復帰
node .claude/scripts/rfc-graph/update-split-step-status.js --status="$statusPath" reset-to-step N
```

### 3. 既存テストの維持確認（変更しない）

`update-split-step-status.js` は新規スクリプトであり、既存テストに影響を与えない。`split-to-tickets.md` の変更も markdown 文書のみであり、テスト不要。

## Non-scope

- 既存の `update-step-status.js` / `update-boundify-step-status.js` の改修は含まない（新規スクリプトとして作成）
- `*-SPLIT-Status.json` の初回自動生成（createDefaultStatus）以外の初期化スクリプトは含まない
- `verify-all-ticket-coverage.js` との統合は含まない（同スクリプトは独立して動作）
- `update-split-step-status.js` の単体テストの追加は含まない（既存の graphify/boundify 同様、テスト未整備。必要なら別チケット）

## Investigation

### 証拠1: boundify の `createDefaultStatus` のサフィックス処理

`update-boundify-step-status.js` L183-L195:
```js
const GRAPHIFY_SUFFIX = '-GRAPHIFY-Status.json';
const BOUNDIFY_SUFFIX = '-BOUNDIFY-Status.json';
let basename = filename;
if (filename.endsWith(GRAPHIFY_SUFFIX)) {
  basename = filename.slice(0, -GRAPHIFY_SUFFIX.length);
} else if (filename.endsWith(BOUNDIFY_SUFFIX)) {
  basename = filename.slice(0, -BOUNDIFY_SUFFIX.length);
}
```

これに `SPLIT_SUFFIX` を追加する。既存のサフィックス判定は else-if 連鎖のため、追加は単純。

### 証拠2: boundify の `MAX_STEP`

L33: `const MAX_STEP = 3;`（0〜3 の4Step）

split 用は `MAX_STEP = 9`（0〜9 の10Step）に設定する。

### 証拠3: boundify.md での statusPath 導出パターン

L26: `statusPath="${graphDir}/${basename}-BOUNDIFY-Status.json"`

split では以下になる：
```bash
basename="$(basename "$DOC_PATH" .md)"
statusPath="${DOC_DIR}/${basename}-SPLIT-Status.json"
```

### 証拠4: 原子ステップの正確な数

`split-to-tickets.md` の全見出しから抽出した10原子ステップ：
- Step 0: 0-1 初期化（引数パース + Malfeasance）
- Step 1: 0-2 RFC読込
- Step 2: 1 I/O境界参考情報
- Step 3: 2 グラフ構造確認
- Step 4: 3 boundifyディレクトリ確認
- Step 5: 4-1 phasify
- Step 6: 4-2 全フェーズ名・サマリー書き込み（ループ）
- Step 7: 5-1 ノード詳細表示（ループ）
- Step 8: 5-2 チケット化 + 検証（ループ）
- Step 9: 6 チェックリスト出力

## Test Plan

### ユニットテスト計画

本チケットの変更対象は以下：
1. `update-split-step-status.js` — 新規スクリプト（既存の boundify 版のコピー＋修正）
2. `split-to-tickets.md` — Markdown文書のみ

両者とも**既存テストでカバー可能**：
- `make test-rfc-graph` で既存883テストが全て通過することを確認する（新規スクリプト追加による影響がないこと）
- `update-split-step-status.js` の単体テストは既存の update-boundify-step-status.js と同様、現時点では未整備。テスト追加は別チケットとする

### ユニットテスト不可能な項目（例外）

なし（Markdown文書の変更でありユニットテストは不要）

## Boy Scout Rule — 翻訳可能性計画

### 新規コードの方針

`update-split-step-status.js` は既存の `update-boundify-step-status.js` のコピーである。全関数が既に動詞句（`parseArguments`, `readStatus`, `executeStartStep` 等）、変数は説明的な名前、ハードコード値は定数化済み。JSDoc コメントも完備。翻訳可能性の追加改善は不要。

### コピー元の識別

コピー後に以下の値を変更する。変更漏れを防ぐため、以下のgrepで確認する：

```
grep -n "BOUNDIFY\|boundify\|MAX_STEP\|BOUNDIFY_SUFFIX" .claude/scripts/rfc-graph/update-split-step-status.js
```

Step範囲のコメント（`0〜5` 等）も必ず更新する。

## Acceptance Criteria

- [ ] `update-split-step-status.js` が `update-boundify-step-status.js` をベースに作成され、`MAX_STEP = 9` に設定されている
- [ ] `createDefaultStatus()` が `-SPLIT-Status.json` サフィックスを正しく処理する
- [ ] 全コメント・usage・エラーメッセージが SPLIT 用に書き換えられている（BOUNDIFY の残骸がない）
- [ ] `split-to-tickets.md` の冒頭に `statusPath` 導出が追加されている（`update-split-step-status.js` も使用スクリプト一覧に追加）
- [ ] 全10原子ステップ（Step 0〜9）に `start-step` / `end-step` 呼び出しが追加されている
- [ ] ループステップ（4-2, 5-1, 5-2）の Status 管理が正しい順序で呼び出されている
- [ ] エラー時復帰手順（`fail-step` + `reset-to-step`）が各Stepに記載されている
- [ ] `make test-rfc-graph` が全て通過する（既存テストへの影響なし）
- [ ] `grep -n "BOUNDIFY\|boundify" .claude/scripts/rfc-graph/update-split-step-status.js` が0件（コピー残骸なし）
- [ ] 不完全実装（todo!/panic!/TODO等）の混入なし

## Notes

- 本チケットは1チケットで実装する（新規スクリプト1つ + Markdownの改修のみで、相互依存しており分割不能）
- 実装順序: `update-split-step-status.js` 作成 → `split-to-tickets.md` 改修
- 依存チケット: PX-41（split-to-tickets.md の全Stepが確定）、PX-42（add-tickets-for-phase.js のインターフェース確定）
- `update-split-step-status.js` は `update-boundify-step-status.js` をコピーした後、以下の値のみ変更:
  - MAX_STEP = 9
  - SPLIT_SUFFIX = '-SPLIT-Status.json' を追加
  - 全 BOUNDIFY → SPLIT 文字列置換
  - 全 boundify → split-to-tickets 文字列置換
