---
ticket_id: 93
title: resolve-ticket-context.js の docPath を rfcPath に改名する
slug: resolve-ticket-contextjs-docpath-rfcpath
status: draft
created_at: 2026-07-14
updated_at: 2026-07-14
---
# resolve-ticket-context.js の docPath を rfcPath に改名する

## Summary

resolve-ticket-context.js の出力フィールド名を docPath/docPathSource から rfcPath/rfcPathSource に改名する。併せて内部関数名 resolveDocPath() を resolveRfcPaths() に、make-ticket.md の出力テーブル表記も docPath/$DOC_PATH から rfcPath/$RFC_PATH に変更する。動作ロジックは一切変えず、命名の一貫性のみを修正する。

## Background

Tickets.json metadata に新設される resolvedPaths のフィールド名は rfcPath/graphPath/dirsTreePath である。しかし resolve-ticket-context.js の出力は docPath という異なる命名を使っており、一貫性を欠いている。

- resolvedPaths.rfcPath → RFC文書のパス
- resolve-ticket-context.js 出力の docPath → 同じくRFC文書のパス

同一概念に異なる名前が使われていると、spec 読み取り時の混乱や、後続コマンド（make-ticket.md）でのシェル変数名の不一致を生む。改名により naming を統一する。

## Scope

以下の2ファイルを修正する:

1. **`.claude/scripts/tickets/resolve-ticket-context.js`** — 内部の全 docPath/docPathSource を rfcPath/rfcPathSource に改名
   - `resolveDocPath()` → `resolveRfcPaths()`（関数名）
   - 戻り値: `{ docPath, docPathSource, ... }` → `{ rfcPath, rfcPathSource, ... }`
   - 出力JSON: `"docPath"`, `"docPathSource"` → `"rfcPath"`, `"rfcPathSource"`
   - `generateInstruction()` の引数名
   - `derivePaths()` の引数名（docPath → rfcPath）
   - 全コメント・JSDoc のドキュメント文字列
   - 内部ローカル変数 `docExists` → `rfcExists`

2. **`.claude/commands/make-ticket.md`** — 出力テーブルとシェル変数参照の表記を更新
   - Step 1 出力テーブル: `docPath` / `$DOC_PATH` → `rfcPath` / `$RFC_PATH`
   - Step 2d: `$DOC_PATH` → `$RFC_PATH`（dump-ticket-graph-commands の引数）

**改修対象は `tools/conver/.claude/` 配下のみとする。** 単体テスト・結合テストについてはこの限りではない（テストファイルの改修は本チケットのスコープに含まれる）。root `.claude/` や `crates/siprs/.claude/` への展開は別途行う。

### 改名マップ（完全対応表）

| 現在 | 変更後 | 種別 |
|------|--------|------|
| `resolveDocPath()` | `resolveRfcPaths()` | 関数名 |
| `docPath`（戻り値） | `rfcPath` | 変数名 |
| `docPathSource` | `rfcPathSource` | 変数名 |
| `"docPath"`（JSON出力） | `"rfcPath"` | JSONキー |
| `"docPathSource"`（JSON出力） | `"rfcPathSource"` | JSONキー |
| `docExists` | `rfcExists` | ローカル変数 |
| `$DOC_PATH`（make-ticket.md） | `$RFC_PATH` | シェル変数 |

## Non-scope

- resolve-ticket-context.js のロジック変更（動作は既存のまま。改名のみ）
- phasify 側の修正（別チケット PX-55）
- find-omissions の内部改修
- 出力JSONの `graphPath` / `dirsTreePath` の改名（これらは既に resolvedPaths と一貫）

## Investigation

### コード解析の証拠

**resolve-ticket-context.js L162** — 関数定義:
```javascript
function resolveDocPath(rawSource, ticketsDir, resolvedPaths) {
```

**resolve-ticket-context.js L165-169** — 戻り値（resolvedPaths 優先ケース）:
```javascript
return { docPath, graphPath, dirsTreePath, docPathSource: 'resolvedPaths' };
//        ^^^^^^^          ^^^^^^^^^^^^^^
//        ここだけ rfcPath にすべき
//        graphPath, dirsTreePath は resolvedPaths と一致しているため改名不要
```

