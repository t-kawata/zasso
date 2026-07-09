---
ticket_id: 13
title: headingRefs 複数セクショントークン混入の修正
slug: headingrefs
status: made
created_at: 2026-07-09
updated_at: 2026-07-09
---
# headingRefs 複数セクショントークン混入の修正

## Summary

RFC-ROOT-GRAPH.json 内の 2 件のノード（N0033, N0100）が持つ headingRef に、本来別々の headingRef に分割すべき異なるセクションのトークンが混入している。これを修正し、各 headingRef が正しく1つのセクションのみを指すようにする。

## Background

`test-query-all.js` による全 headingRefs 一括解決検証で、170件中168件は正常に解決されていた。しかし追加検証により以下の2件で `resolveByHeading` が "exact" を返すものの、`texts` 配列内の一部トークンが解決行に存在しないことが判明した。

これは `resolveByHeading` のアルゴリズムが第1フェーズ（最初の1トークンのみで検索）で一意の行を見つけた場合に "exact" を返すため、2つ以上のトークンのうち最初のトークンだけがマッチすれば通過してしまうからである。根本原因は headingRef の `texts` 配列に2セクション分のトークンが混入しているデータ不備にある。

これらの問題は `query.js` や `test-query-all.js` のバグではなく、グラフJSONのデータ品質の問題である。

## Scope

1. **N0033/REF034** の headingRef を2件に分割する
2. **N0100/REF102** の headingRef を2件に分割する
3. 分割後、`test-query-all.js` で全トークン一致を確認する

## Non-scope

- `resolveByHeading` のアルゴリズム変更（現状の段階的フォールバックは設計意図通り）
- `test-query-all.js` の改修（全トークン一致チェックは将来の改善として別チケット化可能）
- 他の headingRefs の精査（全170件中この2件のみの問題であり、残り168件は正常）

## Investigation

### 証拠1: N0033/REF034

```json
{
  "nodeId": "N0033",
  "nodeTitle": "§15.2 SipEvent — 全イベント種別のenum定義",
  "headingRefs": [
    {
      "heading": 3,
      "texts": ["15.2 SipEvent", "15.3 EventMeta"],
      "refId": "REF034"
    }
  ]
}
```

`texts` に `"15.2 SipEvent"` と `"15.3 EventMeta"` の2トークンが含まれている。`### 15.2 SipEvent`（L761）は `"15.2 SipEvent"` のみを含む。`"15.3 EventMeta"` は別セクション（L784: `### 15.3 EventMeta — ユーザー公開イベント種別`）のトークンである。

- 解決行: L761 `### 15.2 SipEvent`
- 不足トークン: `"15.3 EventMeta"`（別セクション）

### 証拠2: N0100/REF102

```json
{
  "nodeId": "N0100",
  "nodeTitle": "§34 観測性 — tracing・metrics・ClientCapabilities",
  "headingRefs": [
    { "heading": 2, "texts": ["34. 観測性"], "refId": "REF101" },
    {
      "heading": 3,
      "texts": ["34.1 tracing", "34.2 metrics"],
      "refId": "REF102"
    }
  ]
}
```

REF102 の `texts` に `"34.1 tracing"` と `"34.2 metrics"` の2トークンが含まれている。`### 34.1 tracing`（L2336）は `"34.1 tracing"` のみを含む。`"34.2 metrics"` は別セクション（L2351: `### 34.2 metrics — tokio-metrics連携`）のトークンである。

- 解決行: L2336 `### 34.1 tracing`
- 不足トークン: `"34.2 metrics"`（別セクション）

### 判定

両件とも、**1つの headingRef に2つの異なるセクションのトークンが混入**している。これはグラフ生成時のミスである。以下の修正が必要：

- N0033: REF034 を2つの headingRef に分割（REF034→ `"15.2 SipEvent"`, 新規REF → `"15.3 EventMeta"`）
- N0100: REF102 を2つの headingRef に分割（REF102→ `"34.1 tracing"`, 新規REF → `"34.2 metrics"`）

### 再現手順

```bash
cd /Users/kawata/shyme/zasso
node -e "
const { resolveByHeading } = require('./.claude/scripts/rfc-graph/resolve-by-heading.js');
const g = require('fs').readFileSync('crates/siprs/RFC-ROOT-GRAPH.json','utf8');
const src = require('fs').readFileSync('crates/siprs/RFC-ROOT.md','utf8').split('\n');
for (const node of JSON.parse(g).nodes) {
  if (!Array.isArray(node.headingRefs)) continue;
  for (const ref of node.headingRefs) {
    const r = resolveByHeading(src, ref.heading, ref.texts);
    if (r && ref.texts.length > 1) {
      const line = src[r.line - 1];
      if (!ref.texts.every(t => line.includes(t)))
        console.log(node.id + '/' + ref.refId + ': texts=' + JSON.stringify(ref.texts) + ' matched=' + ref.texts.filter(t => line.includes(t)));
    }
  }
}
"
```

## Test Plan

### ユニットテスト計画

本チケットはグラフJSONのデータ修正であるため、新規のユニットテストは不要。以下の検証で十分：

1. `test-query-all.js` を実行し、全 headingRefs が解決可能であることを確認
2. 追加スクリプトで全 headingRef の全トークンが解決行に含まれていることを確認
3. 分割後の REF ID が重複していないことを確認

### ユニットテスト不可能な項目（例外）

ユニットテストは不要（データ修正のため）。手動検証で代替する。

## Boy Scout Rule — 翻訳可能性計画

本チケットで触るのはグラフJSONのデータのみであり、コードの修正は発生しない。したがって翻訳可能性の改善対象はない。

## Acceptance Criteria

- [ ] N0033/REF034 の `texts` が `["15.2 SipEvent"]` に修正され、解決行 L761 の全トークンが一致する
- [ ] N0033 に新規 headingRef（refId: 新規採番、heading: 3, texts: `["15.3 EventMeta"]`）が追加される
- [ ] N0100/REF102 の `texts` が `["34.1 tracing"]` に修正され、解決行 L2336 の全トークンが一致する
- [ ] N0100 に新規 headingRef（refId: 新規採番、heading: 3, texts: `["34.2 metrics"]`）が追加される
- [ ] `test-query-all.js` が exit 0 で完了する
- [ ] 追加検証スクリプトで全 headingRef の全トークン一致が確認できる
- [ ] 分割後の全 refId がユニークである

## Notes

- 修正対象ファイル: `crates/siprs/RFC-ROOT-GRAPH.json`
- 修正後は `test-query-all.js --graph=crates/siprs/RFC-ROOT-GRAPH.json --source=crates/siprs/RFC-ROOT.md` で検証
- 新規 refId は既存 REF の最大値 +1 から採番する（現状最大: REF170 → REF171, REF172）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
