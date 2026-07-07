---
ticket_id: 63
title: graphify-rfc 出力スキーマ拡張 — mainLanguage/language/slug
slug: graphify-rfc-mainlanguagelanguageslug
status: draft
created_at: 2026-07-07
updated_at: 2026-07-07
---

# graphify-rfc 出力スキーマ拡張 — mainLanguage/language/slug

## Summary

`*-GRAPH.json` のスキーマに3つのフィールドを追加する。これにより boundify パイプラインがノードのタイトルやサマリーから言語・ファイル名を推論する必要をなくし、graphify 側で静的に確定した情報をそのまま利用できるようになる。

追加フィールド:
- **ルートレベル**: `mainLanguage` — プロジェクト全体の主要プログラミング言語（単一値）
- **ノードレベル**: `language` — 当該ノードが実装されるプログラミング言語（単一値、配列ではない）
- **ノードレベル**: `slug` — タイトルから生成された lower_snake_case の識別子（ファイル名・ディレクトリ名のベースとして使用）

## Background

2026-07-07 の実動作検証で、以下の問題が確認された。

### 問題1: 日本語タイトルから空のファイル名が生成される

`boundify-helpers.js:titleToFileName()` は ASCII 英数字 `a-zA-Z0-9_` 以外をすべて除去する正規表現を使用している。日本語（漢字・ひらがな）のみで構成されたタイトル（例: `§3 用語 — ドメイン固有の定義`）は全ての文字が除去され、空文字列になる。結果として拡張子のみのファイル名（`.rs`）が生成され、同名ファイルの大量重複が発生する。

**実測: 177ノード中15ノードが空ファイル名になる。**

### 問題2: 言語推論が全ノードで全3言語を返す

`boundify-helpers.js:inferLanguage()` はタイトルとサマリーのテキストをキーワードマッチングで判定するが、日本語主体のRFCではすべてのノードが `["rust", "go", "typescript"]` と判定される。結果として同じ内容のディレクトリツリーが3言語分生成され、冗長である。

**実測: 177ノード中177ノードが全3言語判定。**

### 問題3: boundify 側で title からのファイル名推論が不安定

`titleToFileName()` はタイトルの先頭部分のみを切り出し、非ASCII文字を除去し、48文字に切り詰める。タイトルの細かな違いでファイル名が変わる不安定性があり、かつ元のタイトルとの対応関係が不明瞭になる。

### 解決策

上記3問題はすべて、graphify 側でノードの言語とスラグを確定値として持たせることで解決する。boundify 側の推論ロジック（inferLanguage / titleToFileName）は不要となる。

## Scope

### graphify-rfc.md（スラッシュコマンド定義）

- `*-GRAPH.json` のルートスキーマに `mainLanguage` フィールドを追加するよう指示を追記
- 各ノードのオブジェクトに `language`（単一文字列）と `slug`（lower_snake_case）を追加するよう指示を追記
- `slug` の生成ルールを定義（タイトルの英語部分 + セクション番号 等。日本語タイトルへの対応方法を明確化）

### graphify 関連スクリプト群

- グラフ生成時に `mainLanguage`、各ノードの `language`、`slug` を出力するロジックを追加
- `slug` の生成は node.title から決定論的に生成（セクション番号＋英語キーワード抽出等）
- PX-19 で導入された headingRefs との整合性を確保

### 既存グラフデータとの互換性

- 新フィールドが存在しない既存グラフでも boundify がエラーにならないよう、フォールバック処理を PX-25 側で実装する（本チケットのスコープ外だが、I/F 設計上留意）

## Non-scope

- boundify 側の改修（`inferLanguage()` / `titleToFileName()` 削除等） — これは PX-25
- 既存グラフデータの一括マイグレーション — グラフはオンデマンド生成のため不要
- `slug` の翻訳（日本語→英語変換） — 日本語タイトルの slug 生成ルールは本チケットで定義するが、機械翻訳は行わない。セクション番号＋kind 名の組み合わせ等で代替

## Investigation

### 実行時エビデンス

**エビデンス1: 日本語のみタイトルが空ファイル名になる（boundify-graph-to-dirs.js 実実行結果）**

```
$ node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js --graph="/Users/kawata/shyme/zasso/crates/siprs/RFC-ROOT-GRAPH.json"
[ERROR] Dirs-Tree.json のスキーマ検証に失敗しました
原因: パス重複: "rust/docs" 配下に同名ノード ".rs" が複数存在します
パス重複: "rust/config" 配下に同名ノード ".rs" が複数存在します
...
rust ファイルの拡張子が ".rs" ではありません: ".rs"（拡張子: ""）
```

**エビデンス2: titleToFileName の空文字出力（テストコードによる確認）**

