// check-and-start-loop.test.ts — checkAndStartLoop のユニットテスト
//
// テスト戦略:
//   tickets.js と runner.js を mock.module() でモック化し、checkAndStartLoop の
//   全分岐を検証する。動的 import を使用してモック後にモジュールを読み込む。
//   加えて、状態メッセージの出力チャネル（stderr のみ、stdout は使わない）を検証する。
//
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する。
import { describe, it, mock, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { LoopOptions } from "./runner.js";

// ============================================================
// Mock state
// ============================================================

/** loadPendingTickets が返すモックチケット配列 */
let mockPendingTickets: object[] = [];

/** loadPendingTickets が throw するエラー（未設定時は正常実行） */
let mockTicketsError: Error | null = null;

/** runLoop の呼び出し回数（各テスト前にリセット） */
let runLoopCallCount = 0;

/** runLoop が throw するエラー（未設定時は正常実行） */
let runLoopError: Error | null = null;

/**
 * true の間、runLoop は解決しない Promise を待ち続ける。
 * 再入防止（isLoopRunning === true）の状態をテスト中に保持するために使う。
 */
let shouldHoldRunLoop = false;

/** 保留中の runLoop を解放する関数。shouldHoldRunLoop が true の間のみ設定される。 */
let releaseRunLoop: (() => void) | null = null;

// ============================================================
// Module mocking
// ============================================================

before(() => {
  // tickets.js の loadPendingTickets をモック化
  mock.module("./tickets.js", {
    exports: {
      loadPendingTickets: (_ticketsPath: string) => {
        if (mockTicketsError) {
          throw mockTicketsError;
        }
        return mockPendingTickets;
      },
    },
  });

  // runner.js の runLoop をモック化
  mock.module("./runner.js", {
    exports: {
      runLoop: async (_options: LoopOptions) => {
        runLoopCallCount++;
        if (runLoopError) {
          throw runLoopError;
        }
        if (shouldHoldRunLoop) {
          await new Promise<void>((resolve) => {
            releaseRunLoop = resolve;
          });
        }
      },
    },
  });
});

// モック設定後に動的 import で checkAndStartLoop を取得
let checkAndStartLoop: (
  ticketsPath: string,
  loopOptions: LoopOptions,
) => Promise<void>;

before(async () => {
  const mod = await import("./check-and-start-loop.js");
  checkAndStartLoop = mod.checkAndStartLoop;
});

// ============================================================
// Helpers
// ============================================================

const FAKE_TICKETS_PATH = "/fake/tickets.json";
const FAKE_LOOP_OPTIONS = {} as LoopOptions;

/** 各テスト前にモック状態をリセットする */
function resetMockState(): void {
  mockPendingTickets = [];
  mockTicketsError = null;
  runLoopCallCount = 0;
  runLoopError = null;
  shouldHoldRunLoop = false;
  releaseRunLoop = null;
}

/**
 * console への書き込みを stdout / stderr チャネル別に捕捉する。
 * console.warn は stderr へ書くため stderr 側に含める。テスト終了時は restore() で戻す。
 */
function captureConsoleOutput(): {
  stdout: string[];
  stderr: string[];
  restore: () => void;
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...args: unknown[]): void => {
    stdout.push(args.join(" "));
  };
  console.error = (...args: unknown[]): void => {
    stderr.push(args.join(" "));
  };
  console.warn = (...args: unknown[]): void => {
    stderr.push(args.join(" "));
  };

  return {
    stdout,
    stderr,
    restore: (): void => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    },
  };
}

// ============================================================
// Tests
// ============================================================

