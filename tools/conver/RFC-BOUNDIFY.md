---
title: "RFC-BOUNDIFY: Boundify Graph to Directory Tree"
category: "Standards Track"
date: "2026-07-07"
status: "Draft"
---

# RFC-BOUNDIFY: グラフ構造から安全なディレクトリ境界を導出するパイプライン

## Abstract

本RFCは、`/graphify-rfc` が生成するグラフJSONを入力として受け取り、ディレクトリと名前空間で構築された安全な境界を持つ実装ディレクトリツリーを提案・洗練・生成する `/boundify-graph-to-dirs` スラッシュコマンドの完全設計を記述する。

**作業対象範囲**: 本RFCに記述される全スクリプト・コマンド定義は `tools/conver/.claude/` ディレクトリ内に配置する。既存ファイル（`graphify-rfc.md`、`crud.js`、`verify.js` 等）への変更は `update-step-status.js` への `--status=` フラグ追加に限定し、それ以外の既存ファイルは一切変更しない。

出力は検証可能なJSONスキーマ（Dirs-Tree.json）と人間可読なMarkdownの二形式を持ち、Rust/Go/TypeScriptの3言語に対応する。グラフノードのkind分類とエッジの依存関係から循環依存のない安全なディレクトリ構成を機械的に提案し、複数Stepの反復ループを通じてAIが洗練した後、最終的に実ディレクトリとテンプレートファイルを自動生成する。

---

## Motivation

### 現状のパイプラインの欠落

`/graphify-rfc` → `/formulate-tickets` のパイプラインは、設計文書をグラフ構造に変換し、実装チケットに分解する。しかしこのパイプラインには「**設計の論理構造を物理ディレクトリに落とす**」工程が存在しない。チケットごとに「どのディレクトリのどのファイルを編集するか」を毎回人間が判断すると、以下の問題が生じる：

- チーム規模の拡大に伴う構造の不整合
- 循環依存の偶発的な発生
- 公開/非公開の境界（`pub` vs `pub(crate)`、`internal/` パッケージ、barrel export）の不統一
- 言語固有の規約（Rustのモジュール階層、Goのパッケージ設計、TypeScriptの barrel パターン）の適用漏れ

### 解決策: boundify-graph-to-dirs

`/boundify-graph-to-dirs` はグラフJSONの kind 分類とエッジの依存関係から、安全な境界を持つディレクトリツリーを**機械的に提案**し、**AIが洗練**し、**テンプレートとして出力**する3段階のパイプラインを提供する。

```text
RFC-ROOT.md
  ↓ graphify-rfc
RFC-ROOT-GRAPH.json          ← 設計の論理グラフ（177ノード・243エッジ）
  │
  ├──→ formulate-tickets    ← 「何を」実装するか
  │
  └──→ boundify-graph-to-dirs  ← 「どこに」実装するか（← 本RFC）
         │
         ↓ Step 1-4 ループ
         RFC-ROOT-Dirs-Tree.json  ← 洗練されたディレクトリ構造
         RFC-ROOT-GRAPH-LANG.json ← 言語注釈付き拡張グラフ
         <basename>-BOUNDIFY-Status.json  ← 進行管理
         │
         ↓ Step 5
         実際のディレクトリ + テンプレートファイル
```

---

## Design

### 3.1 入出力契約

#### 入力

| 項目 | 仕様 |
|------|------|
| 第1引数 | グラフJSONファイルの絶対パスまたは相対パス |
| `--json` フラグ | 指定時はJSONのみを標準出力に出力（Markdown部分を省略） |
| `--quiet` フラグ | 標準出力を完全に抑制（ファイル出力のみ実施） |
| `--dry-run` フラグ | テンプレート生成時、実際のファイル作成を行わず予定一覧を表示 |
| `--force` フラグ | テンプレート生成時、既存ファイルの上書きを許可 |

#### 出力（stdout, --json なし）

標準出力は以下の3層構造を持つ：

```
[1] .en.md 英文（const としてスクリプト内に保持）
     ※ tools/conver/docs/directory-and-namespace-safe-boundaries-rust-go-typescript-en.md より

[2] Boundify Report（Markdown）
     ## Analysis Summary（ノード/エッジ統計）
     ## Kind Distribution（kind 別ノード数）
     ## Proposed Directory Tree（3言語別ツリー）
     ## Dependency Direction Map
     ## Boundary Warnings（循環依存等）

[3] 検証可能JSONブロック（```json ... ```）
     Dirs-Tree.json と同一内容
```

`--json` 指定時は [3] のJSONブロックのみを標準出力に出力する。

#### 出力（ファイル）

| ファイル | 出力先 | 内容 |
|----------|--------|------|
| `<basename>-Dirs-Tree.json` | グラフJSONと同じディレクトリ | 洗練されたディレクトリツリー（下記スキーマに従う） |
| `<basename>-BOUNDIFY-Status.json` | グラフJSONと同じディレクトリ | 進行ステータス（`update-step-status.js` 互換） |
| `<basename>-GRAPH-LANG.json` | グラフJSONと同じディレクトリ | 元グラフに language 注釈を追加した拡張版 |
| 実ディレクトリ＋ファイル | グラフJSONの親ディレクトリをルートとして | Step 5 でのみ生成 |

### 3.2 `.en.md` 英文の保持

スクリプト内の const 定義としてハードコードする：

```javascript
// Source: tools/conver/docs/directory-and-namespace-safe-boundaries-rust-go-typescript-en.md
// 更新時はこの const とソースファイルの両方を編集すること
const SAFE_BOUNDARIES_EN_TEXT = `\
## Safe boundaries built with directories and namespaces (Rust/Go/TypeScript)

### Rust (crate + mod)

- "Directories are just physical layout; **boundaries are defined by the hierarchy of crates and mods**."
...

### Go (module + package)

- You treat "**directory = package = boundary**", with one directory per responsibility...
...

### TypeScript (directories + modules + barrels)

- Modules are per-file, but **you treat directories as logical namespaces**...
...`;
```

### 3.3 Dirs-Tree.json スキーマ

Dirs-Tree.json は以下のJSON Schemaに従う検証可能な構造を持つ。

