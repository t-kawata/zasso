---
ticket_id: 12
title: JSON Schema定義とバリデーション基盤
slug: json-schema
status: draft
created_at: 2026-07-06
updated_at: 2026-07-06
---
# JSON Schema定義とバリデーション基盤（node.schema.json / edge.schema.json / graph.schema.json + 検証ユーティリティ）

## Summary

グラフデータモデルを規定する3つのJSON Schema（node.schema.json / edge.schema.json / graph.schema.json）と、crud.js から呼び出す汎用スキーマ検証関数 `validateAgainstSchema()` を一括実装する。これらのスキーマは RFC-GRAPHIFY.md §3.2.1〜3.2.3 で定義されたデータモデルを機械検証可能な形式でコード化したものであり、crud.js（P13-2）のすべての書き込み操作の前に呼び出される。

## Background

RFC GRAPHIFY-001 では、長大なMarkdown設計文書をI/O境界単位の細粒度ノードに分割し、属性付きエッジで結んだグラフ構造として永続化する。このグラフ構造のデータモデルは3つのJSON Schemaで定義される：

1. **node.schema.json**（§3.2.1）: ノードの構造と制約（ID形式 `N0001`〜、kind 10種、sourceRanges）
2. **edge.schema.json**（§3.2.2）: エッジの構造と制約（from/to ノードID参照、type 10種、attributes）
3. **graph.schema.json**（§3.2.3）: グラフ全体の構造（sourceFile、nodes[]、edges[]）

これらのスキーマは crud.js（P13-2）の全書き込み操作（create-nodes, create-edges, update-node, update-edge）の前置検証として使用される。スキーマ検証を通過したデータのみがグラフJSONに書き込まれる。

## Scope

- **node.schema.json**: `tools/conver/.claude/scripts/rfc-graph/schema/node.schema.json`
  - Draft 2020-12 準拠
  - 必須フィールド: id, title, kind, summary, sourceRanges
  - id パターン: `^N[0-9]{4}$`
  - kind 列挙: requirement, api_contract, data_model, state_machine, error_policy, config, test_policy, build_ci, rationale, glossary
  - sourceRanges: refId（`^REF[0-9]{3,}$`）, startLine, endLine
  - additionalProperties: false

- **edge.schema.json**: `tools/conver/.claude/scripts/rfc-graph/schema/edge.schema.json`
  - Draft 2020-12 準拠
  - 必須フィールド: from, to, type, attributes
  - from/to パターン: `^N[0-9]{4}$`
  - type 列挙: depends_on, implements, refines, conflicts_with, triggers, constrains, supersedes, references, part_of, validates
  - attributes: strength（hard/soft）, bidirectional（boolean）, note（maxLength 240）
  - additionalProperties: false

- **graph.schema.json**: `tools/conver/.claude/scripts/rfc-graph/schema/graph.schema.json`
  - Draft 2020-12 準拠
  - 必須フィールド: sourceFile, nodes, edges
  - nodes の items は node.schema.json を $ref 参照
  - edges の items は edge.schema.json を $ref 参照
  - additionalProperties: false

- **validateAgainstSchema()**: `tools/conver/.claude/scripts/rfc-graph/schema/validate.js`
  - スキーマディレクトリからJSON Schemaを読み込む
  - Ajv（Another JSON Schema Validator）を使用して検証
  - エラー時は3段テンプレートでエラー詳細を返す（エラーパス・期待値・実際の値）
  - crud.js（P13-2）から呼び出されることを前提としたAPI設計

## Non-scope

- crud.js 本体の実装（P13-2 で実施）
- verify.js の実装（P14-1 で実施）
- 上記スキーマ以外の追加スキーマ定義
- formulate連携スクリプト（P15以降）

## Investigation

### 証拠1: RFC-GRAPHIFY.md のスキーマ定義

RFC-GRAPHIFY.md §3.2.1（node.schema.json）、§3.2.2（edge.schema.json）、§3.2.3（graph.schema.json）に完全なスキーマ定義が記載されている。各スキーマは JSON Schema Draft 2020-12 に準拠し、`additionalProperties: false` で未知フィールドを明示的に拒否する。

参照: `tools/conver/RFC-GRAPHIFY.md:61-159`

### 証拠2: JSON Schema ライブラリ選定

Ajv v8 が最も広く使われている JSON Schema バリデータであり、Draft 2020-12 をサポートしている。node_modules に ajv が存在することを確認済み。`require('ajv')` でインポート可能。

### 証拠3: 出力先ディレクトリ

スキーマファイルの出力先は `tools/conver/.claude/scripts/rfc-graph/schema/` である。このディレクトリは現時点では存在しない。初回スキーマ作成時に mkdir -p で作成が必要。

