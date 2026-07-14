---
ticket_id: 41
title: I/O境界情報抽出スクリプト＋3コマンド修正＋test.sh拡張
slug: io3testsh
status: draft
created_at: 2026-07-03
updated_at: 2026-07-03
---

# I/O境界情報抽出スクリプト＋3コマンド修正＋test.sh拡張

## Summary

1. I/O 境界参考情報セクションを RFC から機械的に抽出するスクリプト `extract-io-boundary.js` を作成する。
2. `insert-io-boundary-template.js` のテンプレート冒頭文を修正し、`/formulate-tickets` および `/formulate-tickets-for-next` にも役立つことを明記する。
3. 3 つのコマンド定義ファイル（`split-rfc-to-children.md`, `formulate-tickets.md`, `formulate-tickets-for-next.md`）のステップの早い段階に、抽出スクリプトで I/O 境界情報を参照するステップを追加挿入する。ステップ番号は整数を維持するように調整する。
4. `~/shyme/zasso/tools/conver/test.sh` に I/O 境界関連スクリプト（insert, check, extract）の統合テストを追加する。
5. RFC-ROOT.md Sec 61 の内容を上記と矛盾しないように修正する。

## Background

PX-1 で `insert-io-boundary-template.js` と `check-io-stubs.js` を作成し、4 つの grill 系コマンドに STEP 7a を追加した。しかし以下の課題が残っている：

1. **テンプレートの目的が狭い**: 現在のテンプレート冒頭は `/split-rfc-to-children` のみを対象としているが、`/formulate-tickets` や `/formulate-tickets-for-next` も I/O 境界情報を活用できる。
2. **I/O 境界情報を抽出する手段がない**: 他のコマンドが RFC 内の I/O 境界情報だけを参照したい場合、現在は RFC 全体を読むしかない。機械抽出するスクリプトが必要。
3. **3 つのコマンドに参照ステップがない**: `split-rfc-to-children.md`, `formulate-tickets.md`, `formulate-tickets-for-next.md` の 3 ファイルには I/O 境界情報を参照するステップが存在しない。
4. **統合テストが不足**: `test.sh` に I/O 境界関連スクリプトのテストが追加されていない。
5. **RFC-ROOT.md の Sec 61 が未更新**: テンプレート修正後に RFC-ROOT.md の Sec 61 も追記修正が必要。

## Scope

### 1. extract-io-boundary.js の新規作成

`~/shyme/shyme/zasso/tools/conver/.claude/scripts/grill-me-for-rfc/` 内に新規スクリプト。

- **引数**: RFC ファイルパス
- **動作**: RFC ファイルを読み込み、I/O 境界参考情報セクションを抽出して stdout に出力する
- **マッチング方式**:
  - セクションタイトルは `split-rfc-to-children のための参考情報` という文字列を含む `##` 見出しで検出
  - 検出したら、その行から次の `## `（同レベル以降の見出し）までを抽出
  - 抽出できなかった場合は空出力 + exit 0（エラーではない。情報がないだけ）
- **出力**: I/O 境界参考情報セクションの全文（サブセクション含む）。stdout にそのまま出力する。
- **使用例**: `node .claude/scripts/grill-me-for-rfc/extract-io-boundary.js path/to/RFC.md`

### 2. insert-io-boundary-template.js の修正

現在のテンプレート冒頭文:
```
本セクションは、後日 `/split-rfc-to-children` を実行する際に安全な I/O 境界を見つけるための手がかりとして...
```

修正後:
```
本セクションは、後日 `/split-rfc-to-children`（RFC分割）、`/formulate-tickets`（チケット策定）、`/formulate-tickets-for-next`（次フェーズチケット策定）を実行する際に、安全な I/O 境界や実装スコープの判断材料を得るための手がかりとして、RFC 設計書自体が自然な切断面を参考情報として示すものである。
```

### 3. 3つのコマンド定義ファイルの修正

以下の 3 ファイルに、I/O 境界情報を参照するステップを追加する。各ファイルの「早い段階」（最初のステップの直後または調査ステップ）に新ステップを挿入し、後続のステップ番号をずらして整数を維持する。

1. `~/shyme/shyme/zasso/tools/conver/.claude/commands/split-rfc-to-children.md`
2. `~/shyme/shyme/zasso/tools/conver/.claude/commands/formulate-tickets.md`
3. `~/shyme/shyme/zasso/tools/conver/.claude/commands/formulate-tickets-for-next.md`

各ファイルに挿入するステップの内容（共通）:
```bash
# I/O 境界参考情報の参照（存在する場合）
echo "=== I/O 境界参考情報 ==="
node ".claude/scripts/grill-me-for-rfc/extract-io-boundary.js" "$TARGET_RFC" || echo "(I/O 境界参考情報なし)"
echo "========================"
```

### 4. test.sh への統合テスト追加

`~/shyme/shyme/zasso/tools/conver/test.sh` に I/O 境界関連 3 スクリプトの統合テストを追加する。

