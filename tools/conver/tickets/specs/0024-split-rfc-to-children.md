---
ticket_id: 24
title: split-rfc-to-children スラッシュコマンドの実装
slug: split-rfc-to-children
status: draft
created_at: 2026-06-29
updated_at: 2026-06-29
---

# split-rfc-to-children スラッシュコマンドの実装

## Summary

`/split-rfc-to-children` スラッシュコマンドを新設する。本コマンドは、長大で密結合な正典RFC（RFC-ROOT.md 等）を、安全なI/O境界で区切られた**独立した名前空間単位**（crate/module/class）の子・孫RFCに分割する。

**核となる設計**: 各RFCファイルは名前空間と 1:1 に対応し、**ディレクトリ構造が RFC_TREE と完全に一致する**。各ディレクトリは独立した `{正典名}-{childId}-{slug}.md` を持ち、その中で `formulate-tickets` を独立実行できる。これは git branch での並行実装を衝突なく可能にするための要件である。

**実行引数**:
```
/split-rfc-to-children </path/to/canonical/RFC.md>
```

### ディレクトリ構造の具体例

```
/path/to/rfc-root/
├── {正典名}-{childId}-{slug}.md                              # 正典RFC（親）
│                                        # （正典RFCと同じ階層に RFC-TREE.json が生成される）
├── RFC-ROOT-01-parser/                           # 子RFC #01: parser 名前空間
│   ├── {正典名}-{childId}-{slug}.md                           #   子RFCの設計書（`<!-- ??? -->` から詳細化される）
│   ├── tickets/                         #   formulate-tickets の出力先
│   ├── 01-lexer/                        #   孫RFC #01: lexer 名前空間
│   │   ├── {正典名}-{childId}-{slug}.md
│   │   └── tickets/
│   └── 02-ast/                          #   孫RFC #02: ast 名前空間
│       ├── {正典名}-{childId}-{slug}.md
│       └── tickets/
├── 02-evaluator/                        # 子RFC #02: evaluator 名前空間
│   ├── {正典名}-{childId}-{slug}.md
│   └── tickets/
└── 03-typechecker/                      # 子RFC #03: typechecker 名前空間
    ├── {正典名}-{childId}-{slug}.md
    └── tickets/
```

各ディレクトリの `{正典名}-{childId}-{slug}.md` が「当該名前空間のRFC設計書」であり、`tickets/` が `/formulate-tickets` によるチケット管理の出力先である。親・子・孫の関係は RFC-TREE.json のツリー構造とディレクトリの入れ子が完全に一致するため、機械的な検証が可能である。

### 言語検出と最適化の方針

本コマンドは正典RFCの実装対象言語を自動検出し、言語ごとに最適な分割・生成を行う。検出は正典RFCファイルと同じディレクトリ（上位のプロジェクトルートも含む）に存在するビルド設定ファイルで判断する：

| 言語 | 検出条件 | namespaceUnit | 分割単位 |
|------|---------|---------------|---------|
| **Rust** | `Cargo.toml` に `[workspace]` | `crate` | workspace crate。`Cargo.toml` の `path =` 依存で結合 |
| **Go** | `go.mod` + `go.work` または `go.mod` | `package` / `module` | Go module。`go.work` の `use` で管理 |
| **TypeScript** (frontend) | `fe/package.json` or `package.json` with Quasar | `module` (npm package) | npm workspace package。`tsconfig` paths + `package.json` workspaces |
| **TypeScript** (backend) | `src-tauri/` なし、`package.json` with `"type": "module"` | `module` | npm workspace package。同上 |

言語ごとの最適化は RFC-TREE.json の `language` フィールドに記録され、以降の全ステップで参照される。各ステップの言語別注記は **`[Rust]` / `[Go]` / `[TS]`** のラベルで区別する。

## Background

正典RFCはしばしば長大な設計書（RFC_ROOT.md は約1100行）になり、各所が密結合した形で全体が設計されている。このようなRFCを実装する際、以下の問題が発生する：

1. **実装単位が不明確**: 1100行の設計書全体を一度に理解して実装するのは困難であり、どの部分から着手すべきかの判断が難しい
2. **I/O境界が不明**: 密結合な設計において、どこが安全な分離境界（I/Oインターフェース）で、どこが内部結合なのかが設計書から読み取れない
3. **テスト単位が不明**: 単体テストすべき単位と結合テストすべき単位の区別がつかない
4. **チケット分割の指針がない**: formulate-tickets がチケットを生成する際、RFCのどの範囲を1チケットにすべきかの判断材料が不足する

