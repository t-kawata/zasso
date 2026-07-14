---
ticket_id: 33
title: 定期点検ロジック — 未reviewedチケット確認とループ起動
slug: review-and-start-loop
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
ticket_key: P7-2
---
# 定期点検ロジック — 未reviewedチケット確認とループ起動

## Summary

CronScheduler から定期実行されるコールバック関数 `checkAndStartLoop()` を実装する。
Tickets.json に未reviewedチケットが存在する場合に既存のループ（`runLoop`）を起動し、
処理が完了したら次の定期点検まで待機する。

## Background

conver.js の Watcher モード（P8-3 で統合）では、CronScheduler（P7-1 で実装済み）が
`intervalMinutes` 間隔でコールバックを呼び出す。このコールバックとして動作するのが
P7-2 の `checkAndStartLoop()` である。

既存の実装状況：

- **P6-1 (WatcherConfig 型定義)**: 完了済み。`src/watcher.ts` に `WatcherConfig` 定義。
- **P6-2 (時間窓判定)**: 完了済み。`src/time-window.ts` に `isInTimeWindow()` 実装。
- **P7-1 (CronScheduler)**: 完了済み。`src/cron-scheduler.ts` に `CronScheduler` クラス実装。
  - コールバック型: `() => void`（同期的な fire-and-forget）
- **P1-1 (tickets.ts)**: 完了済み。`loadPendingTickets()` および `checkAllReviewed()` が利用可能。
- **P4-1 (runner.ts)**: 完了済み。`runLoop(options)` がチケット処理パイプラインを実行する。

P7-2 はこれらの Layer 2/3 コンポーネントの橋渡しとして位置づけられる。

## Scope

### 成果物

- `src/check-and-start-loop.ts` — `checkAndStartLoop` 関数の実装
- `src/check-and-start-loop.test.ts` — ユニットテスト
- `Makefile` — `test-conver` ターゲットにテストファイル追加

### 公開API

```typescript
import type { LoopOptions } from "./runner.js";

/**
 * CronScheduler の定期コールバックとして動作し、未reviewedチケットが
 * 存在する場合にループを開始する。ループ実行中は再実行を防止する。
 * @param ticketsPath Tickets.json のファイルパス
 * @param loopOptions runLoop に渡すオプション
 * @returns ループ完了時に解決。ループ不要時は即時解決。
 */
export function checkAndStartLoop(
  ticketsPath: string,
  loopOptions: LoopOptions,
): Promise<void>
```

### 内部設計

**処理フロー:**

1. `loadPendingTickets(ticketsPath)` で未reviewedチケットを取得
2. 件数が 0 なら何もせず即時 return（ログ出力のみ）
3. 件数が 1 以上なら `runLoop(loopOptions)` を呼び出し
4. runLoop 完了後に終了（完了ログ出力）
5. エラー時はエラーログ出力＋上位に伝播

**再入防止:**

```typescript
/** ループ実行中フラグ（モジュールスコープ） */
let isLoopRunning = false;

export async function checkAndStartLoop(
  ticketsPath: string,
  loopOptions: LoopOptions,
): Promise<void> {
  if (isLoopRunning) {
    console.log("[Watcher] ループ実行中のためスキップします。");
    return;
  }
  isLoopRunning = true;
  try {
    // ... メイン処理
  } finally {
    isLoopRunning = false;
  }
}
```

**CronScheduler との連携:**

- `CronScheduler` のコールバック型は `() => void`（同期的）
- `checkAndStartLoop` は `async` 関数として実装し、呼び出し元で fire-and-forget 的に動作させる
- 実際の結合は P8-3（エントリポイント統合）で行う

```typescript
// P8-3 での結合例:
const scheduler = new CronScheduler(config);
scheduler.start(async () => {
  await checkAndStartLoop(ticketsPath, loopOptions);
});
```

### エラーハンドリング

- `loadPendingTickets` のエラー（ファイル不在、JSONパースエラー）→ `try-catch` で捕捉しログ出力後 throw
- `runLoop` のエラー（内部で process.exit(1) されなければ）→ try-catch で捕捉しログ出力後 throw
- 再入防止フラグは `try-finally` で必ずリセット

### Watcher モードでの使用

P7-2 の `checkAndStartLoop` は P8-3 で CronScheduler のコールバックとして登録される。
ループ実行中は再入防止により次の定期点検がスキップされるため、間隔が短く設定されていても
安全に動作する。

## Non-scope

- CronScheduler の実装（P7-1 で完了済み）— 本チケットは CronScheduler のユーザー側
- Watcher モードのエントリポイント統合（P8-3）— 本チケットでは CronScheduler との結合は行わず、
  関数の独立したユニットとして実装する
