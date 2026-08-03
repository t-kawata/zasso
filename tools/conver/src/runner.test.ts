
// runner.test.ts — runner.ts のユニットテスト
//
// テスト方針:
//   mock.module() はモジュールごとに1度しか呼べないため、before() で全モックを
//   一括設定し、テスト間で共有する可変状態で挙動を制御する。
//   process.exit は関数上書きでモック化する。
//
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する。
import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LoopOptions } from "./runner.js";

// --- 共有モック状態 ---
// mock.module() は各モジュールに1度しか呼べないため、
// テスト間で挙動を切り替えるために共有オブジェクトを使用する。

const mockState = {
  runCommandImpl: async (_cmd: string): Promise<string> => "ok",
  slackCalls: [] as Array<{ ticketId: string; phase: string }>,
  /** checkAllReviewed の戻り値制御 — true で find-omissions 分岐を発火させる */
  allReviewed: false,
  /** getGraphPathFromTickets の戻り値 — /find-omissions の引数になる */
  graphPath: "/abs/RFC-ROOT-GRAPH.json",
};

/** step-timer モックの制御状態 */
const mockStepTimerState = {
  /** checkStepDeadline が呼ばれたステップ名の記録 */
  stepNames: [] as string[],
  /** checkStepDeadline の戻り値。true=通過, false=スキップ */
  deadlineResult: true,
};

// --- テスト用ヘルパー ---

/** テスト用のデフォルト LoopOptions */
function baseOptions(overrides?: Partial<LoopOptions>): LoopOptions {
  return {
    apiKey: "test-api-key",
    model: "test-model",
    ticketsPath: "/tmp/test-tickets.json",
    maxCount: 999999,
    resolveEvery: 1,
    pushEnabled: false,
    slackWebhookUrl: "https://hooks.slack.com/test",
    verbose: false,
    timeoutMs: 5000,
    bindReviewInOneSession: true,
    ...overrides,
  };
}

/** process.exit をモック化する（呼出時は例外を投げてプロセス終了を模倣） */
function mockProcessExit(): { calledWith: number[]; restore: () => void } {
  const calledWith: number[] = [];
  const origExit = process.exit;
  (process as any).exit = (code?: number) => {
    calledWith.push(code ?? 0);
    // プロセス終了を模倣する: モックではループ継続を防ぐため例外を投げる
    throw new Error(`process.exit(${code})`);
  };
  return { calledWith, restore: () => { process.exit = origExit; } };
}

// --- runLoop ---

