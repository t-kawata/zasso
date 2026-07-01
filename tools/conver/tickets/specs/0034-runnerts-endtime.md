---
ticket_id: 34
title: ステップ境界時間制御 — runner.ts endTime ガード
slug: runnerts-endtime
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
ticket_key: P8-1
---
# ステップ境界時間制御 — runner.ts endTime ガード

## Summary

Watcher モードで動作中、各ループステップ（make/plan/start/review/resolve/find）の開始前に現在時刻が `WatcherConfig.endTime` を超過していないかを確認するガード関数を実装する。超過時は該当ステップをスキップし、警告ログを出力する。`-w` 未指定時（通常モード）は従来通り全ステップを実行する。

## Background

P8（Watcher ループ統合）の Layer 3/4 層として、既存の `runner.ts` ループに時間枠制御を追加する。

### 依存関係完了状況

- **P6-1 (WatcherConfig 型定義)**: ✅ 完了。`src/watcher.ts` に `WatcherConfig` インターフェース定義済み。
- **P6-2 (時間窓判定)**: ✅ 完了。`src/time-window.ts` に `isInTimeWindow()` 純粋関数実装済み。
  - 引数: `(now: Date, startTime: string, endTime: string, timezone: string): boolean`
  - 日跨ぎ対応（startTime > endTime で深夜跨ぎ判定）
- **P7-1 (CronScheduler)**: ✅ 完了。`src/cron-scheduler.ts` に `CronScheduler` クラス実装済み。
- **P7-2 (定期点検ロジック)**: ✅ 完了。`src/check-and-start-loop.ts` に `checkAndStartLoop()` 実装済み。
- **P4-1 (メインループ制御)**: ✅ 完了。`src/runner.ts` に `runLoop()` 実装済み。386行。
- **P8-2 (CLI引数統合)**: ⬜ 未着手（本チケットの出力先）。
- **P8-3 (エントリポイント統合)**: ⬜ 未着手（本チケットの出力先）。

### 既存コード上の制約

- `runner.ts` の `runLoop()` は `LoopOptions` を受け取り、未処理チケットを順次処理する
- `LoopOptions` に `WatcherConfig` の受取口は未実装（P8-1 で追加予定）
- `isInTimeWindow()` は `new Date()` による現在時刻を内部で生成せず、呼び出し元から渡す設計
- 既存のループ動作に影響を与えないこと（`-w` 未指定時は従来通り動作）

## Scope

### 成果物

| ファイル | 種別 | 説明 |
|----------|------|------|
| `src/step-timer.ts` | **新規作成** | 時間枠判定ラッパー + ステップ期限チェック |
| `src/step-timer.test.ts` | **新規作成** | ユニットテスト |
| `src/runner.ts` | **修正** | LoopOptions に `watcherConfig` 追加、各ステップ前に時間枠チェック |
| `src/runner.test.ts` | **修正** | 時間枠チェックを含む新しいテストケース追加 |
| `Makefile` | **修正** | test-conver ターゲットに `step-timer.test.js` 追加 |

### 公開関数

```typescript
// src/step-timer.ts

/**
 * WatcherConfig が設定されている場合、現在時刻が時間枠内かを判定する。
 * config が null（通常モード）の場合は常に true を返し、後方互換性を確保する。
 * 内部で isInTimeWindow(new Date(), ...) を呼び出す。
 */
export function isWithinTimeWindow(config: WatcherConfig | null): boolean;

/**
 * 指定されたステップの実行前に期限超過をチェックする。
 * 時間枠内なら true（実行可）、枠外なら false（スキップ）を返す。
 * スキップ時は console.warn で警告を出力する。
 */
export function checkStepDeadline(
  stepName: string,
  config: WatcherConfig | null
): boolean;
```

### LoopOptions への追加フィールド

```typescript
export interface LoopOptions {
  // ... 既存のフィールド ...
  watcherConfig?: WatcherConfig;  // 追加
}
```

### 非スコープ

- `isInTimeWindow()` の修正・再実装（P6-2 完了済み）
- `WatcherConfig` インターフェースの変更（P6-1 完了済み）
- CLI 引数パース（P8-2）
- エントリポイント統合（P8-3）
- find-omissions からの watcher 起動（未計画）