- 時間窓判定（P6-2 で実装済み）— 時間窓による制御は上位レイヤー（P8-3）の責務
- CLI引数 `-w/--watcher` の追加（P8-2）
- Slack通知の統合 — `runLoop` 内部での通知は既存のまま、本関数では追加の通知は行わない
- 複数設定ファイルの同時監視

## Investigation

### 既存コードパターンの確認

1. **runner.ts のインターフェース**（`src/runner.ts:43-55`）:
   - `LoopOptions` は全フィールド必須。P7-2 はこれらの全フィールドをそのまま受け取り `runLoop` に渡す
   - `export async function runLoop(options: LoopOptions): Promise<void>`
   - `runLoop` は内部で `loadPendingTickets` を呼び出しているが、P7-2 では二重呼び出しではなく
     「未reviewed の有無を事前確認する」という目的で独立して呼び出す

2. **tickets.ts の loadPendingTickets**（`src/tickets.ts:55-63`）:
   - `readFileSync` + `JSON.parse` で読み込み、`flatMap` で全 phase のチケットをフラット化
   - `status !== "reviewed"` でフィルタ
   - ファイルI/O を含むため、テストではモックが必要

3. **テスト用のモックパターン**（`src/cron-scheduler.test.ts` のパターン）:
   - `mock.module("node:fs", ...)` で `readFileSync` をモック化
   - `mock.method(fs, "readFileSync", ...)` で特定のメソッドのみモック
   - `mock.fn()` でモック関数を生成し、呼び出し引数や戻り値を制御
   - `assert.strictEqual` で値の検証
   - `assert.rejects` で非同期エラーの検証

4. **CronScheduler のコールバック型**（`src/cron-scheduler.ts:131`）:
   - `start(callback: () => void): void` — 同期的シグネチャ
   - 実際に `async` 関数を渡しても動作する（Promise は無視される）

5. **既存のテストフレームワーク設定**:
   - `node:test` + `node:assert/strict`
   - `--experimental-test-module-mocks` フラグ有効
   - `npx tsc` でコンパイル後に `node --test` で実行
   - テストファイルは `src/*.test.ts` に配置

6. **Makefile のテストターゲット**（`tools/conver/Makefile:21-22`）:
   ```
   test-conver:
           npx tsc && node --experimental-test-module-mocks --test dist/error.test.js ...
   ```
   - テストファイル列挙に新しいファイルを追加する必要がある

### コード配置の設計判断

`checkAndStartLoop` 関数の配置先として、`src/check-and-start-loop.ts` を新規作成する。

- `src/runner.ts` に追加する選択肢もあるが、runner.ts は既に 386 行で
  「ループ制御（make→plan→start→review→resolve→find）」という単一責務を持つ。
  定期点検ロジックは「CronScheduler からのコールバックとしてループを開始する」という
  別の責務であり、独立ファイルとして分離する方が翻訳可能性の観点から優れている。
- `src/watcher.ts` は型定義とファイルバリデーションに特化しており、実行ロジックは混在させない。

### 再入防止の設計判断

- モジュールスコープの `let isLoopRunning = false` で管理する
- クラスインスタンスは不要（グローバル状態は Watcher 全体で1つのみ）
- `try-finally` で必ずリセットする
- 実際の CronScheduler との結合は P8-3 で行うため、P7-2 のユニットテストでは再入防止の
  みを検証し、CronScheduler との結合は結合テストのスコープとする

## Test Plan

### ユニットテスト計画

テスト対象: `src/check-and-start-loop.ts` — `checkAndStartLoop` 関数

#### モック設計

`node:fs` の `readFileSync` を `mock.method()` でモック化し、Tickets.json の
読み取り結果を制御する。`runLoop` もモック化して実際のループ実行を防止する。

```typescript
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";

// 未reviewedチケットありの Tickets.json データ
const PENDING_TICKETS_JSON = JSON.stringify({
  phases: [{ id: 7, tickets: [{ id: 2, phaseId: 7, status: "todo", title: "test" }] }],
});

// 全チケット reviewed の Tickets.json データ
const ALL_REVIEWED_JSON = JSON.stringify({
  phases: [{ id: 7, tickets: [{ id: 1, phaseId: 7, status: "reviewed", title: "test" }] }],
});
```

#### テストケース

