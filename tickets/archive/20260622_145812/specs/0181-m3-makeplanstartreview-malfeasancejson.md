---
ticket_id: 181
title: "M3: make/plan/start/review への Malfeasance.json 統合"
slug: m3-makeplanstartreview-malfeasancejson
status: reviewed
created_at: 2026-06-21
updated_at: 2026-06-21
related_tickets: "依存: M0 (#178) — スクリプト群必須, M2 (#180) — 規則の明記が前提"
implementation_path: /Users/shyme/shyme/zasso/tickets/context/0181-m3-makeplanstartreview-malfeasancejson/implementation.md
review_report_path: /Users/shyme/shyme/zasso/tickets/context/0181-m3-makeplanstartreview-malfeasancejson/review.md
plan_path: /Users/shyme/shyme/zasso/tickets/context/0181-m3-makeplanstartreview-malfeasancejson/plan.md
---

# M3: make/plan/start/review への Malfeasance.json 統合

## Summary

`make-ticket.md` / `plan-ticket.md` / `start-ticket.md` / `review-ticket.md` の 4 コマンド全てに、Malfeasance.json をスクリプト経由で読み取り、未解決の犯罪を解消する処理を組み込む。

- **make / plan**: Malfeasance.json を読み取り、未解決の犯罪があれば spec や計画内で解消するための具体的計画を必ず盛り込む
- **start / review**: Malfeasance.json を読み取り、未解決の犯罪があれば最優先でその場で解決する
- この処理は各コマンドのワークフロー内で**必須ステップ**として明記し、スキップを禁止する

## Background

