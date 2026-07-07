---
ticket_id: 57
title: headingRefs移行に伴うテストファイル改修
slug: headingrefs
status: made
created_at: 2026-07-07
updated_at: 2026-07-07
related_tickets: PX-19 (spec/0054-line-rangeheadingtrees.md — headingRefsスキーマ変更に伴うテスト修復)
ticket_key: PX-22
---

# headingRefs移行に伴うテストファイル改修

## Summary

作業対象は、/Users/kawata/shyme/zasso/tools/conver/.claude の中だけに限る。PX-19 ~ PX-23 まで全て作業対象は /Users/kawata/shyme/zasso/tools/conver/.claude の中だけである。
PX-19 実施中に `sed` で一括置換したテストファイルのJSON構造崩れを修復し、新しいスクリプトのテストを追加する。

## Background

PX-19 でテストファイルの `sourceRanges` を `headingRefs` に `sed` 置換した際、startLine/endLine → heading/texts の変換が不適切でJSON構造が壊れている。また deduplicate-headings.js と resolve-by-heading.js のテストファイルが未作成。

## Scope

### 既存テスト修復（sed 被害）
以下のテストファイルの headingRefs 形式のJSONデータを正しい構造に書き直す：

- `crud.test.cjs` — createTestNode の headingRefs データ
- `query.test.cjs` — SAMPLE_GRAPH の headingRefs データ
- `show-graph-summary-markdown.test.cjs` — SAMPLE_GRAPH の headingRefs データ
- `verify.test.cjs` — createTestNode の headingRefs データ
- `dump-ticket-graph-commands.test.cjs` — TEST_GRAPH の headingRefs データ
- `load-rfc-graph.test.cjs` — 各グラフデータの headingRefs データ
- `acceptance-criteria.test.cjs` — テストデータ

### 新規テスト作成
- `deduplicate-headings.test.cjs` — 重複検出・A-Z追記・27件超過のテスト
- `resolve-by-heading.test.cjs` — 4段階フォールバックの各ケーステスト

### 変更ファイル
| ファイル | 種別 |
|----------|------|
| 既存テスト7ファイル | 修正 |
| `deduplicate-headings.test.cjs` | 新規 |
| `resolve-by-heading.test.cjs` | 新規 |

## Acceptance Criteria
- [ ] 全テストファイルが正しい JSON 形式になっている
- [ ] `deduplicate-headings.test.cjs` が全ケースをカバーしている
- [ ] `resolve-by-heading.test.cjs` が4段階フォールバックをカバーしている
- [ ] `node --test tests/rfc-graph/` が全テスト通過すること
