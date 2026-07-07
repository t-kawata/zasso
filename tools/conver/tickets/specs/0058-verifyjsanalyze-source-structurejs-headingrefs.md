---
ticket_id: 58
title: verify.js/analyze-source-structure.js headingRefs対応
slug: verifyjsanalyze-source-structurejs-headingrefs
status: made
created_at: 2026-07-07
updated_at: 2026-07-07
related_tickets: PX-19 (spec/0054-line-rangeheadingtrees.md — headingRefsスキーマ変更の完了が前提)
ticket_key: PX-23
---

# verify.js/analyze-source-structure.js headingRefs対応

## Summary

作業対象は、/Users/kawata/shyme/zasso/tools/conver/.claude の中だけに限る。PX-19 ~ PX-23 まで全て作業対象は /Users/kawata/shyme/zasso/tools/conver/.claude の中だけである。
verify.js の checkCoverage と analyze-source-structure.js を headingRefs 方式に対応させる。

## Background

verify.js は未カバー行の検出に sourceRanges（行番号範囲）を使っている。headingRefs 方式では「行番号カバレッジ」ではなく「全見出しセクションが少なくとも1つのノードから参照されているか」の検証に変わる。analyze-source-structure.js はセクションツリーは正しく抽出するが、kind 推定ロジックがまだ sourceRanges を参照している。

## Scope

### verify.js の変更
- `checkCoverage` のロジックを行番号ベースから headingRefs ベースに変更
  - 各行が sourceRanges に含まれているか → 各大見出し（`^## `）が headingRefs に出現するか
  - 未カバー行 → 未カバー見出し行として報告
- `checkIsolated` は変更なし（ヘッジの有無は kind や headingRefs に依存しない）
- JSDoc とエラーメッセージを更新

### analyze-source-structure.js の変更
- 出力レポートの「セクション一覧」に heading レベルと texts（トークン列）を追記
- `headingRefs` の機械的抽出を追加（どのセクションにどの tokens が割り当てられるかの候補表示）
- レポートに「候補 headingRefs」セクションを追加

### 変更ファイル
| ファイル | 種別 |
|----------|------|
| `verify.js` | 変更 |
| `analyze-source-structure.js` | 変更 |

### 非スコープ
- テストファイルの修復（PX-22 で対応）
- query.js / show-graph-summary-markdown.js の変更（PX-20）

## Acceptance Criteria
- [ ] verify.js の checkCoverage が見出しベースで動作する
- [ ] 未カバー見出しがある場合に正しく報告する
- [ ] analyze-source-structure.js の出力に headingRefs 候補セクションが含まれている
- [ ] 既存の verify.test.cjs が更新後も通過する
