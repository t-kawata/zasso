---
ticket_id: 92
title: phasify が Tickets.json metadata に resolvedPaths を出力する
slug: phasify-ticketsjson-metadata-resolvedpaths
status: draft
created_at: 2026-07-14
updated_at: 2026-07-14
---
# phasify が Tickets.json metadata に resolvedPaths を出力する

## Summary

phasify-graph-and-dirs-files-tree.js が Tickets.json を生成する際、metadata に resolvedPaths（rfcPath, graphPath, dirsTreePath）を出力する。同時に source の値を従来の graphPath（.json）から rfcPath（.md）に変更する。これにより resolve-ticket-context.js が機械的に3経路を確定でき、かつ find-omissions への引数（source）が正しい RFC.md パスになる。

## Background

/split-to-tickets → phasify-graph-and-dirs-files-tree.js が生成する Tickets.json の metadata は従来:
```json
{
  "source": "/path/to/RFC-ROOT-GRAPH.json",
  "generatedAt": "2026-07-14",
  "analyzedSections": "phasify-graph-and-dirs-files-tree.js による自動生成"
}
```
であり、resolvedPaths が存在しなかった。このため resolve-ticket-context.js は metadata.source から拡張子による推測（.json → -GRAPH を strip → .md）に頼っており、機械的確定ができなかった。

さらに source に GRAPH.json の絶対パスが入っていることにより、runner.ts（conver.js）が /find-omissions-for-next-rfc に渡す引数が誤って GRAPH.json を指していた。find-omissions は RFC.md のパスを期待しているため、これは設計上の誤りである。

解決策: source を rfcPath（RFC.md）に変更し、metadata に resolvedPaths { rfcPath, graphPath, dirsTreePath } を追加する。この3経路は phasify が既に保持している graphPath と dirsTreePath から機械的に導出可能（推測不要）。

## Scope

以下の3ファイルを修正する:

1. **`.claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js`**
   - `ensureTicketsJsonExists()`: シグネチャに `dirsTreePath` パラメータを追加。metadata の `source` を `graphPath` → `rfcPath` に変更。metadata に `resolvedPaths` を追加
   - `runPhasify()`: 同上の変更を in-memory tickets オブジェクトにも適用
   - `main()`: `ensureTicketsJsonExists` 呼び出しに `opts.dirsTreePath` を追加

2. **`.claude/scripts/tickets/write-tickets-json-template.js`**
   - 現在 `data.resolvedPaths` を完全に無視してスケルトンを生成している。受け取った `data.resolvedPaths` を metadata に反映する

3. **`.claude/scripts/tickets/tickets-schema.json`**
   - `metadata.additionalProperties` が `{ "type": "string" }` のため、object 型の `resolvedPaths` が JSON Schema 検証を通過できない。`resolvedPaths` を正式プロパティとして追加するか、`additionalProperties` を緩和する

**改修対象は `tools/conver/.claude/` 配下のみとする。** 単体テスト・結合テストについてはこの限りではない（テストファイルの改修は本チケットのスコープに含まれる）。root `.claude/` や `crates/siprs/.claude/` への展開は別途行う。

### rfcPath の導出ルール

graphPath（例: `/path/to/RFC-ROOT-GRAPH.json`）から:
```
const rfcPath = graphPath.replace(/-GRAPH\.json$/, '.md');
```
この命名規則は graphify-rfc の導出ルールと合致しており、100%機械的に確定できる。

## Non-scope

- `sources` 配列の導入（今回のループモデルでは不要と判断）
- `resolve-ticket-context.js` の改名（別チケット PX-56）
- find-omissions の内部改修
- merge-omissions-into-root-rfc の作成

## Investigation

### コード解析の証拠

**phasify-graph-and-dirs-files-tree.js L194-199** — ensureTicketsJsonExists() の metadata 生成:
```javascript
const metadata = JSON.stringify({
    title: 'phasify 自動生成チケット分解設計書',
    source: graphPath,        // ← ここが RFC.md ではなく GRAPH.json の絶対パス
    generatedAt: ...,
    analyzedSections: '...',
    // ← resolvedPaths なし
});
```

**phasify-graph-and-dirs-files-tree.js L341-345** — runPhasify() の in-memory tickets:
```javascript
const inMemoryTickets = {
    title: 'phasify 自動生成',
    metadata: { source: opts.graphPath, generatedAt: ... },
    // ← analyzedSections も resolvedPaths もなし
    phases: ticketsPhases,
};
```

**write-tickets-json-template.js L45-52** — resolvedPaths をドロップ:
```javascript
const skeleton = {
    title: data.title || "",
    metadata: {
      source: data.source || "",
      generatedAt: data.generatedAt || "",
      analyzedSections: data.analyzedSections || "",
      // ← data.resolvedPaths は完全に無視！
    },
    phases: [],
};
```

