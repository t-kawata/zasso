---
ticket_id: 32
title: CronScheduler — node-cron ジョブ管理
slug: cronscheduler-node-cron
status: draft
created_at: 2026-07-01
updated_at: 2026-07-01
---
# CronScheduler — node-cron ジョブ管理

## Summary

`node-cron` パッケージを使用して、WatcherConfig の `intervalMinutes` に基づく cron ジョブを設定・起動・停止する `CronScheduler` クラスを実装する。スケジューラは指定された間隔でコールバック関数を呼び出し、`start()` / `stop()` / `isRunning()` のライフサイクルを持つ。

## Background

conver.js の Watcher モード（P8-3 で統合）では、指定された間隔（intervalMinutes）でチケット処理を繰り返し実行する必要がある。既存の実装状況：

- **P6-1 (WatcherConfig 型定義)** は完了済み。`src/watcher.ts` に `WatcherConfig` インターフェース（`intervalMinutes`, `startTime`, `endTime`, `timezone`）とバリデーション関数が実装されている
- **P6-2 (時間窓判定)** は完了済み。`src/time-window.ts` に `isInTimeWindow()` が実装され、日跨ぎ判定に対応している
- **cli.ts** には `-w/--watcher` フラグは未実装（P8-2 のスコープ）
- **runner.ts** に watcher モードの起動パスは未実装（P8-3 のスコープ）
- **`node-cron` パッケージは未インストール**。`package.json` に依存関係として追加する必要がある

CronScheduler はこれらの下位レイヤーと Watcher モード起動パス（P8-3）の間に位置する Layer 2 のコンポーネントであり、`node-cron` のラッパーとして動作する。

## Scope

### 成果物

- `src/cron-scheduler.ts` — CronScheduler クラス実装
- `src/cron-scheduler.test.ts` — ユニットテスト

### 公開API

```typescript
export class CronScheduler {
  constructor(config: WatcherConfig);
  start(callback: () => void): void;    // ジョブ開始
  stop(): void;                          // ジョブ停止
  isRunning(): boolean;                  // 実行中か
}
```

### 内部設計

- `constructor`: WatcherConfig の `intervalMinutes` から cron 式を生成し、内部状態を初期化
- `start()`: コールバック関数を受け取り、`node-cron.schedule()` でジョブを登録・開始。既に起動中なら二重起動を防止
- `stop()`: `cronTask.stop()` でジョブを停止。未起動なら何もしない
- `isRunning()`: 現在の実行状態を返す
- cron 式への変換: `intervalMinutes` → cron 式文字列

### エラーハンドリング

- 不正な intervalMinutes（0以下、非整数）がコンストラクタに渡された場合、`Error` を throw
- 無効な cron 式（`node-cron.validate()` で検証）の場合、`Error` を throw
- start() が既に起動中のジョブに対して呼ばれた場合、何もせず正常終了（二重起動防止）
- stop() が未起動のジョブに対して呼ばれた場合、何もせず正常終了（冪等性確保）

### スケジュール式の計算

- `intervalMinutes` が 60 以下 → `*/N * * * *`（N 分ごと）
- `intervalMinutes` が 60 の倍数（60, 120, ...）→ `0 */N * * *`（N 時間ごと、毎時0分に実行）
- 60 超かつ60の倍数でない → `*/N * * * *` のまま（N分ごと）
- 検証: `node-cron.validate()` で有効性を確認し、無効なら throw

## Non-scope

- 時間窓判定（P6-2 で実装済み）— CronScheduler は時間窓の判定は行わない。時間窓による制御は上位レイヤー（P8-3 または runner.ts）の責務
- CLI引数 `-w/--watcher` の追加（P8-2）
- Watcher モードの起動パス統合（P8-3）
- 複数ジョブの同時管理 — CronScheduler は単一ジョブのみ管理する
- Slack 通知の統合
- `node-cron` のタイムゾーン機能 — CronScheduler はシンプルな interval ベースで動作し、タイムゾーン変換は上位レイヤーで行う
- スケジュールの永続化 — プロセス再起動時のジョブ復元は対象外

## Investigation

### 既存コードパターンの確認

1. **TypeScript テストパターン**（`src/time-window.test.ts`, `src/watcher.test.ts`）:
   - `node:test` の `describe`/`it` で構造化
   - `node:assert/strict` で検証
   - テストファイルは `src/*.test.ts` に配置、実行は `dist/` の compiled JS に対して行う
   - モックが必要な場合は `node:test` の `mock.module()` と `mock.method()` を使用（`src/conver.test.ts` のパターンを参照）