## Investigation

### ソースコード調査結果

#### 1. `src/time-window.ts` (P6-2 完了)

`isInTimeWindow()` は純粋関数として既に実装済み。引数に `(now: Date, startTime: string, endTime: string, timezone: string)` を取り、日跨ぎ対応を含む完全な実装となっている（ファイル全67行）。P8-1 はこの関数をラップする形で `isWithinTimeWindow()` を実装する。

**確認済み:**
- `src/time-window.ts` — 完全実装。公開関数: `isInTimeWindow()`
- `src/time-window.test.ts` — 17件のテストケース。全パス確認済み（P6-2 レビュー報告書より）
- 犯罪: 0件。スタブ: 0件。

#### 2. `src/watcher.ts` (P6-1 完了)

`WatcherConfig` インターフェース:
```typescript
export interface WatcherConfig {
  intervalMinutes: number;  // 1〜525600
  startTime: string;        // "HH:mm" 形式（24時間表記）
  endTime: string;          // "HH:mm" 形式（24時間表記）
  timezone: string;         // IANA タイムゾーン名（例: "Asia/Tokyo"）
}
```

ファイル全148行。`loadWatcherConfig()` / `validateWatcherConfig()` も実装済み。

#### 3. `src/runner.ts` (P4-1 完了)

`runLoop()` は386行のファイルで、以下のループ構造を持つ:

```
for each pending ticket (sorted by phaseId, id):
  1. Session A: make-ticket → plan-ticket → start-ticket
  2. Session B: review-ticket (分離モード or done)
  3. reviewedCount % resolveEvery === 0 || 最終チケット:
     - resolve-ticket
     - [pushEnabled] jpush-branch
     - [最終チケット] Slack 完了通知
     - [!noFind && 全 reviewed] find-omissions-for-next-rfc
```

P8-1 での修正箇所:
- `LoopOptions` に `watcherConfig?: WatcherConfig` を追加（43行目付近）
- `for` ループ先頭で `checkStepDeadline()` を呼び出し、`false` なら `break`（214行目付近）
- インポートに `WatcherConfig` と `checkStepDeadline` を追加

#### 4. 依存関係の整合性確認

```bash
# P6-1 → P6-2 → P7-1 → P7-2 → P8-1 の依存チェーン
# 全上流チケットの状態: reviewed (完了)
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "P6-1"  # → reviewed ✅
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "P6-2"  # → reviewed ✅
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "P7-1"  # → reviewed ✅
node ".claude/scripts/tickets/get-ticket.js" "Tickets.json" "P7-2"  # → reviewed ✅
```

#### 5. 犯罪スキャン結果

- Malfeasance.json: 0件（未解決の犯罪なし）
- `[::STUB::]` 未付与の不完全実装: 0件（`node .claude/scripts/tickets/review/find-all-stubs.js src` 確認）

#### 6. 設計判断

| # | 判断 | 根拠 |
|---|------|------|
| 1 | チェックタイミング: 各チケット処理の開始前（ループ先頭）に1回 | 開始済みのステップがendTime超過しても許容する要件による。厳密な「各ステップ前」ではなく「各チケット前」で十分実用的 |
| 2 | スキップ動作: `break`（以降の全チケットをスキップ） | 時間枠外では翌チケットも同様に枠外のため、ループ継続は無駄 |
| 3 | 通常モード互換: `config === null` or `undefined` → 常に true | 既存動作への影響ゼロ |
| 4 | 警告出力: `console.warn`（`console.log` ではなく） | 通常ログと区別し、警告であることを明示。既存 runner.ts の設計（CLI進捗報告としての console.log）と整合 |
| 5 | 新規ファイル作成（`src/step-timer.ts`） | 責務分離。runner.ts は「いつチェックするか」、step-timer.ts は「どうチェックするか」を担当 |

## Test Plan

### ユニットテスト計画

#### `src/step-timer.test.ts` — 公開関数の純粋テスト

**`isWithinTimeWindow()` のテスト:**