### ディレクトリ構造 = RFC_TREE の根拠

従来の「ファイル名で階層をエンコードしてフラット出力」方式には以下の問題があった：

- 1つのRFCファイルが1つの名前空間を表現するにも関わらず、物理的には1ディレクトリに全ファイルが混在する
- `/formulate-tickets` を実行すると、全チケットが単一の Tickets.json に集約されるため、名前空間間の衝突が発生する
- git branch で並行実装しようとすると、同名の Tickets.json の編集が必ず衝突する

ディレクトリ構造 = RFC_TREE 方式ではこれらの問題が解決される：

- **各ディレクトリが独立した名前空間**: 1名前空間 = 1ディレクトリ。`{正典名}-{childId}-{slug}.md` と `tickets/` が閉じている
- **git branch で衝突しない**: 異なる名前空間のディレクトリを別々の branch で編集しても、変更ファイルが完全に分離される
- **独立した formulate-tickets**: 各ディレクトリ内で独立に `/formulate-tickets` を実行でき、Tickets.json の衝突が発生しない

## Scope

1. **`.claude/commands/split-rfc-to-children.md`** — スラッシュコマンド定義（8ステップのワークフロー）

2. **`.claude/scripts/tickets/` 配下のスクリプト群（11種類）:**

   | # | スクリプト | 責務 |
   |---|-----------|------|
   | 1 | `create-rfc-tree.js` | RFC-TREE.json の雛形作成（スキーマ定義＋バリデーション内蔵） |
   | 2 | `add-rfc-tree-meta.js` | 正典RFCのメタデータ書き込み（パス・タイトル・日付等） |
   | 3 | `add-rfc-tree-goal.js` | rfcUnderstanding: purpose/goals/successCriteria/nonScope 書き込み |
   | 4 | `add-rfc-tree-architecture.js` | rfcUnderstanding: architecture/componentRelations/designDecisions 書き込み |
   | 5 | `add-rfc-tree-detail-1.js` | rfcUnderstanding: typeDefinitions/apiSignatures/dependencyGraph/externalDependencies 書き込み |
   | 6 | `add-rfc-tree-detail-2.js` | rfcUnderstanding: testRequirements/errorHandling/configuration 書き込み |
   | 7 | `write-rfc-tree-draft.js` | 素案ツリーの作成・書き込み（最大3階層、孤立禁止） |
   | 8 | `write-rfc-tree-final.js` | 検証ループ通過後の完成版ツリーを別フィールドに保存 |
   | 9 | `generate-child-rfcs.js` | **完成版ツリーに基づきディレクトリ構造を機械的に生成** |
   | 10 | `check-rfc-placeholders.js` | 全 `{正典名}-{childId}-{slug}.md` の未記入 `<!-- ??? -->` マーカーを再帰的に一覧・完了確認 |
   | 11 | `verify-rfc-coverage.js` | ディレクトリ構造が RFC_TREE と一致するか機械的に検証 |

3. **`RFC-TREE.json` スキーマ定義** — 全スクリプトが参照する厳格な JSON Schema

## Non-scope

- 既存の `find-omissions-for-next-rfc.md` Step 2 の改造
- 既存の `OMISSIONS-XXX.json` の改造
- `Tickets.json` の直接操作
- 孫階層の強制（合理的な場合のみ孫まで分割する）

## 各ステップの言語別最適化

本コマンドの8ステップのうち、以下の4ステップが言語依存の判断を含む。各ステップの注記は `[Rust]` / `[Go]` / `[TS]` のラベルで区別する。ラベルのない注記は全言語共通。

### Step 3: rfcUnderstanding（14フィールド分析）における言語別注記

rfcUnderstanding の14フィールド自体は言語不変だが、**分析時の着目点**が言語によって異なる：

| フィールド | [Rust] 着目点 | [Go] 着目点 | [TS] 着目点 |
|-----------|--------------|------------|------------|
| typeDefinitions | 構造体・enum・trait・型エイリアス | struct・interface・type 宣言 | type・interface・Vue component props |
| apiSignatures | pub fn / pub trait の完全シグネチャ | 大文字始まりのexported関数 | export された関数・コンポーネント |
| dependencyGraph | workspace crate 間の参照・trait 境界 | import パス・interface 実装関係 | import 文・Vue component 間参照 |
| externalDependencies | 外部 crate（tokio/serde/reqwest） | 外部 module（標準ライブラリ主体） | npm パッケージ・CDN |
| errorHandling | Result / Error 型・カスタムエラー | error interface・errors.Is/As | try-catch・catch 境界・fallback |
| testRequirements | #[cfg(test)] + mod tests ・ doctest | _test.go ファイル・TestXxx 関数 | .test.ts ・ Vitest 記述 |
| configuration | Cargo.toml features ・ config crate | envconfig・YAML + 構造体 | env・Vite .env・Runtime Config |

