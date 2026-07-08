---
ticket_id: 72
title: query.js 改修 — headingRefs警告削除・エッジ重複除去バグ修正・関係一覧フォーマット改善
slug: queryjs-headingrefs
status: draft
created_at: 2026-07-08
updated_at: 2026-07-08
---
# query.js 改修 — headingRefs警告削除・エッジ重複除去バグ修正・関係一覧フォーマット改善

## Summary

query.js から headingRefs 解決不能に関する WARN 出力を削除する。同時に、エッジ一覧に多数の重複が出力されるバグ（#L248-251, edgeSet がオブジェクト参照比較をしているため同一内容のエッジを重複除去できない）を修正し、関係一覧の各行で種別・強度が重複出力される無駄を解消する。

## Background

**背景1: headingRefs 警告の削除**

query.js は現在、headingRefs 解決不能時に `[WARN]` を stderr に出力するが、これは test-query-all.js（PX-32）が全 headingRefs の解決可能性を exit code で保証するようになるため不要となる。むしろ、query.js が WARN を出すと「無視してよい警告」という誤った印象を AI に与え、本来止まるべき場面で次工程に進んでしまう原因となる。query.js は純粋なグラフ探索・整形スクリプトとしての責務に専念させる。

**背景2: エッジ重複除去バグ**

2026-07-08 の実際の出力で以下の重複が確認された:
```
- part_of ← N0119 (§43 M20追補: 新機能のテスト層マッピング) [hard]
- part_of ← N0119 (§43 M20追補: 新機能のテスト層マッピング) [hard]
- part_of ← N0119 (§43 M20追補: 新機能のテスト層マッピング) [hard]
```
同一のエッジが3回出力されている。原因は `multiHopBFS()`（#L248-251）の `edgeSet` が `new Set()` でエッジオブジェクトの参照比較をしていること。JSON パース後は同一内容でも別オブジェクトとなるため、重複とみなせない。

```javascript
// 現状（バグあり）
const edgeSet = new Set();
...
if (!edgeSet.has(edge)) {  // オブジェクト参照比較 → 常に別オブジェクト
  edgeSet.add(edge);
  resultEdges.push(edge);
}
```

**背景3: 関係一覧フォーマットの冗長性**

現在の出力形式:
```
### 関係 (refines / soft)
- refines ← N0001 (§1 目的) [soft]
- refines ← N0001 (§1 目的) [soft]
```
グループ見出しに「refines / soft」と表示しているにもかかわらず、各行でも「refines」「soft」を繰り返している。情報が二重に出力されており可読性を損なっている。

## Scope

1. **headingRefs 警告の全削除**（query.js #L522-581 の該当部分）:
   - `hasHeadingRefWarning` フラグの削除
   - headingRefs 解決チェックループ（#L546-560）の削除
   - 最終 WARN 出力（#L576-581）の削除
   - ただし `resolveCurrentLines()` 関数自体は `formatNodeMarkdown()` が表示用に使うため維持
   - ヘルプテキストの修正: 「正常終了（マーカー欠損時も0、警告はstderr）」→「正常終了」

2. **エッジ重複除去バグの修正**（query.js #L248-251）:
   - `const edgeSet = new Set();` → `const edgeKeys = new Set();`
   - キー生成: `` const key = `${edge.from}:${edge.to}:${edge.type}`; ``
   - 重複判定: `if (!edgeKeys.has(key)) { edgeKeys.add(key); resultEdges.push(edge); }`
   - エッジ数が多い場合を考慮し、from/to/type の3属性でユニーク判定する（bidirectional 属性は type 内包）
   - direction（from→to）を考慮しない: 無向グラフとしての重複除去であるため、同一エッジの逆向きは別エッジとして扱う（有向エッジが正しい）

3. **関係一覧フォーマットの改善**（query.js #L343-366）:
   - グループ見出し: `### 関係 (refines / soft)` は維持
   - 各行: `- refines ← N0001 (§1 目的) [soft]` → `- ← N0001 (§1 目的)` に短縮
   - 種別と強度はグループ見出しから自明のため各行では省略
   - 方向 (`→`/`←`/`↔`) は維持（どの向きの関係かはグループ見出しから自明でないため）
   - `getDirectionLabel()` 関数は維持（__future__ で bidirectional 対応するため）
   - `formatNodeMarkdown()` のグループ化ループ内部の行フォーマットのみ変更

## Non-scope

- headingRefs 解決不能時の exit code 変更は行わない（exit 0 維持。検証は test-query-all.js が担当）
- `resolveByHeading()` / `resolveCurrentLines()` 自体のロジック変更は行わない
- エッジ型や強度の属性変更は行わない
- graphify-rfc.md の記述変更は含まない（別チケット PX-34）
- `formatNodeMarkdown()` の大幅な再設計は行わない（ミニマルな変更に留める）

## Investigation

**証拠1: headingRefs 警告コードの該当範囲**