2. **モジュール解決**:
   - NodeNext のため相対import は `.js` 拡張子が必要（`tsconfig.json:4`）
   - 例: `import { CronScheduler } from "./cron-scheduler.js"`

3. **node-cron のAPI**:
   - `import cron from "node-cron"`
   - `cron.schedule(expression: string, callback: () => void, options?: { scheduled?: boolean, timezone?: string }): CronTask`
   - `cron.validate(expression: string): boolean`
   - `CronTask.start()`, `CronTask.stop()`, `CronTask.destroy()`
   - `CronTask` の実行状態は外部から確認できないため、CronScheduler が内部状態変数（`#isActive`）で管理する

4. **既存の依存関係**:
   - `package.json`（`tools/conver/package.json`）: 現時点で `node-cron` は未インストール
   - `npm install node-cron` と `npm install -D @types/node-cron` が必要

5. **Makefile のテストターゲット**（`tools/conver/Makefile:21-22`）:
   ```
   test-conver:
           npx tsc && node --experimental-test-module-mocks --test dist/error.test.js ...
   ```
   - テストは `npx tsc` でコンパイル後に `node --test` で実行
   - `--experimental-test-module-mocks` フラグが有効（`mock.module()` を使用できる）

### コード配置の設計判断

CronScheduler クラスの配置先として、`src/cron-scheduler.ts` を新規作成する。理由：
- 既存の `src/watcher.ts` は型定義と設定ファイル読み込みに特化しており、ジョブスケジューリングの責務を混在させるべきではない
- `src/runner.ts` はチケットパイプラインの制御に特化しており、cron 管理ロジックは独立した関心事
- Layer 構成に従い、CronScheduler は Layer 2（I/O・副作用を持つコンポーネント）として位置づける

### テスト手法

- `node-cron` の `cron.schedule()` はモジュールモックで代替する（`mock.module("node-cron", ...)`）
- 実際のタイミング制御（指定された間隔でコールバックが呼ばれること）は、モックで注入した `schedule` 関数の呼び出しを確認することで検証する
- 実際の `node-cron` の時間精度は結合テストで確認する（スコープ外）

## Test Plan

### ユニットテスト計画

テスト対象: `src/cron-scheduler.ts` — `CronScheduler` クラスの全公開メソッド

#### テスト戦略

`node-cron` モジュールを `mock.module()` でモック化し、以下の動作を検証する：

- `cron.schedule()` が正しい cron 式とコールバックで呼ばれること
- `CronTask.start()` / `CronTask.stop()` が適切に呼ばれること
- 二重起動・二重停止が防止されること
- 不正な intervalMinutes でコンストラクタがエラーを投げること

#### CronScheduler のテスト

| カテゴリ | ケース | 検証内容 |
|---------|--------|---------|
| 正常系 | コンストラクタ + start() | cron.schedule() が intervalMinutes を正しい cron 式に変換して呼ばれる |
| 正常系 | start() → コールバック実行 | モックの cronTask が start() され、コールバック経由でユーザー処理が呼ばれる |
| 正常系 | stop() → ジョブ停止 | cronTask.stop() が呼ばれる |
| 正常系 | isRunning() → false（未起動） | コンストラクタ直後は false |
| 正常系 | start() → isRunning() → true | 起動後は true |
| 正常系 | stop() → isRunning() → false | 停止後は false |
| 正常系 | 二重起動防止: start() 2回 → 2回目は cron.schedule() を呼ばない | 内部ガードで防止 |
| 正常系 | 二重停止防止: stop() 2回 → 2回目は cronTask.stop() を呼ばない | 冪等性確保 |
| 正常系 | intervalMinutes=1（最小値）→ `*/1 * * * *` | cron 式変換が正しい |
| 正常系 | intervalMinutes=60 → `0 * * * *`（毎時0分） | 60分=1時間の変換 |
| 正常系 | intervalMinutes=120 → `0 */2 * * *`（2時間ごと） | 時間単位の変換 |
| 異常系 | intervalMinutes=0 → コンストラクタが Error を throw | 無効な値の拒否 |
| 異常系 | intervalMinutes=-1 → コンストラクタが Error を throw | 負数の拒否 |
| 異常系 | intervalMinutes=1.5（小数）→ コンストラクタが Error を throw | 非整数の拒否 |
| 異常系 | cron.schedule() が throw → start() が Error を throw | エラー伝播の確認 |

#### カバレッジ目標

- CronScheduler 全メソッド: 100%（モックにより全分岐をカバー可能）
- intervalMinutes の cron 式変換ロジック: 100%（3パターン以上で確認）