### Step 4: 素案ツリー作成における言語別注記

「名前空間の分割単位＝namespaceUnit」が言語によって異なり、それに伴いディレクトリ設計も最適化される：

#### [Rust] — 子 = workspace crate、孫 = submodule

```
RFC-ROOT-01-parser/                        # workspace crate
├── {正典名}-{childId}-{slug}.md
├── tickets/
├── Cargo.toml                    # [dependencies] で path = "../02-evaluator"
├── src/
│   ├── lib.rs                    # pub mod lexer; pub mod ast;
│   └── ...
└── 01-lexer/                     # 孫 = submodule（同一crate内）
    ├── {正典名}-{childId}-{slug}.md
    └── ...
```

- **安全なI/O境界**: `pub trait` の定義。trait が境界線。実装は内部に隠蔽
- **疎結合方法**: `Cargo.toml` の `[dependencies]` で `path = "../02-evaluator"`。workspace crate 間の参照は明示的
- **Send + Sync**: 境界をまたぐ型は自動的に Send/Sync がチェックされる。`trait X: Send + Sync` で明示も可能
- **テスト**: 各 crate 内の `#[cfg(test)]` に閉じる。結合テストは `tests/` ディレクトリ

#### [Go] — 子 = module、孫 = subpackage

```
RFC-ROOT-01-parser/                        # Go module（go.mod あり）
├── {正典名}-{childId}-{slug}.md
├── tickets/
├── go.mod                        # module github.com/user/project/01-parser
├── lexer/                        # 孫 = subpackage（同一module内）
│   ├── {正典名}-{childId}-{slug}.md
│   ├── tickets/
│   └── lexer.go
├── parser.go
└── parser_test.go
```

- **安全なI/O境界**: 大文字始まりの exported interface / function。小文字はパッケージ外からアクセス不可
- **疎結合方法**: `go.work` の `use` ディレクティブで全モジュールを管理。`import "github.com/user/project/02-evaluator"` で参照
- **循環依存の強制チェック**: Go コンパイラが循環 import を禁止する → **循環依存がある分割案はコンパイル時に自動検出される**。RFC_TREE の正当性検証に活用可能
- **テスト**: 各パッケージ内の `_test.go` に閉じる。結合テストも同一ファイル内で `package parser_test`

#### [TS] — 子 = npm workspace package、孫 = module（同一package内）

```
RFC-ROOT-01-parser/                        # npm workspace package
├── {正典名}-{childId}-{slug}.md
├── tickets/
├── package.json                  # "name": "@project/01-parser"
├── tsconfig.json                 # "composite": true, "references": [...]
├── src/
│   ├── index.ts                  # 公開API
│   ├── lexer/                    # 孫 = module（同一package内）
│   │   ├── {正典名}-{childId}-{slug}.md
│   │   ├── tickets/
│   │   ├── index.ts
│   │   └── lexer.test.ts
│   └── parser.test.ts
```

- **安全なI/O境界**: `export` された type / interface / function。`export` しないものはモジュール外部からアクセス不可
- **疎結合方法**: ルートの `pnpm-workspace.yaml` + 各 package の `package.json` + ルート `tsconfig.json` の `references`
- **設定増加**: Rust や Go に比べて設定ファイル（package.json, tsconfig.json, pnpm-workspace.yaml）が増える。Turborepo / Nx の導入も検討
- **FE と BE の分離**: フロントエンド（Vue/Quasar）の名前空間は `fe/` 配下、バックエンド（Axum/Node）は別 workspace package として分割。同じ TypeScript でも FE/BE でビルド設定が異なることに注意

### Step 6: generate-child-rfcs.js における言語別注記

機械的なディレクトリ生成時に、言語に応じて追加で生成すべきファイルが異なる：

