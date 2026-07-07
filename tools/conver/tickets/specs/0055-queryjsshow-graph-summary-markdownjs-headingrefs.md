---
ticket_id: 55
title: query.js/show-graph-summary-markdown.js headingRefs移行
slug: queryjsshow-graph-summary-markdownjs-headingrefs
status: made
created_at: 2026-07-07
updated_at: 2026-07-07
related_tickets: PX-19 (headingRefsスキーマ変更の完了が前提、spec/0054-line-rangeheadingtrees.md)
ticket_key: PX-20
---

# query.js/show-graph-summary-markdown.js headingRefs移行

**親チケット**: PX-19 (spec/0054-line-rangeheadingtrees.md) — headingRefs スキーマ変更が本チケットの前提

## Summary

作業対象は、/Users/kawata/shyme/zasso/tools/conver/.claude の中だけに限る。PX-19 ~ PX-23 まで全て作業対象は /Users/kawata/shyme/zasso/tools/conver/.claude の中だけである。
query.js の `resolveCurrentLines`（マーカー行番号走査）を `resolveByHeading`（見出し+トークン照合）に置き換える。show-graph-summary-markdown.js の行番号表示を見出し表示に変更する。

## Background

PX-19 で `node.schema.json` の `sourceRanges` → `headingRefs` 変更、`resolve-by-heading.js` の作成は完了したが、`query.js` と `show-graph-summary-markdown.js` は依然として古い `sourceRanges` と `resolveCurrentLines` を参照している。

## Scope

### query.js の変更

- `resolveByHeading` を `require('./resolve-by-heading.js')` で読み込む（実装済み）
- `resolveCurrentLines(sourceText, refId)` を `resolveByHeading` ベースに書き換え
  - シグネチャ: `resolveCurrentLines(sourceText, refId, headingRefs)`
  - headingRefs 配列から該当 refId の heading+texts を取得して resolveByHeading に渡す
- `formatNodeMarkdown`: `sourceRanges` → `headingRefs` に参照変更
- `exports` から `resolveCurrentLines` を削除し `resolveByHeading` を追加

### show-graph-summary-markdown.js の変更

- `resolveCurrentLines` の呼び出しを `resolveByHeading` に変更
- 行番号表示 `[L42-L58]` → 見出し表示 `[h2: 6.1 Crate 責務分割]` に変更
- 行番号を全く使わない表示にする

### 変更ファイル

| ファイル | 種別 | 内容 |
|----------|------|------|
| `query.js` | 変更 | resolveCurrentLines → resolveByHeading |
| `show-graph-summary-markdown.js` | 変更 | 行番号→見出し表示 |

### 非スコープ
- embed-markers.js の削除（PX-21）
- テストファイルの修復（PX-22）
- verify.js の変更（PX-23）

## Acceptance Criteria
- [ ] query.js が `resolveByHeading` を import している
- [ ] `resolveCurrentLines` の旧実装（マーカー走査）が削除されている
- [ ] `formatNodeMarkdown` が headingRefs を参照している
- [ ] show-graph-summary-markdown.js の行番号表示が見出し表示に変わっている
- [ ] 全テストが通過すること
