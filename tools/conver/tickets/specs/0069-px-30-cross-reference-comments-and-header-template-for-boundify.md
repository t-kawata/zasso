---
ticket_id: 69
title: PX-30: Cross-Reference Comments and Header Template for boundify
slug: px-30-cross-reference-comments-and-header-template-for-boundify
status: draft
created_at: 2026-07-08
updated_at: 2026-07-08
---

# PX-30: Cross-Reference Comments and Header Template for boundify

## Summary

boundify が生成する全ファイルの先頭に、初期設計情報を記述したヘッダーコメントを機械生成する。このヘッダーには「Node」の定義、関連グラフファイルへのパス（このファイルからの相対パス+直接実行可能な cd コマンド）、マッピングされているグラフノードの情報、および prose 系 kind（rationale/glossary/requirement）の情報をエッジの関係性とともに記述する。また、`Dirs-Tree.json` のスキーマにクロスリファレンス情報を格納するフィールドを追加する。

## ⚠️ 作業範囲の重大制約

**このチケットの全作業は `tools/conver/.claude/` ディレクトリ内のみに限定される。**
すなわち `/Users/kawata/shyme/zasso/tools/conver/.claude/` 以下が唯一の変更対象である。

**禁止される操作:**
- このパスの外にあるあらゆるファイルの編集・作成・削除
- `cargo` 関連コマンドの実行
- プロジェクトルート `/Users/kawata/shyme/zasso/` 以下の `crates/`, `src-tauri/`, `fe/` 等への影響
- テスト用にグラフJSONを生成する場合も、出力先は必ず `tools/conver/.claude/` 内とすること

## Background

PX-28 で prose 系 kind の独立ファイル生成が廃止された。これらの情報（設計判断の根拠、用語定義、要件）は消えるのではなく、全ての関係するプログラムファイルの先頭コメントとして埋め込まれなければならない。また、Everything as Code の原則により、全ファイルが「どの設計文書のどのノードに由来するか」を機械的にトレース可能にしておく必要がある。

現在は `SAFE_BOUNDARIES_EN_TEXT`（boundify-helpers.js:112-123）という汎用テキストが boundify-graph-to-dirs.js の出力時に表示されるのみで、個々の生成ファイルには一切の設計情報が書き込まれていない。

## Scope

- ヘッダーコメントテンプレートの設計と実装
- 全生成ファイルの先頭に以下の情報を機械生成する（言語別のコメント記法で）:
  - `Node` の定義説明（英語: "Node refers to a design fragment bounded by safe I/O boundaries in the Original RFC..."）
  - このファイルからの相対パスで記述された Graph パス、Dirs-Tree パス、Original RFC パス
  - マッピングされているノードの一覧（nodeId, 種別, 元セクション見出し）
  - `cd <相対パス> && node ...` で直接実行可能な探索コマンド
  - 当該ノードに接続されている prose 系ノードの情報（エッジの種類と方向も記述）
- prose 系ノードのクロスリファレンス計算:
  - rationale/glossary/requirement の各ノードについて、全接続先ファイル（エッジを辿って到達する全ノードのファイル）を特定
  - エッジが1つもない prose ノードは共通ヘッダーエリアにのみサマリーを表示（全ファイルに同一内容が書かれることは避ける）
  - クロスリファレンス情報は Dirs-Tree.json に `crossReferences` フィールドとして格納
- `Dirs-Tree.json` の JSON Schema（boundify-helpers.js の SCHEMA 定数）に `crossReferences` を追加
- `generate-dir-template.js` の `discover` 関数でヘッダーコメントを各ファイルの content 先頭に追加

