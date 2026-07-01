// cron-scheduler.test.ts — CronScheduler のユニットテスト
//
// テスト戦略:
//   node-cron モジュールを mock.module() でモック化し、cron.schedule() の
//   呼び出し確認と CronTask.start()/stop() の呼び出し確認で動作を検証する。
//   静的な import はモックが反映されないため、動的 import を使用する。
//
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する。
import { describe, it, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
// CronScheduler 型の参照のみ（動的 import で取得）
import type { CronScheduler as CronSchedulerType } from "./cron-scheduler.js";

/** node-cron のモックが生成する CronTask の型 */
interface MockCronTask {
  start: ReturnType<typeof mock.fn>;
  stop: ReturnType<typeof mock.fn>;
}

/** モック内部状態（テスト間で共有されるが各テストが new CronScheduler で独立） */
interface MockState {
  /** schedule に渡された最後の cron 式 */
  lastExpression: string;
  /** schedule に渡された最後のコールバック関数（テスト内で直接呼び出し可能） */
  lastCallback: (() => void) | null;
  /** 最後に生成された CronTask（start/stop の呼び出し検証用） */
  lastTask: MockCronTask | null;
  /** schedule が呼ばれた回数 */
  scheduleCallCount: number;
  /** schedule が throw するエラー（設定時） */
  scheduleError: Error | null;
  /** validate の戻り値 */
  validateResult: boolean;
  /** validate が呼ばれた回数 */
  validateCallCount: number;
  /** validate に渡された最後の式 */
  lastValidateExpression: string;
}

const mockState: MockState = {
  lastExpression: "",
  lastCallback: null,
  lastTask: null,
  scheduleCallCount: 0,
  scheduleError: null,
  validateResult: true,
  validateCallCount: 0,
  lastValidateExpression: "",
};

/** before() で動的 import した CronScheduler コンストラクタを保持する */
let CronScheduler: typeof CronSchedulerType;

before(async () => {
  // node-cron モジュールをモック化
  mock.module("node-cron", {
    exports: {
      default: {
        // schedule(expression, callback, options?) → CronTask
        schedule: (expression: string, callback: () => void) => {
          mockState.lastExpression = expression;
          mockState.lastCallback = callback;
          mockState.scheduleCallCount++;
          if (mockState.scheduleError) {
            throw mockState.scheduleError;
          }
          const task: MockCronTask = {
            start: mock.fn(),
            stop: mock.fn(),
          };
          mockState.lastTask = task;
          return task;
        },
        // validate(expression) → boolean
        validate: (expression: string) => {
          mockState.validateCallCount++;
          mockState.lastValidateExpression = expression;
          return mockState.validateResult;
        },
      },
    },
  });

  // モック設定後に動的 import で CronScheduler を取得
  const mod = await import("./cron-scheduler.js");
  CronScheduler = mod.CronScheduler;
});

// ============================================================
// CronScheduler のテスト
// ============================================================
describe("CronScheduler", () => {
  /** テスト用の有効な WatcherConfig */
  function validConfig(overrides?: Partial<{
    intervalMinutes: number;
    startTime: string;
    endTime: string;
    timezone: string;
  }>) {
    return {
      intervalMinutes: 30,
      startTime: "09:00",
      endTime: "17:30",
      timezone: "Asia/Tokyo",
      ...overrides,
    };
  }

  // 各テスト実行前にモック状態をリセット
  beforeEach(() => {
    mockState.lastExpression = "";
    mockState.lastCallback = null;
    mockState.lastTask = null;
    mockState.scheduleCallCount = 0;
    mockState.scheduleError = null;
    mockState.validateResult = true;
    mockState.validateCallCount = 0;
    mockState.lastValidateExpression = "";
  });

  // ============================================================
  // 正常系: ライフサイクル
  // ============================================================

  it("コンストラクタ → start() で cron.schedule() が呼ばれ isRunning() が true", () => {
    const scheduler = new CronScheduler(validConfig());
    assert.strictEqual(mockState.scheduleCallCount, 0);

    scheduler.start(() => {});

    // cron.schedule() が呼ばれたこと
    assert.strictEqual(mockState.scheduleCallCount, 1);
    assert.ok(mockState.lastExpression.length > 0, "cron 式が設定されている");
    // CronTask.start() が呼ばれたこと
    assert.strictEqual(mockState.lastTask!.start.mock.callCount(), 1);
    // isRunning() が true
    assert.strictEqual(scheduler.isRunning(), true);
  });

  it("start() → stop() で cronTask.stop() が呼ばれ isRunning() が false", () => {
    const scheduler = new CronScheduler(validConfig());
    scheduler.start(() => {});

    scheduler.stop();

    assert.strictEqual(mockState.lastTask!.stop.mock.callCount(), 1);
    assert.strictEqual(scheduler.isRunning(), false);
  });

  it("コンストラクタ直後の isRunning() は false", () => {
    const scheduler = new CronScheduler(validConfig());
    assert.strictEqual(scheduler.isRunning(), false);
  });

  // ============================================================
  // 正常系: 二重起動・二重停止防止
  // ============================================================

  it("start() を2回呼んでも cron.schedule() は1回のみ（二重起動防止）", () => {
    const scheduler = new CronScheduler(validConfig());
    scheduler.start(() => {});
    scheduler.start(() => {});

    assert.strictEqual(mockState.scheduleCallCount, 1);
    assert.strictEqual(mockState.lastTask!.start.mock.callCount(), 1);
  });

  it("stop() を2回呼んでも cronTask.stop() は1回のみ（二重停止防止）", () => {
    const scheduler = new CronScheduler(validConfig());
    scheduler.start(() => {});
    scheduler.stop();
    scheduler.stop();

    assert.strictEqual(mockState.lastTask!.stop.mock.callCount(), 1);
  });

  it("未起動状態で stop() を呼んでもエラーにならない（冪等性）", () => {
    const scheduler = new CronScheduler(validConfig());
    scheduler.stop();
    assert.strictEqual(scheduler.isRunning(), false);
  });

  // ============================================================
  // 正常系: cron 式の変換
  // ============================================================

  it("intervalMinutes=1 → */1 * * * *", () => {
    const scheduler = new CronScheduler(validConfig({ intervalMinutes: 1 }));
    scheduler.start(() => {});
    assert.strictEqual(mockState.lastExpression, "*/1 * * * *");
  });

  it("intervalMinutes=30 → */30 * * * *", () => {
    const scheduler = new CronScheduler(validConfig({ intervalMinutes: 30 }));
    scheduler.start(() => {});
    assert.strictEqual(mockState.lastExpression, "*/30 * * * *");
  });

  it("intervalMinutes=60 → 0 * * * *（毎時0分）", () => {
    const scheduler = new CronScheduler(validConfig({ intervalMinutes: 60 }));
    scheduler.start(() => {});
    assert.strictEqual(mockState.lastExpression, "0 * * * *");
  });

  it("intervalMinutes=120 → 0 */2 * * *（2時間ごと）", () => {
    const scheduler = new CronScheduler(validConfig({ intervalMinutes: 120 }));
    scheduler.start(() => {});
    assert.strictEqual(mockState.lastExpression, "0 */2 * * *");
  });

  // ============================================================
  // 異常系: 不正な intervalMinutes
  // ============================================================

  it("intervalMinutes=0 → コンストラクタが Error を throw", () => {
    assert.throws(
      () => new CronScheduler(validConfig({ intervalMinutes: 0 })),
      Error,
    );
  });

  it("intervalMinutes=-1 → コンストラクタが Error を throw", () => {
    assert.throws(
      () => new CronScheduler(validConfig({ intervalMinutes: -1 })),
      Error,
    );
  });

  it("intervalMinutes=1.5（小数）→ コンストラクタが Error を throw", () => {
    assert.throws(
      () => new CronScheduler(validConfig({ intervalMinutes: 1.5 })),
      Error,
    );
  });

  // ============================================================
  // 異常系: cron.schedule() のエラー伝播
  // ============================================================

  it("cron.schedule() が throw → start() も throw（エラー伝播）", () => {
    mockState.scheduleError = new Error("node-cron schedule error");
    const scheduler = new CronScheduler(validConfig());

    assert.throws(
      () => scheduler.start(() => {}),
      /node-cron schedule error/,
    );
    // エラー後も isRunning() は false のまま
    assert.strictEqual(scheduler.isRunning(), false);
  });

  // ============================================================
  // 正常系: コールバック実行
  // ============================================================

  it("start() で登録したコールバックが cron 経由で呼び出せる", () => {
    let called = false;
    const scheduler = new CronScheduler(validConfig());
    scheduler.start(() => {
      called = true;
    });

    // モックに保存されたコールバックを手動実行
    assert.notStrictEqual(mockState.lastCallback, null);
    mockState.lastCallback!();

    assert.strictEqual(called, true);
  });
});
