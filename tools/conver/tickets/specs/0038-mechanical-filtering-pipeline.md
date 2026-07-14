---
ticket_id: 38
title: 機械的フィルタリングパイプライン（3スクリプト一括実装）
slug: mechanical-filtering-pipeline
status: made
created_at: 2026-07-01
updated_at: 2026-07-01
ticket_key: P9-1
---
# 機械的フィルタリングパイプライン — Step 3.5（3スクリプト一括実装）

## Summary

find-omissions の Step 3.5 で動作する3つの決定論的スクリプト `dedup-omissions-by-history.js`、`materiality-filter.js`、`diminishing-returns.js` を一括実装する。これらは直列パイプラインとして動作し、1つの I/O 境界（raw OMISSIONS + 履歴 OMISSIONS + RFC → フィルタリング済み OMISSIONS + 発散傾向レポート）を形成する。

## Background

find のループを重ねると omission が減らず発散する問題がある。原因は以下の通り：
- **再現率偏重**: omission を1件でも多く見つける = 良い仕事。見逃しリスク回避のため保守的に「差がある」と報告する
- **Goal へのフィードバック欠如**: purpose/goals/successCriteria との照合がない
- **発見量の質的評価がない**: omission の数自体は減っても「質が低下している（low/cosmetic ばかり）」ことを検知できない
- **過去との重複排除がない**: 同じファイル・同じ観点の omission がループごとに再発見される

このチケットでは、既存の find ワークフロー（Step 0〜Step 6）は維持した上で、Step 3（比較分析）と Step 4（確認）の間に **Step 3.5 機械的フィルタリング**を追加する3つのスクリプトを実装する。

**設計原則**: 決定論で確定できることはスクリプトが判断し、非決定論が不可欠なことのみ AI が判断する。

## Scope

### 実装範囲

1. **`.claude/scripts/tickets/dedup-omissions-by-history.js`**
   - 100% 決定論。現在の OMISSIONS と過去の OMISSIONS を比較し、完全重複を排除
   - 決定論的ルール3種:
     - Rule 1: 完全重複（同一ファイル + 同一セクション + 同一种別）→ 自動skip
     - Rule 2: low severity の `stub_remaining` → `cosmetic` に自動格下げ
     - Rule 3: 同一ファイルで3回以上連続 omission → `repeated_area` タグ + 要確認フラグ
   - 出力: `autoSkipped[]`, `downgraded[]`, `repeatedAreas[]`, `pendingForAI[]`

2. **`.claude/scripts/tickets/materiality-filter.js`**
   - 80% 決定論 + 20% AI への情報提供。各 omission を RFC の purpose / goals / successCriteria と照合
   - 処理:
     - `rfcUnderstanding` から purpose / goals / successCriteria を読み取る
     - 各 omission の `affectedFiles` と successCriteria のキーワード一致率を機械的に評価
     - omission 種別と阻害する criteria の数の積を計算
     - purpose に照らした影響範囲の広さを評価
     - 3階層（purpose: 3点 / goals: 2点 / successCriteria: 1点）で Goal 阻害度スコアリング
   - 合計スコアに応じた severity 機械的調整:
     - スコア 0 → `cosmetic`（check-final通過可能）
     - スコア 1-2 → `low`（優先度低）
     - スコア 3-5 → `medium`
   - 出力: 各 omission の Goal阻害スコア + 推奨 severity

3. **`.claude/scripts/tickets/diminishing-returns.js`**
   - 100% 決定論。find のループ回数と omission 発見数の時系列を分析
   - 処理:
     - 全 `OMISSIONS-*.json` から omission 数を種別・severity 別に集計
     - `low / (high + medium + low)` 比率の推移を計算
     - 前回比で omission 総数が増加していれば発散フラグ
     - low 比率が 50% 以上かつ増加傾向なら発散警告
   - 出力: 発見数推移 + 発散/収束判定

4. **パイプライン結合**: 3スクリプトを `dedup → materiality → diminishing` の直列実行で1つのトップレベル関数から呼び出し可能にする

### 非スコープ

- find-omissions ワークフロー（create-omissions.js の steps 配列や find-omissions-for-next-rfc.md）への統合は **P10-1** のスコープ
- 既存の add-omission.js, list-omissions.js の変更は含まない
- 発散検知後の自動停止など、ワークフロー制御は含まない

## Investigation

### 参照元設計

RFC_ADDITION-002.md（Proposal B-1/B-2/B-3）に基づく。各スクリプトの入出力仕様は RFC の該当セクションに定義済み。

| スクリプト | 決定論度 | 入力 | 出力 |
|-----------|---------|------|------|
| dedup-omissions-by-history.js | 100% | 現在のOMISSIONSパス + 過去OMISSIONS一覧 | 重複排除結果JSON |
| materiality-filter.js | 80% | OMISSIONSパス + RFCパス | Goal阻害度スコア |
| diminishing-returns.js | 100% | OMISSIONSパス | 発散/収束判定 |

### 既存スクリプトのパターン確認

既存の tickets スクリプト（add-omission.js, create-omissions.js, list-omissions.js 等）は `.claude/scripts/tickets/` に配置されている。これらは Node.js（CommonJS）で記述され、OMISSIONS ファイルを JSON として読み書きする。P9-1 の3スクリプトも同様のパターンに従う。

### 依存関係