| 生成物 | [Rust] | [Go] | [TS] |
|--------|--------|------|------|
| `{正典名}-{childId}-{slug}.md` | ✅ 共通 | ✅ 共通 | ✅ 共通 |
| `tickets/` | ✅ 共通 | ✅ 共通 | ✅ 共通 |
| 追加ファイル | `Cargo.toml`（path deps 含む） | `go.mod` | `package.json` |
| 追加ファイル | `src/lib.rs`（mod 宣言含む） | — | `tsconfig.json`（composite） |
| 追加ファイル | — | — | `src/index.ts` |

**言語別追加ファイルのテンプレート:**

[Rust - Cargo.toml]:
```toml
[package]
name = "{directoryName}"
version = "0.1.0"
edition = "2021"

[dependencies]
# 依存関係は RFC-TREE の dependencyOn フィールドに基づき自動生成
02-evaluator = { path = "../02-evaluator" }
```

[Rust - src/lib.rs]:
```rust
// [::STUB::] このファイルは generate-child-rfcs.js が生成した雛形です。
// <!-- ??? --> の箇所は対応する {正典名}-{childId}-{slug}.md の記述に従って実装すること。

// 孫モジュール（RFC-TREE に孫が存在する場合のみ生成）
pub mod lexer;
pub mod ast;

// 当該crateの公開API（<!-- ??? -->）
pub trait Parser {
    fn parse(&self, input: &str) -> Result<Ast, ParseError>;
}
```

[Go - go.mod]:
```
module github.com/user/project/01-parser

go 1.22

require github.com/user/project/02-evaluator v0.0.0
replace github.com/user/project/02-evaluator => ../02-evaluator
```

[TS - package.json]:
```json
{
  "name": "@project/01-parser",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@project/02-evaluator": "workspace:*"
  }
}
```

**言語別ファイル生成の有効/無効は `language` フィールドで切り替える。** `generate-child-rfcs.js` はこのフィールドを読み取り、適切な追加ファイルを生成する。

### Step 7: 詳細記述における言語別注記

`<!-- ??? -->` マーカーを埋める際、各セクションで記述すべき言語固有の内容：

| {正典名}-{childId}-{slug}.md セクション | [Rust] 記述内容 | [Go] 記述内容 | [TS] 記述内容 |
|-----------------|----------------|--------------|--------------|
| 責務 | crate の責務・所有権の境界 | package の責務・interface 一覧 | module の責務・export 型一覧 |
| I/O境界 | pub trait の定義・Send+Sync要件 | exported interface の定義 | exported type/interface の定義 |
| 依存関係 | Cargo.toml path deps・feature flags | go.work / import path | workspace 参照・types 依存 |

### Step 8: 網羅性検証における言語別注記

| 検証項目 | [Rust] | [Go] | [TS] |
|---------|--------|------|------|
| path 依存整合 | Cargo.toml の path が directoryName と一致する | go.mod の replace が directoryName と一致する | package.json の workspace:* が一致する |
| ビルド設定存在 | 各子ディレクトリに Cargo.toml がある | 各子ディレクトリに go.mod がある | 各子ディレクトリに package.json がある |
| 循環依存 | cargo check で間接検証可能 | **コンパイラが直接検証** | tsc --noEmit で間接検証可能 |

## Investigation

### 既存の rfcUnderstanding 構造（再利用対象）

```json
{
  "rfcUnderstanding": {
    "purpose": "", "goals": "", "successCriteria": "", "nonScope": "",
    "architecture": "", "componentRelations": "", "designDecisions": "",
    "typeDefinitions": "", "apiSignatures": "", "dependencyGraph": "",
    "externalDependencies": "", "testRequirements": "", "errorHandling": "",
    "configuration": ""
  }
}
```

14フィールドを `find-omissions-for-next-rfc.md` の Step 2（6子ステップ）と**同一の方法**で書き込む。
既存の `add-omissions-rfc-goal.js` / `add-omissions-rfc-architecture.js` / `add-omissions-rfc-detail-1.js` / `add-omissions-rfc-detail-2.js` と同様のスクリプトを本チケットでも作成する。

### 既存スクリプトのパターン（再利用）

| 既存スクリプト | 本チケットでの相当品 |
|---------------|-------------------|
| `create-omissions.js` | `create-rfc-tree.js` |
| `add-omissions-meta.js` | `add-rfc-tree-meta.js` |
| `add-omissions-rfc-goal.js` | `add-rfc-tree-goal.js` |
| `add-omissions-rfc-architecture.js` | `add-rfc-tree-architecture.js` |
| `add-omissions-rfc-detail-1.js` | `add-rfc-tree-detail-1.js` |
| `add-omissions-rfc-detail-2.js` | `add-rfc-tree-detail-2.js` |
| `validate-omissions.js` | `validate-rfc-tree.js`（スキーマ検証） |

