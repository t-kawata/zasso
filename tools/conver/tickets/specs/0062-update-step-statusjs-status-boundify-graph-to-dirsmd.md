---
ticket_id: 62
title: update-step-status.js --status= フラグ拡張 + boundify-graph-to-dirs.md スラッシュコマンド定義
slug: update-step-statusjs-status-boundify-graph-to-dirsmd
status: draft
created_at: 2026-07-07
updated_at: 2026-07-07
---
# update-step-status.js --status= フラグ拡張 + boundify-graph-to-dirs.md スラッシュコマンド定義

## Summary

update-step-status.js に `--status=<path>` フラグを追加（既存 `--graphify-status=` のエイリアスとして併存させ、後方互換を維持する）。合わせて、空ファイル状態の `.claude/commands/boundify-graph-to-dirs.md` にスラッシュコマンド定義を記述する（graphify-rfc.md と同様の Step 0〜5 構成）。フラグ拡張とドキュメント化は相互依存する（フラグの存在を前提に .md で呼び出し例を記述する）ため同一チケットに統合する。

## Background

RFC-BOUNDIFY.md §4.5（BOUNDIFY-Status.json 管理）および §4.7（スラッシュコマンドテンプレート）に基づく。

boundify-graph-to-dirs.js（P21-1）の出力先は `*-BOUNDIFY-Status.json` であり、既存の update-step-status.js が操作する `*-GRAPHIFY-Status.json` とは別のファイルである。update-step-status.js は内部的にどの Status.json を操作しても同じロジックで動作する汎用ツールだが、現状のフラグ名 `--graphify-status=` が「graphify 専用」という誤解を与える。

`--status=<path>` という汎用エイリアスを追加することで、boundify の進行管理にも同一スクリプトを再利用可能にする。

## Scope

1. **update-step-status.js — `--status=<path>` フラグ拡張**:
   - `parseArguments()`: `--status=<path>` を `--graphify-status=<path>` と同等に受理する
   - 両方指定された場合の優先ルールは指定しない（両方とも同じパス変数に代入されるため）
   - `--help` / `printUsage()`: 使用例に `--status=` 表記を追加
   - エラーメッセージ: `--graphify-status=<path>` に加えて `--status=<path>` も記載
   - `module.exports`: 変更なし（新規API不要、既存export維持）
   - 後方互換性: `--graphify-status=` の動作は一切変更禁止

2. **boundify-graph-to-dirs.md — スラッシュコマンド定義の記述**:
   - 既存の空ファイル（.claude/commands/boundify-graph-to-dirs.md）に frontmatter + 本文を記述
   - frontmatter: `description`, `argument-hint`, `allowed-tools`
   - 使用スクリプト一覧テーブル（graphify-rfc.md と同形式）
   - Step 0〜5 の進行制御手順（各Step: 開始→作業→正常終了→エラー時復帰）
   - 引数説明と導出パス（graphPath, statusPath の計算式）
   - 各スクリプトの更新版呼び出し例（--status= を使用 / --graphify-status= は不使用）

3. **テストファイル更新**:
   - update-step-status.test.cjs に `--status=` フラグのパーステストを追加（正常系・異常系・重複指定）

## Non-scope

- update-step-status.js のサブコマンド追加やロジック変更（現行の5サブコマンド維持）
- `--status=` の排他処理（両方指定された場合の動作優先順位 — 現状は両方受理で十分）
- boundify-graph-to-dirs.js の改修（P21-1 で実装済み、スコープ外）
- graphify-rfc.md の内容変更（既存のスラッシュコマンドに影響を与えない）
- 既存のupdate-step-status.test.cjs テストケースへの変更（追加のみ）

## Investigation

### 証拠1: update-step-status.js parseArguments() の現状

ファイル: `.claude/scripts/rfc-graph/update-step-status.js`

**L76-L134 — parseArguments() 関数:**

現在の引数パースは `--graphify-status=<path>` のみを受理する。該当部分は L93-L106:

```javascript
// --graphify-status=<path> のパース
const statusFlag = args[0];
if (!statusFlag.startsWith('--graphify-status=')) {
  throw new Error(
    '最初の引数は --graphify-status=<path> である必要があります。\n' +
    `  実際の値: ${statusFlag}`
  );
}
const statusPath = statusFlag.split('=', 2)[1];
```

**変更方針**: `--status=` も同時に受理するには、条件を OR で拡張する:
```javascript
if (!statusFlag.startsWith('--graphify-status=') && !statusFlag.startsWith('--status=')) {
```

### 証拠2: update-step-status.js printUsage() の現状

**L308-L328 — printUsage():**

```javascript
使用方法:
  node update-step-status.js --graphify-status=<path> start-step <N>
  node update-step-status.js --graphify-status=<path> end-step <N>
  node update-step-status.js --graphify-status=<path> fail-step <N>
  node update-step-status.js --graphify-status=<path> reset-to-step <N>
  node update-step-status.js --graphify-status=<path> status
  node update-step-status.js --help
```

全使用例に `--graphify-status=` と併記する形で `--status=` の使用例も追加する。ただし冗長になるため、冒頭の説明行で `--graphify-status=<path>|--status=<path>` と表記し、個別例は代表1パターンに統合する。

### 証拠3: update-step-status.js エラーメッセージの現状

**L87-L89**: 引数不足時のエラーメッセージ:
```
'  Usage: update-step-status.js --graphify-status=<path> <subcommand> [N]'
```

**L96-L99**: フラグ名不一致時のエラーメッセージ:
```
'最初の引数は --graphify-status=<path> である必要があります。\n' +
```