| # | 分類 | 内容 | 期待値 |
|---|------|------|--------|
| 1 | 正常系 | config=null → 常に通過 | `true` |
| 2 | 正常系 | config あり、時間枠内 | `true` |
| 3 | 正常系 | config あり、時間枠外（開始前） | `false` |
| 4 | 正常系 | config あり、時間枠外（終了後） | `false` |
| 5 | 正常系 | config あり、日跨ぎ時間枠内 | `true` |
| 6 | 正常系 | config あり、日跨ぎ時間枠外 | `false` |

**`checkStepDeadline()` のテスト:**

| # | 分類 | 内容 | 期待値 |
|---|------|------|--------|
| 7 | 正常系 | config=null → 常に通過 | `true` |
| 8 | 正常系 | 時間枠内 → 実行可 | `true` |
| 9 | 正常系 | 時間枠外 → スキップ + `console.warn` 発行 | `false` |
| 10 | 異常系 | 不正な config（空オブジェクト）→ エラー伝播 | `throw` |

ケース10の補足: `isWithinTimeWindow({} as any)` のような不正入力は、内部で `isInTimeWindow()` に渡され、同関数内の `parseTimeToMinutes()` で `TIME_FORMAT_PATTERN.test(undefined)` が `false` → `Error` を throw する。これをそのまま伝播する。

#### `src/runner.test.ts` — ループ統合テスト

既存の `mock.module` ベースのモックテストに以下を追加:

| # | 分類 | 内容 | 期待動作 |
|---|------|------|----------|
| 11 | 正常系 | watcherConfig=undefined → 従来通り全ステップ実行 | 既存動作と同一 |
| 12 | 正常系 | watcherConfig あり、時間枠内 → 全ステップ実行 | 通常ループ |
| 13 | 正常系 | watcherConfig あり、時間枠外 → ループ break + console.warn | 最初のチケットスキップ |

ケース12/13 では `Date.now()` を固定できないため、`isInTimeWindow` のラッパーである `isWithinTimeWindow` のモジュールをモック化する方針（既存の `mock.module` パターンに準拠）。

### ユニットテスト不可能な項目（例外）

- 該当なし。全テストケースはユニットテストでカバー可能。

## Boy Scout Rule — 翻訳可能性計画

### 新規コード（`src/step-timer.ts`）

- **関数名**: `isWithinTimeWindow`（状態判定の述語）、`checkStepDeadline`（動作前ガード）— いずれも動詞句で散文として読める
- **変数名**: `config`, `stepName` — ドメイン概念を正確に表現。1文字変数なし
- **一関数一責務**: 各関数は1つの責務のみ（判定／チェック+警告）
- **マジックナンバー**: なし。既存の `time-window.ts` / `watcher.ts` の定数を流用
- **エラー握りつぶし禁止**: エラーは呼び出し元に伝播。try-catch による握りつぶしなし
- **コメント**: 「なぜ」に特化（`// isInTimeWindow のラッパー。config=null の後方互換のため` 等）

### 既存コード改善（`src/runner.ts`）

- `LoopOptions` への `watcherConfig` 追加 — 設定値の一元管理を強化
- 時間枠チェックロジックを `step-timer.ts` に外部化 → `runner.ts` は「いつチェックするか」に専念（責務分離の改善）
- 修正範囲は最小限（インポート追加 + ループ先頭ガード + Optional フィールド追加）
- 既存の `loadPendingTickets` / `checkAllReviewed` / `getCurrentPhase` 等は変更なし

## Acceptance Criteria

- [ ] `isWithinTimeWindow(null)` は常に `true`（後方互換性）
- [ ] `isWithinTimeWindow(config)` は `isInTimeWindow()` を正しくラップ
- [ ] `checkStepDeadline()` は時間枠外で `false` を返し、`console.warn` を発行
- [ ] `runLoop` が `watcherConfig` なしで呼ばれた場合、従来通り全ステップ実行
- [ ] `runLoop` が `watcherConfig` あり、時間枠外で呼ばれた場合、ループ break + 警告
- [ ] テスト: 全13ケース以上、カバレッジ80%以上
- [ ] 犯罪: 0件維持
- [ ] `[::STUB::]`: 0件維持
- [ ] 依存関係: P6-1 / P6-2 / P7-1 / P7-2 の公開API変更なし（後方互換）
