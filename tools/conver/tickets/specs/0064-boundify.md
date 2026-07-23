---
ticket_id: 64
title: boundify 言語推論廃止とスキーマ直接参照への移行
slug: boundify
status: draft
created_at: 2026-07-07
updated_at: 2026-07-07
---

# boundify 言語推論廃止とスキーマ直接参照への移行

## Summary

PX-24 で拡張された `*-GRAPH.json` スキーマ（`mainLanguage` / ノード単位の `language` / `slug`）を boundify パイプラインで消費する。言語推論（`inferLanguage`）とファイル名推論（`titleToFileName`）の全ロジックを削除し、グラフから直接 `language` と `slug` を読み込んでディレクトリツリーを生成するように改修する。

## Background

`boundify-helpers.js` の `inferLanguage()` と `titleToFileName()` には以下の問題があり、これらは graphify 側で静的な値をグラフに埋め込むことで解決できる。

### 問題1: inferLanguage は全ノードを全3言語と判定する

`inferLanguage()` はタイトル＋サマリーのテキストをキーワードマッチングするが、日本語主体のRFCでは全177ノードが `["rust", "go", "typescript"]` と判定される。これは設計上の意図（ノードごとに言語を絞り込む）をまったく達成できていない。

### 問題2: titleToFileName は日本語タイトルで空文字を返す

ASCII英数字以外をすべて除去する正規表現を使用しており、日本語のみのタイトル15件が空文字に変換される。結果として同名ファイル（`.rs`）の大量重複が発生し、スキーマ検証に失敗する。

### 問題3: buildLangGraph の冗長な2回推論

`boundify-graph-to-dirs.js` の `buildLangGraph()` は `graphToLangJson()` 内部で全ノードの `inferLanguage()` を呼び出した上で、さらに `|| inferLanguage()` のフォールバックを持つ。同一推論が2回実行されている。

### 解決策

PX-24 で追加されるスキーマフィールドにより、以下のことが可能になる：
- 各ノードの `language`（単一値）をそのまま使用 → `inferLanguage()` 削除
- 各ノードの `slug`（lower_snake_case）をそのままファイル名に使用 → `titleToFileName()` 削除
- `mainLanguage` をループの基準に使用 → `SUPPORTED_LANGUAGES` 定数の見直し

## Scope

### boundify-helpers.js

- `inferLanguage()` 関数の削除
- `graphToLangJson()` 関数の削除（または language フィールドをパススルーする簡略版に置き換え）
- `titleToFileName()` 関数の削除
- `deduplicateFileNames()` 関数の整理（slug が一意であれば不要になる可能性が高いが、念のため保持）
- `SAFE_BOUNDARIES_EN_TEXT` / `SCHEMA` / `DIRECTIONAL_EDGE_TYPES` / `tarjanSCC()` 等の他モジュールから使用される関数は維持
- `LANGUAGE_EXTENSIONS` / `LANGUAGE_SEPARATORS` 定数はファイル名構築に引き続き必要（slug + ext）

### boundify-tree.js

- `buildDirectoryTree()` のファイル名生成ロジックを `titleToFileName()` → `node.slug + LANGUAGE_EXTENSIONS[lang]` に変更
- ディレクトリ名の生成も `slug` ベースに変更（現行は `titleToFileName().replace(/\.(rs|go|ts)$/, '')`）
- 言語リストの扱い：`SUPPORTED_LANGUAGES` 定数の代わりに、グラフノードの `language` 値から動的に収集

### boundify-graph-to-dirs.js

- `buildLangGraph()` の削除または簡略化（language フィールドを map に変換するだけにできる）
- `adaptBuildDirectoryTree()` に渡す引数から `titleToFileName` / `deduplicateFileNames` ヘルパーを削除
- `SUPPORTED_LANGUAGES` の代わりにグラフ内の実在言語のみをループ

### validate-dirs-tree-schema.js

- 新フィールド（`language` が単一値であること、`slug` の命名規則）の検証ルール追加
- 既存の拡張子チェックを維持（ただし `.rs` のみのファイル名は発生しなくなる）

### テストファイル

- `tests/rfc-graph/boundify-graph.test.cjs`
- `tests/rfc-graph/boundify-helpers.test.cjs`（存在する場合）
- `tests/rfc-graph/boundify-tree.test.cjs`（存在する場合）
- 言語推論テスト → 削除（テスト自体が不要になる）
- ファイル名生成テスト → slug ベースに変更
- 既存グラフとの互換性テストを追加

## Non-scope

- graphify 側のスキーマ拡張 — これは PX-24
- 既存グラフデータの一括マイグレーション — PX-24 の完了後に再生成する
- `commands/boundify-graph.md` の大幅な構造変更 — コマンド定義のインターフェースは維持

## Investigation

### 実行時エビデンス

本チケットの調査は PX-24 の Investigation と共通する部分が多い。以下は boundify 固有のエビデンス。

### 関連コード箇所