### 証拠4: 依存関係の確認

- P13-2（crud.js）は本チケットの `validateAgainstSchema()` を呼び出す
- P13-2 の実装は本チケット完了後に着手される
- PX（conver.js基盤）とは独立しており、本チケットは PX に依存しない

## Test Plan

### ユニットテスト計画

テストファイル: `tools/conver/tests/rfc-graph/schema/validate.test.js`

**正常系:**
1. 有効なノードJSON（全kind種×最小構成）が node.schema.json の検証を通過する（10ケース）
2. 有効なエッジJSON（全type種×strength/biDirectional 組合せ）が edge.schema.json の検証を通過する（20ケース）
3. 有効なグラフJSON（ノード1〜10個・エッジ0〜5本）が graph.schema.json の検証を通過する（5ケース）

**異常系:**
4. 必須フィールド欠落で検証失敗する（id欠落 / title欠落 / kind欠落 / summary欠落 / sourceRanges欠落 / from欠落 / to欠落 / type欠落 / attributes欠落 / sourceFile欠落 / nodes欠落 / edges欠落）
5. 未知のkind値で検証失敗する（"unknown_kind"）
6. 未知のtype値で検証失敗する（"unknown_type"）
7. IDパターン違反で検証失敗する（"N001" 4桁未満 / "X0001" 先頭N以外 / "N001a" 数字以外含む）
8. sourceRanges の startLine > endLine で検証失敗する
9. from/to が node.schema.json の id パターンに従わない値で検証エラーとなる
10. strength が "hard"/"soft" 以外で検証失敗する
11. bidirectional が boolean 以外で検証失敗する
12. additionalProperties 指定により未知フィールドを含むデータが検証失敗する
13. 空の nodes[] 配列はスキーマ上は許容される（graph.schema.json で minItems 未指定）

**境界値:**
14. title が maxLength=120 を超える文字列で検証失敗する
15. title が空文字列で検証失敗する（minLength: 1）
16. sourceRanges が空配列で検証失敗する（minItems: 1）
17. attributes.note が maxLength=240 を超える文字列で検証失敗する

**validateAgainstSchema() 関数のテスト:**
18. 存在しないスキーマファイルを指定した場合にエラーを返す
19. 有効なJSONが検証を通過した場合、成功結果を返す
20. 無効なJSONが検証エラーとなった場合、3段テンプレート形式でエラー詳細を返す

### ユニットテスト不可能な項目（例外）

なし。すべての検証は JSON Schema + Ajv で機械的に実施可能であり、外部API結合やハードウェア依存は存在しない。

## Boy Scout Rule — 翻訳可能性計画

本チケットで作成するファイルは以下の通り：

**JSON Schema ファイル**（node.schema.json / edge.schema.json / graph.schema.json）:
- スキーマ自体が自己記述的であり、プロパティ名はドメイン概念（kind, type, strength 等）を正確に表現
- `additionalProperties: false` により未知のプロパティを明示的に拒否し、暗黙の許容を排除

**validate.js**（validateAgainstSchema()）:
- 関数名は「スキーマに対して検証する」を表明する `validateAgainstSchema` と命名
- エラーメッセージは3段テンプレート（エラーパス・期待値・実際の値）で構造化
- Ajv のエラーをそのまま返さず、人間可読な形式に変換する

**テストファイル**（validate.test.js）:
- Arrange-Act-Assert パターンで統一
- テストケース名は「どの入力で何が起きるか」を散文として読める形式に

## Acceptance Criteria

- [ ] 3つのJSON Schemaファイルが RFC-GRAPHIFY.md §3.2.1〜3.2.3 の定義と完全に一致する
- [ ] Draft 2020-12 として有効であり、Ajv での自己検証に成功する
- [ ] validateAgainstSchema() が有効データを受け入れ、無効データを拒否する
- [ ] 異常系テストが全ケース通過する（必須フィールド欠落・パターン違反・未知の列挙値）
- [ ] テストカバレッジが 90% 以上（クリティカルパスであるエラーハンドリングは 100%）
- [ ] 関連チケット P13-2（crud.js）とのインターフェースが確定している

## Notes

- 本チケットは P12（基本データモデルとスキーマ定義）の最初のチケットである
- RFC-GRAPHIFY.md の §§3.2.1-3.2.3 が唯一の設計ソースであり、実装はこれに完全準拠する
- 依存関係の修正: `relatedTicketIds` の「P13-3」は誤り。正しくは「P13-2 (crud.jsが本チケットのスキーマ検証関数を呼び出す)」

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
