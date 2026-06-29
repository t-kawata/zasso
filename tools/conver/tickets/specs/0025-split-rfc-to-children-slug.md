---
ticket_id: 25
title: split-rfc-to-children 命名規則のリファイン（slug + 正典名接頭辞）
slug: split-rfc-to-children-slug
status: draft
created_at: 2026-06-29
updated_at: 2026-06-29
---

# split-rfc-to-children 命名規則のリファイン（slug + 正典名接頭辞）

## Summary

`/split-rfc-to-children` で生成される子・孫RFCのディレクトリ名・ファイル名の命名規則を以下のように変更する。また RFC-TREE.json のスキーマに `slug` フィールドを追加し、kebab-case の機械的変換ではなく明示的な識別子を用いる方式に改める。

### 新命名規則

```
子:   {正典名}-{子番号2桁}-{slug}          → RFC-ROOT-01-parser/
孫:   {正典名}-{子番号2桁}-{孫番号2桁}-{slug} → RFC-ROOT-01-01-lexer/
ファイル名 = ディレクトリ名 + ".md"
```

**具体例:**

```
conver/
├── RFC-ROOT.md
├── RFC-TREE.json
├── RFC-ROOT-01-parser/                   # 子
│   ├── RFC-ROOT-01-parser.md
│   ├── tickets/
│   ├── RFC-ROOT-01-01-lexer/             # 孫
│   │   ├── RFC-ROOT-01-01-lexer.md
│   │   └── tickets/
│   └── RFC-ROOT-01-02-ast/
│       ├── RFC-ROOT-01-02-ast.md
│       └── tickets/
└── RFC-ROOT-02-evaluator/
    ├── RFC-ROOT-02-evaluator.md
    └── tickets/
```

**重要:** 正典名は動的。`RFC-ROOT.md` → `RFC-ROOT`、`MY-DESIGN.md` → `MY-DESIGN`。ハードコード禁止。

## Background

PX-10 実装時の設計では、ディレクトリ名 `{childId}-{kebab(name)}`（例: `01-parser`）、ファイル名 `rfc.md` としていた。問題点：

1. **`rfc.md` が汎用的すぎる**: エディタのタブに複数の `rfc.md` が並び区別できない
2. **正典名との関連が視認できない**: ディレクトリ構造だけでは正典との関係がわからない
3. **kebab-case 機械的変換は不安定**: 特殊文字で意図しない結果になる
4. **人間とAIの視認性が低い**: `01-parser` だけでは階層情報が不足

`slug` フィールド導入により、AIが明示的に識別子を設定し機械的変換に依存しない。

## Scope

1. **RFC-TREE.json スキーマ** — childNode/grandchildNode に `slug` 追加（必須）
2. **`generate-child-rfcs.js`** — ディレクトリ名・ファイル名生成を新規則に変更
3. **`verify-rfc-coverage.js`** — ファイル名確認を新規則に変更
4. **`rfc-tree-schema.json`** — `slug` フィールド定義
5. **`split-rfc-to-children.md`** — 命名規則説明を更新
6. **`tickets/specs/0024-split-rfc-to-children.md`** — 命名規則記述を更新

## Non-scope

- `directoryName` フィールドの削除（後方互換で維持）
- `validate-rfc-tree.js` 以外の検証ロジック変更
- `patch-rfc-tree-child.js` / `get-rfc-tree-draft.js` の変更

## Investigation

### 現在のロジック（変更前）

```javascript
// generate-child-rfcs.js
const cd = path.join(bd, child.directoryName);
write(path.join(cd, "rfc.md"), ...);
// 子ディレクトリ: 01-parser, ファイル: rfc.md
```

### 新しいロジック（変更後）

```javascript
const canonicalBase = path.basename(data.canonicalRfcPath, ".md");
// 子: RFC-ROOT-01-parser/
const dirName = canonicalBase + "-" + child.childId + "-" + (child.slug || child.directoryName);
const fileName = dirName + ".md";
// 孫: RFC-ROOT-01-01-lexer/
const dirNameGC = canonicalBase + "-" + parent.childId + "-" + gc.grandchildId + "-" + (gc.slug || gc.directoryName);
```