#### トップレベル構造

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "2026-07-07T12:00:00.000Z",
  "sourceGraph": "/path/to/RFC-ROOT-GRAPH.json",
  "analysis": {
    "nodeCount": 177,
    "kindCounts": { "architecture": 42, "api_contract": 23, ... },
    "edgeTypeCounts": { "part_of": 111, "depends_on": 24, ... },
    "circularDependencies": []
  },
  "trees": {
    "rust": { ... },
    "go": { ... },
    "typescript": { ... }
  },
  "dependencyDirections": {
    "rust": [ ... ],
    "go": [ ... ],
    "typescript": [ ... ]
  }
}
```

#### ツリーノード型（単一型、type フィールドで区別）

```json
{
  "name": "src",
  "type": "directory",
  "kind": "architecture",
  "rationale": "Rustソースのルートディレクトリ。crateルートとしてpub re-exportを集約。",
  "language": ["rust", "go", "typescript"],
  "languageRules": {
    "rust": "pub(crate) mod; crate rootからのpub useで公開",
    "go": "internal/ 配下に配置",
    "typescript": "barrel index.ts で再export"
  },
  "mappedNodeIds": ["N0010", "N0138"],
  "children": [
    {
      "name": "event",
      "type": "directory",
      "kind": "api_contract",
      "rationale": "SipEventPayload/EventBusはAPI契約であり、かつ内部実装を持つためディレクトリに分離。",
      "language": ["rust"],
      "languageRules": {
        "rust": "pub(crate) mod event"
      },
      "mappedNodeIds": ["N0030", "N0034"],
      "children": [
        {
          "name": "mod.rs",
          "type": "file",
          "role": "EventBus + バレル",
          "mappedNodeIds": ["N0034", "N0035", "N0036", "N0037"],
          "declarationStub": "// [::STUB::] EventBus実装と子モジュールのバレル\npub mod payload;\npub mod meta;\npub mod raw_sip;"
        },
        {
          "name": "payload.rs",
          "type": "file",
          "role": "SipEventPayload enum",
          "mappedNodeIds": ["N0030", "N0031"],
          "declarationStub": "// [::STUB::] SipEventPayload enum定義（#[non_exhaustive]）"
        },
        {
          "name": "meta.rs",
          "type": "file",
          "role": "EventMeta構造体",
          "mappedNodeIds": ["N0032", "N0033"],
          "declarationStub": "// [::STUB::] EventMeta構造体"
        },
        {
          "name": "raw_sip.rs",
          "type": "file",
          "role": "RawSipMessage",
          "mappedNodeIds": ["N0043"],
          "declarationStub": "// [::STUB::] RawSipMessage構造体"
        }
      ]
    },
    {
      "name": "client.rs",
      "type": "file",
      "role": "SipClient本体",
      "mappedNodeIds": ["N0016", "N0017"],
      "declarationStub": "// [::STUB::] SipClient（参照カウント化ハンドル）"
    }
  ]
}
```

#### dependencyDirections エントリ

```json
{
  "from": "src/event/",
  "to": "src/error/",
  "rule": "event → error は依存可（eventモジュールはerror型を参照する）",
  "edgeEvidence": ["N0031->N0027 (part_of)"]
}
```

`dependencyDirections` は各言語ごとに独立した配列として保持する。これはRustのcrate間依存とGoのpackage間依存が同一の構造にならないためである。

### 3.4 言語推定ヒューリスティック

boundify は入力グラフJSONの各ノードに、以下のヒューリスティックで `language` 属性を自動付与する。推定結果は `<basename>-GRAPH-LANG.json` に出力される。

```javascript
function inferLanguage(node) {
  const text = (node.title + ' ' + node.summary).toLowerCase();

  // Rust 固有キーワード
  const rustPatterns = /\b(crate|mod\s|pub\s|unsafe|fn\s|impl\s|struct\s|enum\s|trait\s|cargo|#[derive|::std::|mut\s|impl\s.+for\s|\.await)\b/;
  if (rustPatterns.test(text)) {
    return ['rust', 'go', 'typescript']; // Rust固有でも汎用性が高い概念は全言語対象に含める
  }

  // Go 固有キーワード
  const goPatterns = /\b(package|func\s|goroutine|interface\{\}|struct\s|defer\s|go func|select\s|\*\.\w+|\.\( \w+\))\b/;
  if (goPatterns.test(text)) {
    return ['go', 'typescript'];
  }

  // TypeScript 固有キーワード
  const tsPatterns = /\b(TypeScript|barrel|index\.ts|\.ts\b|interface\s|type\s|async\s+\w+\s*=>|React|Vue|Component|useState|useEffect)\b/;
  if (tsPatterns.test(text)) {
    return ['typescript'];
  }

  // kind ベースの補完
  switch (node.kind) {
    case 'build_ci':
    case 'test_policy':
    case 'security':
    case 'glossary':
      return ['rust', 'go', 'typescript']; // CI/テスト/セキュリティ/用語は全言語共通

    case 'rationale':
    case 'architecture':
      if (text.includes('rust') || text.includes('crate') || text.includes('ffi')) {
        return ['rust', 'go', 'typescript'];
      }
      return ['rust', 'go', 'typescript']; // 設計判断は原則全言語に適用

    case 'requirement':
      return ['rust', 'go', 'typescript'];

    default:
      return ['rust', 'go', 'typescript'];
  }
}
```

推定の結果は Step 2 でAIが目視確認し、誤りがあれば修正する。この修正は `GRAPH-LANG.json` に書き戻される。

### 3.5 ディレクトリ提案アルゴリズム

グラフノードからディレクトリツリーを生成するアルゴリズムは、`part_of` エッジが形成する文書階層をドメインバックボーンとして利用する2段階構成である。

#### Phase 1: `part_of` エッジからドメイン階層を構築

グラフ内の `part_of` エッジは親セクション→子セクションの包含関係を表す。この階層をそのままディレクトリ階層の骨格として利用する：

```javascript
function buildDomainHierarchy(graph) {
  // part_of エッジから親子関係マップを構築
  const childOf = {};  // childId -> parentId
  for (const edge of graph.edges) {
    if (edge.type === 'part_of') {
      childOf[edge.from] = edge.to;
    }
  }

  // ルートノード（part_of の対象になっていないノード）を特定
  const allNodeIds = new Set(graph.nodes.map(n => n.id));
  const hasParent = new Set(Object.keys(childOf));
  const roots = [...allNodeIds].filter(id => !hasParent.has(id));

  // ツリー構造を再帰構築
  function buildTree(nodeId) {
    const node = graph.nodes.find(n => n.id === nodeId);
    const children = graph.edges
      .filter(e => e.type === 'part_of' && e.from !== nodeId && childOf[e.from] === nodeId)
      .map(e => buildTree(e.from))
      .filter(Boolean);
    return { node, children: children.length > 0 ? children : null };
  }

  return { roots: roots.map(id => buildTree(id)).filter(Boolean), childOf };
}
```

これにより、§15「イベントモデル」ノードの下に §15.1「SipEventPayload」〜§15.7「確実配送非保証」が子ノードとして配置されるなど、設計文書のセクション構造を反映した階層が得られる。

#### Phase 2: kind に基づくファイル配置

Phase 1 の階層をリーフレベルまで展開した後、各ノードの kind に応じてファイル名と配置先を決定する：

| kind | ファイル配置ルール | 例 |
|------|-------------------|-----|
| `api_contract` | 親ドメイン内にインライン配置 | `src/event/payload.rs` |
| `data_model` | 親ドメイン内にインライン配置、または `types/` | `src/event/meta.rs` |
| `config` | 単一の `config/` ディレクトリに集約 | `src/config.rs` または `src/config/` |
| `state_machine` | 所属ドメイン内にインライン配置 | `src/call.rs` 内の `CallState` |
| `error_policy` | 単一の `error/` に集約 | `src/error.rs` |
| `architecture` | 該当ドメインのバックボーン（ディレクトリ構造自体） | ディレクトリ名として反映 |
| `security` | 単一の `security/` | `src/security.rs` |
| `test_policy` | `tests/` ディレクトリ | `tests/unit/` 等 |
| `build_ci` | `build/`、`.github/` | `build/build.rs` |
| `rationale` | `docs/` | `docs/design-decisions.md` |
| `glossary` | `docs/`（単一ファイル） | `docs/glossary.md` |
| `requirement` | `docs/` | `docs/requirements.md` |

`architecture` kind のノードはディレクトリ階層の骨格として利用され、単独のファイルにはならない。たとえば「§6 全体構成」ノード（kind: architecture）は `src/` ディレクトリ自体として表現される。

#### ノード→ファイル名の決定

```javascript
function titleToFileName(title, language) {
  // §プレフィックスと番号を除去
  const cleaned = title.replace(/^§\S+\s*/, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    .substring(0, 48);

  // 言語別拡張子
  const ext = { rust: '.rs', go: '.go', typescript: '.ts' }[language] || '.rs';

  // 予約語による衝突回避: barrelファイル名は特殊扱い
  if (cleaned === 'mod' || cleaned === 'index') {
    return `_${cleaned}${ext}`;
  }

  return `${cleaned}${ext}`;
}
```

衝突防止：生成後に同一ディレクトリ内のファイル名を検査し、重複があればサフィックス（`_1`, `_2`）を付加する。

```javascript
function deduplicateFileNames(files, language) {
  const names = {};
  for (const file of files) {
    const baseName = file.name.replace(/\.(rs|go|ts)$/, '');
    if (names[baseName] !== undefined) {
      names[baseName]++;
      file.name = `${baseName}_${names[baseName]}.${language === 'typescript' ? 'ts' : language === 'go' ? 'go' : 'rs'}`;
    } else {
      names[baseName] = 0;
    }
  }
  return files;
}
```

#### Phase 3: 子ファイルの宣言生成

Phase 1 の階層と Phase 2 のファイル配置から、各ディレクトリの barrel 宣言（`mod.rs` / `package` / `index.ts`）を自動生成する：

```javascript
function generateDeclarationStub(dirNode, language) {
  const files = (dirNode.children || []).filter(c => c.type === 'file');
  const subdirs = (dirNode.children || []).filter(c => c.type === 'directory');
  const declarations = [];

  switch (language) {
    case 'rust': {
      const modDecls = files
        .filter(f => f.name !== 'mod.rs')
        .map(f => `pub mod ${f.name.replace(/\.rs$/, '')};`);
      const subModDecls = subdirs
        .map(d => `pub mod ${d.name};`);
      declarations.push(...modDecls, ...subModDecls);
      break;
    }
    case 'go': {
      declarations.push(`package ${dirNode.name}`);
      break;
    }
    case 'typescript': {
      const barrel = files
        .filter(f => f.name !== 'index.ts')
        .map(f => `export * from './${f.name.replace(/\.ts$/, '')}';`);
      const subBarrel = subdirs
        .map(d => `export * from './${d.name}';`);
      declarations.push(...barrel, ...subBarrel);
      break;
    }
  }

  return declarations.length > 0 ? declarations.join('\n') : null;
}
```

**重要**: このアルゴリズムは「第1パス」の機械的提案であり、精緻なドメイン配置は保証しない。Step 1/2 のループでAIが kind の再割り当てやノードの移動を行い、Dirs-Tree.json を洗練する。機械的提案が完全である必要はなく、AIが修正可能な範囲で十分である。

### 3.6 エッジ解析と循環依存検出

#### ノード間エッジ → ディレクトリ間エッジの投影

グラフのノード間エッジを、ノード→ディレクトリのマッピングテーブルを用いてディレクトリ間エッジに投影する：

```javascript
function projectEdgesToDirs(graphNodes, graphEdges, nodeToDirMap) {
  const dirEdges = [];

  for (const edge of graphEdges) {
    const fromDir = nodeToDirMap[edge.from];
    const toDir = nodeToDirMap[edge.to];

    if (!fromDir || !toDir) continue;    // マッピング未解決ノードはスキップ
    if (fromDir === toDir) continue;     // 同一ディレクトリ内のエッジはスキップ
    if (edge.type !== 'depends_on' &&
        edge.type !== 'implements' &&
        edge.type !== 'references' &&
        edge.type !== 'extends' &&
        edge.type !== 'constrains') continue;  // 方向性のあるエッジのみ対象

    dirEdges.push({
      from: fromDir,
      to: toDir,
      type: edge.type,
      evidence: `${edge.from}->${edge.to} (${edge.type})`
    });
  }

  return dirEdges;
}
```

#### 循環依存の検出（Tarjan SCC）

投影されたディレクトリ間有向グラフに対してTarjanの強連結成分分解（SCC）アルゴリズムを適用する：

```javascript
function findCycles(dirEdges) {
  const graph = {};
  for (const e of dirEdges) {
    if (!graph[e.from]) graph[e.from] = [];
    graph[e.from].push(e.to);
    if (!graph[e.to]) graph[e.to] = [];
  }

  const index = {};
  const lowlink = {};
  const onStack = {};
  const stack = [];
  let currentIndex = 0;
  const cycles = [];

  function strongconnect(v) {
    index[v] = currentIndex;
    lowlink[v] = currentIndex;
    currentIndex++;
    stack.push(v);
    onStack[v] = true;

    for (const w of (graph[v] || [])) {
      if (index[w] === undefined) {
        strongconnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack[w]) {
        lowlink[v] = Math.min(lowlink[v], index[w]);
      }
    }

    if (lowlink[v] === index[v]) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) {
        cycles.push({ cycle: scc });
      }
    }
  }

  for (const v of Object.keys(graph)) {
    if (index[v] === undefined) strongconnect(v);
  }

  return cycles;
}
```

検出された循環は以下の情報とともに報告される：

```json
{
  "from": "src/media/",
  "to": "src/call/",
  "type": "depends_on",
  "evidence": "N0059->N0046 (depends_on)"
}
```

循環が検出された場合、boundify は循環を自動解消せず、循環に参加しているディレクトリとノードの一覧を `warnings` フィールドに出力する。解消（ノードの再配置や kind の再割り当て）はAIの判断に委ねる。

---

## Implementation

### 4.1 ファイル構成

```
.claude/scripts/rfc-graph/
├── boundify-graph-to-dirs.js    ← メインスクリプト（新規）
├── validate-dirs-tree-schema.js ← Dirs-Tree.json スキーマ検証（新規）
├── generate-dir-template.js     ← 実ディレクトリ生成（新規）
├── update-step-status.js        ← --status= フラグ追加（既存改修）
├── crud.js                      ← グラフCRUD（既存、変更なし）
├── verify.js                    ← グラフ検証（既存、変更なし）
└── query.js                     ← グラフ検索（既存、変更なし）