**tickets-schema.json** — metadata の additionalProperties 制約:
```json
"metadata": {
    "additionalProperties": { "type": "string" }
    // ← object 型の resolvedPaths を弾く
}
```

**runner.ts L348** — source が find-omissions に誤って渡される:
```javascript
const source = getSourceFromTickets(options.ticketsPath);
await runCommand(session, `/find-omissions-for-next-rfc ${source}`, ...);
// source が GRAPH.json の絶対パスなので find-omissions は JSON ファイルを
// RFC とみなして読み込むことになる — 設計上の誤り
```

**resolve-ticket-context.js L162-170** — resolvedPaths を最優先する既存実装:
```javascript
if (resolvedPaths && resolvedPaths.rfcPath && resolvedPaths.graphPath && resolvedPaths.dirsTreePath) {
    const docPath = path.resolve(ticketsDir, resolvedPaths.rfcPath);
    // ...全ファイル実在確認→機械的確定
    return { docPath, graphPath, dirsTreePath, docPathSource: 'resolvedPaths' };
}
// すでに resolvedPaths 最優先のロジックは存在する。入力を出力していないだけ。
```

## Test Plan

### ユニットテスト計画

修正対象の3ファイルは Node.js のスクリプトであり、既存のテストスイートが存在することを確認する:

1. **phasify-graph-and-dirs-files-tree.js**: 結合テスト（`tests/rfc-graph/phasify-*.test.cjs`）が存在。修正後も全テストが通過すること
2. **write-tickets-json-template.js**: テストファイルの有無を確認。少なくとも:
   - `resolvedPaths` を渡したときに metadata に正しく反映されること
   - `resolvedPaths` なし（互換性）でも従来通り動作すること
3. **tickets-schema.json**: JSON Schema 検証が `resolvedPaths` を通すこと

### 検証手順

1. phasify を実行して生成された Tickets.json の metadata を確認:
   ```bash
   node .claude/scripts/rfc-graph/phasify-graph-and-dirs-files-tree.js <GRAPH.json> <Dirs-Tree.json>
   cat Tickets.json | jq '.metadata'
   ```
   期待:
   ```json
   {
     "source": "/path/to/RFC-ROOT.md",
     "resolvedPaths": {
       "rfcPath": "/path/to/RFC-ROOT.md",
       "graphPath": "/path/to/RFC-ROOT-GRAPH.json",
       "dirsTreePath": "/path/to/RFC-ROOT-Dirs-Tree.json"
     }
   }
   ```

2. resolve-ticket-context.js の `resolveDocPath()` が `resolvedPaths` を正しく読むことを確認（出力JSONの docPathSource が `'resolvedPaths'` になること）

3. 3系統（root, tools/conver, crates/siprs）全てで全テスト通過

### ユニットテスト不可能な項目（例外）

- ファイルI/O（`ensureTicketsJsonExists()` のファイル生成）はモックが必要

## Boy Scout Rule — 翻訳可能性計画

1. **phasify-graph-and-dirs-files-tree.js**: `ensureTicketsJsonExists()` の metadata 組み立て文字列は現状でも散文として読める。ただし `rfcPath` の導出ロジックをインライン文字列置換ではなく名前付きの純粋関数として抽出する（例: `deriveRfcPath(graphPath)`）
2. **write-tickets-json-template.js**: `data.resolvedPaths` の反映は `...(data.resolvedPaths ? { resolvedPaths: data.resolvedPaths } : {})` の1行で済む。過剰な抽象化は不要
3. 3系統への適用は rsync または同期的なコピーで行い、ファイルの不一致を防ぐ

## Acceptance Criteria

- [ ] phasify が生成する Tickets.json の metadata に `source: rfcPath`（RFC.md のパス）が設定される
- [ ] phasify が生成する Tickets.json の metadata に `resolvedPaths`（rfcPath, graphPath, dirsTreePath）が含まれる
- [ ] write-tickets-json-template.js が `resolvedPaths` を metadata に反映する
- [ ] tickets-schema.json の検証が `resolvedPaths` を含む metadata を通す
- [ ] tools/conver/.claude/ 配下の3ファイルが修正されている（root や crates/siprs への展開は本チケットのスコープ外）
- [ ] 既存テストが全て通過する

## Notes

<!--
注: このコメントは人間向けの説明である。

- plan: /plan-ticket が計画を策定し、チケットの JSON フィールド（scope, testUnit, notes）に保存する
- implementation: /start-ticket が実装サマリーをチケットの JSON フィールド（changes, notes）に保存する
- review: /review-ticket がレビュー報告をチケットの JSON フィールド（instrumentation, notes）に保存する

詳細は Tickets.json の該当チケットフィールドを参照すること。
-->

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