| ファイル | 行 | 内容 | アクション |
|---|---|---|---|
| `boundify-helpers.js` | 130-181 | `inferLanguage()` — 全推論ロジック | **削除** |
| `boundify-helpers.js` | 187-208 | `graphToLangJson()` — 推論を全ノードに適用 | **削除**（または簡略化） |
| `boundify-helpers.js` | 330-387 | `titleToFileName()` — ファイル名生成 | **削除** |
| `boundify-helpers.js` | 394-426 | `deduplicateFileNames()` — 重複解決 | 維持（予備） |
| `boundify-tree.js` | 191 | `buildTreeFromRoot()` — ディレクトリ名 `dirName.replace(/\.\.\.$/, '')` | slug ベースに変更 |
| `boundify-tree.js` | 213,277 | ファイル名生成 `titleToFileName(title)` | slug ベースに変更 |
| `boundify-tree.js` | 269-293 | `findRuleDrivenNodes()` — `deduplicateFileNames` 不使用 | slug 一意化により解消 |
| `boundify-graph-to-dirs.js` | 248-259 | `buildLangGraph()` | **削除**または簡略化 |
| `boundify-graph-to-dirs.js` | 240-246 | `adaptBuildDirectoryTree()` — helpers 注入 | 引数削減 |
| `boundify-graph-to-dirs.js` | 391-418 | `for (const lang of SUPPORTED_LANGUAGES)` ループ | 動的収集に変更 |
| `validate-dirs-tree-schema.js` | 210-245 | `checkNamingConventions()` — 拡張子検証 | 維持＋slug形式検証追加 |

### 依存関係図

```
PX-24 完了（スキーマ拡張）→ 新しい *-GRAPH.json が生成可能に
    ↓
PX-25 開始
    ↓
boundify-helpers.js から inferLanguage / titleToFileName 削除
    ↓
boundify-tree.js を slug ベースに変更
    ↓
boundify-graph-to-dirs.js の buildLangGraph / SUPPORTED_LANGUAGES ループ改修
    ↓
validate-dirs-tree-schema.js に slug 検証ルール追加
    ↓
テスト一括改修
```

## Test Plan

### ユニットテスト計画

PX-25 は PX-24 よりテスト範囲が広い。以下をテストする。

1. **boundify-helpers.js 削除後も残存関数が正常動作する**
   - `tarjanSCC()` の循環依存検出
   - `projectEdgesToDirectories()` のエッジ投影
   - `SAFE_BOUNDARIES_EN_TEXT` の内容
   - `LANGUAGE_EXTENSIONS` / `LANGUAGE_SEPARATORS` の値

2. **boundify-tree.js slug ベースファイル名生成**
   - 正常系: ノードの slug と拡張子を結合したファイル名が生成される
   - 正常系: ディレクトリ名が slug から生成される
   - 異常系: slug 未設定ノードのフォールバック（互換性）
   - 言語指定がないノードの扱い

3. **boundify-graph-to-dirs.js 動的言語リスト**
   - 正常系: グラフ内の language 値のみでループする
   - 正常系: 単一言語グラフ → 1言語のみのツリー生成
   - 互換性: slug/language 未設定の古いグラフでもエラーにならない

4. **validate-dirs-tree-schema.js 新検証ルール**
   - slug の命名規則（lower_snake_case）検証
   - language が単一値であることの検証
   - ファイル名が `slug.ext` 形式に従っていることの検証

### ユニットテスト不可能な項目（例外）

- なし。すべての改修は純粋関数およびファイルI/Oのユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

### 削除対象（Boy Scout 改善の対象外）

以下の関数は削除されるため、改善は行わない（動作を継承する必要はない）：
- `inferLanguage()` — 完全削除
- `titleToFileName()` — 完全削除

### 残存関数の改善

- `tarjanSCC()`: `index`, `lowlink` のネーミングはアルゴリズム標準のため維持
- `projectEdgesToDirectories()`: 変数名 `dirEdges` → `directoryEdges` にリネーム（翻訳可能性向上）
- `deduplicateFileNames()`: 関数自体は維持するが、slug 一意化により呼び出し頻度が激減する。コメントを実態に合わせて更新

### 新規コード

- 新しく書くコードはすべて翻訳可能に。
- 関数 = 動詞句（`resolveLanguageFromGraph`, `buildTreeForLanguages` 等）
- 変数 = ドメイン概念（`graphLanguages` 等）

## Acceptance Criteria

- [ ] `inferLanguage()` がコードベースから完全に削除されている（全呼び出し箇所の確認）
- [ ] `titleToFileName()` がコードベースから完全に削除されている（全呼び出し箇所の確認）
- [ ] ファイル名がノードの `slug` + 拡張子から生成される
- [ ] 言語ループがグラフ内の実在言語のみに縮小されている
- [ ] slug/language 未設定の既存グラフとの互換性が維持されている（フォールバック）
- [ ] 既存テストがすべて通過している（削除対象テストを除く）
- [ ] 日本語タイトルの RFC グラフで空ファイル名が生成されない
- [ ] 翻訳可能性検証が通っている

## Notes

- PX-24 でのスキーマ確定を前提とする。PX-24 未完了の場合、本チケットは着手不可。
- `*-GRAPH.json` のフォーマットが変わるため、boundify 関連の全テストファイルをPASSさせるには、テスト用のグラフJSONも新しいスキーマに合わせて更新する必要がある。
- P17-1 / P18-1 / P19-1 / P21-1 の各チケット完了品（boundify-helpers.js / boundify-tree.js / validate-dirs-tree-schema.js / boundify-graph-to-dirs.js）が本チケットの改修対象。