**ヘッダーコメントの具体形式（Rust の場合）:**
```rust
// ============================================================================
// Initial Design Artifact — RFC-driven Implementation
// ============================================================================
// "Node" refers to a design fragment bounded by safe I/O boundaries in the
// Original RFC. Each node captures a distinct architectural concern that must
// be carefully implemented with attention to its relationships.
//
// Graph:        ../../path/to/RFC-ROOT-GRAPH.json
// Directory:    ../../path/to/RFC-ROOT-Dirs-Tree.json
// Original RFC: ../../path/to/RFC-ROOT.md
//
// Mapped node(s):
//   - N0005 (config/database_settings)
//     § 3.2 "Database Connection Configuration"
//     → Details: (cd ../../path/to && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --id=N0005)
//
// Cross-referenced design context:
//   - rationale/why_adopt_eda [N0003] (refines → N0005)
//     § 2.1 "Why Adopt EDA"
//     → (cd ../../path/to && node .claude/scripts/rfc-graph/query.js --graph="RFC-TEST-GRAPH.json" --id=N0003)
//
// Full graph exploration:
//   (cd ../../path/to && node .claude/scripts/rfc-graph/show-graph-summary-markdown.js \
//     --graph="RFC-ROOT-GRAPH.json" --source="RFC-ROOT.md")
//   (cd ../../path/to && node .claude/scripts/rfc-graph/query.js --graph="RFC-ROOT-GRAPH.json" --id=<NODE_ID> --hops=3)
// ============================================================================
```

## Non-scope

- 宣言スタブテーブル（PX-28 で対応）
- ツリー階層化・prune（PX-29 で対応）
- slug バリデーション（PX-27 で対応）
- ドキュメント更新（PX-31 で対応）

## Investigation

**`boundify-helpers.js:112-123`** — 現在の SAFE_BOUNDARIES_EN_TEXT:
```javascript
const SAFE_BOUNDARIES_EN_TEXT = [
  'Safe boundaries built with directories and namespaces (Rust/Go/TypeScript)',
  'This project enforces architectural boundaries through physical directory structure',
  'and namespace conventions...',
  'Cross-boundary dependencies are explicitly declared and validated.',
  'Circular dependencies between directories are detected and reported as warnings.'
].join('\n');
```
→ 汎用説明のみ。個別ファイルへの埋め込みに使われていない。

**`generate-dir-template.js:128-132`** — content 組み立て:
```javascript
let content = '';
if (node.declarationStub) {
  content += node.declarationStub + '\n\n';
}
```
→ declarationStub の前にヘッダーコメントを追加する必要がある。順序: (1) ヘッダーコメント → (2) 宣言スタブ

**`boundify-graph-to-dirs.js:483-486`** — Dirs-Tree.json 構築:
```javascript
const dirsTree = {
  schemaVersion: "1.0",
  generatedAt: new Date().toISOString(),
  sourceGraph: graphPath,
  // ...現状 crossReferences なし
};
```

### クロスリファレンス解決アルゴリズム

1. prose 系 kind（rationale/glossary/requirement）のノードを収集
2. 各 prose ノードについて、graph.edges から接続先ノードを全リストアップ
3. エッジ種別（depends_on, refines, references, implements, constrains, part_of）と方向を保持
4. 接続先ノードの属するファイルパスを nodeToDir マップから解決
5. 結果を `crossReferences` フィールドとして Dirs-Tree.json に追加

エッジがない prose ノードの扱い:
- 共通ヘッダーエリア（全ファイルに書かれる）にのみ表示
- 全ファイルに同じ prose 情報を重複させるとファイルが肥大化するため、サマリー＋探索コマンドのみ

### クロスリファレンスの Dirs-Tree.json 格納形式

`crossReferences` フィールドは `trees` 内の各言語ツリーのルートレベル（`src/` 相当の DirNode と同階層）に追加する:

```json
{
  "trees": {
    "rust": {
      "name": "src",
      "type": "directory",
      "children": [...],
      "crossReferences": [
        {
          "nodeId": "N0003",
          "kind": "rationale",
          "title": "Why Adopt EDA",
          "headingRef": "§ 2.1",
          "connections": [
            { "toFile": "config/db_settings.rs", "edgeType": "refines", "direction": "→" }
          ]
        }
      ]
    }
  }
}
```

---

## パス解決の絶対仕様

