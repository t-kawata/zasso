---
ticket_id: 148
title: /make-ticket Step 3,4,5 のフィールド高密度化テンプレート導入
slug: make-ticket-step-345
status: made
created_at: 2026-07-15
updated_at: 2026-07-15
source_ticket: PX-57
---

# PX-57: /make-ticket Step 3,4,5 のフィールド高密度化テンプレート導入

## Background

現在の `/make-ticket` の Step 3（設計及びソースコード調査）、Step 4（証拠の記録）、Step 5（仕様の具体化）は、チケットフィールドを詳細化・高密度化すべきと述べているものの、「各フィールドに何を・どれだけ書けば合格か」という具体的な基準と手順が欠けている。

結果として、AI 実装者によって出力品質にばらつきが生じ、spec の情報密度が不十分なまま次のフェーズ（plan → start → review）に進んでしまう問題がある。

**解決策**: `grill-me-for-rfc-ja.md` で採用されている `insert-io-boundary-template.js` + `check-io-stubs.js` のテンプレート + マーカー方式を `make-ticket.md` にも導入する。各フィールドに事前定義されたテンプレート（`[::TEMPLATE-STUB::<field-name>::]` マーカー付き）を挿入し、AI がすべてのマーカーを実際の内容で置換するまで検証スクリプトが通過しない仕組みにより、フィールド密度をプログラム的に保証する。

## Investigation

### 参考実装: grill-me-for-rfc のテンプレート + マーカー方式

| スクリプト | パス | 動作 |
|-----------|------|------|
| `insert-io-boundary-template.js` | `.claude/scripts/grill-me-for-rfc/` | RFC ファイルに `<!-- [::IO-INFO-STUB::] -->` マーカーを含むテンプレートセクションを追記。同名セクションが既にあればスキップ（二重挿入防止）。セクション番号は既存最大+1 で自動採番。 |
| `check-io-stubs.js` | `.claude/scripts/grill-me-for-rfc/` | ファイル内の `[::IO-INFO-STUB::]` マーカー残存を全行スキャン。0 件 → exit 0（正常）、1 件以上 → exit 1（未記入 + JSON エラー出力）。 |

**ワークフロー**: テンプレート挿入 → AI が各マーカーを読み内容で置換 → 検証スクリプトがマーカー残存チェック → 0 になるまでループ。

### スキーマ不整合の発見

`tickets-schema.json` の `ticket` 定義に `testIntegration` が存在しない。`additionalProperties: true` により保存は可能だが、スキーマ定義がないため型検証・description が欠落。一方、`ensure-ticket-and-spec.js` は `--test-integration` を正しくパースし、`add-ticket.js` に渡している。`/make-ticket.md` のスクリプト一覧にも記載済み。**スキーマ定義の追加が必要。**

### 設計判断

- 対象は RFC `.md` ではなく Tickets.json の JSON フィールド。各フィールドの値を `update-ticket.js` で上書き設定する。
- マーカー形式: `[::TEMPLATE-STUB::<field-name>::]`
- 検証: `check-field-density.js` が `get-ticket.js` 経由でチケット全フィールドを取得、文字列連接して正規表現でマーカー残存をチェック。

## Scope

### 変更範囲

1. `insert-field-template.js` — 新規スクリプト
2. `check-field-density.js` — 新規スクリプト
3. `tickets-schema.json` — `testIntegration` フィールド追加
4. `ensure-ticket-and-spec.js` — Step 2b 末尾に `insert-field-template.js` 呼び出し追加
5. `/make-ticket.md` — Step 3,4,5 の手順記述をテンプレート方式に対応

### 非変更範囲

- `ensure-ticket-and-spec.js` の改修は呼び出し追加のみ（既存ロジック不変）
- 他のスラッシュコマンド（plan/start/review）は変更しない
- `insert-io-boundary-template.js` / `check-io-stubs.js` は参考実装として維持し変更しない

### 影響範囲

- `ensure-ticket-and-spec.js` は新スクリプト呼び出しを追加するため、エラー時のロールバック整合性に注意

## insert-field-template.js 設計

### 役割

`/make-ticket` の Step 3 開始時点で AI が実行する。対象チケットの 8 フィールドすべてにテンプレート（`[::TEMPLATE-STUB::]` マーカー入り）を設定する。

### 動作仕様

