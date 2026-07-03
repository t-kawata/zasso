---
ticket_id: 46
title: Anchor Marker コメントアウトラップ除去
slug: anchor-marker
status: draft
created_at: 2026-07-03
updated_at: 2026-07-03
---
# Anchor Marker コメントアウトラップ除去

## Summary

Anchor Marker の書式を `<!-- [::REF-POINTER-BEGIN-01-001::] -->` から
`[::REF-POINTER-BEGIN-01-001::]` に変更する。`<!-- -->` の HTML コメントラップを
除去することで、`strip-rfc-comments.js` による誤削除リスクを完全に排除する。

## Background

現在の Anchor Marker は以下のように HTML コメントでラップされている：

```
<!-- [::REF-POINTER-BEGIN-01-001::] -->
pub struct SipClient;
<!-- [::REF-POINTER-END-01-001::] -->
```

この形式には以下の問題がある：

1. **削除事故リスク**: `strip-rfc-comments.js` は保護パターンで REF-POINTER を
   保持しようとするが、マーカー自体が HTML コメントであるため、正規表現のズレや
   エッジケースで誤削除される可能性がある。
2. **本質的でない**: `[::REF-POINTER-BEGIN-01-001::]` はそれ自体が十分に特徴的であり、
   Markdown レンダリングを壊さない。`<!-- -->` で囲む必要はない。
3. **冗長性**: マーカーの可読性を損なう。

## Scope

改修対象は `~/shyme/zasso/tools/conver/.claude` 配下のみ。

マーカー書式を以下に統一する：

```
旧: <!-- [::REF-POINTER-BEGIN-01-001::] -->
新: [::REF-POINTER-BEGIN-01-001::]

旧: <!-- [::REF-POINTER-END-01-001::] -->
新: [::REF-POINTER-END-01-001::]
```

### 修正ファイル一覧（全9ファイル、漏れ禁止）

#### A. generate-child-rfcs.js（3箇所）

| # | 行 | 現在 | 修正後 |
|---|-----|------|--------|
| A1 | 256 | `var beginLine = "\<\!-- [::" + REF_POINTER_BEGIN + "-" + ins.id + "::] -->";` | `var beginLine = "[::" + REF_POINTER_BEGIN + "-" + ins.id + "::]";` |
| A2 | 257 | `var endLine = "\<\!-- [::" + REF_POINTER_END + "-" + ins.id + "::] -->";` | `var endLine = "[::" + REF_POINTER_END + "-" + ins.id + "::]";` |
| A3 | 517-518 | `beginTag = "\<\!-- [::" + REF_POINTER_BEGIN + ...` / `endTag = ...` | `beginTag = "[::" + REF_POINTER_BEGIN + ...` / `endTag = ...` |
| A4 | 325 | `"  \<\!-- [::REF-POINTER-BEGIN-{childId}-{seq}::] -->",` | `"  [::REF-POINTER-BEGIN-{childId}-{seq}::]",` |

#### B. validate-ref-pointer.js（2箇所）

| # | 行 | 現在 | 修正後 |
|---|-----|------|--------|
| B1 | 22 | `/<!--\s*\[::(REF-POINTER-(BEGIN\|END)-(\d{2}-\d{3}))::\]\s*-->/g` | `/\[::(REF-POINTER-(BEGIN\|END)-(\d{2}-\d{3}))::\]/g` |
| B2 | 111 | 同上（regex リセット） | 同上 |

#### C. strip-rfc-comments.js（1箇所）

| # | 行 | 現在 | 修正後 |
|---|-----|------|--------|
| C1 | 6 | コメント内のドキュメンテーション | REF-POINTER 行を削除（マーカーがコメントではなくなるため保護不要） |
| C2 | 27-29 | `PROTECTED_PATTERNS` に `REF-POINTER` あり | `REF-POINTER` パターンを削除（マーカーがコメントではなくなるため保護不要） |

#### D. split-rfc-to-children.md（1箇所）

| # | 行 | 現在 | 修正後 |
|---|-----|------|--------|
| D1 | 450 | `` lineStart/lineEnd から `` `[::REF-POINTER-BEGIN/END-*::]` `` マーカー `` | 変更なし（この行は説明文であり `<!-- -->` を含まない） |
| D2 | 548 | `Anchor Marker（\`REF-POINTER-BEGIN/END\`）` | 変更なし |

（説明文は既にコメントラップなしの書式を参照している）

#### E. Test fixtures（5ファイル）

| # | ファイル | 行 | 現在 | 修正後 |
|---|---------|-----|------|--------|
| E1 | fixture-1-canon.md | 3,5 | `<!-- [::REF-POINTER-BEGIN/END-01-001::] -->` | `[::REF-POINTER-BEGIN/END-01-001::]` |
| E2 | fixture-2-canon.md | 3,5 | 同上 | 同上 |
| E3 | fixture-3-canon.md | 3,5 | 同上 | 同上 |
| E4 | fixture-4-canon.md | 2 | `<!-- [::REF-POINTER-BEGIN-01-001::] -->` | `[::REF-POINTER-BEGIN-01-001::]` |
| E5 | fixture-5-canon.md | 2,3 | `<!-- [::REF-POINTER-BEGIN...END...] -->`（2箇所） | コメントラップ除去 |