両方のエラーメッセージに `--status=<path>` の記述を追加する。

### 証拠4: boundify-graph-to-dirs.js の Status.json 出力先

ファイル: `.claude/scripts/rfc-graph/boundify-graph-to-dirs.js`

**L353-L359** の `resolveOutputPaths()` 関数:
```javascript
statusPath: path.join(graphDir, `${basename}-BOUNDIFY-Status.json`),
```

**L459**: 実際の書き出し:
```javascript
fs.writeFileSync(outputPaths.statusPath, JSON.stringify({
```

このように boundify は `*-BOUNDIFY-Status.json` を出力する。update-step-status.js が `--status=<path>` でこのファイルを受け取れるようにする必要がある。

### 証拠5: boundify-graph-to-dirs.md の現状

ファイル: `.claude/commands/boundify-graph-to-dirs.md`

**現状**: ファイルは存在するが中身は空（0行）。全く記述がない。

**参考テンプレート**: `.claude/commands/graphify-rfc.md` が完全な Step 0-5 構成を持っている（約336行）。以下のセクションで構成:
- frontmatter（description, argument-hint, allowed-tools）
- 引数説明
- 導出パス計算
- ガイドライン
- 使用スクリプト一覧テーブル（21行）
- Step 0〜5（各Step: 開始→作業→正常終了→エラー時復帰）
- 完了報告

### 証拠6: 関連チケットの依存関係

| チケット | ステータス | 関係 |
|---------|-----------|------|
| P13-1 | reviewed | update-step-status.js オリジナル実装（本チケットの親） |
| P13-2 | reviewed | crud.js（依存なし） |
| P16-1 | reviewed | graphify-rfc.md テンプレート（.md の参考元） |
| P21-1 | reviewed | boundify-graph-to-dirs.js メインスクリプト（本チケットを後続として参照） |

P21-1 は `relatedTicketIds` に P21-2 を「後続」として明示している（spec 0061 Notes 参照）。

## Test Plan

### ユニットテスト計画

`tests/rfc-graph/update-step-status.test.cjs` に以下のテストを追加する。

| テストケース | 種別 | 内容 |
|-------------|------|------|
| `--status=<path>` 正常系 | 正常系 | `--status=/tmp/test.json start-step 1` → statusPath=/tmp/test.json |
| `--graphify-status=` 従来互換 | 正常系 | `--graphify-status=/tmp/test.json status` → 従来通り動作（後方互換） |
| 両方指定（最初の引数のみ有効） | 正常系 | エラーにならないことのみ確認 |
| `--status=` + 空パス | 異常系 | `--status=` → <path> が空のエラー |
| `--stat=` 誤記 | 異常系 | `--stat=path` → 未知のフラグとしてエラー（typo耐性確認） |

カバレッジ: P13-1 で既に 90% 以上を達成済み。本拡張によりカバレッジが低下しないことのみ確認。既存の 41 テストケースに変更は加えず、追加のみ行う。

### ユニットテスト不可能な項目（例外）

- `.md` ファイル（Markdown コマンド定義）はコードではないため自動テスト不可
- 存在確認のみテストケース外で手動確認: `test -f .claude/commands/boundify-graph-to-dirs.md`

## Boy Scout Rule — 翻訳可能性計画

1. **関数名は動詞句**: `parseArguments()` は既に動詞句。拡張部分も同様。
2. **変数名はドメイン概念**: `statusFlag`, `statusPath` 等、既存の命名規則を踏襲。
3. **一関数一責務**: フラグ拡張は `parseArguments()` 内の条件式のみ変更。新規関数追加不要。
4. **定数化**: `--graphify-status=` と `--status=` のフラグ文字列は const 定義にする（冗長文字列を関数内にハードコードしない）。L95 のリテラル `'--graphify-status='` とエラーメッセージのリテラルを定数に抽出する。
5. **エラー握りつぶし禁止**: 既存の 3段テンプレートエラー報告に準拠。新たなエラーパターンは発生しない。
6. **Surgical Diff**: 変更は `parseArguments()` の条件式1行 + エラーメッセージ2行 + `printUsage()` の使用例。不要な再フォーマットは行わない。
7. **コメントは「なぜ」**: エイリアス追加の理由（graphify と boundify 双方で再利用するため）を JSDoc またはインラインコメントで記述。

## Notes

### 依存関係

- **P13-1**（先行: reviewed）— update-step-status.js オリジナル実装。本チケットはこれを改修する。
- **P16-1**（先行: reviewed）— graphify-rfc.md テンプレート。.md の書式参照元。
- **P21-1**（先行: reviewed）— boundify-graph-to-dirs.js。本チケットはその後続。

### 作業制約

- tools/conver/.claude/ 内に限定
- `--graphify-status=` の挙動は一切変更禁止（後方互換絶対維持）
- P13-1 の既存 41 テストケースに変更禁止
- 既存の boundify 系スクリプト（boundify-helpers.js, boundify-tree.js, validate-dirs-tree-schema.js, generate-dir-template.js, boundify-graph-to-dirs.js）への変更禁止

### 作業対象ファイル

| ファイル | 操作 | 内容 |
|---------|------|------|
| `.claude/scripts/rfc-graph/update-step-status.js` | 改修 | `--status=` フラグ拡張（parseArguments + printUsage + エラーメッセージ） |
| `.claude/commands/boundify-graph-to-dirs.md` | 新規記述 | 空ファイルにスラッシュコマンド定義を記述（graphify-rfc.md 相当） |
| `tests/rfc-graph/update-step-status.test.cjs` | テスト追加 | `--status=` フラグのパーステスト4〜5ケース |
