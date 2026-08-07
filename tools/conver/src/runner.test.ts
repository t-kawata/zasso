
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

/** sendFindOutcomeNotification が受け取るペイロードの型（テスト用） */
// [::TICKET::] PX-117 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-117 --for-spec --no-implementation-order`.
interface FindOutcomeMock {
  progress: string;
  integrationSucceeded: boolean;
  mergedPhases: number;
  mergedTickets: number;
}

/** 共有モック状態の型 — プロパティ絞り込みを避けるため明示的に型付けする */
// [::TICKET::] PX-117, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-117|PX-146) --for-spec --no-implementation-order`.
interface MockState {
  runCommandImpl: (cmd: string) => Promise<string>;
  slackCalls: Array<{ ticketId: string; phase: string }>;
  allReviewed: boolean;
  graphPath: string;
  findOutcome: FindOutcomeMock | undefined;
  countSnapshots: Array<{ phaseCount: number; ticketCount: number }>;
  /** clearForNextRound の呼び出し回数（PX-146 C005） */
  clearCalls: number;
  /** /review-ticket 実行時にチケットを reviewed に遷移させるか（PX-146 C002/C003 制御） */
  reviewMarksReviewed: boolean;
}

const mockState: MockState = {
  runCommandImpl: async (_cmd: string) => "ok",
  slackCalls: [],
  /** checkAllReviewed の戻り値制御 — true で find-omissions 分岐を発火させる */
  allReviewed: false,
  /** getGraphPathFromTickets の戻り値 — /find-omissions の引数になる */
  graphPath: "/abs/RFC-ROOT-GRAPH.json",
  /** sendFindOutcomeNotification が受け取ったペイロード（C001-C003 検証用） */
  findOutcome: undefined,
  /** countPhasesAndTickets の戻り値キュー — find 前後でシフトして統合成否を検証する */
  countSnapshots: [],
  clearCalls: 0,
  reviewMarksReviewed: true,
};

/** find 関連モック状態をリセットする（型絞り込みを避けるため関数経由） */
// [::TICKET::] PX-117 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-117 --for-spec --no-implementation-order`.
function resetFindState(): void {
  mockState.findOutcome = undefined;
  mockState.countSnapshots = [];
}

/** step-timer モックの制御状態 */
const mockStepTimerState = {
  /** checkStepDeadline が呼ばれたステップ名の記録 */
  stepNames: [] as string[],
  /** checkStepDeadline の戻り値。true=通過, false=スキップ */
  deadlineResult: true,
};

// --- テスト用ヘルパー ---

