---
ticket_id: 66
title: PX-27: Slug Validation for graphify-rfc
slug: px-27-slug-validation-for-graphify-rfc
status: draft
created_at: 2026-07-08
updated_at: 2026-07-08
---

# PX-27: Slug Validation for graphify-rfc

## Summary

グラフノードの `slug` フィールドに命名規則の検証機構を追加する。slug は boundify でファイル名のベースとして使用されるため、その品質が生成されるディレクトリ・ファイル名の品質を直接決定する。検証は graphify-rfc の自己修復ループ内で実行され、違反時は AI が `crud.js` で修正する導線を提供する。

## ⚠️ 作業範囲の重大制約

**このチケットの全作業は `tools/conver/.claude/` ディレクトリ内のみに限定される。**
すなわち `/Users/kawata/shyme/zasso/tools/conver/.claude/` 以下が唯一の変更対象である。

**禁止される操作:**
- このパスの外にあるあらゆるファイルの編集・作成・削除
- `cargo` 関連コマンドの実行
- プロジェクトルート `/Users/kawata/shyme/zasso/` 以下の `crates/`, `src-tauri/`, `fe/` 等への影響

## Background

PX-24 でグラフスキーマに `slug` フィールドが導入され、PX-25 で boundify が titleToFileName から slug 直接参照に移行した。しかし slug の値そのものを検証する機構が存在しないため、以下の問題が発生している:

1. **ファイル名の長大化**: 制限のない slug から `config_manager_for_database_connection_pool.rs` のような長大なファイル名が生成される
2. **命名規則の不統一**: `camelCase`, `kebab-case`, `mixed_style-Name` など混在が発生
3. **ファイル名の粒度崩壊**: slug が長くなりすぎると、boundify のファイル名制限（MAX_FILE_NAME_LENGTH）に抵触する

**物理的証拠**: `boundify-tree.js:187` の resolveFileName は slug を無条件に使用する（`validate-dirs-tree-schema.js:262` に slug 形式の正規表現パターンはあるが、これは Dirs-Tree.json 生成後の事後検証のみで slug 自体の事前防止はない）。`boundify-helpers.js:311` の MAX_FILE_NAME_LENGTH = 48 は未使用のデッド定数。

## Scope

- `validate-slug.js`（新規）の作成: グラフJSONの全ノードの slug フィールドを検証
  - lower_snake_case 形式の強制（文字種: [a-z0-9_]、先頭英小文字）
  - 最大25文字上限（slug 部分のみ、拡張子含まず）
  - 1単語基本推奨、2単語許容、3単語まで許容（4単語以上は警告のみ、ブロックしない）
  - remedies フィールドに crud.js 使用の修正コマンド例を出力
- graphify-rfc の Step 1（自己修復ループ）への統合（graphify-rfc.md のコマンド定義改修）
- `boundify-helpers.js` の MAX_FILE_NAME_LENGTH を 48→25 に変更し、参照可能にする
- 既存 `boundify-helpers.js:311` の MAX_FILE_NAME_LENGTH = 48 を更新

## Non-scope

- boundify 側の resolveFileName への truncation 追加（別チケット）
- graphify-rfc の slug 自動生成ロジックの変更
- crud.js の修正（既存で slug 編集は可能）
- 既存グラフの slug 一括修正（本チケットは検証機構の追加が目的）

## Investigation

**`boundify-tree.js:186-194`** — resolveFileName:
```javascript
const slug = node.slug;
if (slug && typeof slug === 'string' && slug.length > 0) {
  return slug + (languageExtensions[lang] || '.rs');
}
```
→ slug の長さ・形式を全く検証せず無条件にファイル名として使用。

**`validate-dirs-tree-schema.js:261-262`** — 事後検証の正規表現:
```javascript
const slugPattern = /^[a-z][a-z0-9_]*$/;
```
→ ファイル名からの逆算検証であり slug 生成時点での制御ではない。25文字上限もない。

**`boundify-helpers.js:311`**:
```javascript
const MAX_FILE_NAME_LENGTH = 48;
```
→ 単独で定義されているが参照するコードがない。これを25に変更し validate-slug.js から参照する。

