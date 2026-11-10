// conver.test.ts — workspace entry gate, normal mode, watcher mode and crash handlers.
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
interface MockCli {
  apiKey: string;
  model: string;
  baseUrl: string;
  packages: string[];
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
  bindReviewInOneSession: boolean;
  noFind: boolean;
  watcherConfig?: string;
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
interface MockWorkspace {
  root: string;
  name: string;
  packages: Array<{
    id: string;
    name: string;
    path: string;
    directory: string;
    ticketsPath: string;
  }>;
}

const state: {
  cli: MockCli;
  workspace: MockWorkspace;
  runOptions: Record<string, unknown> | null;
  runError: Error | null;
  gateError: Error | null;
  watcherError: Error | null;
  withinWindow: boolean;
  schedulerStarted: boolean;
  callback: (() => void) | null;
  exitCalls: number[];
} = {
  cli: {
    apiKey: "k",
    model: "m",
    baseUrl: "http://localhost",
    packages: [],
    maxCount: 10,
    resolveEvery: 3,
    pushEnabled: false,
    slackWebhookUrl: "https://example.invalid",
    verbose: false,
    timeoutMs: 1000,
    bindReviewInOneSession: true,
    noFind: false,
  },
  workspace: { root: "/ws", name: "ws", packages: [] },
  runOptions: null,
  runError: null,
  gateError: null,
  watcherError: null,
  withinWindow: true,
  schedulerStarted: false,
  callback: null,
  exitCalls: [],
};

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
class MockWorkspaceGateError extends Error {}
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
class MockLoopStoppedError extends Error {
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
  constructor(readonly context: { reason: string }) {
    super(context.reason);
  }
}
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
class MockPackageSelectionError extends Error {
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
  constructor(readonly candidates: string[] = []) {
    super("selection failed");
  }
}

mock.module("./cli.js", {
  exports: { parseCliOptions: () => state.cli },
});
mock.module("./workspace.js", {
  exports: {
    resolveWorkspaceRoot: () => {
      if (state.gateError) throw state.gateError;
      return state.workspace.root;
    },
    validateImplementationOrder: () => {},
    readWorkspace: () => state.workspace,
    WorkspaceGateError: MockWorkspaceGateError,
  },
});
mock.module("./runner.js", {
  exports: {
    runWorkspaceLoop: async (options: Record<string, unknown>) => {
      state.runOptions = options;
      if (state.runError) throw state.runError;
    },
    LoopStoppedError: MockLoopStoppedError,
  },
});
mock.module("./watcher.js", {
  exports: {
    loadWatcherConfig: () => {
      if (state.watcherError) throw state.watcherError;
      return {
        timezone: "UTC",
        intervalMinutes: 5,
        filters: [{ startTime: "09:00", endTime: "17:00" }],
      };
    },
  },
});
mock.module("./step-timer.js", {
  exports: { isWithinTimeWindow: () => state.withinWindow },
});
mock.module("./cron-scheduler.js", {
  exports: {
    CronScheduler: class {
      start(callback: () => void): void {
        state.schedulerStarted = true;
        state.callback = callback;
      }
      stop(): void {}
    },
  },
});
mock.module("./package-selection.js", {
  exports: {
    resolvePackageSelection: () => state.workspace.packages,
    PackageSelectionError: MockPackageSelectionError,
  },
});
mock.module("./tickets.js", {
  exports: { pendingTicketsOf: () => [] },
});

const { main, reportFatalError, installCrashHandlers } = await import("./conver.js");

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function mockExit(): void {
  state.exitCalls = [];
  mock.method(process, "exit", (code?: number) => {
    state.exitCalls.push(code ?? 0);
  });
}

beforeEach(() => {
  state.runOptions = null;
  state.runError = null;
  state.gateError = null;
  state.watcherError = null;
  state.withinWindow = true;
  state.schedulerStarted = false;
  state.callback = null;
  state.cli.watcherConfig = undefined;
  state.cli.packages = [];
});

describe("main", () => {
  it("runs the workspace loop in normal mode", async () => {
    mockExit();
    await main();
    assert.strictEqual(state.exitCalls.length, 0);
    assert.ok(state.runOptions !== null);
    const workspace = state.runOptions?.workspace as MockWorkspace;
    assert.strictEqual(workspace.name, "ws");
  });

  it("exits 1 when the workspace gate fails", async () => {
    mockExit();
    state.gateError = new MockWorkspaceGateError("no manifests");
    await main();
    assert.deepStrictEqual(state.exitCalls, [1]);
    assert.strictEqual(state.runOptions, null);
  });

  it("exits 1 when the workspace loop stops", async () => {
    mockExit();
    state.runError = new MockLoopStoppedError({ reason: "escalation-exhausted" });
    await main();
    assert.deepStrictEqual(state.exitCalls, [1]);
  });

  it("starts the scheduler in watcher mode and runs the loop on a firing", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    await main();
    assert.strictEqual(state.schedulerStarted, true);
    assert.ok(state.callback !== null);
    state.callback?.();
    assert.ok(state.runOptions !== null);
  });

  it("exits 1 when the watcher config cannot be loaded", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    state.watcherError = new Error("bad config");
    await main();
    assert.deepStrictEqual(state.exitCalls, [1]);
  });
});

describe("reportFatalError / installCrashHandlers", () => {
  it("logs the error and does not exit", () => {
    mockExit();
    const messages: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => messages.push(args.join(" "));
    try {
      reportFatalError("fatal", new Error("boom"));
    } finally {
      console.error = originalError;
    }
    assert.strictEqual(state.exitCalls.length, 0);
    assert.ok(messages.join("\n").includes("boom"));
  });

  it("registers both process handlers", () => {
    installCrashHandlers();
    assert.ok(process.listenerCount("uncaughtException") > 0);
    assert.ok(process.listenerCount("unhandledRejection") > 0);
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
  });
});