```javascript
// boundify-helpers.js: titleToFileName("§3 用語 — ドメイン固有の定義", "rust") => ".rs"
//                                               ^^^^^^^^^^^^^^^^^^^^
//                                               すべて非ASCII → 除去 → 空文字
```

**エビデンス3: 全ノードが全3言語判定**

```javascript
const { languageMap } = graphToLangJson(graph);
Object.keys(languageMap).length; // 177
new Set(Object.values(languageMap).map(JSON.stringify));
// Set { '["rust","go","typescript"]' }
// → 177ノード中177ノードが全3言語。絞り込みは一切機能していない。
```

**エビデンス4: 空ファイル名になるノード一覧（15件）**

| ID | kind | タイトル | 現在のtitleToFileName結果 |
|---|---|---|---|
| N0006 | glossary | §3 用語 — ドメイン固有の定義 | `.rs` |
| N0028 | error_policy | §14.1 エラー変換方針 | `.rs` |
| N0036 | rationale | §15.6 イベントバス分割の設計判断 | `.rs` |
| N0037 | config | §15.7 イベントバスの確実配送非保証 | `.rs` |
| N0045 | state_machine | §17.1 登録状態遷移規則 | `.rs` |
| N0047 | state_machine | §18.1 通話状態遷移規則 | `.rs` |
| N0048 | requirement | §18.2 同時通話制約 | `.rs` |
| N0090 | error_policy | §29.1 コーデックフォールバックルール | `.rs` |
| N0115 | api_contract | §41.3 使用例 発信とイベント受信 | `.rs` |
| N0124 | test_policy | §43.5 プラットフォームテスト | `.rs` |
| N0137 | config | §48 デフォルトポリシーの明文化 | `.rs` |
| N0139 | requirement | §50 受け入れ基準 | `.rs` |
| N0140 | rationale | §51 結論 | `.rs` |
| N0169 | api_contract | §59.3 マルチネットワークインターフェース | `.rs` |
| N0177 | rationale | §61.6 参考 本セクションの目的と限界 | `.rs` |

### 関連コード箇所

| ファイル | 箇所 | 関連性 |
|---|---|---|
| `commands/graphify-rfc.md` | グラフスキーマ定義セクション | 追記対象 |
| `.claude/scripts/rfc-graph/` 全般 | P12〜P16 実装 | 全スクリプトがグラフを生成する可能性。最低限 crud.js と verify.js がスキーマに依存 |

## Test Plan

### ユニットテスト計画

本チケットは主に graphify-rfc.md（設計文書）の改修が中心であり、スクリプト改修は最小限。以下のテスト方針とする：

1. **graphify 関連スクリプトのテスト**: 新フィールド（mainLanguage/language/slug）を含むグラフJSONの生成が正常に行われることを検証
   - 正常系: `mainLanguage` が正しく設定される
   - 正常系: 各ノードに `language`（単一値）が設定される
   - 正常系: 各ノードに `slug`（lower_snake_case）が設定される
   - 異常系: `slug` に禁止文字（大文字、ハイフン等）が含まれない

2. **スキーマ検証テスト**: 新フィールドを考慮したバリデーションが動作することを確認

### ユニットテスト不可能な項目（例外）

- AIワークフローの指示（graphify-rfc.md）の改修はテスト不能。実行時にコマンドが期待通り動作することを手動確認する。

## Boy Scout Rule — 翻訳可能性計画

### 新規追記部分

- graphify-rfc.md に追記するスキーマ定義は、具体的なJSONのサンプルとフィールド説明を含め、翻訳可能性を確保する
- スクリプト修正時の関数名は動詞句（`generateSlug`, `attachLanguageToNode` 等）

### 既存コードの改善（スコープ内で触るもののみ）

- `slug` 生成関数は純粋関数として実装し、I/O を持たない
- ハードコードされた言語リスト（`['rust', 'go', 'typescript']`）は極力排除し、動的解決に寄せる方向で設計

## Acceptance Criteria

- [ ] graphify-rfc.md が更新され、`mainLanguage` / `language` / `slug` のスキーマ定義と生成ルールが記載されている
- [ ] graphify スクリプトが生成するグラフJSONに上記3フィールドが含まれている
- [ ] 既存のテスト（graphify 関連）がすべて通過している
- [ ] `slug` が lower_snake_case の命名規則に従っている
- [ ] `language` が単一値（配列ではない）である
- [ ] `mainLanguage` がルートレベルの必須フィールドとして設定されている

## Notes

- 本チケット(PX-24) → PX-25 の順序依存あり。先に PX-24 が完了し、新しいスキーマでグラフが生成できるようになってから PX-25 を着手する。
- PX-19 (headingRefs) との整合性に注意。slug の生成は headingRefs のトークンと矛盾しないルールとする。
- 既存 P21-1 (boundify-graph-to-dirs.js) のテスト群は PX-25 でまとめて改修される。