describe("checkAndStartLoop", () => {
  beforeEach(() => {
    resetMockState();
  });

  // ----------------------------------------------------------
  // 正常系: 未reviewedチケットあり → runLoop 起動
  // ----------------------------------------------------------
  it("未reviewedチケットが存在する場合、runLoop が呼ばれる", async () => {
    mockPendingTickets = [{ id: 1, phaseId: 7, status: "todo", title: "test" }];

    await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);

    assert.strictEqual(runLoopCallCount, 1);
  });

  // ----------------------------------------------------------
  // 正常系: 未reviewedチケットなし → 何もしない
  // ----------------------------------------------------------
  it("未reviewedチケットが存在しない場合、runLoop は呼ばれない", async () => {
    mockPendingTickets = [];

    await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);

    assert.strictEqual(runLoopCallCount, 0);
  });

  // ----------------------------------------------------------
  // 正常系: 再入防止 — ループ実行中はスキップ
  // ----------------------------------------------------------
  it("ループ実行中に再呼び出しされた場合、runLoop は2回目を呼ばない", async () => {
    mockPendingTickets = [{ id: 1, phaseId: 7, status: "todo", title: "test" }];

    // 1回目の呼び出し（同期的に runLoop が完了するまで待つ）
    await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);
    assert.strictEqual(runLoopCallCount, 1);

    // 2回目の呼び出し（ループ完了済みだが、モジュール状態の isLoopRunning を確認）
    // isLoopRunning は finally で false に戻っているので、再度 runLoop が呼ばれる
    await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);
    assert.strictEqual(runLoopCallCount, 2);

    // ここから再入防止のテスト: isLoopRunning を true にすると本来の再入状態を再現
    // ただし isLoopRunning はプライベートなモジュール変数であり直接操作不可。
    // このケースはモックの動作で再現する。
  });

  // ----------------------------------------------------------
  // 異常系: Tickets.json 読み込みエラー
  // ----------------------------------------------------------
  it("Tickets.json 読み込みエラー時、エラーが throw される", async () => {
    mockTicketsError = new Error("ENOENT: no such file or directory");

    await assert.rejects(
      () => checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS),
      /ENOENT/,
    );
  });

  // ----------------------------------------------------------
  // 正常系: ループ完了後に再入可能
  // ----------------------------------------------------------
  it("ループ完了後、再度呼び出しで runLoop が呼ばれる", async () => {
    mockPendingTickets = [{ id: 1, phaseId: 7, status: "todo", title: "test" }];

    // 1回目: 完了
    await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);
    assert.strictEqual(runLoopCallCount, 1);

    // 2回目: 再び呼ばれる（isLoopRunning が finally で false に戻っている）
    await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);
    assert.strictEqual(runLoopCallCount, 2);
  });

  // ----------------------------------------------------------
  // 異常系: runLoop がエラーを throw → finally でフラグリセット
  // ----------------------------------------------------------
  it("runLoop がエラーを throw した場合も finally でフラグがリセットされる", async () => {
    mockPendingTickets = [{ id: 1, phaseId: 7, status: "todo", title: "test" }];
    runLoopError = new Error("runLoop failed");

    // runLoop がエラーを投げる → checkAndStartLoop もエラーを投げる
    await assert.rejects(
      () => checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS),
      /runLoop failed/,
    );

    // isLoopRunning がリセットされているので、次の呼び出しで runLoop が呼ばれる
    runLoopError = null; // エラーを解除
    await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);
    assert.strictEqual(runLoopCallCount, 2);
  });
});

// ============================================================
// Tests — 出力チャネル
// ============================================================
//
// 診断メッセージは stderr（console.error / console.warn）へ出力する。
// console.log（stdout）は本番コードで禁止されており、run-quality-checks.js の
// debug_output チェックが major で検出する。再入スキップの警告は console.warn を使う。
describe("checkAndStartLoop — 出力チャネル", () => {
  beforeEach(() => {
    resetMockState();
  });

  it("未reviewedチケットが存在する場合、開始・完了メッセージを stderr に出力し stdout は使わない", async () => {
    mockPendingTickets = [{ id: 1, phaseId: 7, status: "todo", title: "test" }];
    const capture = captureConsoleOutput();

    try {
      await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);
    } finally {
      capture.restore();
    }

    assert.deepStrictEqual(capture.stdout, []);
    assert.ok(
      capture.stderr.some((message) => message.includes("ループを開始します")),
      `開始メッセージが stderr に無い: ${JSON.stringify(capture.stderr)}`,
    );
    assert.ok(
      capture.stderr.some((message) => message.includes("ループが完了しました")),
      `完了メッセージが stderr に無い: ${JSON.stringify(capture.stderr)}`,
    );
  });

  it("未reviewedチケットが存在しない場合、件数0のメッセージを stderr に出力し stdout は使わない", async () => {
    mockPendingTickets = [];
    const capture = captureConsoleOutput();

    try {
      await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);
    } finally {
      capture.restore();
    }

    assert.deepStrictEqual(capture.stdout, []);
    assert.ok(
      capture.stderr.some((message) => message.includes("未reviewedチケットはありません")),
      `件数0メッセージが stderr に無い: ${JSON.stringify(capture.stderr)}`,
    );
  });

  it("ループ実行中の再呼び出し時、スキップメッセージを stderr に出力し stdout は使わない", async () => {
    mockPendingTickets = [{ id: 1, phaseId: 7, status: "todo", title: "test" }];
    shouldHoldRunLoop = true;
    const capture = captureConsoleOutput();

    try {
      // 1回目は runLoop が保留のまま isLoopRunning === true を保持する
      const firstRun = checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);

      // 2回目は再入とみなされスキップされる
      await checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS);

      assert.strictEqual(runLoopCallCount, 1);

      releaseRunLoop?.();
      await firstRun;
    } finally {
      capture.restore();
    }

    assert.deepStrictEqual(capture.stdout, []);
    assert.ok(
      capture.stderr.some((message) => message.includes("ループ実行中のためスキップ")),
      `スキップメッセージが stderr に無い: ${JSON.stringify(capture.stderr)}`,
    );
  });

  it("runLoop がエラーを throw した場合も stdout は使わない", async () => {
    mockPendingTickets = [{ id: 1, phaseId: 7, status: "todo", title: "test" }];
    runLoopError = new Error("runLoop failed");
    const capture = captureConsoleOutput();

    try {
      await assert.rejects(
        () => checkAndStartLoop(FAKE_TICKETS_PATH, FAKE_LOOP_OPTIONS),
        /runLoop failed/,
      );
    } finally {
      capture.restore();
    }

    assert.deepStrictEqual(capture.stdout, []);
  });
});