**検証追加方式の選択**: `verify.js` に統合せず新規スクリプト `validate-slug.js` とする。理由：
- verify.js の現在の責務（カバレッジ・孤立ノード・headingRefs）と slug 検証は独立
- 新規スクリプトの方が単体テストが容易
- graphify-rfc.md の Step 1 で `verify.js` と並べて呼び出すことで自己修復ループに統合

## Test Plan

### ユニットテスト計画

テスト対象: `validate-slug.js`（新規スクリプトの全公開関数）

**正常系:**
- `config`, `db_settings`, `tls_config` などの有効な slug がエラーなしで通過する
- 25文字ちょうどの slug（`a234567890123456789012345`）が通過する
- slug 未設定（undefined）のノードがスキップされる（エラーにしない）
- 空文字列 slug のノードがスキップされる
- エラー0件の場合、`{ok: true, errors: [], warnings: []}` が返る

**異常系:**
- `CamelCaseName` → format 違反（大文字使用）
- `has space` → format 違反（スペース）
- `UPPER_CASE` → format 違反（大文字）
- `_leading_underscore` → format 違反（先頭が英小文字でない）
- `a_very_long_slug_over_twentyfive_chars` → length 違反（26文字）
- `has-hyphens` → format 違反（ハイフン）
- 複数ノードに違反がある場合、全件が errors 配列に列挙される

**警告系:**
- `word1_word2_word3_word4`（4単語以上）→ warnings 配列に報告、errors には含めない
- 違反のみで警告なしの場合、warnings が空配列であること

**境界値:**
- 25文字 slug（上限ちょうど）→ 通過
- 26文字 slug（上限+1）→ 違反
- 1文字 slug `"a"` → 通過
- アンダースコアのみ `"_"` → 先頭英小文字違反
- 数字のみ `"123"` → 先頭英小文字違反

**出力形式:**
- graphify-rfc の自己修復ループで読み取り可能な JSON 形式（`{ok, errors: [{nodeId, slug, reason, remedy}], warnings}`）
- 各 error の remedy フィールドに `crud.js` の具体的な修正コマンドを含む（例: `node .claude/scripts/rfc-graph/crud.js --graph="..." update-node --id=N0005 --field=slug --value="new_slug"`）

**カバレッジ目標:** 95%（クリティカルパス: 検出ロジックは100%）

### ユニットテスト不可能な項目（例外）

- graphify-rfc の自己修復ループとの統合動作は E2E 確認（スラッシュコマンド実行）
- `MAX_FILE_NAME_LENGTH` の変更が boundify の出力に与える影響は PX-28/PX-29 で検証

## Boy Scout Rule — 翻訳可能性計画

- `validate-slug.js` の関数はすべて動詞句: `validateSlugs()`, `checkSlugLength()`, `checkSlugFormat()`, `checkWordCount()`
- エラーメッセージは3段テンプレート（原因・影響・修正手順）で統一
- ハードコード値なし、slug パターン・文字数上限は名前付き定数
- 既存 `boundify-helpers.js:311` の未使用定数 MAX_FILE_NAME_LENGTH を本チケットで25に変更し、使用される状態にする（放置された定数を改善）

## Acceptance Criteria

- [ ] `validate-slug.js` が新規作成され、lower_snake_case, 25文字上限, 先頭英小文字 の検証を行う
- [ ] 検証エラーは `{ok, errors: [{nodeId, slug, reason, remedy}], warnings}` 形式で出力される
- [ ] `remedies` フィールドに `crud.js` を使用した修正コマンド例が含まれる
- [ ] 機械的連結による4単語以上の slug が warnings に報告される（ブロックしない）
- [ ] `MAX_FILE_NAME_LENGTH` が 25 に変更され validate-slug.js から参照される
- [ ] graphify-rfc.md の Step 1（自己修復ループ）に validate-slug.js の実行が追加される
- [ ] 既存の全テストが通過する
- [ ] 翻訳可能性の検証が通っている