**内部計算では絶対パスを使用し、コメントアウト内には相対パスのみを書き込む。**
この原則は絶対に破ってはならない。

### 背景: なぜ絶対仕様が必要か

コメントアウト内の `cd` コマンドおよびパスは、人間または AI がターミナルにコピー&ペーストしてそのまま実行する。ワンクッションの解釈や変換を一切介在させてはならない。したがって、以下の条件を同時に満たす必要がある:

1. **cd コマンドはこのファイルのあるディレクトリから graphDir への相対パスで cd する**
2. **--graph= に渡すパスは cd 後のカレントディレクトリからの相対パス（すなわち basename のみ）**
3. **Graph/Dirs-Tree/Markdown の3系統の表示用パスもこのファイルからの相対パス**

### 関数契約: `resolveHeaderPaths`

```
resolveHeaderPaths(
  generatedFilePath: string,   // 生成するファイルの絶対パス（discover から渡される）
  graphDirAbs: string,         // graphPath の path.dirname() の値（事前計算済み、絶対パス）
  graphBasename: string,       // path.basename(graphPath)    例: "RFC-ROOT-GRAPH.json"
  dirsTreeBasename: string,    // path.basename(dirsTreePath) 例: "RFC-ROOT-Dirs-Tree.json"
  sourceBasename: string       // path.basename(sourceMdPath) 例: "RFC-ROOT.md"
) -> HeaderPaths
```

### 戻り値: HeaderPaths 型

```
HeaderPaths = {
  relDirToGraph: string,        // ".." / "../.." / "."（同一階層は "."、空文字は絶対に使わない）
  graphRelPath: string,         // relDirToGraph + "/" + graphBasename
  dirsTreeRelPath: string,      // relDirToGraph + "/" + dirsTreeBasename
  sourceRelPath: string,        // relDirToGraph + "/" + sourceBasename
  cdCommandPrefix: string,      // "(cd " + relDirToGraph + " &&" （cd 後の空白1つ）
  graphFlagForCmd: string,      // '--graph="' + graphBasename + '"'
}
```

### 計算手順（逐次、分岐なし）

```
Step 1: fileDir   = path.dirname(generatedFilePath)    # 絶対パスに注意
Step 2: rawRel    = path.relative(fileDir, graphDirAbs) # 絶対 → 相対 変換
Step 3: relDir    = (rawRel === "") ? "." : rawRel       # 同一ディレクトリ対策
Step 4: graphRelPath    = relDir + "/" + graphBasename   # 例: "../../RFC-ROOT-GRAPH.json"
Step 5: dirsTreeRelPath = relDir + "/" + dirsTreeBasename
Step 6: sourceRelPath   = relDir + "/" + sourceBasename
Step 7: cdCommandPrefix = "(cd " + relDir + " &&"         # 例: "(cd ../.. &&"
Step 8: graphFlagForCmd = '--graph="' + graphBasename + '"'
```

**重要な注意点（Step 3）:**
`path.relative(a, b)` は `a` と `b` が同一ディレクトリの場合 `""`（空文字列）を返す。
`cd ` の後に空文字列が来ると `cd ` 単独となりシェルエラーになる。
したがって、`""` を必ず `"."` に置き換える。
この変換により `cd . && node ...` が生成され、カレントディレクトリに留まる正しい挙動となる。

### 検証条件（不変表明）

以下の等式が常に成立しなければならない。この検証をテストで行うこと:

```
path.resolve(fileDir, graphRelPath)    === path.resolve(graphDirAbs, graphBasename)
path.resolve(fileDir, dirsTreeRelPath)  === path.resolve(graphDirAbs, dirsTreeBasename)
path.resolve(fileDir, sourceRelPath)    === path.resolve(graphDirAbs, sourceBasename)
```

右辺の `path.resolve(graphDirAbs, basename)` は元の絶対パスそのものである。
左辺は「コメントに書いた相対パスをファイルのディレクトリから逆解決した値」である。
この両者が一致することは、**コメントに書いた相対パスが絶対に正しい**ことの機械的証明になる。