- P10-1（find-omissions ワークフローへの Goal Gate 統合）が P9-1 に依存する
- 既存のスクリプト群（add-omission.js, list-omissions.js）への変更は不要

## Test Plan

### ユニットテスト計画

**共通**: 全テストは決定論的ロジックの検証に集中する。ファイルI/Oはモック化し、純粋ロジックのみテストする。

#### dedup-omissions-by-history.js（6ケース）

| # | 種別 | ケース | 期待結果 |
|---|------|--------|---------|
| 1 | 正常系 | 完全重複（同一ファイル+同一セクション+同一种別）が存在する場合 | 該当 omission が `autoSkipped` に追加される |
| 2 | 正常系 | low severity の `stub_remaining` が存在する場合 | 該当 omission が `cosmetic` に格下げされる |
| 3 | 正常系 | 同一ファイルで3回以上連続して omission が出ている場合 | `repeated_area` タグ + 要確認フラグが付与される |
| 4 | 異常系 | 履歴 OMISSIONS が空の場合 | 全ての omission が `pendingForAI` に分類される |
| 5 | 境界値 | 同一ファイルでちょうど2回連続の omission | タグは付与されない |
| 6 | 境界値 | 重複かつ stub_remaining かつ repeated_area が同時に該当 | 各ルールの適用順序が正しいこと（Rule1 → Rule2 → Rule3） |

#### materiality-filter.js（5ケース）

| # | 種別 | ケース | 期待結果 |
|---|------|--------|---------|
| 1 | 正常系 | omission が purpose/goals/successCriteria すべてを阻害する | スコア 6（=3+2+1）→ 推奨 severity: medium |
| 2 | 正常系 | omission が1つも阻害しない | スコア 0 → 推奨 severity: cosmetic |
| 3 | 正常系 | 一部の criteria のみ阻害（例: successCriteria のみ） | スコア 1 → 推奨 severity: low |
| 4 | 境界値 | rfcUnderstanding に goals/successCriteria が空の場合 | 欠落要素はスコアリング対象外とし、purpose のみで評価 |
| 5 | 異常系 | 参照する RFC ファイルが存在しない | エラーハンドリング（ファイル不在を通知） |

#### diminishing-returns.js（5ケース）

| # | 種別 | ケース | 期待結果 |
|---|------|--------|---------|
| 1 | 正常系 | low 比率が増加傾向（33% → 50% → 78%）| 発散傾向と判定され警告表示 |
| 2 | 正常系 | low 比率が減少傾向（60% → 40% → 20%）| 収束傾向と判定 |
| 3 | 正常系 | 前回比で omission 総数が増加している | 発散フラグが立つ |
| 4 | 境界値 | OMISSIONS 履歴が1件のみ | 判定不能（データ不足）を返す |
| 5 | 境界値 | low 比率 50% だが増加傾向でない | 注意レベル（発散確定はしない） |

#### パイプライン結合テスト（2ケース）

| # | 種別 | ケース | 期待結果 |
|---|------|--------|---------|
| 1 | 正常系 | dedup 出力を materiality にパイプ | データ形式の一貫性が保たれる |
| 2 | 正常系 | 全3スクリプト直列実行 | 最終出力（発散傾向レポート）が正しく生成される |

### ユニットテスト不可能な項目（例外）

なし。全ロジックはメモリ内で完結する決定論的処理であり、外部サービス結合は存在しない。

## Boy Scout Rule — 翻訳可能性計画

新規作成の3スクリプトは全て以下の方針で実装する：

1. **関数名は動詞句**: `filterDuplicates()`, `scoreGoalBlocking()`, `analyzeTrend()` 等、処理内容が関数名から読み取れること
2. **変数名はドメイン概念**: `data`, `info`, `tmp` 等の汎用名は禁止。`omissions`, `severityScores`, `trendReport` 等の具体的名称
3. **一関数一責務**: 重複排除・スコアリング・傾向分析の各処理は内部でもさらに責務分割する
4. **ハードコード値は名前付き定数**: スコア重み（3/2/1）、閾値（50%）、連続回数（3回）等は const 定義
5. **エラー握りつぶし禁止**: ファイル不在等のエラーは伝播させ、呼び出し元で適切に処理する

## Acceptance Criteria

- [ ] dedup-omissions-by-history.js の3つの決定論ルールがすべて正しく実装されている
- [ ] materiality-filter.js の Goal 阻害度スコアリングが正しく実装されている
- [ ] diminishing-returns.js の発散/収束判定が正しく実装されている
- [ ] 3スクリプトが直列パイプラインとして動作する
- [ ] 全てのユニットテストが通過している（カバレッジ 90% 以上）
- [ ] 翻訳可能性を満たしている（関数名=動詞句、変数名=ドメイン概念、一関数一責務）
- [ ] `[::STUB::]` マーカー漏れがない

## Notes

- **依存関係**: P10-1 が本チケット完了を前提とする（relatedTicketIds に明記済み）
- **I/O 境界**: raw OMISSIONS + 履歴 OMISSIONS + RFC → フィルタリング済み OMISSIONS + 発散傾向レポート
- **不変条件**: 機械的フィルタリングが正しく omission を重複排除・スコアリング・傾向判定する
- **参照**: RFC_ADDITION-002.md Proposal B-1/B-2/B-3（B-1: 106-132行、B-2: 134-159行、B-3: 161-181行）

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