`query.js` #L522-581:
```javascript
// headingRefs 欠損の追跡
let hasHeadingRefWarning = false;

// 各ノードIDに対して...
for (const nodeId of nodeIds) {
  // ...
  // 6. 行位置を動的に解決し、欠損時に警告を出力する（#L546-560）
  for (const vNode of visitedNodes) {
    if (!Array.isArray(vNode.headingRefs)) continue;
    for (const hr of vNode.headingRefs) {
      const resolved = resolveCurrentLines(sourceText, vNode.headingRefs, hr.refId);
      if (!resolved) {
        process.stderr.write(`[WARN] ...`);
        hasHeadingRefWarning = true;
      }
    }
  }
}

// headingRefs 欠損があっても終了コード0（#L576-581）
if (hasHeadingRefWarning) {
  process.stderr.write(`[WARN] ...`);
}
process.exit(EXIT_SUCCESS);
```

**証拠2: エッジ重複除去バグの該当箇所**

`query.js` #L229-261:
```javascript
function multiHopBFS(graph, startNodeId, hops) {
  const visited = new Map([[startNodeId, 0]]);
  const queue = [startNodeId];
  const resultEdges = [];
  const edgeSet = new Set();  // ← 参照比較の Set

  while (queue.length) {
    const current = queue.shift();
    // ...
    for (const edge of graph.edges) {
      // ...
      if (!edgeSet.has(edge)) {  // ← JSONパース後は常に別オブジェクト
        edgeSet.add(edge);
        resultEdges.push(edge);
      }
    }
  }
}
```

**証拠3: 実際の重複出力（2026-07-08 観測）**

`query.js --id=N0113 --hops=2` の出力より:
```
- part_of ← N0119 (§43 M20追補: 新機能のテスト層マッピング) [hard]
- part_of ← N0119 (§43 M20追補: 新機能のテスト層マッピング) [hard]
- part_of ← N0119 (§43 M20追補: 新機能のテスト層マッピング) [hard]
```

**証拠4: フォーマット重複の該当箇所**

`query.js` #L356-363:
```javascript
for (const edge of typeEdges) {
  // ...
  lines.push(`- ${type} ${direction} ${targetNode ? targetNode.id : 'N/A'} (${targetTitle}) [${strength}]`);
}
```
→ `${type}` と `[${strength}]` がグループ見出し（`### 関係 (${type} / ${strength})`）と重複。

## Test Plan

### ユニットテスト計画

1. **エッジ重複除去のテスト**:
   - 同一エッジ（from/to/type が同一）が複数回出力されないこと
   - 異なる type のエッジは別エントリとして出力されること
   - from→to と to→from は別エッジとして扱われること（有向グラフ）
   - グラフに同一エッジが1本だけの場合も正しく出力されること
   - 空の edges 配列 → 空の結果
   - テスト用グラフJSONを手作りして `multiHopBFS()` に直接入力

2. **関係一覧フォーマットのテスト**:
   - グループ見出しには種別と強度が含まれること
   - 各行には方向ラベルのみが含まれ、種別と強度が省略されていること
   - bidirectional エッジが `↔` で表示されること
   - エッジ0本 → 「関係 (なし)」が表示されること

3. **headingRefs 警告削除のテスト**:
   - 警告フラグ `hasHeadingRefWarning` がコードから完全に除去されていること
   - headingRefs 解決不能でも stderr に `[WARN]` が出力されないこと
   - `resolveCurrentLines()` 関数は維持されていること（`formatNodeMarkdown()` の表示用）

### ユニットテスト不可能な項目（例外）

- query.js 全体の E2E テスト（複数ノードの BFS + 整形）は手動確認
- graphify-rfc Step 4 での動作確認は PX-34 完了後

## Boy Scout Rule — 翻訳可能性計画

- `multiHopBFS()` 内の `edgeSet` → `edgeKeys` の変数名変更に伴い、関連コメントも更新する（嘘のコメントを放置しない）
- フォーマット改善後、`formatNodeMarkdown()` 内の各行フォーマットがグループ見出しと重複しないことを確認するコメントを追記する
- 既存の定数定義（`EXIT_SUCCESS` 等）は改修の妨げにならないため現状維持

## Acceptance Criteria

- [ ] query.js が headingRefs 解決不能時に stderr に `[WARN]` を出力しなくなる
- [ ] `hasHeadingRefWarning` 変数と関連コードが完全に削除されている
- [ ] `resolveCurrentLines()` 関数は維持され、formatNodeMarkdown の表示に使われている
- [ ] エッジ一覧に重複が出力されない（同一 from/to/type は1行のみ）
- [ ] 関係一覧フォーマットが改善され、グループ見出しと各行の情報が重複しない
- [ ] 既存の出力内容（ノード情報・関係一覧）が構造的に維持されている
- [ ] 全てのテストが通過している

## Notes

- 依存関係: PX-32（test-query-all.js）とは独立して並行作業可能
- 本チケット完了後、PX-34 で graphify-rfc.md の Step 4 を本改修に対応させる
- cleanup に `_fix_graph_hints.json` を追加するのは PX-34