### 影響スクリプト一覧

| スクリプト | 変更内容 |
|-----------|---------|
| `rfc-tree-schema.json` | childNode/grandchildNode に `slug`（必須, pattern: `^[a-z0-9-]+$`）追加 |
| `generate-child-rfcs.js` | ディレクトリ名・ファイル名生成を全面改定。`kebab()` 削除 |
| `verify-rfc-coverage.js` | `rfc.md` 確認から `{正典名}-{childId}-{slug}.md` 確認に変更 |

### 変更不要スクリプト

`add-rfc-tree-*.js`, `write-rfc-tree-draft.js`, `write-rfc-tree-final.js`, `patch-rfc-tree-child.js`, `get-rfc-tree-draft.js`, `check-rfc-placeholders.js`, `create-rfc-tree.js`, `validate-rfc-tree.js` — `directoryName` を使用しており変更不要。

## Test Plan

### ユニットテスト計画

**generate-child-rfcs.js:**

| テストケース | 内容 |
|------------|------|
| 正常系: 子のファイル名 | canonicalPath=RFC_ROOT.md, childId=01, slug=parser → `RFC-ROOT-01-parser/`, `RFC-ROOT-01-parser.md` |
| 正常系: 孫のファイル名 | 同上＋grandchildId=01, slug=lexer → `RFC-ROOT-01-01-lexer/`, `RFC-ROOT-01-01-lexer.md` |
| 正常系: 別の正典名 | canonicalPath=MY-DESIGN.md → `MY-DESIGN-01-parser/` |
| 正常系: `rfc.md` が生成されない | 生成ファイル名が `rfc.md` ではないことを確認 |
| 正常系: slug フォールバック | slug 空文字 → `directoryName` を代用 |

**verify-rfc-coverage.js:**

| テストケース | 内容 |
|------------|------|
| 正常系: 新命名ファイル検出 | `RFC-ROOT-01-parser.md` 存在 → PASS |
| 警告: 旧 `rfc.md` 検出 | `rfc.md` のみ存在 → WARN |

### ユニットテスト不可能な項目

なし（命名規則変更は機械的に完全テスト可能）

## Boy Scout Rule — 翻訳可能性計画

- `generate-child-rfcs.js`: `kebab()` を削除し `slug` 直接使用。`rfc.md` ハードコード排除。ディレクトリ名・ファイル名生成を独立関数 `buildChildDirName()`, `buildGrandchildFileName()` として抽出
- `create-rfc-tree.js`: `createSkeleton` 内で `slug` フィールドを空文字初期化することを確認

## Acceptance Criteria

- [ ] childNode/grandchildNode に `slug` 追加、スキーマ検証通過
- [ ] 子ディレクトリ名 `{正典名}-{childId}-{slug}`（例: `RFC-ROOT-01-parser`）
- [ ] 子ファイル名 `{正典名}-{childId}-{slug}.md`（例: `RFC-ROOT-01-parser.md`）
- [ ] 孫ディレクトリ名 `{正典名}-{childId}-{grandchildId}-{slug}`
- [ ] 正典名が動的解決される（ハードコード禁止）
- [ ] `kebab()` 排除、`slug` を直接使用
- [ ] `verify-rfc-coverage.js` が新命名規則で検証
- [ ] `directoryName` 維持（後方互換）
- [ ] `slug` 未設定時の fallback = `directoryName`
- [ ] 既存テスト全件 PASS / 犯罪ゼロ

## Notes

- PX-10（reviewed）の命名規則リファイン。PX-10 のアーキテクチャには影響しない
- `directoryName` は削除せず維持。既存スクリプトとの互換性確保
- `slug` は必須。AIが明示的に設定。空の場合は `directoryName` を fallback
- PX-10 (0024) の spec も併せて更新する（命名規則記述のみ）
