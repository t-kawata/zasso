---
ticket_id: 56
title: embed-markers.js廃止とgraphify-rfc.md改修
slug: embed-markersjsgraphify-rfcmd
status: made
created_at: 2026-07-07
updated_at: 2026-07-07
related_tickets: PX-19 (spec/0054-line-rangeheadingtrees.md — headingRefs方式への移行が本チケットの前提)
ticket_key: PX-21
---

# embed-markers.js廃止とgraphify-rfc.md改修

## Summary

作業対象は、/Users/kawata/shyme/zasso/tools/conver/.claude の中だけに限る。PX-19 ~ PX-23 まで全て作業対象は /Users/kawata/shyme/zasso/tools/conver/.claude の中だけである。
embed-markers.js を削除し、graphify-rfc.md の Step 構成を headingRefs 方式に合わせて改修する。

## Background

headingRefs 方式ではマーカー埋め込みが不要になる。embed-markers.js を廃止し、graphify-rfc.md の Step 4（マーカー埋め込み）を削除、Step 0（見出し重複排除）を追加する。

## Scope

### embed-markers.js の廃止
- `embed-markers.js` を削除
- `embed-markers.test.cjs` を削除
- `acceptance-criteria.test.cjs` の AC2/AC4 を削除

### graphify-rfc.md の改修
- Step 0: `deduplicate-headings.js "$1"` を追加
- Step 4: 「廃止されました」と明記して削除
- 完了報告: REF 数参照を削除
- 使用スクリプト一覧: embed-markers.js → deduplicate-headings.js + resolve-by-heading.js

### 変更ファイル
| ファイル | 種別 |
|----------|------|
| `embed-markers.js` | 削除 |
| `embed-markers.test.cjs` | 削除 |
| `graphify-rfc.md` | 変更 |

## Acceptance Criteria
- [ ] embed-markers.js が削除されている
- [ ] graphify-rfc.md に Step 0 が追加されている
- [ ] Step 4 が「廃止」と明記されている
- [ ] 使用スクリプト一覧が最新構成と一致している