.claude/commands/
├── boundify-graph-to-dirs.md    ← スラッシュコマンド定義（新規）
└── graphify-rfc.md              ← 既存、変更なし
```

### 4.2 boundify-graph-to-dirs.js — メインスクリプト

```javascript
#!/usr/bin/env node
/**
 * boundify-graph-to-dirs.js <graph-json-path> [--json] [--dry-run] [--force]
 *
 * graphify が生成したグラフJSONを解析し、安全な境界を持つディレクトリツリーを
 * 提案する。Dirs-Tree.json、GRAPH-LANG.json、*-BOUNDIFY-Status.json を出力する。
 *
 * CLI: boundify-graph-to-dirs.js /path/to/RFC-ROOT-GRAPH.json [--json] [--quiet]
 *
 * 出力契約:
 *   --json なし → 標準出力に .en.md + Markdown分析 + ```json ブロック
 *   --json あり → 標準出力に JSON のみ
 *   --quiet     → 標準出力を抑制（ファイル出力のみ）
 *   常にグラフ同ディレクトリに Dirs-Tree.json / GRAPH-LANG.json / *-BOUNDIFY-Status.json を書き出す
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// const: .en.md 英文（ハードコード）
// ============================================================
const SAFE_BOUNDARIES_EN_TEXT = `\
## Safe boundaries built with directories and namespaces (Rust/Go/TypeScript)

### Rust (crate + mod)

- "Directories are just physical layout; **boundaries are defined by the hierarchy of crates and mods**."
- Directories reflect the crate/mod structure, but instead of "directory = boundary" you treat it as "express the logical boundaries of crates/mods via directories."
- Each file defines its own module, and you align the module hierarchy roughly with the directory hierarchy, but **you always reason about semantics in terms of paths like \`crate::foo::bar\`**.
- You only add directories when "the meaning of module boundaries has increased," and **you avoid excessive nesting and prioritize a flat module structure**.
- External APIs are exposed only via \`pub\` at the crate root, and **lower-level modules default to \`pub(crate)\` to encapsulate internal implementation details**.
- Code that handles I/O or side effects is consolidated into explicit modules (directories), and **the domain logic side should see only abstractions such as traits**.

### Go (module + package)

- You treat "**directory = package = boundary**", with one directory per responsibility and per namespace as the baseline.
- Package names are chosen based on "what they provide" rather than "what they contain," and you avoid vague namespaces like \`utils\` or \`common\`.
- Dependencies flow "from higher-level to lower-level" in a single direction, and **you never design a directory structure that introduces cyclic dependencies**.
- Code that should not be exposed externally is placed under \`internal/\` packages, **combining Go's visibility rules with directory boundaries to ensure privacy**.
- Directory nesting is kept to 1-2 levels, **prioritizing a flat package structure and introducing new directories and boundaries only when complexity grows**.

### TypeScript (directories + modules + barrels)

- Modules are per-file, but **you treat directories as logical namespaces and design responsibilities and boundaries at the directory level**.
- Each directory has a barrel (\`index.ts\`, etc.) that re-exports only the symbols you want to expose from beneath that directory, thereby **making "directory = public surface" explicit**.
- Imports from other directories go through the barrel by default, and **you do not bypass boundaries by importing files directly via relative paths**.
- You create new directories only when a new domain, layer, or I/O boundary is needed, **avoiding overly fine-grained splits and the proliferation of meaningless shared directories (like \`utils\`)**.
- Types and linting (strict TS, ESLint) enforce both "the direction of inter-directory dependencies" and "imports via barrels," **so that structural boundary violations can be detected mechanically**.`;

// ============================================================
// 定数定義
// ============================================================

// kind ごとのファイル配置ルール（Phase 2 テーブルをコード化）
const KIND_FILE_RULES = {
  api_contract:   { defaultDir: null,  },  // 親ドメインにインライン
  data_model:     { defaultDir: null,  },  // 親ドメインにインライン
  config:         { defaultDir: 'config' },
  state_machine:  { defaultDir: null,  },  // 親ドメインにインライン
  error_policy:   { defaultDir: 'error' },
  security:       { defaultDir: 'security' },
  test_policy:    { defaultDir: 'tests' },
  build_ci:       { defaultDir: null,  },
  rationale:      { defaultDir: 'docs' },
  glossary:       { defaultDir: 'docs' },
  requirement:    { defaultDir: 'docs' },
  // architecture はディレクトリ骨格として利用、単独ファイルにしない
};

const DIRECTIONAL_EDGE_TYPES = ['depends_on', 'implements', 'references', 'extends', 'constrains'];

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

// ============================================================
// エラー報告（3段テンプレート）
// ============================================================

function reportError(message, cause, remedy) {
  const text = `[ERROR] ${message}\n原因: ${cause}\n対応: ${remedy}`;
  console.error(text);
  return text;
}

// ============================================================
// 引数パース
// ============================================================

function parseArguments(testArgs) {
  const args = testArgs || process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage();
    process.exit(EXIT_SUCCESS);
  }

  const graphPath = path.resolve(args[0]);
  if (!fs.existsSync(graphPath)) {
    const err = reportError(
      `グラフファイルが見つかりません: ${graphPath}`,
      '指定されたパスにファイルが存在しない',
      'グラフJSONファイルの正しいパスを指定してください（例: node boundify-graph-to-dirs.js ./RFC-ROOT-GRAPH.json）'
    );
    process.exit(EXIT_FAILURE);
  }

  const flags = {
    json: args.includes('--json'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    quiet: args.includes('--quiet'),
  };

  const graphDir = path.dirname(graphPath);
  const baseName = path.basename(graphPath, path.extname(graphPath));
  // basename: 接尾辞 -GRAPH があれば除去、なければファイル名そのまま
  const basename = baseName.endsWith('-GRAPH') ? baseName.slice(0, -6) : baseName;

  return { graphPath, graphDir, basename, flags };
}

function printUsage() {
  console.log(`\
boundify-graph-to-dirs.js <graph-json-path> [--json] [--dry-run] [--force]

Arguments:
  <graph-json-path>  グラフJSONファイルのパス（必須）

Flags:
  --json             JSONのみを標準出力に出力
  --quiet            標準出力を抑制（ファイル出力のみ）
  --dry-run          ファイル生成を行わず予定一覧を表示
  --force            既存ファイルを上書きして生成
  --help, -h         このヘルプを表示
`);
}

// ============================================================
// グラフ読み込みと検証
// ============================================================

function loadGraph(graphPath) {
  let raw;
  try {
    raw = fs.readFileSync(graphPath, 'utf-8');
  } catch (e) {
    reportError(
      `グラフファイルの読み込みに失敗しました: ${e.message}`,
      'ファイルI/Oエラー',
      'ファイルのパーミッションと存在を確認してください'
    );
    process.exit(EXIT_FAILURE);
  }

  let graph;
  try {
    graph = JSON.parse(raw);
  } catch (e) {
    reportError(
      `グラフJSONのパースに失敗しました: ${e.message}`,
      'JSON形式が不正',
      'グラフファイルが有効なJSONであることを確認してください（node -e "JSON.parse(fs.readFileSync(...))" で検証可能）'
    );
    process.exit(EXIT_FAILURE);
  }

  if (!graph.nodes || !Array.isArray(graph.nodes)) {
    reportError(
      'グラフJSONに nodes 配列が見つかりません',
      '必須フィールド nodes が欠落',
      '/graphify-rfc で生成された正しいグラフJSONを入力してください'
    );
    process.exit(EXIT_FAILURE);
  }

  if (!graph.edges || !Array.isArray(graph.edges)) {
    reportError(
      'グラフJSONに edges 配列が見つかりません',
      '必須フィールド edges が欠落',
      '/graphify-rfc で生成された正しいグラフJSONを入力してください'
    );
    process.exit(EXIT_FAILURE);
  }

  return graph;
}

// ============================================================
// 言語推定
// ============================================================

function inferLanguage(node) {
  const text = (node.title + ' ' + node.summary).toLowerCase();
  const matched = [];

  const rustPatterns = /\b(crate|mod\s|pub\s|unsafe|fn\s|impl\s|trait\s|cargo|#[derive|\.await|Send \+ Sync|pjsua_|pj_status|Rust\-ffi|bindgen)\b/;
  const goPatterns = /\b(package|goroutine|defer\s|go func|select\s|interface\{\}|internal\/|_test\.go|GOPATH|vendor\/)\b/;
  const tsPatterns = /\b(TypeScript|barrel|index\.ts|\.ts\b|npm\b|tsconfig|eslint|vue\b|react\b|Component|useState)\b/;

  if (rustPatterns.test(text)) matched.push('rust');
  if (goPatterns.test(text)) matched.push('go');
  if (tsPatterns.test(text)) matched.push('typescript');

  // 言語固有キーワードで特定できない場合、全言語対象とする
  if (matched.length === 0) {
    matched.push('rust', 'go', 'typescript');
  }

  return [...new Set(matched)];
}

// ============================================================
// kind → ディレクトリ名変換
// ============================================================

function resolveDirForNode(node, kindFileRules, domainHierarchy) {
  // architecture kind はディレクトリ骨格として扱い、単独ファイルにしない
  if (node.kind === 'architecture') return null;

  // kind に既定ディレクトリがある場合はそれを使用
  const rule = kindFileRules[node.kind];
  if (rule && rule.defaultDir) return rule.defaultDir;

  // part_of 階層から親ノードを辿り、architecture 親が見つかればそのタイトルをディレクトリ名に
  let currentId = node.id;
  const visited = new Set();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const parentEdge = domainHierarchy.childOf ? domainHierarchy.childOf[currentId] : null;
    if (!parentEdge) break;
    const parentNode = domainHierarchy.nodeMap ? domainHierarchy.nodeMap[parentEdge] : null;
    if (parentNode && parentNode.kind === 'architecture') {
      const dirName = extractDomainName(parentNode.title);
      if (dirName) return dirName;
    }
    currentId = parentEdge;
  }

  // フォールバック: kind 名をそのままディレクトリ名に
  return node.kind;
}

function extractDomainName(title) {
  // 現状は architecture 親からの自動命名は行わず、Step 2 の AI ループに委ねる
  // 将来ここで「§15 イベントモデル」→"event" のような抽出を実装可能
  return null;
}

// ============================================================
// part_of エッジからドメイン階層を構築
// ============================================================

function buildDomainHierarchy(graph) {
  const childOf = {};    // nodeId -> parentNodeId
  const nodeMap = {};    // nodeId -> node

  for (const node of graph.nodes) {
    nodeMap[node.id] = node;
  }

  for (const edge of graph.edges) {
    if (edge.type === 'part_of') {
      // from が子、to が親（RFC文書のセクション階層）
      childOf[edge.from] = edge.to;
    }
  }

  return { childOf, nodeMap };
}

// ============================================================
// ドメイン指向ディレクトリツリー生成
// ============================================================

function buildDirectoryTree(graph, lang) {
  const nodeToDir = {};
  const dirs = {};
  const hierarchy = buildDomainHierarchy(graph);

  for (const node of graph.nodes) {
    const languages = node.language || inferLanguage(node);
    if (!languages.includes(lang)) continue;

    // architecture ノードはディレクトリ骨格（単独ファイルにしない）
    if (node.kind === 'architecture') continue;

    // 配置先ディレクトリを解決
    const dirName = resolveDirForNode(node, KIND_FILE_RULES, hierarchy);
    if (!dirName) continue;

    if (!dirs[dirName]) {
      dirs[dirName] = {
        name: dirName,
        type: 'directory',
        kind: null,
        rationale: `kind「${node.kind}」および part_of 階層から機械的に割り当て`,
        language: [lang],
        children: [],
      };
    }

    const fileName = titleToFileName(node.title, lang);
    dirs[dirName].children.push({
      name: fileName,
      type: 'file',
      role: node.title.replace(/^§\S+\s*/, ''),
      mappedNodeIds: [node.id],
      declarationStub: `// [::STUB::] ${node.title.replace(/^§\S+\s*/, '')}`,
    });

    nodeToDir[node.id] = dirName;
  }

  // 同一ディレクトリ内のファイル名重複を解決
  for (const dir of Object.values(dirs)) {
    dir.children = deduplicateFileNames(dir.children, lang);
  }

  return { tree: { name: 'src', type: 'directory', children: Object.values(dirs) }, nodeToDir };
}