M0 (#178) で作成した Malfeasance.json 操作スクリプトと、M2 (#180) で明記した第一級規則に実効性を持たせるためには、各コマンドのワークフロー内で Malfeasance.json を読み取る処理が強制されていなければならない。

現在の各コマンドワークフローには以下の問題がある：

1. **スタブ点検の記述はあるが弱い**: make-ticket.md には「スタブの点検」セクションがあり `find-all-stubs.js` でスタブ検索を行うが、Malfeasance.json との連携がなく、検出結果を犯罪として記録するプロセスがない
2. **コマンドごとに強制力が異なる**: スタブチェックの記述があるファイルとないファイルがある
3. **犯罪解決の優先順位が不明**: 未解決の犯罪があった場合、それが最優先タスクであることが明記されていない
4. **スクリプト呼び出しが未整備**: Malfeasance.json 操作スクリプト群が存在しない（M0 で作成）

本チケットでは、各コマンドファイルに Malfeasance.json 読み取りと犯罪解決を必須ステップとして組み込み、一貫した強制力を持たせる。

## Scope

### 含むもの

1. **make-ticket.md の修正**
   - 既存「スタブの点検」セクションを拡張し、Malfeasance.json の読み取りと犯罪解決計画の策定を組み込む
   - 「スタブの点検」から「犯罪の点検」へのセクション名変更を検討

2. **plan-ticket.md の修正**
   - Malfeasance.json 読み取り → 未解決犯罪の解消計画を spec/plan に盛り込む処理を必須ステップとして追加
   - 計画承認条件として「未解決の犯罪がないこと（または解消計画が含まれていること）」を追加

3. **start-ticket.md の修正**
   - Malfeasance.json 読み取り → 未解決犯罪の最優先解決を必須ステップとして追加
   - 実装着手前に犯罪を解決できない場合はブロッカーとして報告する

4. **review-ticket.md の修正**
   - Malfeasance.json 読み取り → 未解決犯罪の最優先解決を必須ステップとして追加
   - 品質チェックと併せて犯罪解決を検証する

5. **コマンド間の一貫性確保**
   - 各コマンドファイルで Malfeasance.json スクリプト呼び出しの記述を統一する
   - 読み取り時は `malfeasance-all.js open` を使用する

### 含まないもの

- 第一級規則の文面記述（→ M2 #180）
- Malfeasance.json 操作スクリプトの作成（→ M0 #178）
- formulate-tickets.md の修正（→ M1 #179）

## ワークフロー詳細

### make-ticket.md の統合

既存の「スタブの点検」セクションを以下のように拡張する：

```markdown
### 犯罪の点検（必須）

Malfeasance.json を読み取り、未解決の犯罪（open ステータスのレコード）がないか確認する。これは**必須ステップ**であり、スキップを禁止する。

```bash
# Malfeasance.json から未解決の犯罪を全て取得
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-all.js" "open"
```

1. 未解決の犯罪が存在する場合、本チケットの spec または計画内にそれらを解消するための具体的計画を必ず盛り込む
2. 解消計画には以下を含める：
   - 各犯罪の ID と内容
   - 解決方法（マーカー追加、実装完了、false_positive 判断等）
   - 本チケット内で解決するか、別チケットに委ねるかの判断
3. 解消計画を spec の「調査結果」または独立したセクションに記述する

**注意**: 犯罪を単に「既知の状態」として放置するだけの記述は許可されない。必ず具体的な解決アクションを記述すること。
```

### plan-ticket.md の統合

「依存・関連チケットID」点検の後に以下を追加：

```markdown
### 犯罪の点検（必須）

Malfeasance.json を読み取り、未解決の犯罪がないか確認する。**計画承認の条件**として、以下のいずれかを満たさなければならない：

- **条件 A**: Malfeasance.json に open レコードが存在しない
- **条件 B**: open レコードが存在する場合、本チケットの実装計画内にそれらを解消する具体的なステップが含まれている

条件 B の場合、計画内に以下を明記する：
- 各犯罪を解消する具体的なステップ（マーカー追加、コード実装等）
- 犯罪解消に必要な作業量の見積もり
- 犯罪解消が本チケットのスコープ外であれば、新規チケット作成の提案

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-all.js" "open"
```
```

### start-ticket.md の統合

実装着手前に以下を追加：

```markdown
### 犯罪の緊急解決（最優先）

Malfeasance.json を読み取り、未解決の犯罪（open）が存在する場合、**本チケットの実装作業より優先して**解決する。これは最優先タスクである。

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-all.js" "open"
```

1. 未解決の犯罪が存在する場合、直ちに解決に取り掛かる
2. 解決方法：
   - 該当コードに `[::STUB::]` マーカーが未付与なら、その場でマーカーを追加する
   - マーカー追加後、`malfeasance-update.js` でステータスを `resolved` に変更する
   - 実装が完了しているにも関わらずマーカーが残っている場合は、マーカーを削除して解決する
3. 技術的に解決不可能な場合は、`malfeasance-update.js` でステータスを `false_positive` に変更し、理由を `note` に記録する
4. 全ての犯罪を解決（または適切に分類）するまで実装作業を開始してはならない
```

### review-ticket.md の統合

品質チェックの前に以下を追加：

```markdown
### 犯罪の緊急解決（最優先）

Malfeasance.json を読み取り、未解決の犯罪（open）が存在する場合、**レビュー処理より優先して**解決する。これは最優先タスクである。

```bash
_R="$(git rev-parse --show-toplevel)/.claude"
node "$_R/scripts/tickets/malfeasance-all.js" "open"
```

start-ticket.md と同一の解決手順に従う。全犯罪を解決するまでレビューを進行してはならない。

また、本チケットの実装コードに新たな犯罪（[::STUB::] マーカー未付与の不完全実装）がないことを確認する。発見した場合は：
1. その場で `[::STUB::]` マーカーを追加する
2. `malfeasance-create.js` で犯罪として記録する
3. 犯罪を解決する（実装完了 or マーカー追加）
```

## 依存・関連チケットID

| 関係 | チケット | 説明 |
|------|---------|------|
| 依存 | M0 (#178) | 本チケットは M0 の操作スクリプト群完成後に実装可能 |
| 依存 | M2 (#180) | 本チケットは M2 の第一級規則明記後に実装可能（規則が前提のため） |
| 依存 | M1 (#179) | formulate-tickets.md が先に修正されていなくても本チケットの実装は可能（独立したファイル修正のため） |

## 調査結果

### 実装時現状確認（2026-06-21）

- **M2 とのスコープ重複**: M2 (#180) ですでに各コマンドファイルへの犯罪点検・犯罪解決セクションの追加が完了していた。M3 では実質的に以下を実施：
  1. `scan-crimes.sh` の新規作成 — Malfeasance.json 不在時に自動初期化する共通ラッパー
  2. 全 4 コマンドファイルのコードブロックを `scan-crimes.sh` に統一
- **Malfeasance.json 不在問題**: `formulate-tickets.md` 未実行環境では Malfeasance.json が存在しない。`scan-crimes.sh` がこのギャップを解消。
- **呼び出し形式**: 全 4 コマンドファイルで `_R + malfeasance-all.js` の直接呼び出しから `scan-crimes.sh` に統一。

## Test Plan

### ユニットテスト計画

コード変更を伴わない（Markdown ファイルの編集のみ）ため、以下の検証で代替する：

1. **キーワード存在確認**
   - 各コマンドファイルに `malfeasance-all.js "open"` の呼び出し例が含まれていること
   - 各コマンドファイルに「犯罪」「未解決」「最優先」というキーワードが含まれていること

2. **ワークフロー位置の確認**
   - make-ticket.md では spec 作成前に犯罪点検があること
   - plan-ticket.md では計画承認条件として犯罪解消があること
   - start-ticket.md では実装着手前に犯罪解決があること
   - review-ticket.md ではレビュー前に犯罪解決があること

3. **一貫性チェック**
   - 各コマンドファイルで犯罪解決の強制力に差がないこと
   - Malfeasance.json 操作スクリプトの呼び出し形式が統一されていること

### ユニットテスト不可能な項目（例外）

Markdown の内容検証は目視レビューが主となる。

## 受け入れ基準 (Acceptance Criteria)

1. [ ] make-ticket.md に Malfeasance.json 読み取りと犯罪解消計画策定が必須ステップとして追加されている
2. [ ] plan-ticket.md に Malfeasance.json 読み取りと計画承認条件（犯罪解消必須）が追加されている
3. [ ] start-ticket.md に Malfeasance.json 読み取りと犯罪最優先解決が必須ステップとして追加されている
4. [ ] review-ticket.md に Malfeasance.json 読み取りと犯罪最優先解決が必須ステップとして追加されている
5. [ ] 全コマンド間で Malfeasance.json 操作スクリプトの呼び出し形式が統一されている
6. [ ] 既存の「スタブの点検」記述が新しいフローと矛盾しないように更新されている

## Boy Scout Rule — 翻訳可能性計画

- 各コマンドファイル内で翻訳可能性を損なう表現があれば改善する
- 重複する記述（make/plan/start/review 間）は統一表現に整理する