### RFC-TREE.json スキーマ設計

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": [
    "canonicalRfcPath", "canonicalRfcTitle", "generatedAt",
    "rfcUnderstanding", "draftTree", "finalTree"
  ],
  "properties": {
    "canonicalRfcPath": { "type": "string" },
    "canonicalRfcTitle": { "type": "string" },
    "generatedAt": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}$" },
    "summary": { "type": "string" },
    "language": {
      "type": "string",
      "enum": ["rust", "go", "typescript"],
      "description": "自動検出された実装言語。全ステップの最適化の基準となる"
    },
    "rfcUnderstanding": { "type": "object" },
    "draftTree": { "$ref": "#/definitions/tree" },
    "finalTree": { "$ref": "#/definitions/tree" }
  },
  "definitions": {
    "tree": {
      "type": "array",
      "items": { "$ref": "#/definitions/childNode" },
      "description": "孤立ノード禁止。全ノードがツリーに接続されていること"
    },
    "childNode": {
      "type": "object",
      "required": [
        "childId", "directoryName", "namespaceUnit",
        "ioSchema", "decouplingMethod", "rfcEvidence"
      ],
      "properties": {
        "childId": {
          "type": "string", "pattern": "^\\d{2}$",
          "description": "2桁0埋めの連番（01, 02, ...）"
        },
        "directoryName": {
          "type": "string", "minLength": 1,
          "description": "実際のディレクトリ名 = {childId}-{kebab-case-name}。例: 01-parser"
        },
        "name": { "type": "string", "minLength": 1 },
        "namespaceUnit": {
          "type": "string",
          "description": "Goのpackage/Rustのcrate/TypeScriptのmodule 等"
        },
        "summary": { "type": "string", "description": "この名前空間の責務概要" },
        "ioSchema": {
          "type": "string",
          "description": "安全なI/O境界のスキーマ定義。外部に公開するインターフェース"
        },
        "decouplingMethod": {
          "type": "string",
          "description": "親・兄弟との疎結合方法（interface/trait/protocol buffer 等）"
        },
        "rfcEvidence": {
          "type": "string",
          "description": "正典RFCの該当セクション。この名前空間の設計根拠"
        },
        "dependencyOn": {
          "type": "array",
          "items": { "type": "string", "pattern": "^\\d{2}$" },
          "description": "依存する子ID一覧（例: [\"01\", \"02\"]）"
        },
        "children": {
          "type": "array",
          "items": { "$ref": "#/definitions/grandchildNode" },
          "description": "孫ノード配列。空配列または省略可（孫なし）"
        }
      }
    },
    "grandchildNode": {
      "type": "object",
      "required": [
        "grandchildId", "directoryName", "namespaceUnit",
        "ioSchema", "decouplingMethod", "rfcEvidence", "parentEvidence"
      ],
      "properties": {
        "grandchildId": {
          "type": "string", "pattern": "^\\d{2}$",
          "description": "子内での2桁連番"
        },
        "directoryName": {
          "type": "string", "minLength": 1,
          "description": "ディレクトリ名 = {grandchildId}-{kebab-case-name}。例: 01-lexer"
        },
        "name": { "type": "string", "minLength": 1 },
        "namespaceUnit": { "type": "string" },
        "summary": { "type": "string" },
        "ioSchema": { "type": "string" },
        "decouplingMethod": { "type": "string" },
        "rfcEvidence": {
          "type": "string",
          "description": "正典RFCの該当箇所（根拠）"
        },
        "parentEvidence": {
          "type": "string",
          "description": "親（子）RFCのどの箇所が根拠か。つまり「なぜこの孫が子の配下にあるのか」の理由"
        },
        "dependencyOn": {
          "type": "array",
          "items": { "type": "string" },
          "description": "依存する兄弟孫ID一覧"
        }
      }
    }
  }
}
```

**`directoryName` の決定ルール:**
- 子: `{childId}-{kebab-case-name}` → `01-parser`
- 孫: `{grandchildId}-{kebab-case-name}` → `01-lexer`
- 名前は kebab-case に正規化する（スペース→ハイフン、大文字→小文字）

### 物理ディレクトリ構造 = RFC_TREE

`generate-child-rfcs.js` が finalTree に基づいて以下のようにディレクトリを生成する：

```
/path/to/canonical-rfc-dir/
├── {正典名}-{childId}-{slug}.md                          # 正典RFC（元のファイル、移動しない）
├── RFC-TREE.json                   # ツリーメタデータ
├── RFC-ROOT-01-parser/                      # ← generate-child-rfcs.js が作成
│   ├── {正典名}-{childId}-{slug}.md                       #   子RFC（`<!-- ??? -->` マーカー付き）
│   └── tickets/                     #   空の tickets ディレクトリ
│       └── .gitkeep
│   └── 01-lexer/                   # ← 孫RFC
│       ├── {正典名}-{childId}-{slug}.md
│       └── tickets/
│           └── .gitkeep
├── 02-evaluator/
│   ├── {正典名}-{childId}-{slug}.md
│   └── tickets/
│       └── .gitkeep
└── 03-typechecker/
    ├── {正典名}-{childId}-{slug}.md
    └── tickets/
        └── .gitkeep