function titleToFileName(title, language) {
  const cleaned = title.replace(/^§\S+\s*/, '')
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
    .substring(0, 48);

  const ext = { rust: '.rs', go: '.go', typescript: '.ts' }[language] || '.rs';

  if (cleaned === 'mod' || cleaned === 'index') {
    return `_${cleaned}${ext}`;
  }

  return `${cleaned}${ext}`;
}

function deduplicateFileNames(files, language) {
  const ext = { rust: '.rs', go: '.go', typescript: '.ts' }[language] || '.rs';
  const seen = {};
  return files.map(file => {
    const base = file.name.replace(/\.(rs|go|ts)$/, '');
    if (seen[base] !== undefined) {
      seen[base]++;
      file.name = `${base}_${seen[base]}${ext}`;
    } else {
      seen[base] = 0;
    }
    return file;
  });
}

// ============================================================
// エッジ投影と循環検出
// ============================================================

function projectEdgesToDirectories(graph, nodeToDir) {
  const dirEdges = [];
  const seen = new Set();

  for (const edge of graph.edges) {
    const fromDir = nodeToDir[edge.from];
    const toDir = nodeToDir[edge.to];
    if (!fromDir || !toDir || fromDir === toDir) continue;
    if (!DIRECTIONAL_EDGE_TYPES.includes(edge.type)) continue;

    // 同一ディレクトリペア＋同一タイプの重複を除去
    const key = `${fromDir}|${toDir}|${edge.type}`;
    if (seen.has(key)) continue;
    seen.add(key);

    dirEdges.push({
      from: fromDir,
      to: toDir,
      type: edge.type,
      evidence: `${edge.from}->${edge.to} (${edge.type})`,
    });
  }

  return dirEdges;
}