テストケース:
1. `insert-io-boundary-template.js` に新規 RFC でテンプレート挿入 → 5 つの `[::IO-INFO-STUB::]` が存在する
2. `check-io-stubs.js` でマーカー残存時は exit 1、除去後は exit 0
3. `extract-io-boundary.js` でテンプレート挿入後の RFC から I/O 境界セクションを抽出できる。抽出結果が空でない。
4. `extract-io-boundary.js` で I/O 境界セクションがない RFC からは空出力（exit 0）
5. 二重挿入防止

### 5. RFC-ROOT.md Sec 61 の修正

RFC-ROOT.md の Sec 61 冒頭をテンプレート修正と一致させるよう追記する（破壊的変更禁止、追記のみ）。

## Non-scope

- PX-1（insert-io-boundary-template.js / check-io-stubs.js）の再レビューは含めない
- 既存 test.sh のリファクタリングは含めない
- formulate-tickets 系コマンドのロジック自体の修正は含めない（I/O 境界情報を参照するステップの追加のみ）

## Investigation

### PX-1 で作成した既存のテンプレート冒頭

現在の `insert-io-boundary-template.js` 内のテンプレート冒頭（約 51 行目のテンプレート文字列内）:
```
本セクションは、後日 `/split-rfc-to-children` を実行する際に安全な I/O 境界を見つけるための手がかりとして、RFC 設計書自体が自然な切断面を参考情報として示すものである。「これが正しい分割である」と決めつけるものではなく、設計の記述の中に現れる境界の候補を書き留めておくことで、実際の分割作業の一助とすることを目的とする。
```

### 抽出スクリプトのマッチング方式

RFC 内の I/O 境界セクションは以下のようなタイトルを持つ:
```text
## <N>. split-rfc-to-children のための参考情報 — RFC設計書が示す I/O 境界の手がかり
```

このタイトルを確実に検出するため、`split-rfc-to-children のための参考情報` という部分文字列でマッチさせる。セクション番号 `N` が可変でも確実に検出できる。

抽出範囲はセクション開始行（`## N. split-rfc-to-children...`）から、次の `## `（同レベル以降の見出し）の直前まで。

### 修正対象コマンドファイルの調査

3 つのファイルの現在のステップ構成を plan-ticket 時に確認する。各ファイルの最初のステップの直後を挿入位置の第一候補とする。

### test.sh の現状

`test.sh` が存在するか、どのようなテストが既に書かれているかを plan-ticket 時に確認する。

## Test Plan

### ユニットテスト計画

| テスト対象 | 正常系 | 異常系 | 境界値 |
|-----------|--------|--------|--------|
| `extract-io-boundary.js` 抽出 | I/O 境界セクションがある RFC から正しく抽出される | セクションがない RFC は空出力（exit 0） | セクションがファイル末尾にある場合、途中にある場合 |
| `insert-io-boundary-template.js` 冒頭修正 | 修正後のテンプレートに `/formulate-tickets` が含まれる | — | — |
| コマンド定義ファイル修正 | 3 ファイルすべてに参照ステップが正しい位置に追加される | — | ステップ番号が整数のまま連続しているか |
| `test.sh` 統合テスト | 全 I/O 境界テストが test.sh から実行可能 | — | 全テスト PASS |

### ユニットテスト不可能な項目（例外）

- **コマンド定義ファイルの修正位置の正しさ**: テキスト編集の正しさはコードレビューで確認する
- **test.sh の全テスト通過確認**: テスト実行結果は実装時に確認する

## Boy Scout Rule — 翻訳可能性計画

- `extract-io-boundary.js` の関数名は処理内容を動詞句で表現する
- マジックパターン（セクションタイトルのマッチ文字列）は名前付き定数として定義する
- エラーハンドリングは `console.error` + `exit 1`（握りつぶし禁止）
- PX-1 で作成した既存スクリプトも触る場合は Boy Scout 改善を実施する

## Acceptance Criteria

- [ ] `extract-io-boundary.js` が I/O 境界セクションを正しく抽出できる
- [ ] `insert-io-boundary-template.js` のテンプレート冒頭に `/formulate-tickets` と `/formulate-tickets-for-next` が明記されている
- [ ] 3 つのコマンド定義ファイルに I/O 境界参照ステップが整数のステップ番号で追加されている
- [ ] `test.sh` から全 I/O 境界テストが実行でき、全テストが PASS する
- [ ] RFC-ROOT.md Sec 61 の冒頭がテンプレートと一致している
- [ ] 既存の PX-1 のテスト（insert + check）も含めて全て PASS

## Notes

- PX-1（insert-io-boundary-template.js / check-io-stubs.js）の上に積み上げるチケット
- 作業対象は `~/shyme/shyme/zasso/tools/conver/.claude/` 内のみ
- スクリプト言語は Node.js（ESM、`#!/usr/bin/env node`）、conver プロジェクトの既存スタイルに従う
- `test.sh` のテスト追加は忘れずに行うこと

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