### 具体例（全4パターン）

全パターンを網羅するために、graphDirAbs = `/Users/kawata/shyme/crates/siprs`、
graphBasename = `RFC-ROOT-GRAPH.json` として4通り列挙する:

| # | 生成ファイルの絶対パス | fileDir | relDir | graphRelPath | cdCommandPrefix |
|---|---|---|---|---|---|
| 1 | `.../siprs/src/main.rs` | `.../siprs/src` | `..` | `../RFC-ROOT-GRAPH.json` | `"(cd .. &&"` |
| 2 | `.../siprs/src/config/db.rs` | `.../siprs/src/config` | `../..` | `../../RFC-ROOT-GRAPH.json` | `"(cd ../.. &&"` |
| 3 | `.../siprs/src/net/http/handler.rs` | `.../siprs/src/net/http` | `../../..` | `../../../RFC-ROOT-GRAPH.json` | `"(cd ../../.. &&"` |
| 4 | `.../siprs/docs/plan.md`（未発生だが参考） | `.../siprs/docs` | `..` | `../RFC-ROOT-GRAPH.json` | `"(cd .. &&"` |

**同一ディレクトリケース（graphDirAbs === fileDir の場合）:**

| 生成ファイルの絶対パス | fileDir | relDir | graphRelPath | cdCommandPrefix |
|---|---|---|---|---|
| `.../siprs/some.rs` | `.../siprs` | `.` | `./RFC-ROOT-GRAPH.json` | `"(cd . &&"` |

### 3つの cd コマンドの統一ルール

コメントアウト内に3種類の `cd` コマンドが登場する。**これらは全て同じ `cdCommandPrefix` を使用する:**

```
# cdCommandPrefix は以下の全コマンドで共有される共通部
PREFIX = "(cd " + relDirToGraph + " &&"

# --- 個別ノード詳細 ---
PREFIX + " node .claude/scripts/rfc-graph/query.js --graph="BASENAME" --id=N0005)"

# --- グラフサマリー ---
PREFIX + " node .claude/scripts/rfc-graph/show-graph-summary-markdown.js --graph="BASENAME" --source="SOURCE_BASENAME")"

# --- マルチホップ探索 ---
PREFIX + " node .claude/scripts/rfc-graph/query.js --graph="BASENAME" --id=<NODE_ID> --hops=3)"
```

**致命的制約:**
- `cdCommandPrefix` 内の `relDirToGraph` と `--graph=` に渡す basename は**独立して計算し、連結しない**
- `--graph=` には basename のみを渡し、`relDirToGraph` を前置しない（cd で既に移動済みのため）
- この2つを誤って連結すると二重パス（`../../RFC-ROOT-GRAPH.json` が `../../../../RFC-ROOT-GRAPH.json` になる等）が発生する

### この絶対仕様を実装に落とす場合の実装上の注意

```javascript
// ✅ 内部計算に絶対パスを使用（OK）
const fileDir = path.dirname(generatedFilePath);
const rawRel = path.relative(fileDir, graphDirAbs);

// ✅ 空文字列対策（必須）
const relDir = rawRel === '' ? '.' : rawRel;

// ✅ コメントに書くのは相対パスのみ（必須）
const graphRelPath = relDir + '/' + graphBasename;
// → 例: "../../RFC-ROOT-GRAPH.json"（絶対パスが混入しない）

// ❌ 絶対パスを直接書いてはいけない（禁止）
// const graphRelPath = graphPath;  ← 絶対パスがコメントに漏れる

// ❌ path.join で連結してはいけない（path.join は絶対パスセグメントを優先する）
// const graphRelPath = path.join(relDir, graphBasename);
// → path.join("..", "/Users/.../siprs/RFC-ROOT-GRAPH.json") は後者を優先し絶対パスになる
```

## Test Plan

### ユニットテスト計画

テスト対象: `boundify-tree.js`（クロスリファレンス計算）, `boundify-helpers.js`（SCHEMA更新）, `generate-dir-template.js`（ヘッダー追加）

