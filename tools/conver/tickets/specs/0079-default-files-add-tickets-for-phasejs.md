---
ticket_id: 79
title: "default_files スキーマ追加と add-tickets-for-phase.js への自動解決機能統合"
slug: default-files-add-tickets-for-phasejs
status: draft
created_at: 2026-07-10
updated_at: 2026-07-10
---
# default_files スキーマ追加と add-tickets-for-phase.js への自動解決機能統合

## Summary

`tickets-schema.json` の `#/definitions/ticket` に `default_files`（string[]）を追加し、`add-tickets-for-phase.js` に `--dirs-tree` 引数を追加する。同スクリプトは内部で `buildNodeToDirMap()`（validate-phasify.js の公開関数）を呼び出し、stdin から受け取った各チケットの `nodeIds` から Dirs-Tree.json に基づく正確なファイルパスを機械的に解決し、`default_files` として自動設定する。これにより AI がファイルパスを手書きする必要がなくなり、憶測パス・書き漏れを永久に防止する。

## Background

現在の `add-tickets-for-phase.js` は AI が手動で指定したフィールドのみを追加し、ファイルパスは全く管理していない。AI に `default_files` を手動で書かせると：

1. パスを憶測で書く（存在しないパス）
2. 束ねたノードの一部のパスしか書かない（書き漏れ）
3. フォーマットが統一されない

一方、既存の `buildNodeToDirMap()`（validate-phasify.js L56-L75）は Dirs-Tree.json から `nodeId → ファイルパス` のマッピングを正確に構築できる。`query.js --dirs-tree` も既にこの関数を使用して実装先ファイルパスを表示している。この既存関数を `add-tickets-for-phase.js` からも呼び出せるようにすれば、AI の操作を一切介さずに機械的にファイルパスを解決できる。

## Scope

### 1. `tickets-schema.json` の改修

`#/definitions/ticket` の `properties` に `default_files` を追加：

```json
"default_files": {
  "type": "array",
  "items": { "type": "string" },
  "description": "このチケットの実装先となるファイルパスの配列。Dirs-Tree.json から nodeIds 経由で機械的に解決される。AI が手動で指定してはならず、add-tickets-for-phase.js が --dirs-tree フラグ指定時に自動設定する。required には含めず後方互換性を維持。"
}
```

`required` には含めず後方互換性を維持する。

### 2. `add-tickets-for-phase.js` の改修

以下の変更を行う：

**a. `--dirs-tree` CLI引数の追加**

Usage を拡張：
```
echo '<tickets-array-json>' | node add-tickets-for-phase.js \
  <Tickets.json のパス> \
  <P{id}> \
  --dirs-tree=<Dirs-Tree.json のパス>
```

`--dirs-tree` は第3引数として受け取り、省略可能とする（省略時は `default_files` の自動設定は行われず、従来通り動作）。

**b. `buildNodeToDirMap` のインポート**

`validate-phasify.js` の `buildNodeToDirMap` 関数を `require` する：

```js
const { buildNodeToDirMap } = require("../rfc-graph/validate-phasify.js");
```

**c. `default_files` 自動設定関数の追加**

```js
function resolveDefaultFiles(tickets, nodeToDirMap) {
  for (const ticket of tickets) {
    const paths = new Set();
    if (Array.isArray(ticket.nodeIds)) {
      for (const nodeId of ticket.nodeIds) {
        const resolvedPath = nodeToDirMap[nodeId];
        if (resolvedPath) {
          paths.add(resolvedPath);
        }
      }
    }
    if (paths.size > 0) {
      ticket.default_files = Array.from(paths).sort();
    }
  }
}
```

**d. main() 内での呼び出し**

`--dirs-tree` が指定された場合、`main()` 内の以下の箇所で呼び出す：
- stdin パース後、`ticketsInput` の各要素に対して `resolveDefaultFiles()` を実行
- `nodeToDirMap` は `buildNodeToDirMap(dirsTreeData)` で事前構築

**e. 処理フロー**

```
1. stdin からチケット配列をパース（従来通り）
2. nodeIds 必須チェック（従来通り）
3. 第3引数 --dirs-tree が指定されている場合:
   a. Dirs-Tree.json を読み込む
   b. buildNodeToDirMap() で nodeId→path マップを構築
   c. 各チケットの nodeIds から default_files を自動解決・設定
4. Tickets.json 読み込み、フェーズ解決（従来通り）
5. bulkAddTickets 実行（従来通り）
6. nodeIds 過不足検証（従来通り）
7. 書き込み（従来通り）
```

### 3. `split-to-tickets.md` のドキュメント更新

- Step 5-2 の Usage に `--dirs-tree` 引数を追加
- JSON 例に `default_files` フィールドを追加（値は `["src/auth/token.rs", "src/auth/keystore.rs"]` のような具体的な配列）
- 「`default_files` は `--dirs-tree` 指定時にスクリプトが自動設定するため、AI が入力してはならない」と明記

### 4. テストファイルの更新

`step5-add-tickets-coverage.test.cjs` に以下を追加：
- `resolveDefaultFiles()` のテスト（正常系: 正しくパスが解決される）
- `resolveDefaultFiles()` のテスト（異常系: nodeToDirMap にない nodeId は無視）
- `resolveDefaultFiles()` のテスト（nodeIds 空の場合は default_files 未設定）
- `add-tickets-for-phase.js` 統合テスト（--dirs-tree 指定時の動作）

