---
ticket_id: 67
title: PX-28: Declaration Stubs and Prose Kind Removal for boundify
slug: px-28-declaration-stubs-and-prose-kind-removal-for-boundify
status: draft
created_at: 2026-07-08
updated_at: 2026-07-08
---

# PX-28: Declaration Stubs and Prose Kind Removal for boundify

## Summary

2つの改善を行う: (1) 全プログラムファイルに言語・kind に応じた適切な宣言スタブ（雛形コード）を書き込む。(2) `rationale`, `glossary`, `requirement` の prose 系 kind をファイル生成対象から外し、独立したファイルとして生成しないようにする（これらの情報は PX-30 でコメントとして関連ファイルに埋め込まれる）。

## ⚠️ 作業範囲の重大制約

**このチケットの全作業は `tools/conver/.claude/` ディレクトリ内のみに限定される。**
すなわち `/Users/kawata/shyme/zasso/tools/conver/.claude/` 以下が唯一の変更対象である。

**禁止される操作:**
- このパスの外にあるあらゆるファイルの編集・作成・削除
- `cargo` 関連コマンドの実行
- プロジェクトルート `/Users/kawata/shyme/zasso/` 以下の `crates/`, `src-tauri/`, `fe/` 等への影響

## Background

**問題1: 全ファイルが空**: 現在 boundify が生成するファイルは全て空である。`generate-dir-template.js:128-132` の discover 関数は `node.declarationStub` があれば内容として書き込むが、`boundify-tree.js` の `buildDirectoryTree` でファイルノードに `declarationStub` を設定するコードが存在しない。`generateDeclarationStub`（boundify-tree.js:374-409）は関数として存在するが、未使用である。

**問題2: prose 系 kind が不適切にファイル化される**: `rationale`（設計判断の根拠）、`glossary`（用語定義）、`requirement`（要件）は実行時の振る舞いを持つプログラムコードではなく、設計意図を説明する情報である。これらを `.rs` / `.go` / `.ts` の独立ファイルとして生成しても中身は空であり、意味をなさない。本来これらは関連プログラムファイルのコメントとして埋め込まれるべき（PX-30 で対応）。

## Scope

- `boundify-helpers.js` に kind×言語の宣言スタブテーブルを定数として追加
  - 各 kind（config, error_policy, security, test_policy, build_ci, api_contract, data_model, state_machine）に対して Rust/Go/TypeScript の雛形を定義
- `boundify-tree.js` の `buildDirectoryTree` 内で各ファイルノードに宣言スタブを付与するよう配線
  - `generateDeclarationStub` を呼び出し、結果を `declarationStub` プロパティとしてファイルノードに設定
  - 現状の `generateDeclarationStub`（boundify-tree.js:374-409）の内容では不足しているため、kind に応じたスタブを新設する
- `KIND_FILE_RULES`（boundify-tree.js:24-33）から `rationale`, `glossary`, `requirement` の3エントリを削除
- `docs/` ディレクトリが生成されないことの確認
- 既存テストの修正（Dirs-Tree.json の trees 構造が変わるため期待値を更新）

## Non-scope

- prose 系ノードの情報をコメントとして埋め込む処理（PX-30 で対応）
- ツリー階層化（PX-29 で対応）
- prune（空ディレクトリ削除）（PX-29 で対応）
- ディレクトリ名・ファイル名の長さ制限（PX-27 で対応）

## Investigation

**`boundify-tree.js:374-409`** — generateDeclarationStub（未使用）:
```javascript
function generateDeclarationStub(dirNode, lang) {
  switch (lang) {
    case 'rust': {
      const modDecls = files
        .filter(f => path.basename(f.name, '.rs') !== 'mod')
        .map(f => `pub mod ${path.basename(f.name, '.rs')};`);
      // ...
    }
    case 'go': {
      declarations.push(`package ${dirNode.name}`);
    }
    case 'typescript': {
      const barrel = files
        .filter(f => path.basename(f.name, '.ts') !== 'index')
        .map(f => `export * from './${path.basename(f.name, '.ts')}';`);
    }
  }
}
```
→ 言語別の barrel 宣言のみで kind 別の雛形（構造体・トレイト・enum 等）がない。ファイルノードにセットする配線もない。