- **引数**: `<PATH of Tickets.json> P{phaseID}-{ticketID>`
- **スキップ条件**: フィールドに既に値が存在し、かつ `[::TEMPLATE-STUB::]` を含まない場合 → 上書きしない
- **二重挿入防止**: 既に `[::TEMPLATE-STUB::]` を含むフィールドはスキップ
- **postcondition**: `update-ticket.js` で 8 フィールドを一括上書き
- **exit code**: 0 = 正常、1 = エラー
- **出力**: `{ ok: true, ticketKey: "...", updated: [field names...] }`

## check-field-density.js 設計

### 役割

`/make-ticket` の Step 5 終了時に、全 `[::TEMPLATE-STUB::]` マーカーが置換されたことを検証する。

### 動作仕様

- **引数**: `<PATH of Tickets.json> P{phaseID}-{ticketID>`
- **検出方法**: `get-ticket.js` でチケット取得 → 全フィールド値を文字列連接 → 正規表現 `/\[::TEMPLATE-STUB::[^:]+::\]/` でマッチング
- **exit code**: 0 = 合格（マーカー 0 件）、1 = 不合格（1 件以上残存）
- **エラー出力**: 残存マーカーのフィールド名と内容を JSON で stderr 出力
- **密度スコアリング**: 各フィールドの必須項目数 / 記入済み項目数の比率を stdout に JSON 出力（オプション）

## 8フィールドのテンプレート定義

### invariants（string）: 正常成立条件 / 異常永不変条件 / 内部状態不変条件 / 境界不変条件
### background（string）: 目的 / 動機 / 制約 / 関連RFC
### scope（string 配列）: 変更範囲 / 非変更範囲 / 影響範囲
### testUnit（string 配列）: 正常系 / 異常系 / 境界値 / 不変条件
### testIntegration（string 配列）: 結合点 / 検証内容 / 前提条件 / 関連チケット
### testExceptions（string 配列）: 項目 / 理由（(a)非決定性 (b)外部依存 (c)UI検証 (d)ライセンス (e)その他） / 代替検証手段
### instrumentation（string）: ログ出力 / メトリクス / エラー追跡 / 正常動作確認
### notes（string）: 実装手順 / リスク一覧 / 注意点 / 未確定事項 / 将来の改善余地

各テンプレートの具体的な内容（マーカー数含む）は Tickets.json PX-57 の各フィールドを正本とする。

## Test Plan

### Unit Tests

| # | テスト | 期待結果 |
|---|-------|---------|
| 1 | insert-field-template.js: 空チケットの 8 フィールドにテンプレート挿入 | 全フィールドに `[::TEMPLATE-STUB::]` が設定される |
| 2 | insert-field-template.js: 既存値のあるフィールドを上書きしない | 既存値が維持される |
| 3 | insert-field-template.js: 存在しないチケットキー | exit 1 + JSON エラー |
| 4 | check-field-density.js: 全マーカー未記入 | exit 1 + 残存マーカー数報告 |
| 5 | check-field-density.js: 一部マーカー未記入 | exit 1 + 未記入フィールド名のみ報告 |
| 6 | check-field-density.js: 全マーカー記入済み | exit 0 + `{ ok: true, count: 0 }` |
| 7 | tickets-schema.json: testIntegration 追加後バリデーション | 既存 Tickets.json 全件で validation 通過 |

### Integration Tests

- ensure-ticket-and-spec.js → insert-field-template.js → AI 記入 → check-field-density.js の一連の流れが実際の Tickets.json 上で動作すること
- `/make-ticket` の Step 2b → 3 → 4 → 5 → 6 を通した spec 生成パイプライン全体の結合テスト

### Exceptions

テンプレート内容の「意味的正確性」（AI が各フィールドに適切な情報を書いたか）はプログラムで判定不能。`check-field-density.js` はマーカー残存と構造的充足性のみ検証し、意味的正確性は `/plan-ticket` の Investigation 再検証で担保する。

## Boy Scout Rule — 翻訳可能性計画

`tickets-schema.json` に `testIntegration` フィールドを追加する（型・description を明記）。設計と実装の乖離を修正する。

## 実装手順

1. `tickets-schema.json` に `testIntegration` フィールド追加（`type: array`, `items: { type: string }`, description 明記）
2. `insert-field-template.js` 実装
3. `check-field-density.js` 実装
4. `ensure-ticket-and-spec.js` の Step 2b 末尾に `insert-field-template.js` 呼び出し追加
5. `/make-ticket.md` の Step 3,4,5 手順記述をテンプレート方式に書き換え

（1, 2, 3 は独立しているため並行実装可能。5 は全スクリプト完成後に行うこと）