/** テスト用のデフォルト LoopOptions */
// [::TICKET::] PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-146 --for-spec --no-implementation-order`.
function baseOptions(overrides?: Partial<LoopOptions>): LoopOptions {
  return {
    apiKey: "test-api-key",
    model: "test-model",
    ticketsPath: "/tmp/test-tickets.json",
    maxCount: 999999,
    resolveEvery: 1,
    maxRetries: 3,
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
        runCommand: async (_session: unknown, cmd: string) => {
          // PX-146 C002: /review-ticket 成功時、事後検証が通るようチケットを reviewed に遷移させる。
          if (cmd.startsWith("/review-ticket") && mockState.reviewMarksReviewed) {
            markReviewed(ticketPath, extractTicketKey(cmd));
          }
          return mockState.runCommandImpl(cmd);
        },
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
        sendFindOutcomeNotification: async (
          _url: string,
          ctx: { progress: string; integrationSucceeded: boolean; mergedPhases: number; mergedTickets: number },
        ) => {
          mockState.findOutcome = ctx;
        },
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
            .filter(
              (t: { status: string; forNextRound?: boolean }) =>
                t.status !== "reviewed" && t.forNextRound !== true,
            );
        },
        checkAllReviewed: (_ticketsPath: string) => mockState.allReviewed,
        // getGraphPathFromTickets は同期関数（readFileSync + JSON.parse）なので
        // モックも同期で string を返す。async にすると runner 側が
        // Promise を連結して "… [object Promise]" になってしまう。
        getGraphPathFromTickets: (_path: string) => mockState.graphPath,
        // find 前後で 2 回呼ばれる想定 — キューをシフトして前後差分を検証する
        countPhasesAndTickets: (_path: string) =>
          mockState.countSnapshots.shift() ?? { phaseCount: 0, ticketCount: 0 },
        clearForNextRound: (_path: string) => {
          mockState.clearCalls++;
        },
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
// [::TICKET::] PX-116, PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-116|PX-146) --for-spec --no-implementation-order`.
  function writeTickets(phases: Array<{
    id: number;
    name: string;
    tickets: Array<{ id: number; phaseId: number; status: string; title: string; forNextRound?: boolean }>;
  }>): void {
    writeFileSync(ticketPath, JSON.stringify({ phases }, null, 2));
  }

  /** コマンド文字列からチケットキー（末尾トークン）を抽出する */
// [::TICKET::] PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-146 --for-spec --no-implementation-order`.
  function extractTicketKey(cmd: string): string {
    const parts = cmd.trim().split(/\s+/);
    return parts[parts.length - 1] ?? "";
  }

  /** fixture 内のチケットを reviewed に遷移させる（PX-146 C002 事後検証用モック） */
// [::TICKET::] PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-146 --for-spec --no-implementation-order`.
  function markReviewed(path: string, key: string): void {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    const separator = key.indexOf("-");
    const phasePart = key.slice(0, separator);
    const idPart = key.slice(separator + 1);
    const phaseId = phasePart === "PX" ? -1 : parseInt(phasePart.slice(1), 10);
    const id = parseInt(idPart, 10);
    for (const phase of data.phases) {
      if (phase.id !== phaseId) continue;
      const t = (phase.tickets || []).find((x: { id: number }) => x.id === id);
      if (t) t.status = "reviewed";
    }
    writeFileSync(path, JSON.stringify(data, null, 2));
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

  it("pushEnabled=true: resolve 後に epush-branch が呼ばれる", async () => {
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
    assert.ok(commands.some((c) => c.startsWith("/epush-branch")));
    exitMock.restore();
  });

  // @verifies C001 C002 C003
  it("checkAllReviewed=true かつ noFind=false → /find-omissions 実行後に統合成否通知が飛ぶ", async () => {
    mockStepTimerState.deadlineResult = true;
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.allReviewed = true;
    mockState.graphPath = "/abs/RFC-ROOT-GRAPH.json";
    resetFindState();
    mockState.countSnapshots = [
      { phaseCount: 5, ticketCount: 10 },   // find 前
      { phaseCount: 6, ticketCount: 12 },   // find 後（統合成功）
    ];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath, noFind: false }));

    const findCmd = commands.find((c) => c.startsWith("/find-omissions "));
    assert.ok(findCmd, "expected /find-omissions command");
    // 末尾スペース込みの正の照合がコマンド名の回帰を排除するため、負の assert は不要。
    assert.ok(findCmd!.startsWith("/find-omissions /abs/RFC-ROOT-GRAPH.json"));
    // C001 postcondition: sendFindOutcomeNotification が呼ばれる（sendOmissionsNotification は廃止）
    assert.ok(mockState.findOutcome, "sendFindOutcomeNotification should be called");
    // C002: progress（list-phases-and-tickets.js 出力）が含まれる
    assert.ok(mockState.findOutcome!.progress.length > 0);
    // C003: フェーズ/チケット増加 → 統合成功
    assert.strictEqual(mockState.findOutcome!.integrationSucceeded, true);
    assert.strictEqual(mockState.findOutcome!.mergedPhases, 1);
    assert.strictEqual(mockState.findOutcome!.mergedTickets, 2);
    mockState.allReviewed = false;
    exitMock.restore();
  });

  it("checkAllReviewed=true かつ noFind=false → /consolidate-stubs が /find-omissions より先に実行される", async () => {
    mockStepTimerState.deadlineResult = true;
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.allReviewed = true;
    mockState.graphPath = "/abs/RFC-ROOT-GRAPH.json";
    resetFindState();
    mockState.countSnapshots = [
      { phaseCount: 5, ticketCount: 10 },   // find 前
      { phaseCount: 6, ticketCount: 12 },   // find 後
    ];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath, noFind: false }));

    const consolidateIndex = commands.findIndex((c) =>
      c.startsWith("/consolidate-stubs"),
    );
    const findIndex = commands.findIndex((c) => c.startsWith("/find-omissions "));
    assert.ok(consolidateIndex !== -1, "expected /consolidate-stubs command");
    assert.ok(findIndex !== -1, "expected /find-omissions command");
    assert.ok(
      consolidateIndex < findIndex,
      "/consolidate-stubs must run before /find-omissions",
    );
    mockState.allReviewed = false;
    exitMock.restore();
  });

  // @verifies C003
  it("find 後もフェーズ/チケット数が不変 → 統合なし/失敗として通知", async () => {
    mockStepTimerState.deadlineResult = true;
    const exitMock = mockProcessExit();
    writeTickets([
      { id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] },
    ]);

    const commands: string[] = [];
    mockState.allReviewed = true;
    resetFindState();
    mockState.countSnapshots = [
      { phaseCount: 5, ticketCount: 10 },
      { phaseCount: 5, ticketCount: 10 },   // 統合なし/失敗
    ];
    mockState.runCommandImpl = async (cmd) => {
      commands.push(cmd);
      return "ok";
    };
    mockState.slackCalls = [];

    const { runLoop } = await import("./runner.js");
    await runLoop(baseOptions({ ticketsPath: ticketPath, noFind: false }));

    assert.ok(mockState.findOutcome, "sendFindOutcomeNotification should be called");
    assert.strictEqual(mockState.findOutcome!.integrationSucceeded, false);
    assert.strictEqual(mockState.findOutcome!.mergedPhases, 0);
    assert.strictEqual(mockState.findOutcome!.mergedTickets, 0);
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

  it("epush-branch エラー時に sendSlackError + exit(1)", async () => {
    const { slackPhase, exitCode } = await runErrorTest(
      async (cmd) => {
        if (cmd.startsWith("/epush-branch")) throw new Error("/epush-branch failed");
        return "ok";
      },
      { pushEnabled: true },
    );
    assert.strictEqual(slackPhase, "epush-branch");
    assert.strictEqual(exitCode, 1);
  });

  it("consolidate-stubs エラー時に sendSlackError + exit(1)", async () => {
    mockState.allReviewed = true;
    resetFindState();
    const { slackPhase, exitCode } = await runErrorTest(
      async (cmd) => {
        if (cmd.startsWith("/consolidate-stubs")) throw new Error("/consolidate-stubs failed");
        return "ok";
      },
      {},
    );
    assert.strictEqual(slackPhase, "consolidate-stubs");
    assert.strictEqual(exitCode, 1);
    mockState.allReviewed = false;
  });

  // ==================================================================
  // PX-146: wave ループ / リトライ / find+break / 安全網
  // ==================================================================

  // @verifies C001
  it("PX-146 C001: maxCount 重複なし予算を超えない", async () => {
    const { runLoop } = await import("./runner.js");
    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => { commands.push(cmd); return "ok"; };
    writeTickets([{ id: 0, name: "P0", tickets: [
      { id: 1, phaseId: 0, status: "todo", title: "A" },
      { id: 2, phaseId: 0, status: "todo", title: "B" },
      { id: 3, phaseId: 0, status: "todo", title: "C" },
    ] }]);
    await runLoop(baseOptions({ ticketsPath: ticketPath, maxCount: 2 }));
    const madeKeys = commands
      .filter((c) => c.startsWith("/make-ticket"))
      .map((c) => c.split(" ")[1]);
    assert.ok(madeKeys.length <= 2, "at most 2 distinct tickets made");
  });

  // @verifies C001
  it("PX-146 C001: forNextRound チケットは処理対象外", async () => {
    const { runLoop } = await import("./runner.js");
    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => { commands.push(cmd); return "ok"; };
    writeTickets([{ id: 0, name: "P0", tickets: [
      { id: 1, phaseId: 0, status: "todo", title: "normal" },
      { id: 2, phaseId: 0, status: "todo", title: "deferred", forNextRound: true },
    ] }]);
    await runLoop(baseOptions({ ticketsPath: ticketPath }));
    assert.ok(!commands.some((c) => c.includes("P0-2")), "deferred ticket not processed");
  });

  // @verifies C002
  it("PX-146 C002: review 失敗チケットが次 wave で再処理される（救済）", async () => {
    const { runLoop } = await import("./runner.js");
    let reviews = 0;
    mockState.reviewMarksReviewed = false;
    mockState.runCommandImpl = async (cmd) => {
      if (cmd.startsWith("/review-ticket")) {
        reviews++;
        if (reviews >= 2) markReviewed(ticketPath, extractTicketKey(cmd));
      }
      return "ok";
    };
    writeTickets([{ id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "T1" }] }]);
    await runLoop(baseOptions({ ticketsPath: ticketPath }));
    assert.ok(reviews >= 2, "failed-review ticket retried in a later wave");
    mockState.reviewMarksReviewed = true;
  });

  // @verifies C003
  it("PX-146 C003: リトライ上限超過で Slack 通知し abort しない", async () => {
    const { runLoop } = await import("./runner.js");
    mockState.slackCalls = [];
    mockState.reviewMarksReviewed = false;
    mockState.runCommandImpl = async () => "ok";
    writeTickets([{ id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "Stuck" }] }]);
    const exitMock = mockProcessExit();
    await runLoop(baseOptions({ ticketsPath: ticketPath, maxRetries: 3 }));
    assert.strictEqual(exitMock.calledWith.length, 0, "run does not abort");
    assert.ok(mockState.slackCalls.some((c) => c.ticketId === "P0-1"), "Slack error notified");
    mockState.reviewMarksReviewed = true;
    exitMock.restore();
  });

  // @verifies C004
  it("PX-146 C004: checkAllReviewed=true で find が1回だけ実行されループが終了する", async () => {
    const { runLoop } = await import("./runner.js");
    mockState.allReviewed = true;
    resetFindState();
    const commands: string[] = [];
    mockState.runCommandImpl = async (cmd) => { commands.push(cmd); return "ok"; };
    writeTickets([{ id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "todo", title: "A" }] }]);
    await runLoop(baseOptions({ ticketsPath: ticketPath }));
    const finds = commands.filter((c) => c.startsWith("/find-omissions")).length;
    assert.strictEqual(finds, 1, "find runs exactly once");
    mockState.allReviewed = false;
  });

  // @verifies C005
  it("PX-146 C005: 起動時に clearForNextRound が1回だけ呼ばれる", async () => {
    const { runLoop } = await import("./runner.js");
    mockState.clearCalls = 0;
    mockState.runCommandImpl = async () => "ok";
    writeTickets([{ id: 0, name: "P0", tickets: [{ id: 1, phaseId: 0, status: "reviewed", title: "Done" }] }]);
    await runLoop(baseOptions({ ticketsPath: ticketPath }));
    assert.strictEqual(mockState.clearCalls, 1, "clearForNextRound called once at entry");
  });
});