**正常系（パス計算 — 絶対仕様の検証条件に基づく）:**
- 生成ファイルから GRAPH.json への相対パスが正しく計算されること
  - 検証条件: `path.resolve(fileDir, graphRelPath) === originalGraphAbsPath`
- 生成ファイルから Dirs-Tree.json への相対パスが正しく計算されること（同様の逆解決検証）
- 生成ファイルから元 Markdown への相対パスが正しく計算されること（同様の逆解決検証）
- `cd` コマンドが `(cd <relDir> &&` の形式で正しく生成される
- cd 内の `relDir` と `--graph=` に渡す basename が独立しており、連結・二重化していないこと
- 同一ディレクトリの場合（`path.relative` が `""` となるケース）→ `"."` に変換され `cd . &&` が生成される

**正常系（クロスリファレンス）:**
- prose ノードにエッジで接続されている全ノードのファイルが列挙される
- エッジ種別と方向が正しく記録される
- 1つの prose ノードが複数ファイルに参照される場合、全ファイルに情報が追記される
- エッジがない prose ノードが共通エリアにのみ表示される

**正常系（ヘッダーコメント）:**
- 全3言語（Rust/Go/TypeScript）のコメント記法で正しく出力される
- `mappedNodeIds` が正しく記述される
- グラフ探索コマンドが `cd` から始まる直接実行可能な形式である
- 宣言スタブの前にヘッダーコメントが配置される

**異常系:**
- グラフパスが解決できない場合（ファイル生成時に計算不能） → 空文字列またはプレースホルダー
- マッピングノードがないファイル → "No direct node mapping" と表示
- prose ノードが全くないグラフ → crossReferences が空配列

**境界値:**
- ファイルパスが深い階層（`src/a/b/c/d/e/f.rs` と `../../../../RFC-ROOT-GRAPH.json`）の相対パス計算
- Windows と POSIX のパス区切り文字の違い（実行環境は macOS 前提）

**カバレッジ目標:** 90%（パス計算・コメント生成は100%、クロスリファレンス解決も100%）

### ユニットテスト不可能な項目（例外）

- 生成されたコメントが実際のファイルに正しく書き込まれるかの確認は generate-dir-template.js の E2E で確認

## Boy Scout Rule — 翻訳可能性計画

- ヘッダーコメント生成関数は動詞句 `generateHeaderComment()`、クロスリファレンス計算は `computeCrossReferences()` とする
- パス計算とコメントフォーマットは別関数に分離（1関数1責務）
- コメントテンプレートはテンプレートリテラルではなく定数として定義し、フォーマットの変更に強い設計にする
- 言語別のコメント記法はテーブル駆動にする（switch 文の羅列にしない）
- 既存の `SAFE_BOUNDARIES_EN_TEXT` は本チケットで不要になれば削除する（Boy Scout Rule）

## Acceptance Criteria

- [ ] 全生成ファイルの先頭にヘッダーコメントが機械生成される
- [ ] ヘッダーコメントに「Node」の定義説明が含まれる
- [ ] 全パスが「このファイルからの相対パス」で機械計算されている（内部計算は絶対パス）
- [ ] 不変表明検証条件 `path.resolve(fileDir, relPath) === originalAbsPath` が全パスで成立している
- [ ] `path.relative` が `""` を返す場合に `"."` に変換されている
- [ ] `cd` 内の `relDir` と `--graph=` の basename が独立して計算され、連結していない
- [ ] 探索コマンドが `cd <相対パス> && node ...` の直接実行可能形式である
- [ ] prose 系ノードの情報がエッジ関係とともに接続先ファイルのヘッダーに追記される
- [ ] エッジがない prose ノードは共通ヘッダーエリアにのみ表示される
- [ ] `Dirs-Tree.json` に `crossReferences` フィールドが追加され、スキーマが更新されている
- [ ] 既存テストが新しい期待値で更新され通過する
- [ ] 翻訳可能性の検証が通っている