### ユニットテスト不可能な項目（例外）

- **理由1: `node-cron` の実際のタイミング制御精度** — 実時間に依存する挙動（「指定された間隔でコールバックが正確に呼ばれるか」）は、モックされた `schedule()` の呼び出し検証では確認できない。これは P7-2（定期点検ロジック）との結合テスト、または手動の実時間テストで確認する。
- **理由2: `node-cron` の内部動作やバグ** — サードパーティライブラリの内部実装はテスト対象外。

### モック設計

```typescript
// node-cron モジュールのモック形状
interface MockCronTask {
  start: ReturnType<typeof mock.fn>;
  stop: ReturnType<typeof mock.fn>;
}

// mock.module("node-cron", ...) で注入する模擬モジュール
const mockCronModule = {
  default: {
    schedule: mock.fn((expression: string, callback: () => void) => {
      const task: MockCronTask = {
        start: mock.fn(),
        stop: mock.fn(),
      };
      return task;
    }),
    validate: mock.fn((expression: string) => true),
  },
};
```

## Boy Scout Rule — 翻訳可能性計画

新規作成する `src/cron-scheduler.ts` は最初から翻訳可能性を確保する：

1. **関数名は動詞句**: `start()`, `stop()`, `isRunning()` — メソッド呼び出しの並びがライフサイクルを物語る
2. **変数名はドメイン概念**: `intervalMinutes`, `cronExpression`, `isActive` — ロジックを読まずとも役割が理解できる
3. **一関数一責務**: コンストラクタは設定検証と cron 式生成、start/stop はジョブ制御のみ。cron 式生成はプライベートメソッド `#buildCronExpression()` に分離
4. **ハードコード値は名前付き定数**: cron 式のフォーマット文字列、intervalMinutes の最小値・最大値はモジュール定数として定義
5. **エラー握りつぶし禁止**: 不正な intervalMinutes はコンストラクタで throw、cron 式の検証エラーも throw、start() のエラーはコールバック内で握りつぶさず上位に伝播
6. **プライベートフィールド**: 内部状態は `#cronTask`, `#isActive` 等のプライベートフィールドでカプセル化し、外部からの直接アクセスを禁止

既存コードの改善はスコープ外（新規ファイル作成のみのため）。

## Acceptance Criteria

- [ ] `CronScheduler` クラスが `constructor`, `start()`, `stop()`, `isRunning()` の公開メソッドを持つ
- [ ] `start(callback)` が `node-cron.schedule()` で cron ジョブを登録し起動する
- [ ] `stop()` がジョブを停止する（冪等）
- [ ] `isRunning()` が正しい実行状態を返す（false → true → false の遷移）
- [ ] 二重起動を防止する
- [ ] 不正な intervalMinutes に対してエラーを投げる
- [ ] 翻訳可能性の検証が通っている
- [ ] 既存テストが通過している（`make test` が成功）
- [ ] `node-cron` と `@types/node-cron` が依存関係として追加されている

## Notes

### 依存関係

| 方向 | チケット | 関係 |
|------|---------|------|
| 入力 | P6-1 (WatcherConfig) | `WatcherConfig.intervalMinutes` をコンストラクタで受け取る |
| 入力 | P6-2 (時間窓判定) | `isInTimeWindow()` は上位レイヤー（P8-3）で使用。CronScheduler は直接使用しない |
| 出力→ | P8-3 (Watcher 起動パス) | CronScheduler の start/stop を runner.ts が呼び出す |
| 出力→ | P7-2 (定期点検ロジック) | 定期点検のコールバックを CronScheduler に登録する |

### 結合テスト計画

- P8-3（Watcher 起動パス）実装後に、CronScheduler + isInTimeWindow の結合テストを追加
- P7-2（定期点検ロジック）実装後に、スケジューラが定期点検を正しく呼び出す結合テストを追加

### 実装順序

1. `npm install node-cron` + `npm install -D @types/node-cron`
2. `src/cron-scheduler.ts` 作成
3. `src/cron-scheduler.test.ts` 作成
4. Makefile の `test-conver` ターゲットにテストファイル追加
5. `make test` で全テスト通過確認

### 成果物の保存先

各成果物は Tickets.json のチケットフィールドに JSON として保存される。

- **計画**: `scope[]`, `testVerification[]`, `testExceptions[]`, `notes` フィールド
- **実装サマリ**: `changes[]`, `notes` フィールド
- **レビュー報告書**: `instrumentation`, `notes`, `rfcDiscrepancies[]` フィールド