**resolve-ticket-context.js L191-194** — metadata.source が .md の場合:
```javascript
return {
    docPath: resolved,    // → rfcPath に改名
    graphPath: ...,       // そのまま（一致）
    dirsTreePath: ...,    // そのまま（一致）
    docPathSource: 'metadata.source.md',  // → rfcPathSource
};
```

**resolve-ticket-context.js L210-213** — metadata.source が .json の場合:
```javascript
return {
    docPath,              // → rfcPath
    graphPath: resolved,  // そのまま
    dirsTreePath: ...,    // そのまま
    docPathSource: 'metadata.source.json',  // → rfcPathSource
};
```

**resolve-ticket-context.js L373-424** — main() での使用:
```javascript
const rawSource = ...;
const { docPath, graphPath, dirsTreePath, docPathSource } = resolveDocPath(...);
//        ^^^^^^^                                          ^^^^^^^^^^^^^^
const docExists = docPath ? fs.existsSync(docPath) : false;
// ...pipelineAvailable で docPath 参照...
// ...available/missing で 'docPath' 参照...
console.log(JSON.stringify({
    success: true,
    ...
    docPath, docPathSource,    // → rfcPath, rfcPathSource
    ...
}));
```

**resolve-ticket-context.js L221-231** — derivePaths（移行期間のヘルパー）:
```javascript
function derivePaths(docPath) {  // → rfcPath
    const dir = path.dirname(docPath);  // 変数名のみ
    const basename = path.basename(docPath, '.md');
    ...
}
```

**make-ticket.md L61-71** — 出力テーブル:
```
| docPath | $DOC_PATH | 設計書（RFC）のファイルパス |
```

**make-ticket.md L98-104** — Step 2d のシェル:
```bash
node .claude/scripts/rfc-graph/dump-ticket-graph-commands.js \
  --tickets=Tickets.json --graph=$GRAPH_PATH --source=$DOC_PATH
```

### テストファイル

`tools/conver/tests/resolve-ticket-context.test.cjs` が存在する。このテスト内で `resolveDocPath` を参照していればテストも修正が必要。

## Test Plan

### ユニットテスト計画

1. **resolve-ticket-context.test.cjs** の全テストが改名後も通過すること
   - テストから `resolveDocPath` を呼んでいる箇所 → `resolveRfcPaths` に変更
   - テストが期待する出力JSONのキー `docPath` → `rfcPath` に変更
   - `docPathSource` → `rfcPathSource` に変更

2. **動作不変性の検証**: 改名のみのため、同一入力に対する出力値（キー名以外）が変わらないことを確認

### ユニットテスト不可能な項目（例外）

なし（全テストがユニットテスト可能）

## Boy Scout Rule — 翻訳可能性計画

1. **resolve-ticket-context.js**: 改名により、関数名 `resolveRfcPaths` が戻り値の `rfcPath` と一貫する。JSDoc の説明も併せて更新。翻訳可能性は向上する（`resolveDocPath` では「何を解決するのか」が不明瞭だったが、`resolveRfcPaths` で「RFCの複数パスを解決する」ことが関数名から読み取れる）
2. **make-ticket.md**: シェル変数名 `$RFC_PATH` は `$DOC_PATH` よりも「何のパスか」が自明

## Acceptance Criteria

- [ ] resolve-ticket-context.js の関数 `resolveDocPath()` が `resolveRfcPaths()` に改名されている
- [ ] 出力JSON のキー名が `docPath` → `rfcPath`、`docPathSource` → `rfcPathSource` に変更されている
- [ ] 内部変数 `docExists` → `rfcExists` に変更されている
- [ ] make-ticket.md の出力テーブルが `rfcPath` / `$RFC_PATH` に更新されている
- [ ] make-ticket.md のシェルコマンド内の `$DOC_PATH` が `$RFC_PATH` に更新されている
- [ ] tools/conver/.claude/ 配下の2ファイルが修正されている（root や crates/siprs への展開は本チケットのスコープ外）
- [ ] 既存テスト（resolve-ticket-context.test.cjs）が全て通過する

## Notes

<!--
注: このコメントは人間向けの説明である。

- plan: /plan-ticket が計画を策定し、チケットの JSON フィールド（scope, testVerification, notes）に保存する
- implementation: /start-ticket が実装サマリーをチケットの JSON フィールド（changes, notes）に保存する
- review: /review-ticket がレビュー報告をチケットの JSON フィールド（instrumentation, notes）に保存する

詳細は Tickets.json の該当チケットフィールドを参照すること。
-->

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