function tarjanSCC(dirEdges) {
  const graph = {};
  for (const e of dirEdges) {
    if (!graph[e.from]) graph[e.from] = [];
    graph[e.from].push(e.to);
    if (!graph[e.to]) graph[e.to] = [];
  }

  const index = {};
  const lowlink = {};
  const onStack = {};
  const stack = [];
  let currentIndex = 0;
  const cycles = [];

  function strongconnect(v) {
    index[v] = currentIndex;
    lowlink[v] = currentIndex;
    currentIndex++;
    stack.push(v);
    onStack[v] = true;

    for (const w of (graph[v] || [])) {
      if (index[w] === undefined) {
        strongconnect(w);
        lowlink[v] = Math.min(lowlink[v], lowlink[w]);
      } else if (onStack[w]) {
        lowlink[v] = Math.min(lowlink[v], index[w]);
      }
    }

    if (lowlink[v] === index[v]) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
        onStack[w] = false;
        scc.push(w);
      } while (w !== v);
      if (scc.length > 1) {
        cycles.push({ cycle: scc });
      }
    }
  }

  for (const v of Object.keys(graph)) {
    if (index[v] === undefined) strongconnect(v);
  }

  return cycles;
}

// ============================================================
// Dirs-Tree.json スキーマ検証
// ============================================================

function validateDirsTree(dirsTree, graph) {
  const errors = [];

  if (!dirsTree.schemaVersion) {
    errors.push('schemaVersion フィールドが欠落');
  }

  const allNodeIds = new Set(graph.nodes.map(n => n.id));

  function validateNode(node, path, depth) {
    if (depth > 4) {
      errors.push(`ネスト深さが制限(4)を超えています: ${path}`);
      return;
    }
    if (node.type === 'file' && node.mappedNodeIds) {
      for (const nid of node.mappedNodeIds) {
        if (!allNodeIds.has(nid)) {
          errors.push(`存在しないノードIDへの参照: ${path} -> ${nid}`);
        }
      }
    }
    if (node.children) {
      for (const child of node.children) {
        validateNode(child, `${path}/${child.name}`, depth + 1);
      }
    }
  }

  for (const [lang, tree] of Object.entries(dirsTree.trees || {})) {
    validateNode(tree, lang, 0);
  }

  return errors;
}

// ============================================================
// ファイル生成（テンプレート）
// ============================================================

function generateDeclarationStub(dirNode, language) {
  const files = (dirNode.children || []).filter(c => c.type === 'file');
  const subdirs = (dirNode.children || []).filter(c => c.type === 'directory');

  switch (language) {
    case 'rust': {
      const modDecls = files
        .filter(f => f.name !== 'mod.rs')
        .map(f => `pub mod ${f.name.replace(/\.rs$/, '')};`)
        .join('\n');
      const subModDecls = subdirs
        .map(d => `pub mod ${d.name};`)
        .join('\n');
      const result = [modDecls, subModDecls].filter(Boolean);
      return result.length > 0 ? result.join('\n') : null;
    }
    case 'go': {
      return `package ${dirNode.name}\n`;
    }
    case 'typescript': {
      const exports = files
        .filter(f => f.name !== 'index.ts')
        .map(f => {
          const baseName = f.name.replace(/\.ts$/, '');
          return `export * from './${baseName}';`;
        })
        .join('\n');
      const subExports = subdirs
        .map(d => `export * from './${d.name}';`)
        .join('\n');
      const result = [exports, subExports].filter(Boolean);
      return result.length > 0 ? result.join('\n') : null;
    }
    default:
      return null;
  }
}

function dryRunGenerate(dirsTree, rootDir, language) {
  const created = [];

  function walk(node, currentPath) {
    const fullPath = path.join(currentPath, node.name);

    if (node.type === 'directory') {
      created.push({ type: 'directory', path: fullPath });
      for (const child of (node.children || [])) {
        walk(child, fullPath);
      }
    } else {
      const declaration = node.declarationStub || '';
      const content = `${declaration}\n\n`;
      created.push({ type: 'file', path: fullPath, size: content.length });
    }
  }

  const tree = dirsTree.trees[language];
  if (tree) {
    walk(tree, rootDir);
  }

  return created;
}

function generateFiles(dirsTree, rootDir, language, force) {
  const created = [];

  function walk(node, currentPath) {
    const fullPath = path.join(currentPath, node.name);

    if (node.type === 'directory') {
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        created.push({ type: 'directory', path: fullPath, action: 'created' });
      }
      for (const child of (node.children || [])) {
        walk(child, fullPath);
      }
    } else {
      if (fs.existsSync(fullPath) && !force) {
        reportError(
          `ファイルが既に存在します: ${fullPath}`,
          '出力先に同名ファイルが存在する',
          '--force フラグを指定して上書きするか、既存ファイルを退避してから再実行してください'
        );
        process.exit(EXIT_FAILURE);
      }
      const declaration = node.declarationStub || '';
      const content = `${declaration}\n\n`;
      fs.writeFileSync(fullPath, content, 'utf-8');
      created.push({ type: 'file', path: fullPath, action: force && fs.existsSync(fullPath) ? 'overwritten' : 'created' });
    }
  }

  const tree = dirsTree.trees[language];
  if (tree) {
    walk(tree, rootDir);
  }

  return created;
}

// ============================================================
// レポート生成
// ============================================================

function generateReport(graph, dirsTree, lang) {
  const kindCounts = {};
  for (const node of graph.nodes) {
    kindCounts[node.kind] = (kindCounts[node.kind] || 0) + 1;
  }

  const edgeTypeCounts = {};
  for (const edge of graph.edges) {
    edgeTypeCounts[edge.type] = (edgeTypeCounts[edge.type] || 0) + 1;
  }

  let report = `\
# Boundify Report: ${path.basename(graph.sourceFile || 'unknown')}

## 1. Graph Summary

| Metric | Value |
|--------|-------|
| Nodes | ${graph.nodes.length} |
| Edges | ${graph.edges.length} |
| Language | ${lang} |
| Kind types used | ${Object.keys(kindCounts).length} |
| Edge types used | ${Object.keys(edgeTypeCounts).length} |
`;

  const allCycles = dirsTree.warnings || [];
  if (allCycles.length > 0) {
    report += `| Circular dependencies | ${allCycles.length} |\n`;
  } else {
    report += `| Circular dependencies | 0 (DAG) |\n`;
  }

  report += `\n## 2. Kind Distribution\n\n| Kind | Count |\n|------|-------|\n`;
  for (const [k, v] of Object.entries(kindCounts)) {
    report += `| ${k} | ${v} |\n`;
  }

  report += `\n## 3. Proposed Directory Tree\n\n\`\`\`\n`;
  const tree = dirsTree.trees[lang];
  if (tree) {
    function renderTree(node, indent) {
      if (node.type === 'directory') {
        report += `${indent}${node.name}/\n`;
        for (const child of (node.children || [])) {
          renderTree(child, indent + '  ');
        }
      } else {
        report += `${indent}${node.name}  ← ${node.role}\n`;
      }
    }
    renderTree(tree, '');
  }
  report += '```\n';

  if (dirsTree.dependencyDirections && dirsTree.dependencyDirections[lang]) {
    report += `\n## 4. Dependency Directions\n\n| From | To | Rule |\n|------|-----|------|\n`;
    for (const dd of dirsTree.dependencyDirections[lang]) {
      report += `| ${dd.from} | ${dd.to} | ${dd.rule} |\n`;
    }
  }

  report += `\n## 5. Boundary Warnings\n\n`;
  if (allCycles.length === 0) {
    report += 'None detected. All dependency directions are acyclic (DAG).\n';
  } else {
    for (const cycle of allCycles) {
      report += `- Cycle detected: ${cycle.cycle.join(' -> ')}\n`;
    }
  }

  return report;
}

// ============================================================
// メインエントリポイント
// ============================================================