## Non-scope

- `buildNodeToDirMap` の validate-phasify.js からの移設は含まない（既存の export をそのまま require）
- `show-phase-nodes.js` の改修は含まない（既に `query.js --dirs-tree` で正しく動作）
- `verify-all-ticket-coverage.js` の改修は含まない（default_files は検証対象外）
- 既存の `add-ticket.js` / `bulk-add-tickets.js` の改修は含まない（こちらのスクリプトは単独追加用で `default_files` 対応不要）

## Investigation

### 証拠1: `tickets-schema.json` の現在の ticket 定義

L55-L90。`default_files` は未定義。`sourcePaths`（L65）は既に存在するが、これは「実装に関連するソースファイルパス」をAIが手動で指定するフィールドであり、Dirs-Tree.json から機械的に解決されたパスとは異なる概念。`default_files` は別途追加が必要。

### 証拠2: `buildNodeToDirMap` の所在

ファイル: `.claude/scripts/rfc-graph/validate-phasify.js` L56-L75
```js
function buildNodeToDirMap(dirsTree) {
  const nodeToDir = {};
  function walk(node, parentPath) {
    // ... Dirs-Tree.json を再帰的に走査し mappedNodeIds から nodeId→path を構築
  }
  // ...
  return nodeToDir;
}
```
export: L425 `buildNodeToDirMap` — 既に `module.exports` されている。したがって `require("../rfc-graph/validate-phasify.js")` でインポート可能。

### 証拠3: `add-tickets-for-phase.js` の現在の引数設計

L87-L97: 第2引数 `phaseArg` までしか受け取っていない。第3引数として `--dirs-tree=<path>` を受け取る拡張が必要。

### 証拠4: パス解決の方向性の確認

`buildNodeToDirMap` が返すマップは `{ "N0001": "src/auth/token.rs", "N0003": "src/auth/keystore.rs" }` の形式。これは show-phase-nodes.js の出力内 `### 実装先となるファイルパス` のパスと完全に一致する。つまり、同一の Dirs-Tree.json を入力とすれば同一のパスが得られる。

## Test Plan

### ユニットテスト計画

| # | テスト対象 | 内容 |
|---|-----------|------|
| 1 | `resolveDefaultFiles()` | 全 nodeIds が nodeToDirMap に存在する場合 → 正しく default_files が設定される |
| 2 | `resolveDefaultFiles()` | 一部の nodeId が nodeToDirMap に存在しない場合 → 存在するもののみ設定される |
| 3 | `resolveDefaultFiles()` | nodeIds が空の場合 → default_files は設定されない |
| 4 | `resolveDefaultFiles()` | 重複するファイルパス（異なる nodeId が同じパスを指す） → 重複排除される |
| 5 | `add-tickets-for-phase.js` 統合 | --dirs-tree 指定時の全フロー（パース→解決→追加→検証→書込）が正常動作 |
| 6 | `tickets-schema.json` | default_files 追加後も既存チケットのスキーマ検証が通過する（互換性） |

### ユニットテスト不可能な項目（例外）

なし（Dirs-Tree.json はテスト用フィクスチャで再現可能）

## Boy Scout Rule — 翻訳可能性計画

### 新規コードの方針

- `resolveDefaultFiles()`: 関数名は動詞句、1文字変数禁止、エラーは `console.error` + `exit 1` で処理
- ハードコード値は定数化（`DIRS_TREE_ARG_PREFIX` 等）

### 既存コードの改善

`add-tickets-for-phase.js` 内の `main()` はすでに責務がやや長くなっている。今回 `--dirs-tree` パスの追加でさらに伸びるため、`resolveDefaultFiles()` を独立関数として抽出する設計は既に翻訳可能性を考慮したもの。追加の改善は不要。

## Acceptance Criteria

- [ ] `tickets-schema.json` の `#/definitions/ticket` に `default_files`（string[]）が追加されている
- [ ] 既存チケットのスキーマ検証が通過する（後方互換性）
- [ ] `add-tickets-for-phase.js` が第3引数 `--dirs-tree=<path>` を受け付ける
- [ ] `--dirs-tree` 指定時、各チケットの `nodeIds` から機械的に `default_files` が解決・設定される
- [ ] `--dirs-tree` 省略時は従来通り動作（互換性）
- [ ] 解決されたパスが show-phase-nodes.js（query.js --dirs-tree）の出力と一致する（同一の Dirs-Tree.json を使用する限り）
- [ ] `split-to-tickets.md` の Usage と JSON 例が更新されている
- [ ] テストが全て通過する（`make test-rfc-graph`）
- [ ] 不完全実装（todo!/panic!/TODO等）の混入なし

## Notes

- 本チケットは1チケットで実装する（変更が `tickets-schema.json` / `add-tickets-for-phase.js` / `split-to-tickets.md` / テスト の4ファイルに収束し、相互依存しているため）
- 実装順序: schema → add-tickets-for-phase.js → split-to-tickets.md → テスト
- 依存チケット: PX-41（show-phase-nodes.js + add-tickets-for-phase.js の基盤を実装済み）
- `buildNodeToDirMap` は validate-phasify.js から require 可能。移設不要。
