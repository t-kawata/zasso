---
ticket_id: 70
title: PX-31: Update boundify Command Documentation
slug: px-31-update-boundify-command-documentation
status: draft
created_at: 2026-07-08
updated_at: 2026-07-08
---

# PX-31: Update boundify Command Documentation

## Summary

PX-27〜PX-30 の一連の変更を反映し、`boundify-graph-to-dirs.md` スラッシュコマンド定義と関連ドキュメントを更新する。これにより、スラッシュコマンドの記述が実際の動作と一致する状態を維持する。

## ⚠️ 作業範囲の重大制約

**このチケットの全作業は `tools/conver/.claude/` ディレクトリ内のみに限定される。**
すなわち `/Users/kawata/shyme/zasso/tools/conver/.claude/` 以下が唯一の変更対象である。

**禁止される操作:**
- このパスの外にあるあらゆるファイルの編集・作成・削除
- `cargo` 関連コマンドの実行
- プロジェクトルート `/Users/kawata/shyme/zasso/` 以下の `crates/`, `src-tauri/`, `fe/` 等への影響

## Background

PX-27〜PX-30 の4チケットにより、boundify パイプラインに以下の変更が加わる:
1. slug 検証スクリプト `validate-slug.js` の追加（graphify-rfc の自己修復ループに統合）
2. 宣言スタブテーブルの追加（全ファイルに雛形書き込み）
3. prose 系 kind（rationale/glossary/requirement）のファイル生成廃止と docs/ ディレクトリ削除
4. ツリー階層化ロジックの強化
5. prune（空ディレクトリ削除・フラット化）の追加
6. クロスリファレンスコメントとヘッダーテンプレートの追加
7. `validate-dirs-tree-schema.js` の SCHEMA に `crossReferences` 追加

これらの変更がスラッシュコマンド定義 `boundify-graph-to-dirs.md`、CLAUDE.md、および各スクリプトのドキュメント（JSDoc）に適切に反映されなければ、ユーザーは実際の動作とドキュメントの乖離に混乱する。

## Scope

- `.claude/commands/boundify-graph-to-dirs.md` の更新:
  - 使用スクリプト一覧に `validate-slug.js` を追加
  - Step 1（自己修復ループ）に `validate-slug.js` の実行を追加
  - prose 系 kind 廃止に関する挙動変更を記載
  - prune ルール（最低2子ノード要件・フラット化）を記載
  - 全ファイル先頭のヘッダーコメント仕様を記載
  - クロスリファレンス情報の追加を記載
  - 各Stepの入出力契約の更新
- `boundify-tree.js`, `boundify-helpers.js`, `boundify-graph-to-dirs.js` の JSDoc 更新
- `generate-dir-template.js` の JSDoc 更新（ヘッダーコメント生成に関する記述）
- 関連する CLAUDE.md の更新（必要な場合）

## Non-scope

- 各スクリプトの実装変更（PX-27〜PX-30 で完了）
- 既存テストの更新（PX-27〜PX-30 で対応）
- graphify-rfc.md の更新（validate-slug.js 統合部分のみ PX-27 で対応）

## Investigation

**`/Users/kawata/shyme/zasso/tools/conver/.claude/commands/boundify-graph-to-dirs.md`** — 現在の定義:
- 使用スクリプト一覧（L51-65）: 9スクリプト記載。`validate-slug.js` は未記載
- ガイドライン（L41-48）: 自己修復ループの説明あり。prune ルール・ヘッダーコメント・クロスリファレンスの記述なし
- Step 1（L92-151）: verify-graph-integrity.js の実行のみ。validate-slug.js なし
- Step 2（L153-200）: Dirs-Tree.json 生成。prune・階層化の記述なし
- Step 3（L203-229）: ファイル生成。ヘッダーコメント・クロスリファレンスの記述なし
- 完了報告（L315-327）: 報告項目にクロスリファレンス・prune 結果・宣言スタブ品質なし

**更新箇所一覧:**

| セクション | 現在 | 更新後 |
|---|---|---|
| 使用スクリプト一覧 | 9スクリプト | + validate-slug.js（10スクリプト） |
| ガイドライン | 汎用 | + prune ルール・ヘッダーコメント仕様・クロスリファレンス |
| Step 1 | verify のみ | + validate-slug.js の追加実行 |
| Step 2 | Dirs-Tree 生成 | + prune・階層化の説明 |
| Step 3 | ファイル生成 | + ヘッダーコメント・宣言スタブ・クロスリファレンス |
| 完了報告 | 基本統計 | + クロスリファレンス数・prune結果・宣言スタブ品質 |

## Test Plan

### ユニットテスト計画

テスト対象: なし（ドキュメントのみの変更のため、単体テストは存在しない）

**検証手段:**
- 更新後の `boundify-graph-to-dirs.md` が全Stepのコマンド例を実際に実行可能であることを確認（シェルチェック）
- 更新後の JSDoc が `node -e "require('./boundify-helpers.js')"` でエラーなく読み込めることを確認
- 記載内容が PX-27〜PX-30 の各 Acceptance Criteria と矛盾しないことを目視確認

### ユニットテスト不可能な項目（例外）

- ドキュメントの正確性は人間のレビューによる確認が基本（機械的テスト不能）
- コマンド例のシェルチェックは実行環境依存（.md 内のコマンドをすべて実行するわけにはいかない）

## Boy Scout Rule — 翻訳可能性計画

- コマンド定義は各Stepが「何を」「なぜ」「どのように」の3層で読めるよう記述する（翻訳可能性の原則）
- `boundify-graph-to-dirs.md` は本チケット以前から「読めばわかる」状態を保っているため、更新によりその品質を維持する
- `.md` ファイル内のコマンド例は一貫したスタイル（`$` プレフィックス統一）で記述する
- ドキュメント更新で既存の誤記があれば併せて修正する（Boy Scout Rule）

## Acceptance Criteria

- [ ] `boundify-graph-to-dirs.md` の使用スクリプト一覧に `validate-slug.js` が追加されている
- [ ] Step 1 に `validate-slug.js` の実行が追加されている
- [ ] ガイドラインに prose 系 kind 廃止・prune ルール・ヘッダーコメント・クロスリファレンスが記載されている
- [ ] Step 2 に prune・階層化の説明が追加されている
- [ ] Step 3 にヘッダーコメント・宣言スタブ・クロスリファレンスの説明が追加されている
- [ ] 完了報告項目が最新の出力に合わせて更新されている
- [ ] 各スクリプトの JSDoc が最新の実装と一致している
- [ ] PX-27〜PX-30 の Acceptance Criteria と矛盾しない
- [ ] 翻訳可能性の検証が通っている（.md の可読性）