| カテゴリ | ケース | 検証内容 |
|---------|--------|---------|
| 正常系 | 未reviewedチケットあり → runLoop が呼ばれる | `mock.method(runner, "runLoop", ...)` で呼び出しを検証 |
| 正常系 | 未reviewedチケットなし → runLoop が呼ばれない | 空チケットでも runLoop 未呼び出しを確認 |
| 正常系 | ループ実行中に再呼び出し → スキップされる | 2回目の呼び出しで runLoop が呼ばれない |
| 異常系 | Tickets.json 読み込みエラー → エラーが throw される | `readFileSync` がエラーを投げる設定で検証 |
| 正常系 | ループ完了後に再入可能になる | 一度完了→再度呼び出しで runLoop が呼ばれる |
| 異常系 | runLoop がエラーを throw → finally ブロックでフラグリセット | フラグが false に戻ることを確認 |

#### カバレッジ目標

- `checkAndStartLoop` 関数: 100%（全分岐をモックでカバー可能）
- 特に: 再入防止の分岐（running → skip）, エラーハンドリング, 正常系の3経路

### ユニットテスト不可能な項目（例外）

- **理由1: CronScheduler と checkAndStartLoop の結合** — P8-3（エントリポイント統合）実装後に、
  CronScheduler のコールバックとして登録→定期実行→ループ完了→次の定期点検の
  一連の流れは結合テストで検証する。
- **理由2: 実際のファイルI/O とプロセスライフサイクル** — モック化した `readFileSync` では
  実際のファイルシステム操作（ENOENT、パーミッションエラー等）の再現は限定的。
  必要なケースはモックのエラー注入でカバーする。

## Boy Scout Rule — 翻訳可能性計画

新規作成する `src/check-and-start-loop.ts` は最初から翻訳可能性を確保する：

1. **関数名は動詞句**: `checkAndStartLoop` — 「チェックして開始する」という一連の動作を名前に集約
2. **変数名はドメイン概念**: `pendingTickets`, `isLoopRunning`, `ticketsPath`, `loopOptions` —
   コードを読めば即座に役割が理解できる
3. **一関数一責務**: 関数は「未reviewedチケットの確認」と「ループ起動」の2つの責務を持つが、
   これはこの関数の目的そのものであり、関数名が両方を語る。内部で `loadPendingTickets` と
   `runLoop` を呼び出すことで、個々の詳細は委譲している
4. **再入防止フラグは明確な名前で**: `isLoopRunning` — ループ実行中の意味が一目でわかる
5. **エラー握りつぶし禁止**: エラーは catch でログ出力した上で throw により上位に伝播する。
   finally ブロックでリソース解放（フラグリセット）を保証
6. **早期 return**: 未reviewedチケットなし または ループ実行中は早期 return し、
   ネストを浅く保つ（翻訳可能性の維持）

既存コードの改善はスコープ外（新規ファイル作成のみのため）。

## Acceptance Criteria

- [ ] `checkAndStartLoop(ticketsPath, loopOptions)` が未reviewedチケット存在時に `runLoop` を起動する
- [ ] 未reviewedチケットが0件の場合、何もせず即時 return する
- [ ] ループ実行中に再呼び出しされた場合、スキップする（再入防止）
- [ ] ループ完了後に再入可能になる（フラグがリセットされる）
- [ ] Tickets.json 読み込みエラー時に適切にエラーを throw する
- [ ] runLoop のエラー時も finally ブロックでフラグがリセットされる
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している（`make test` が成功）
- [ ] Makefile の `test-conver` ターゲットが新しいテストファイルを含む

## Notes

### 依存関係

| 方向 | チケット | 関係 |
|------|---------|------|
| 入力 | P7-1 (CronScheduler) | CronScheduler のコールバックとして本関数が呼び出される |
| 入力 | P1-1 (tickets.ts) | `loadPendingTickets()` で未reviewedチケット有無を確認 |
| 入力 | P4-1 (runner.ts) | `runLoop()` を呼び出してチケット処理を実行 |
| 出力→ | P8-3 (Watcher 起動パス) | P8-3 で CronScheduler のコールバックとして本関数が登録される |
| 関連 | P8-1 (ステップ境界制御) | 時間窓による制御は P8-3 で isInTimeWindow と組み合わせて使用 |

### 実装順序

1. `src/check-and-start-loop.ts` 作成
2. `src/check-and-start-loop.test.ts` 作成
3. Makefile の `test-conver` ターゲットにテストファイル追加
4. `make test` で全テスト通過確認

### 結合テスト計画

- P8-3 実装後に、WatcherConfig 読み込み → CronScheduler 起動 → checkAndStartLoop → runLoop
  → 完了 → 次の定期点検 の一連の流れを結合テストで検証
- 特に: 時間窓外でのスキップ、時間窓内でのループ実行、複数回の定期点検でループが重複しないこと

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testUnit[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
