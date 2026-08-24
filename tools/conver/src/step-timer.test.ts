// step-timer.test.ts — step-timer.ts のユニットテスト
//
// テスト対象: isWithinTimeWindow(), checkStepDeadline()
// テスト戦略:
//   - null/undefined の後方互換テスト: モック不要、純粋ロジック
//   - 時間枠判定テスト: mock.module で isInTimeWindow を制御
//   - エラー伝播テスト: mock で throw させて伝播確認
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { WatcherConfig } from "./watcher.js";

// isInTimeWindow をモック化。テストごとに mockImplementation で制御する
// 第5引数（daysOfWeek）は伝播検証のために捕捉する。
// [::TICKET::] PX-173 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-173 --for-spec --no-implementation-order`.
const mockIsInTimeWindow = mock.fn(
  (
    _now: Date,
    _start: string,
    _end: string,
    _tz: string,
    _daysOfWeek?: number[],
  ): boolean => true,
);

mock.module("./time-window.js", {
  namedExports: {
    isInTimeWindow: mockIsInTimeWindow,
  },
});

// モック適用後に動的 import で step-timer を読み込む
const { isWithinTimeWindow, checkStepDeadline } = await import(
  "./step-timer.js"
);

// テスト用の WatcherConfig
const TEST_CONFIG: WatcherConfig = {
  intervalMinutes: 60,
  startTime: "09:00",
  endTime: "17:00",
  timezone: "UTC",
};

// ============================================================
// isWithinTimeWindow のテスト
// ============================================================
describe("isWithinTimeWindow", () => {
  // afterEach 相当の処理を各テストの先頭で行う（型定義の制約による代替）

  // --- 後方互換性 ---

  it("config=null → true（後方互換）", () => {
    assert.strictEqual(isWithinTimeWindow(null), true);
    // null の場合は isInTimeWindow が呼ばれない
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 0);
  });

  it("config=undefined → true（後方互換）", () => {
    assert.strictEqual(isWithinTimeWindow(undefined), true);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 0);
  });

  // --- 時間枠内 ---

  it("時間枠内（isInTimeWindow=true）→ true", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => true);
    assert.strictEqual(isWithinTimeWindow(TEST_CONFIG), true);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 1);
  });

  // --- 時間枠外 ---

  it("時間枠外開始前（isInTimeWindow=false）→ false", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => false);
    assert.strictEqual(isWithinTimeWindow(TEST_CONFIG), false);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 1);
  });

  it("時間枠外終了後（isInTimeWindow=false）→ false", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => false);
    assert.strictEqual(isWithinTimeWindow(TEST_CONFIG), false);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 1);
  });

  // --- 日跨ぎ ---

  it("日跨ぎ時間枠内（isInTimeWindow=true）→ true", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => true);
    const crossDayConfig: WatcherConfig = {
      intervalMinutes: 60,
      startTime: "22:00",
      endTime: "06:00",
      timezone: "UTC",
    };
    assert.strictEqual(isWithinTimeWindow(crossDayConfig), true);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 1);
  });

  it("日跨ぎ時間枠外（isInTimeWindow=false）→ false", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => false);
    const crossDayConfig: WatcherConfig = {
      intervalMinutes: 60,
      startTime: "22:00",
      endTime: "06:00",
      timezone: "UTC",
    };
    assert.strictEqual(isWithinTimeWindow(crossDayConfig), false);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 1);
  });

  // --- 引数伝播確認 ---

  it("isInTimeWindow に正しい引数が渡される", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => true);
    isWithinTimeWindow(TEST_CONFIG);
    const call = mockIsInTimeWindow.mock.calls[0];
    assert.ok(call.arguments[0] instanceof Date); // 第一引数は Date
    assert.strictEqual(call.arguments[1], "09:00"); // startTime
    assert.strictEqual(call.arguments[2], "17:00"); // endTime
    assert.strictEqual(call.arguments[3], "UTC"); // timezone
  });

  // @verifies C003
  it("isWithinTimeWindow が config.daysOfWeek を第5引数として isInTimeWindow に渡す", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => true);
    const configWithDays: WatcherConfig = { ...TEST_CONFIG, daysOfWeek: [1, 2, 3] };

    assert.strictEqual(isWithinTimeWindow(configWithDays), true);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 1);
    assert.deepStrictEqual(mockIsInTimeWindow.mock.calls[0].arguments[4], [1, 2, 3]);
  });
});

// ============================================================
// checkStepDeadline のテスト
// ============================================================
describe("checkStepDeadline", () => {
  // afterEach 相当の処理を各テストの先頭で行う（型定義の制約による代替）

  // --- 後方互換性 ---

  it("config=null → true（常に通過）", () => {
    mockIsInTimeWindow.mock.resetCalls();
    assert.strictEqual(checkStepDeadline("make-ticket", null), true);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 0);
  });

  it("config=undefined → true（常に通過）", () => {
    mockIsInTimeWindow.mock.resetCalls();
    assert.strictEqual(checkStepDeadline("make-ticket", undefined), true);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 0);
  });

  // --- 時間枠内 ---

  it("時間枠内 → true（実行可）", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => true);
    assert.strictEqual(checkStepDeadline("start-ticket", TEST_CONFIG), true);
    assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 1);
  });

  // --- 時間枠外（console.warn） ---

  it("時間枠外 → false + console.warn 発行", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => false);

    // console.warn を spy する
    const warnCalls: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args.map(String).join(" "));
    };

    try {
      const result = checkStepDeadline("review-ticket", TEST_CONFIG);

      assert.strictEqual(result, false);
      assert.strictEqual(mockIsInTimeWindow.mock.calls.length, 1);
      assert.ok(warnCalls.length >= 1);
      assert.ok(warnCalls[0].includes("review-ticket"));
      assert.ok(warnCalls[0].includes("17:00")); // endTime
    } finally {
      console.warn = originalWarn;
    }
  });

  // --- エラー伝播 ---

  it("不正な config で isInTimeWindow が throw → エラー伝播", () => {
    mockIsInTimeWindow.mock.resetCalls();
    mockIsInTimeWindow.mock.mockImplementation(() => {
      throw new Error("無効な時刻形式");
    });

    const badConfig = { ...TEST_CONFIG, startTime: "invalid" };
    assert.throws(
      () => checkStepDeadline("make-ticket", badConfig),
      /無効な時刻形式/,
    );
  });
});