describe("runLoop", () => {
  let tmpDir: string;
  let ticketPath: string;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "runner-test-"));
    ticketPath = join(tmpDir, "Tickets.json");
    mockStepTimerState.deadlineResult = true;

    // 全モックを1度だけ設定
    mock.module("./session.js", {
      exports: {
        withSession: async (
          _cwd: string,
          _key: string,
          _model: string,
          fn: (session: unknown) => Promise<unknown>,
        ) => fn({ sessionId: "mock" }),
        runCommand: async (_session: unknown, cmd: string) =>
          mockState.runCommandImpl(cmd),
      },
    });

    mock.module("./notifier.js", {
      exports: {
        sendSlackError: async (
          _url: string,
          ctx: { ticketId: string; phase: string },
        ) => {
          mockState.slackCalls.push(ctx);
        },
        sendSlackSuccess: async () => {},
        sendOmissionsNotification: async () => {},
      },
    });

    mock.module("./tickets.js", {
      exports: {
        loadPendingTickets: (ticketsPath: string) => {
          const raw = readFileSync(ticketsPath, "utf-8");
          const data = JSON.parse(raw);
          return data.phases
            .flatMap((phase: { id: number; tickets: Array<{ id: number; status: string }> }) =>
              phase.tickets.map((t) => ({ ...t, phaseId: phase.id })),
            )
            .filter((t: { status: string }) => t.status !== "reviewed");
        },
        checkAllReviewed: (_ticketsPath: string) => mockState.allReviewed,
        // getGraphPathFromTickets は同期関数（readFileSync + JSON.parse）なので
        // モックも同期で string を返す。async にすると runner 側が
        // Promise を連結して "… [object Promise]" になってしまう。
        getGraphPathFromTickets: (_path: string) => mockState.graphPath,
      },
    });

    mock.module("./step-timer.js", {
      exports: {
        checkStepDeadline: (stepName: string) => {
          mockStepTimerState.stepNames.push(stepName);
          return mockStepTimerState.deadlineResult;
        },
      },
    });
  });

  after(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  /** Tickets.json を作成する */
// [::TICKET::] PX-116 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-116 --for-spec --no-implementation-order`.
  function writeTickets(phases: Array<{
    id: number;
    name: string;
    tickets: Array<{ id: number; phaseId: number; status: string; title: string }>;
  }>): void {
    writeFileSync(ticketPath, JSON.stringify({ phases }, null, 2));
  }

  // --- 正常系 ---

  it("1チケット: make/plan/start → review → resolve が順に呼ばれる", async () => {
    mockStepTimerState.deadlineResult = true;
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath }));

    assert.strictEqual(exitMock.calledWith.length, 0);
    assert.ok(commands.some((c) => c.startsWith("/make-ticket")));
    assert.ok(commands.some((c) => c.startsWith("/plan-ticket")));
    assert.ok(commands.some((c) => c.startsWith("/start-ticket")));
    assert.ok(commands.some((c) => c.startsWith("/review-ticket")));
    assert.ok(commands.some((c) => c.startsWith("/resolve-ticket")));
    exitMock.restore();
  });

  // --- watcherConfig 統合テスト ---

  it("watcherConfig=undefined: 従来通り全ステップ実行", async () => {
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];
    mockStepTimerState.stepNames = [];
    mockStepTimerState.deadlineResult = true;

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath, watcherConfig: undefined }));

    assert.strictEqual(exitMock.calledWith.length, 0);
    assert.ok(commands.some((c) => c.startsWith("/make-ticket")));
    assert.ok(commands.some((c) => c.startsWith("/review-ticket")));
    exitMock.restore();
  });

  it("watcherConfig あり時間枠内: 全ステップ実行", async () => {
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];
    mockStepTimerState.stepNames = [];
    mockStepTimerState.deadlineResult = true;

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({
      ticketsPath: ticketPath,
      watcherConfig: {
        intervalMinutes: 60,
        startTime: "09:00",
        endTime: "17:00",
        timezone: "UTC",
      },
    }));

    assert.strictEqual(exitMock.calledWith.length, 0);
    assert.ok(commands.some((c) => c.startsWith("/make-ticket")));
    assert.ok(mockStepTimerState.stepNames.length >= 1);
    exitMock.restore();
  });

  it("watcherConfig あり時間枠外: ループ break", async () => {
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];
    mockStepTimerState.stepNames = [];
    mockStepTimerState.deadlineResult = false;

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({
      ticketsPath: ticketPath,
      watcherConfig: {
        intervalMinutes: 60,
        startTime: "09:00",
        endTime: "17:00",
        timezone: "UTC",
      },
    }));

    assert.strictEqual(exitMock.calledWith.length, 0);
    // 時間枠外 → コマンドは一切実行されない
    assert.strictEqual(commands.length, 0);
    // ただし checkStepDeadline は 1回呼ばれている
    assert.ok(mockStepTimerState.stepNames.length >= 1);
    exitMock.restore();
  });

  it("resolveEvery=3 でも最終チケットで resolve が呼ばれる", async () => {
    mockStepTimerState.deadlineResult = true;
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath, resolveEvery: 3 }));

    assert.strictEqual(exitMock.calledWith.length, 0);
    assert.ok(commands.some((c) => c.startsWith("/resolve-ticket")));
    exitMock.restore();
  });

  it("pushEnabled=true: resolve 後に jpush-branch が呼ばれる", async () => {
    mockStepTimerState.deadlineResult = true;
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath, pushEnabled: true }));

    assert.strictEqual(exitMock.calledWith.length, 0);
    assert.ok(commands.some((c) => c.startsWith("/jpush-branch")));
    exitMock.restore();
  });

  // @verifies C001
  it("checkAllReviewed=true かつ noFind=false → /find-omissions <graphPath> を実行", async () => {
    mockStepTimerState.deadlineResult = true;
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.allReviewed = true;
    mockState.graphPath = "/abs/RFC-ROOT-GRAPH.json";
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath, noFind: false }));

    const findCmd = commands.find((c) => c.startsWith("/find-omissions "));
    assert.ok(findCmd, "expected /find-omissions command");
    assert.ok(findCmd!.startsWith("/find-omissions /abs/RFC-ROOT-GRAPH.json"));
    assert.ok(!findCmd!.includes("/find-omissions-for-next-rfc"));
    mockState.allReviewed = false;
    exitMock.restore();
  });

  it("未処理0件: 早期終了", async () => {
    mockStepTimerState.deadlineResult = true;
    const exitMock = mockProcessExit();
    writeTickets([]);

    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath }));

    assert.strictEqual(exitMock.calledWith.length, 0);
    assert.strictEqual(commands.length, 0);
    exitMock.restore();
  });

  // --- 異常系 ---

  /** ヘルパー: エラーテスト共通処理（1チケットの一時ファイル＋runLoop実行） */
  async function runErrorTest(
    cmdImpl: (cmd: string) => Promise<string>,
    opts: Partial<LoopOptions>,
  ): Promise<{ slackPhase: string; exitCode: number | undefined }> {
    mockStepTimerState.deadlineResult = true;
    // テストごとにチケットファイルを新規作成
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const exitMock = mockProcessExit();
    mockState.runCommandImpl = cmdImpl;
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    try {
      await runLoop(baseOptions({ ticketsPath: ticketPath, ...opts }));
    } catch {
      // process.exit モックが投げた例外 — 期待動作
    }

    const result = {
      slackPhase: mockState.slackCalls[0]?.phase ?? "",
      exitCode: exitMock.calledWith[0],
    };
    exitMock.restore();
    return result;
  }

  it("make-ticket エラー時に sendSlackError + exit(1)", async () => {
    const { slackPhase, exitCode } = await runErrorTest(
      async (cmd) => {
        if (cmd.startsWith("/make-ticket")) throw new Error("/make-ticket failed");
        return "ok";
      },
      {},
    );
    assert.strictEqual(slackPhase, "make-ticket");
    assert.strictEqual(exitCode, 1);
  });

  it("review-ticket エラー時に sendSlackError + exit(1)", async () => {
    const { slackPhase, exitCode } = await runErrorTest(
      async (cmd) => {
        if (cmd.startsWith("/review-ticket")) throw new Error("/review-ticket error");
        return "ok";
      },
      {},
    );
    assert.strictEqual(slackPhase, "review-ticket");
    assert.strictEqual(exitCode, 1);
  });

  it("resolve-ticket エラー時に sendSlackError + exit(1)", async () => {
    const { slackPhase, exitCode } = await runErrorTest(
      async (cmd) => {
        if (cmd.startsWith("/resolve-ticket")) throw new Error("/resolve-ticket failed");
        return "ok";
      },
      {},
    );
    assert.strictEqual(slackPhase, "resolve-ticket");
    assert.strictEqual(exitCode, 1);
  });

  it("jpush-branch エラー時に sendSlackError + exit(1)", async () => {
    const { slackPhase, exitCode } = await runErrorTest(
      async (cmd) => {
        if (cmd.startsWith("/jpush-branch")) throw new Error("/jpush-branch failed");
        return "ok";
      },
      { pushEnabled: true },
    );
    assert.strictEqual(slackPhase, "jpush-branch");
    assert.strictEqual(exitCode, 1);
  });
});