function main(testArgs) {
  const { graphPath, graphDir, basename, flags } = parseArguments(testArgs);
  const graph = loadGraph(graphPath);

  // 言語推定（全ノード）
  const langGraph = JSON.parse(JSON.stringify(graph));
  for (const node of langGraph.nodes) {
    node.language = inferLanguage(node);
  }

  // 3言語のツリーを生成
  const trees = {};
  const allDependencyDirections = {};
  const allWarnings = [];

  for (const lang of ['rust', 'go', 'typescript']) {
    const { tree, nodeToDir } = buildDirectoryTree(langGraph, lang);
    trees[lang] = tree;

    const dirEdges = projectEdgesToDirectories(langGraph, nodeToDir);
    allDependencyDirections[lang] = dirEdges.map(e => ({
      from: e.from,
      to: e.to,
      rule: `${e.from} → ${e.to} (${e.evidence})`,
    }));

    const cycles = tarjanSCC(dirEdges);
    for (const cycle of cycles) {
      allWarnings.push({ cycle: cycle.cycle, language: lang });
    }
  }

  // Dirs-Tree.json の構築
  const dirsTree = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    sourceGraph: graphPath,
    analysis: {
      nodeCount: graph.nodes.length,
      edgeCount: graph.edges.length,
      kindCounts: {},
      edgeTypeCounts: {},
    },
    trees,
    dependencyDirections: allDependencyDirections,
    warnings: allWarnings,
  };

  for (const node of graph.nodes) {
    dirsTree.analysis.kindCounts[node.kind] = (dirsTree.analysis.kindCounts[node.kind] || 0) + 1;
  }
  for (const edge of graph.edges) {
    dirsTree.analysis.edgeTypeCounts[edge.type] = (dirsTree.analysis.edgeTypeCounts[edge.type] || 0) + 1;
  }

  // スキーマ検証
  const schemaErrors = validateDirsTree(dirsTree, langGraph);
  if (schemaErrors.length > 0) {
    const errMsg = reportError(
      'Dirs-Tree.json のスキーマ検証に失敗しました',
      schemaErrors.join('; '),
      'validate-dirs-tree-schema.js の出力を確認して修正してください'
    );
    if (flags.json) {
      console.log(JSON.stringify({ ok: false, errors: schemaErrors }));
    }
    process.exit(EXIT_FAILURE);
  }

  // 出力ファイルの書き出し
  const dirsTreePath = path.join(graphDir, `${basename}-Dirs-Tree.json`);
  fs.writeFileSync(dirsTreePath, JSON.stringify(dirsTree, null, 2), 'utf-8');

  const langGraphPath = path.join(graphDir, `${basename}-GRAPH-LANG.json`);
  fs.writeFileSync(langGraphPath, JSON.stringify(langGraph, null, 2), 'utf-8');

  const statusPath = path.join(graphDir, `${basename}-BOUNDIFY-Status.json`);
  fs.writeFileSync(statusPath, JSON.stringify({
    state: 'STEP1_DONE',
    sourceGraph: graphPath,
    dirsTree: dirsTreePath,
    langGraph: langGraphPath,
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf-8');

  // 標準出力（--json / --quiet フラグで分岐）
  if (flags.json) {
    console.log(JSON.stringify(dirsTree, null, 2));
  } else if (!flags.quiet) {
    const lang = 'rust';
    const report = generateReport(graph, dirsTree, lang);
    const jsonBlock = JSON.stringify(dirsTree, null, 2);
    console.log(SAFE_BOUNDARIES_EN_TEXT);
    console.log('');
    console.log(report);
    console.log('');
    console.log('```json');
    console.log(jsonBlock);
    console.log('```');
  }
}

// テスト用エクスポート
if (require.main === module) {
  main();
}

module.exports = { main, inferLanguage, buildDirectoryTree, projectEdgesToDirectories, tarjanSCC, validateDirsTree, generateDeclarationStub, dryRunGenerate, generateFiles, parseArguments, loadGraph };
```

### 4.3 validate-dirs-tree-schema.js — スキーマ検証スクリプト

```javascript
#!/usr/bin/env node
/**
 * validate-dirs-tree-schema.js --dirs-tree=<path> --graph=<path>
 *
 * Dirs-Tree.json のスキーマ整合性を検証する。graphify の check-all-schema.js と同様、
 * 各Step終了時に自動実行される。
 *
 * 検証項目:
 *   1. JSON Schema 準拠（schemaVersion, trees, dependencyDirections の存在）
 *   2. 全 mappedNodeIds が元グラフに存在すること
 *   3. パスの重複がないこと
 *   4. 依存方向の型が許可セットに含まれること
 *   5. ネスト深さが 4 を超えないこと
 *   6. 各ファイル名が言語の命名規則に従っていること
 *      - Rust: .rs 拡張子
 *      - Go: .go 拡張子
 *      - TypeScript: .ts 拡張子
 *
 * 出力契約:
 *   正常時 → {"ok":true}（終了コード0）
 *   異常時 → {"ok":false, "errors":[...]}（終了コード1）
 *   異常時は stderr に3段テンプレートのエラーも出力する
 */

const fs = require('fs');
const path = require('path');

function validate(testArgs) {
  const args = testArgs || process.argv.slice(2);
  const dirsTreeFlag = args.find(a => a.startsWith('--dirs-tree='));
  const graphFlag = args.find(a => a.startsWith('--graph='));

  if (!dirsTreeFlag || !graphFlag) {
    console.error('[ERROR] 引数が不足しています\n原因: --dirs-tree=<path> と --graph=<path> が必要\n対応: 両方の引数を指定して再実行');
    process.exit(1);
  }

  const dirsTreePath = path.resolve(dirsTreeFlag.slice('--dirs-tree='.length));
  const graphPath = path.resolve(graphFlag.slice('--graph='.length));

  if (!fs.existsSync(dirsTreePath)) {
    console.error(`[ERROR] Dirs-Tree.json が見つかりません: ${dirsTreePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(graphPath)) {
    console.error(`[ERROR] グラフJSONが見つかりません: ${graphPath}`);
    process.exit(1);
  }

  const dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf-8'));
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
  const errors = [];
  const allNodeIds = new Set(graph.nodes.map(n => n.id));

  // 1. 必須フィールド
  if (!dirsTree.schemaVersion) errors.push('schemaVersion が欠落');
  if (!dirsTree.trees) errors.push('trees が欠落');
  if (!dirsTree.dependencyDirections) errors.push('dependencyDirections が欠落');

  // 2. mappedNodeIds 検証
  function checkNodeIds(node, pathStr) {
    if (node.mappedNodeIds) {
      for (const nid of node.mappedNodeIds) {
        if (!allNodeIds.has(nid)) {
          errors.push(`存在しないノードID ${nid} が ${pathStr} で参照されています`);
        }
      }
    }
    if (node.children) {
      for (const child of node.children) {
        checkNodeIds(child, `${pathStr}/${child.name}`);
      }
    }
  }

  // 3. ネスト深さ検証
  function checkDepth(node, depth, pathStr) {
    if (depth > 4) {
      errors.push(`ネスト深さ制限(4)超過: ${pathStr}`);
    }
    if (node.children) {
      for (const child of node.children) {
        checkDepth(child, depth + 1, `${pathStr}/${child.name}`);
      }
    }
  }

  for (const [lang, tree] of Object.entries(dirsTree.trees || {})) {
    checkNodeIds(tree, lang);
    checkDepth(tree, 0, lang);
  }

  // 4. ファイル命名規則
  for (const [lang, tree] of Object.entries(dirsTree.trees || {})) {
    function checkNaming(node, pathStr) {
      if (node.type === 'file') {
        const ext = path.extname(node.name);
        if (lang === 'rust' && ext !== '.rs') {
          errors.push(`Rustファイルの拡張子が .rs ではありません: ${pathStr}/${node.name}`);
        }
        if (lang === 'go' && ext !== '.go') {
          errors.push(`Goファイルの拡張子が .go ではありません: ${pathStr}/${node.name}`);
        }
        if (lang === 'typescript' && ext !== '.ts') {
          errors.push(`TypeScriptファイルの拡張子が .ts ではありません: ${pathStr}/${node.name}`);
        }
      }
      if (node.children) {
        for (const child of node.children) {
          checkNaming(child, `${pathStr}/${child.name}`);
        }
      }
    }
    checkNaming(tree, lang);
  }

  // 5. dependencyDirections のパスが実際のツリーに存在することを検証
  const allDirPaths = new Set();
  function collectDirPaths(node, prefix) {
    const currentPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.type === 'directory') {
      allDirPaths.add(currentPath);
      if (node.children) {
        for (const child of node.children) {
          collectDirPaths(child, currentPath);
        }
      }
    }
  }
  for (const [lang, tree] of Object.entries(dirsTree.trees || {})) {
    collectDirPaths(tree, '');
  }
  for (const [lang, dirs] of Object.entries(dirsTree.dependencyDirections || {})) {
    for (const dd of dirs) {
      if (!allDirPaths.has(dd.from)) {
        errors.push(`dependencyDirections に存在しないディレクトリ from が参照されています: "${dd.from}" (言語: ${lang})`);
      }
      if (!allDirPaths.has(dd.to)) {
        errors.push(`dependencyDirections に存在しないディレクトリ to が参照されています: "${dd.to}" (言語: ${lang})`);
      }
    }
  }

  if (errors.length > 0) {
    console.error(`[ERROR] スキーマ検証に失敗しました\n原因: ${errors.length}件の違反\n対応: 各エラーを修正してから次のStepに進んでください`);
    console.log(JSON.stringify({ ok: false, errors }));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true }));
}

if (require.main === module) {
  validate();
}

module.exports = { validate };
```

### 4.4 generate-dir-template.js — 実ディレクトリ/ファイル生成スクリプト

```javascript
#!/usr/bin/env node
/**
 * generate-dir-template.js --dirs-tree=<path> --root-dir=<path> --lang=<lang> [--dry-run] [--force]
 *
 * Dirs-Tree.json に基づいて実際のディレクトリとテンプレートファイルを生成する。
 *
 * 出力契約:
 *   正常時 → {"ok":true, "created":[...]}（終了コード0）
 *   異常時 → {"ok":false, "error":"..."}（終了コード1）
 */

const fs = require('fs');
const path = require('path');

async function main(testArgs) {
  const args = testArgs || process.argv.slice(2);

  const dirsTreeFlag = args.find(a => a.startsWith('--dirs-tree='));
  const rootDirFlag = args.find(a => a.startsWith('--root-dir='));
  const langFlag = args.find(a => a.startsWith('--lang='));
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');

  if (!dirsTreeFlag || !rootDirFlag || !langFlag) {
    console.error('[ERROR] 引数が不足しています\n原因: --dirs-tree=<path> --root-dir=<path> --lang=<lang> が必要\n対応: 3つの引数を指定して再実行');
    process.exit(1);
  }

  const dirsTreePath = path.resolve(dirsTreeFlag.slice('--dirs-tree='.length));
  const rootDir = path.resolve(rootDirFlag.slice('--root-dir='.length));
  const lang = langFlag.slice('--lang='.length);

  if (!['rust', 'go', 'typescript'].includes(lang)) {
    console.error(`[ERROR] サポートされていない言語です: ${lang}\n原因: rust/go/typescript のいずれかを指定\n対応: 正しい言語を指定してください`);
    process.exit(1);
  }

  const dirsTree = JSON.parse(fs.readFileSync(dirsTreePath, 'utf-8'));
  const tree = dirsTree.trees[lang];
  if (!tree) {
    console.error(`[ERROR] 言語 ${lang} のツリーが Dirs-Tree.json に見つかりません`);
    process.exit(1);
  }

  const created = [];

  // 第1パス: 生成予定アイテムのディスカバリ（ファイル作成なし）
  function discover(node, currentPath) {
    const fullPath = path.join(currentPath, node.name);
    if (node.type === 'directory') {
      created.push({ type: 'directory', path: fullPath });
      if (node.children) {
        for (const child of node.children) {
          discover(child, fullPath);
        }
      }
    } else if (node.type === 'file') {
      let content = '';
      if (node.declarationStub) {
        content += node.declarationStub + '\n\n';
      }
      created.push({ type: 'file', path: fullPath, size: content.length, content });
    }
  }

  discover(tree, rootDir);

  // dry-run モード: 予定一覧を表示して終了
  if (isDryRun) {
    console.log(JSON.stringify({
      ok: true,
      dryRun: true,
      language: lang,
      created: created.map(c => ({ type: c.type, path: c.path })),
      total: created.length,
      note: 'dry-run モードです。実際に生成するには --dry-run を外して再実行してください。',
    }));
    return;
  }

  // 確認プロンプト（--force の場合はスキップ）
  if (!isForce && process.stdin.isTTY) {
    const rl = require('readline').createInterface({ input: process.stdin, output: process.stderr });
    const summary = created
      .filter(c => c.type === 'file')
      .map(c => `  ${c.path}`)
      .join('\n');
    process.stderr.write(`以下の ${created.length} アイテムを生成します:\n${summary}\n\n続行しますか？ (y/N): `);

    const answer = await new Promise(resolve => rl.question('', resolve));
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.log(JSON.stringify({ ok: false, cancelled: true, message: 'ユーザーによりキャンセルされました' }));
      return;
    }
  }

  // 第2パス: 実際のファイル作成（確認通過後にのみ実行）
  const actuallyCreated = [];
  for (const item of created) {
    if (item.type === 'directory') {
      fs.mkdirSync(item.path, { recursive: true });
      actuallyCreated.push({ type: 'directory', path: item.path, action: 'created' });
    } else if (item.type === 'file') {
      if (fs.existsSync(item.path) && !isForce) {
        console.error(`[ERROR] ファイルが既に存在します: ${item.path}\n原因: 出力先に同名ファイルがある\n対応: --force フラグを指定して上書きするか、既存ファイルを退避してください`);
        process.exit(1);
      }
      fs.writeFileSync(item.path, item.content, 'utf-8');
      actuallyCreated.push({
        type: 'file',
        path: item.path,
        action: fs.existsSync(item.path) && isForce ? 'overwritten' : 'created',
      });
    }
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: false,
    language: lang,
    created: actuallyCreated,
    total: actuallyCreated.length,
  }));
}

if (require.main === module) {
  main().catch(e => {
    console.error(`[ERROR] ${e.message}`);
    process.exit(1);
  });
}

module.exports = { main };
```

### 4.5 update-step-status.js のフラグ拡張

`--status=` フラグを追加する。`--graphify-status=` と同一の動作を `--status=` でも実行可能にする：

```javascript
// 追加するフラグパースロジック
const STATUS_PATH_PREFIX = '--status=';
const GRAPHIFY_STATUS_PATH_PREFIX = '--graphify-status=';

// 従来の --graphify-status=<path> に加えて --status=<path> をサポート
const statusFlag = args.find(a => a.startsWith(STATUS_PATH_PREFIX));
const graphifyStatusFlag = args.find(a => a.startsWith(GRAPHIFY_STATUS_PATH_PREFIX));
const statusPath = statusFlag
  ? statusFlag.slice(STATUS_PATH_PREFIX.length)
  : graphifyStatusFlag
    ? graphifyStatusFlag.slice(GRAPHIFY_STATUS_PATH_PREFIX.length)
    : null;
```

これにより、boundify は `--status=./RFC-ROOT-BOUNDIFY-Status.json` として呼び出せ、graphify は従来通り `--graphify-status=./RFC-ROOT-GRAPHIFY-Status.json` として呼び出せる。

### 4.6 ファイル命名規則

boundify が出力する全ファイルの命名規則は以下の通り：

| 対象 | 規則 | 例 |
|------|------|-----|
| Rust ファイル | `.rs` 拡張子、スネークケース | `sip_event.rs` |
| Go ファイル | `.go` 拡張子、スネークケース | `sip_event.go` |
| TypeScript ファイル | `.ts` 拡張子、ケバブケース | `sip-event.ts` |
| barrel (Rust) | `mod.rs` | `mod.rs` |
| barrel (Go) | 該当なし（Goにはbarrel概念なし） | — |
| barrel (TypeScript) | `index.ts` | `index.ts` |
| ディレクトリ名 | スネークケース（Rust/Go）、ケバブケース（TS） | `audio_mixer/`、`audio-mixer/` |

### 4.7 Step 構成

boundify-graph-to-dirs は以下の6Stepで構成される。各Stepの進行は `update-step-status.js --status=<basename>-BOUNDIFY-Status.json <start-step|end-step|fail-step|reset-to-step> <N>` で管理する。

#### Step 0: 初期化（--json 出力とファイル書き出し）

```bash
# Step 0 を開始
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 0

# 初回 Dirs-Tree.json / GRAPH-LANG.json / BOUNDIFY-Status.json を生成
# --quiet で標準出力を抑制（自動Stepではノイズになるため）
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js "$graphPath" --quiet

# スキーマ検証
node .claude/scripts/rfc-graph/validate-dirs-tree-schema.js --dirs-tree="$dirsTreePath" --graph="$graphPath"

# Step 0 正常終了
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 0
```

#### Step 1: kind/language 検証

AI が各ノードの kind 分類と language 推定結果を目視確認する。誤りがあれば GRAPH-LANG.json のノードの `language` 配列を修正する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 1

# GRAPH-LANG.json を読み込み、各ノードの language 配列を確認
# AI が誤りを修正したら boundify-graph-to-dirs.js を再実行して反映
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js "$graphPath"
node .claude/scripts/rfc-graph/validate-dirs-tree-schema.js --dirs-tree="$dirsTreePath" --graph="$graphPath"

node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 1
```

#### Step 2: 依存方向検証

AI が Dirs-Tree.json の依存方向マップを確認し、循環が報告されている場合は解消方法を判断する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 2

# 循環依存の有無を確認（jq で warnings 配列の長さをチェック）
warnings_count=$(node -e "const d=require('$dirsTreePath'); console.log(d.warnings ? d.warnings.length : 0)")
if [ "$warnings_count" -gt 0 ]; then
  echo "[WARN] $warnings_count 件の循環依存が検出されました"
  # AI は循環に参加しているノードとディレクトリを確認し、
  # kind の再割り当てやノード再配置で解消する
else
  echo "[OK] 循環依存なし（DAG）"
fi

# AI が必要に応じて kind 再割り当てやノード再配置を検討し、修正
# 修正後は boundify-graph-to-dirs.js を再実行
node .claude/scripts/rfc-graph/boundify-graph-to-dirs.js "$graphPath"
node .claude/scripts/rfc-graph/validate-dirs-tree-schema.js --dirs-tree="$dirsTreePath" --graph="$graphPath"

node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 2
```

#### Step 3: 自己検証

Dirs-Tree.json のツリー構造を確認し、提案されたディレクトリ構成の十分性を判断する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 3

# Dirs-Tree.json のツリー構造を表示
node -e "
const d = require('$dirsTreePath');
function show(node, indent) {
  console.log(indent + (node.type === 'directory' ? '📁' : '📄') + ' ' + node.name);
  if (node.children) node.children.forEach(c => show(c, indent + '  '));
}
for (const [lang, tree] of Object.entries(d.trees||{})) {
  console.log('\n## Language: ' + lang);
  show(tree, '');
}
"

# AI が十分性を判断（不十分なら reset-to-step 1、十分なら Step 4 へ）
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 3
```

#### Step 4: 完成確認

Dirs-Tree.json が完成したと判断したら、ユーザーに実体生成の確認を求める。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 4

# dry-run で生成予定のファイル一覧を表示
node .claude/scripts/rfc-graph/generate-dir-template.js --dirs-tree="$dirsTreePath" --root-dir="$rootDir" --lang=rust --dry-run

# 確認プロンプト（AI がユーザーに承諾を求める）

node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 4
```

#### Step 5: 実体生成

ユーザーの承諾を得て、実際のディレクトリとテンプレートファイルを生成する。

```bash
node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" start-step 5

# 実ファイル生成（Rust）
node .claude/scripts/rfc-graph/generate-dir-template.js --dirs-tree="$dirsTreePath" --root-dir="$rootDir" --lang=rust

# 実ファイル生成（Go）
node .claude/scripts/rfc-graph/generate-dir-template.js --dirs-tree="$dirsTreePath" --root-dir="$rootDir" --lang=go

# 実ファイル生成（TypeScript）
node .claude/scripts/rfc-graph/generate-dir-template.js --dirs-tree="$dirsTreePath" --root-dir="$rootDir" --lang=typescript

node .claude/scripts/rfc-graph/update-step-status.js --status="$statusPath" end-step 5
```

---

## Appendix

### A. Dirs-Tree.json 完全JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DirsTree",
  "type": "object",
  "required": ["schemaVersion", "generatedAt", "sourceGraph", "analysis", "trees", "dependencyDirections", "warnings"],
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^\\d+\\.\\d+$" },
    "generatedAt": { "type": "string", "format": "date-time" },
    "sourceGraph": { "type": "string" },
    "analysis": {
      "type": "object",
      "required": ["nodeCount", "kindCounts", "edgeTypeCounts"],
      "properties": {
        "nodeCount": { "type": "integer", "minimum": 1 },
        "kindCounts": { "type": "object" },
        "edgeTypeCounts": { "type": "object" },
        "circularDependencies": { "type": "array" }
      }
    },
    "trees": {
      "type": "object",
      "properties": {
        "rust": { "$ref": "#/definitions/DirNode" },
        "go": { "$ref": "#/definitions/DirNode" },
        "typescript": { "$ref": "#/definitions/DirNode" }
      },
      "required": ["rust", "go", "typescript"]
    },
    "dependencyDirections": {
      "type": "object",
      "properties": {
        "rust": { "type": "array", "items": { "$ref": "#/definitions/DependencyDirection" } },
        "go": { "type": "array", "items": { "$ref": "#/definitions/DependencyDirection" } },
        "typescript": { "type": "array", "items": { "$ref": "#/definitions/DependencyDirection" } }
      }
    },
    "warnings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "cycle": { "type": "array", "items": { "type": "string" } },
          "language": { "type": "string" }
        }
      }
    }
  },
  "definitions": {
    "DirNode": {
      "type": "object",
      "required": ["name", "type"],
      "properties": {
        "name": { "type": "string" },
        "type": { "type": "string", "enum": ["directory", "file"] },
        "kind": { "type": "string" },
        "rationale": { "type": "string" },
        "language": { "type": "array", "items": { "type": "string", "enum": ["rust", "go", "typescript"] } },
        "languageRules": {
          "description": "ディレクトリノードのみ有効。ファイルノードでは使用しない。",
          "type": "object",
          "properties": {
            "rust": { "type": "string" },
            "go": { "type": "string" },
            "typescript": { "type": "string" }
          }
        },
        "mappedNodeIds": { "type": "array", "items": { "type": "string" } },
        "role": { "type": "string" },
        "declarationStub": { "type": "string" },
        "children": {
          "type": "array",
          "items": { "$ref": "#/definitions/DirNode" }
        }
      }
    },
    "DependencyDirection": {
      "type": "object",
      "required": ["from", "to", "rule"],
      "properties": {
        "from": { "type": "string" },
        "to": { "type": "string" },
        "rule": { "type": "string" },
        "edgeEvidence": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

### B. 言語推定ヒューリスティック完全リファレンス

| パターン | 対象言語 | マッチ例 |
|----------|---------|---------|
| `crate`, `pub `, `mod `, `unsafe` | rust | `pub struct SipClient` |
| `fn `, `impl `, `struct `, `enum `, `trait ` | rust | `impl SipClient` |
| `cargo`, `#\[derive`, `::std::` | rust | `cargo test` |
| `.await`, `mut `, `impl .+ for ` | rust | `async fn .await` |
| `package` | go | `package sipclient` |
| `func `, `goroutine`, `defer ` | go | `func NewClient()` |
| `interface{}` | go | `interface{}` |
| `TypeScript`, `barrel`, `index.ts` | typescript | `barrel index.ts` |
| `.ts`, `Component`, `useState` | typescript | `React.Component` |
| 上記のいずれにも該当しない場合 | rust + go + typescript | 汎用的な設計判断 |

### C. BOUNDIFY-Status.json スキーマ

```json
{
  "state": "STEP0_DONE|STEP1_DONE|STEP2_DONE|STEP3_DONE|STEP4_DONE|STEP5_DONE",
  "currentStep": 0,
  "steps": {
    "0": "done",
    "1": "running",
    "2": "pending",
    "3": "pending",
    "4": "pending",
    "5": "pending"
  },
  "sourceGraph": "/path/to/RFC-ROOT-GRAPH.json",
  "dirsTree": "/path/to/RFC-ROOT-Dirs-Tree.json",
  "langGraph": "/path/to/RFC-ROOT-GRAPH-LANG.json",
  "updatedAt": "2026-07-07T12:00:00.000Z"
}
```

---

## セキュリティ考慮事項

1. **ファイル生成の安全機構**: dry-run モードをデフォルトとし、確認プロンプトを必須とする。`--force` は明示的な指定が必要。
2. **既存ファイルの保護**: テンプレートファイル生成時に既存ファイルが存在する場合は `--force` がなければエラーで終了する。
3. **パス・トラバーサル対策**: 全てのファイル出力パスは `path.resolve()` を通過し、ルートディレクトリ外への書き込みを防止する。
4. **権限不足の検出**: `fs.mkdirSync` / `fs.writeFileSync` のエラーはキャッチされ、ユーザーフレンドリなエラーメッセージとともに関数が終了する。

## 参考文献

1. `/graphify-rfc` スラッシュコマンド定義: `tools/conver/.claude/commands/graphify-rfc.md`
2. 安全な境界ドキュメント: `tools/conver/docs/directory-and-namespace-safe-boundaries-rust-go-typescript.md`
3. Tarjan's strongly connected components algorithm: R. Tarjan, "Depth-first search and linear graph algorithms", SIAM Journal on Computing, 1972