## Non-scope

- `[::REF-POINTER-*::]` マーカーの意味論・ID体系の変更は含まない
- `split-rfc-to-children.md` の完了ガード（grep）は REF-POINTER-BEGIN という文字列を
  検索しており、コメントラップ有無に影響されないため修正不要
- 既存の正典RFCに埋め込まれたマーカーの一括変換は含まない（次回 generate-child-rfcs.js
  実行時から新書式で挿入される）

## Investigation

### 証拠: 全修正対象の現状コード

**generate-child-rfcs.js:256-257**（フェーズ1 マーカー挿入）
```javascript
var beginLine = "<!-- [::" + REF_POINTER_BEGIN + "-" + ins.id + "::] -->";
var endLine = "<!-- [::" + REF_POINTER_END + "-" + ins.id + "::] -->";
```

**generate-child-rfcs.js:325**（注釈ブロックの例示）
```javascript
"  <!-- [::REF-POINTER-BEGIN-{childId}-{seq}::] -->",
```

**generate-child-rfcs.js:517-518**（フェーズ2 抽出タグ）
```javascript
var beginTag = "<!-- [::" + REF_POINTER_BEGIN + "-" + markerId + "::] -->";
var endTag = "<!-- [::" + REF_POINTER_END + "-" + markerId + "::] -->";
```

**validate-ref-pointer.js:22**（マーカー検出正規表現）
```javascript
var MARKER_RE = /<!--\s*\[::(REF-POINTER-(BEGIN|END)-(\d{2}-\d{3}))::\]\s*-->/g;
```

**strip-rfc-comments.js:27-29**（保護パターン）
```javascript
var PROTECTED_PATTERNS = [
  /REF-POINTER-(BEGIN|END)-\d{2}-\d{3}/,  // ← 削除対象
  ...
];
```

## Test Plan

### ユニットテスト計画

| # | テスト | 対象 | 内容 |
|---|-------|------|------|
| A1 | generate-child-rfcs.js phase1 マーカー書式 | generate-child-rfcs.js | 挿入されるマーカーに `<!-- -->` が含まれない |
| A2 | generate-child-rfcs.js phase2 抽出タグ | generate-child-rfcs.js | 検索タグに `<!-- -->` が含まれない |
| B1 | validate-ref-pointer.js マーカー検出（旧書式） | validate-ref-pointer.js | `<!-- [::...::] -->` を検出しない（互換性） |
| B2 | validate-ref-pointer.js マーカー検出（新書式） | validate-ref-pointer.js | `[::...::]` を検出する |
| B3 | validate-ref-pointer.js fixture-1 正常系 | validate-ref-pointer.js | 新書式の fixture で正常動作 |
| B4 | validate-ref-pointer.js fixture-2 孤児マーカー | validate-ref-pointer.js | 新書式の fixture で孤児検出 |
| B5 | validate-ref-pointer.js fixture-4 ペア不整合 | validate-ref-pointer.js | 新書式の fixture で不整合検出 |
| B6 | validate-ref-pointer.js fixture-5 重複ID | validate-ref-pointer.js | 新書式の fixture で重複検出 |
| C1 | strip-rfc-comments.js REF-POINTER 削除確認 | strip-rfc-comments.js | コメントでない REF-POINTER が維持される |
| E1 | fixture 全更新確認 | test.sh | 全AM1〜AM13 テスト通過 |

### ユニットテスト不可能な項目（例外）

- 該当なし

## Boy Scout Rule — 翻訳可能性計画

- `generate-child-rfcs.js` のマーカー文字列構築部分で、`"<!-- [::" + ...` の冗長な
  ラップを削除し、`"[::" + ...` に簡略化。コードの意図がより明確になる。

## Acceptance Criteria

- [ ] `generate-child-rfcs.js` が生成する全 Anchor Marker に `<!-- -->` が含まれていない
- [ ] `validate-ref-pointer.js` が新書式 `[::REF-POINTER-BEGIN/END-*::]` を正しく検出する
- [ ] `strip-rfc-comments.js` の保護パターンから `REF-POINTER` が除去されている
- [ ] テストフィクスチャ（5ファイル）の全マーカーが新書式に更新されている
- [ ] AM1〜AM13 の全テストが通過する
- [ ] `node --check` 構文チェック OK

## Notes

- 改修対象は `~/shyme/zasso/tools/conver/.claude` 配下のみ
- 依存関係: PX-1..PX-6 全て reviewed（完了）。PX-7 に先行未完了チケットなし
- 正典RFCに既に埋め込まれた旧書式マーカーは影響を受けない（generate-child-rfcs.js
  のフェーズ1が新書式で挿入するようになるのみ）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。