```

各 `{正典名}-{childId}-{slug}.md` の frontmatter にはツリー上の位置情報を機械的に書き込む：

```yaml
---
tree:
  level: child                    # または grandchild
  childId: "01"
  childName: parser
  directoryName: 01-parser
  parentPath: ..                  # 親ディレクトリへの相対パス
  grandchildId: null              # 孫の場合のみ設定
canonicalRfcPath: ../{正典名}-{childId}-{slug}.md       # 正典RFCへの相対パス
canonicalRfcSection: "§3.2"       # 正典RFCの該当セクション
ioSchema: "..."
decouplingMethod: "..."
dependencyOn: ["02", "03"]
---
```

### スクリプトの責務詳細 — generate-child-rfcs.js の変更点

**変更前（破棄）:**
- フラットに `RFC-ROOT-03-01.md` を出力
- ファイル名のみで階層を表現

**変更後（新設計）:**
- `finalTree` を走査し、子ノードごとに `{childId}-{directoryName}/` ディレクトリを作成
- 各ディレクトリに `{正典名}-{childId}-{slug}.md` を生成（`<!-- ??? -->` マーカーと frontmatter を機械的に書き込み）
- 孫ノードがある場合、子ディレクトリ内に `{grandchildId}-{directoryName}/` を作成
- 各ディレクトリに `tickets/` + `.gitkeep` を作成（後続の formulate-tickets が使用）
- 全生成が完了したら、生成したディレクトリ一覧を JSON で出力

**生成する `{正典名}-{childId}-{slug}.md` の機械的部分:**
```
<!--
GENERATED BY generate-child-rfcs.js — DO NOT EDIT THE STRUCTURE
Tree position: child-01 / 01-parser
Canonical RFC: ../{正典名}-{childId}-{slug}.md (§3.2)
-->
---
tree:
  level: child
  childId: "01"
  directoryName: 01-parser
  parentPath: ..
  canonicalRfcPath: ../{正典名}-{childId}-{slug}.md
  canonicalRfcSection: "§3.2"
  ioSchema: "(TBD)"
  decouplingMethod: "(TBD)"
  dependencyOn: []
---

# RFC: 01-parser

## 責務

<!-- ??? -->

## I/O境界

<!-- ??? -->

## 親（正典RFC）との関係

正典RFCの該当箇所: §3.2 — Parser の設計

<!-- ??? -->

## 依存関係