**`boundify-tree.js:175-277`** — buildDirectoryTree:
ファイルノード作成箇所（L228-233, L297-302）:
```javascript
dirNode.children.push({
  name: fileName,
  type: 'file',
  kind: inlineChild.kind || '',
  mappedNodeIds: [inlineChild.id],
});
```
→ declarationStub プロパティが存在しない。

**`boundify-tree.js:24-33`** — KIND_FILE_RULES:
```javascript
const KIND_FILE_RULES = Object.freeze({
  rationale: 'docs',     // ← 削除対象
  glossary: 'docs',      // ← 削除対象
  requirement: 'docs',   // ← 削除対象
});
```

**`generate-dir-template.js:128-132`** — discover 関数:
```javascript
let content = '';
if (node.declarationStub) {
  content += node.declarationStub + '\n\n';
}
```
→ declarationStub が設定されていれば内容として書き込まれる準備は既にできている。不足は設定側だけ。

### 宣言スタブテーブル設計

| kind | Rust | Go | TypeScript |
|---|---|---|---|
| config | `pub struct Config {}` | `type Config struct {}` | `interface Config {}` |
| api_contract | `pub trait Service {}` | `type Service interface {}` | `interface Service {}` |
| data_model | `pub struct Model {}` | `type Model struct {}` | `interface Model {}` |
| state_machine | `pub enum State {}` | `type State int` + `const` | `type State = '...'` |
| error_policy | `pub enum Error {}` | `type Error struct{}` | `class Error extends Error {}` |
| security | `pub fn authorize() {}` | `func Authorize() {}` | `function authorize(): void {}` |
| test_policy | `#[cfg(test)] mod tests {}` | `func TestXxx(t *testing.T) {}` | `describe('...', () => {})` |
| build_ci | `fn main() {}` | `func main() {}` | `// build script` |

## Test Plan

### ユニットテスト計画

テスト対象: `boundify-helpers.js`（新規 stub table）, `boundify-tree.js`（buildDirectoryTree 改修）

**正常系:**
- 宣言スタブテーブルが全 8 kind × 3 言語 = 24 パターンを網羅していること
- 各 kind に対して正しい言語別の宣言スタブが返ること
- `buildDirectoryTree` 内で生成された全ファイルノードに `declarationStub` が設定されていること
- `declarationStub` が各言語の文法として正しいこと（最低限の構文チェック）
- prose 系 kind（rationale/glossary/requirement）のノードが Dirs-Tree.json に含まれないこと
- `docs/` ディレクトリが Dirs-Tree.json に出現しないこと

**異常系:**
- 未知の kind（stub テーブルにない kind）のノードは空スタブ（`''`）になること
- 未知の言語（rust/go/typescript 以外）のノードは null または空文字列が返ること
- kind 未設定のノードは空スタブになること

**回帰テスト:**
- prose 系 kind 削除後も残りの kind が正しく Dirs-Tree.json に含まれること
- 既存テストが新しい期待値に更新され通過すること

**カバレッジ目標:** 90%（スタブテーブルは全パターン網羅 100%）

### ユニットテスト不可能な項目（例外）

- 生成された宣言スタブが実際にコンパイル可能かの検証は、該当言語のビルド環境が必要（テスト対象外）

## Boy Scout Rule — 翻訳可能性計画

- 宣言スタブテーブルは `boundify-helpers.js` の名前付き定数として定義（関数内ハードコード禁止）
- `generateDeclarationStub` の責務を明確に: 「ファイルノードに言語別の宣言スタブを設定する」1関数1責務を維持
- 既存の `generateDeclarationStub`（boundify-tree.js:374）は呼び出し側がない放置状態のため、本チケットで使用されるように改修し、捨て関数をなくす
- 既存の選択的未使用関数を排除（Boy Scout Rule）

## Acceptance Criteria

- [ ] 宣言スタブテーブルが 8 kind × 3 言語 の全パターンを網羅している
- [ ] `buildDirectoryTree` 内で全ファイルノードに `declarationStub` が設定される
- [ ] prose 系 kind（rationale/glossary/requirement）が KIND_FILE_RULES から削除されている
- [ ] `docs/` ディレクトリが Dirs-Tree.json に含まれない
- [ ] generate-dir-template.js が宣言スタブを正しくファイルに書き込む（空ファイルが撲滅される）
- [ ] 既存テストが新しい期待値で更新され通過する
- [ ] 翻訳可能性の検証が通っている