<!-- ??? -->
```

### スクリプトの責務詳細 — verify-rfc-coverage.js

**変更前（破棄）:**
- フラットなファイルリストの存在確認

**変更後（新設計）:**
- `finalTree` の全ノードに対して、`{directoryName}/{正典名}-{childId}-{slug}.md` の存在を確認
- 子ノードは `{childDir}/{正典名}-{childId}-{slug}.md`、孫ノードは `{childDir}/{grandchildDir}/{正典名}-{childId}-{slug}.md`
- 子ディレクトリ内に `tickets/` が存在するか確認
- ディレクトリ構造と tree 構造の不一致を検出
- 孤立ノード（どの親にも接続されていないディレクトリ）を検出
- 存在すべきでないファイル（RFC-TREE にない余分な {正典名}-{childId}-{slug}.md）を検出

## Test Plan

### ユニットテスト計画

**generate-child-rfcs.js:**

| テストケース | 内容 |
|------------|------|
| 正常系: ディレクトリ生成 | finalTree の全ノードに対応するディレクトリと `{正典名}-{childId}-{slug}.md` が生成される |
| 正常系: ディレクトリ名規則 | `RFC-ROOT-01-parser/` 形式になっている |
| 正常系: 孫ディレクトリ | 孫ノードは子ディレクトリ配下に `01-lexer/` 形式で生成される |
| 正常系: 孫なし | 子に孫がない場合、子ディレクトリ配下に孫ディレクトリは作成しない |
| 正常系: tickets/ | 各ディレクトリに `tickets/` + `.gitkeep` が生成される |
| 正常系: frontmatter | 各 `{正典名}-{childId}-{slug}.md` に tree・canonicalRfcPath・ioSchema 等の frontmatter が機械的に書き込まれる |
| 正常系: マーカー | 各 `{正典名}-{childId}-{slug}.md` に `<!-- ??? -->` マーカーが含まれる |
| 正常系: 根拠リンク | 各マーカー近辺に canonicalRfcSection / parentEvidence が記述されている |
| 正常系: [Rust] Cargo.toml | `language: "rust"` 時、各子ディレクトリに Cargo.toml（path deps 含む）と src/lib.rs が生成される |
| 正常系: [Go] go.mod | `language: "go"` 時、各子ディレクトリに go.mod が生成される |
| 正常系: [TS] package.json | `language: "typescript"` 時、各子ディレクトリに package.json と tsconfig.json が生成される |
| 正常系: 言語なし | `language` 未設定時、追加ファイルは生成しない（{正典名}-{childId}-{slug}.md + tickets/ のみ） |

**verify-rfc-coverage.js:**

| テストケース | 内容 |
|------------|------|
| 正常系: 構造一致 | ディレクトリ構造が finalTree と完全一致 → PASS |
| 異常系: 子ディレクトリ欠落 | finalTree に存在する子のディレクトリがない → FAIL |
| 異常系: 孫ディレクトリ欠落 | finalTree に存在する孫のディレクトリがない → FAIL |
| 異常系: 余剰ディレクトリ | finalTree にないディレクトリが存在する → FAIL |
| 異常系: tickets/ 欠落 | 各ディレクトリに `tickets/` がない → WARN |
| 異常系: 孤立ノード | どの親にも接続されていない {正典名}-{childId}-{slug}.md がある → FAIL |
| 正常系: [Rust] Cargo.toml 整合 | 全子ディレクトリに Cargo.toml が存在し、path 依存が他の子を正しく参照している |
| 正常系: [Go] go.mod 整合 | 全子ディレクトリに go.mod が存在する |
| 正常系: [TS] package.json 整合 | 全子ディレクトリに package.json が存在する |
| 異常系: [Rust] Cargo.toml 欠落 | language=rust で一部の子に Cargo.toml がない → FAIL |

**check-rfc-placeholders.js:**

| テストケース | 内容 |
|------------|------|
| 正常系: 再帰的検出 | 子・孫を含む全 `{正典名}-{childId}-{slug}.md` から `<!-- ??? -->` を再帰的に検出 |
| 正常系: 完了確認 | `<!-- ??? -->` がゼロの場合完了報告 |
| 異常系: 全ディレクトリ走査 | 指定ルート配下の全 `{正典名}-{childId}-{slug}.md` を漏れなく走査する |

**その他スクリプトのテストは変更前と同様。**

### ユニットテスト不可能な項目（例外）

- rfcUnderstanding の意味的正確性（AI分析部分）
- ツリー分割の意味的正確性（AI判断部分）
- 検証ループの意味的精度（AI判断部分）
- 子・孫RFCの詳細記述（AIが `<!-- ??? -->` を埋める部分）

## Boy Scout Rule — 翻訳可能性計画

新規スクリプト共通:

- **関数名は動詞句**: `createDirectoryTree()`, `validateTreeCoverage()`, `generateRfcFiles()`, `findPlaceholders()` 等
- **一関数一責務**: ディレクトリ作成、frontmatter 生成、マーカー検出は分離
- **ハードコード値の禁止**: ディレクトリ名パターン、frontmatter テンプレートは定数化
- **エラー握りつぶし禁止**: mkdir エラー、ファイル書込エラーは throw
- **パス操作は path.join/posix で統一**: プラットフォーム間のパス区切り差を吸収

## Acceptance Criteria

- [ ] `/split-rfc-to-children` が正典RFCのパスを引数に動作する
- [ ] RFC-TREE.json が正典RFCと同じディレクトリに作成される（スキーマ検証通過）
- [ ] rfcUnderstanding（14フィールド）が find-omissions と同一ロジックで書き込まれる
- [ ] 素案ツリーが最大3階層で作成され、孤立ノードがない
- [ ] 検証ループを経て完成版ツリーが finalTree に保存される
- [ ] `generate-child-rfcs.js` が finalTree に基づきディレクトリ構造を機械的に生成する
- [ ] 各子ディレクトリは `{childId}-{kebab-name}/` 形式、孫ディレクトリはその配下の `{grandchildId}-{kebab-name}/` 形式である
- [ ] 各ディレクトリに `{正典名}-{childId}-{slug}.md` が生成され、frontmatter に tree 情報（canonicalRfcPath, ioSchema, dependencyOn 等）が機械的に書き込まれている
- [ ] 各 `{正典名}-{childId}-{slug}.md` に `<!-- ??? -->` マーカーと rfcEvidence/parentEvidence が記述されている
- [ ] 各ディレクトリに `tickets/` + `.gitkeep` が生成されている
- [ ] `check-rfc-placeholders.js` で全 `{正典名}-{childId}-{slug}.md` の未記入箇所を再帰的に検出・完了確認できる
- [ ] `verify-rfc-coverage.js` でディレクトリ構造と RFC_TREE の一致を機械的に検証できる（不一致 → FAIL）
- [ ] 言語検出が自動で行われ、RFC-TREE.json の `language` フィールドに正しく記録される
- [ ] [Rust] `language: "rust"` 時、各子ディレクトリに Cargo.toml（path deps 含む）と src/lib.rs が生成される
- [ ] [Go] `language: "go"` 時、各子ディレクトリに go.mod が生成される
- [ ] [TS] `language: "typescript"` 時、各子ディレクトリに package.json と tsconfig.json が生成される
- [ ] `language` 未設定（汎用モード）時、追加ファイルは生成されない（{正典名}-{childId}-{slug}.md + tickets/ のみ）
- [ ] 既存テスト全件 PASS / 犯罪ゼロ

## Notes

- PX（独立フェーズ）所属。既存のスラッシュコマンド群に新規追加。
- rfcUnderstanding の分析ロジックは `find-omissions-for-next-rfc.md` Step 2（6子ステップ）と**完全に同一**。格納先の違いのみ。
- **「ファイル生成は AI ではなくスクリプトが行う」** — スクリプトはディレクトリ構造と `{正典名}-{childId}-{slug}.md` の機械的部分（frontmatter + `<!-- ??? -->` マーカー）+ 言語別ビルド設定ファイルを生成する。詳細記述は AI が追記。
- ディレクトリ構造が RFC_TREE と一致することは、verify-rfc-coverage.js により**スクリプトが機械的に保証する**。
- 正典RFC・子・孫は全て互いの存在をツリー構造として認識する。各 `{正典名}-{childId}-{slug}.md` の frontmatter に親子関係（parentPath, canonicalRfcPath 等）を機械的に書き込むことで保証。
- 各ディレクトリは `/formulate-tickets` を独立して実行可能。各ディレクトリ内の `tickets/` がその出力先となる。
- 言語検出は自動（プロジェクトルートのビルド設定ファイルから判断）。手動上書きは RFC-TREE.json の `language` フィールドを直接編集することで可能。

### 言語別の実装上の注意点

| 観点 | [Rust] | [Go] | [TS] |
|------|--------|------|------|
| namespace の物理単位 | workspace crate | module | npm workspace package |
| I/O境界の言語機構 | `pub trait` + `Send + Sync` | Exported interface | `export` された type/interface |
| 結合の設定コスト | 低（Cargo.toml の path dep のみ） | 低（go.work の use のみ） | 中（tsconfig + package.json + workspace yaml） |
| 循環依存の検出 | 間接的（cargo check で貸し出し関係） | **直接的（go build が禁止）** | 間接的（tsc の circular import 警告） |
| テストの独立度 | 高（各 crate 内で完結） | 高（各 package 内で完結） | 中（workspace 全体の設定が必要） |
| FE/BE 分離の自然さ | 該当なし（Tauri バックエンドのみ） | 該当なし（バックエンドのみ） | 注意が必要（Vue/Quasar は単一アプリ） |

**TypeScript の FE/BE 分離について**: フロントエンド（Vue/Quasar）とバックエンド（Axum/Node）が同じプロジェクトにある場合、両者は別々の npm workspace package として分割することを推奨する。ただし Quasar アプリは単一のビルドエントリを持つため、Quasar 内部の分割は module レベルの名前空間分離にとどめ、workspace package としては分離しない方が現実的である。
