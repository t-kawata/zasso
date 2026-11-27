// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
// conver.test.ts — workspace entry gate, normal mode, watcher mode and crash handlers.
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// [::TICKET::] PX-403, PX-404, PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-454) --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
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
  tasks?: string;
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

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

/** A promise the test resolves when it wants the watcher to shut down. */
function createDeferred(): Deferred {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
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
  schedulerStopped: boolean;
  termination: Deferred;
  callback: (() => void) | null;
  exitCalls: number[];
  runtimeCheck: { blocked: boolean; message: string };
  runResult: { processed: number; allSelectedComplete: boolean };
  allPackagesEndpoint: boolean;
  readWorkspaceCalls: number;
  readInitialWorkspaceCalls: number;
  stagePlans: Array<{ selections: Array<{ name: string; count: number }> }>;
  stageWatcherConfigs: unknown[];
  stageOutcome: string;
  waitForWindowCalls: number;
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
  schedulerStopped: false,
  termination: createDeferred(),
  callback: null,
  exitCalls: [],
  runtimeCheck: { blocked: false, message: "" },
  runResult: { processed: 0, allSelectedComplete: false },
  allPackagesEndpoint: false,
  readWorkspaceCalls: 0,
  readInitialWorkspaceCalls: 0,
  stagePlans: [],
  stageWatcherConfigs: [],
  stageOutcome: "workspace-complete",
  waitForWindowCalls: 0,
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
    resolveStageWorkspaceRoot: () => state.workspace.root,
    readInitialWorkspaceForPlan: () => {
      state.readInitialWorkspaceCalls += 1;
      return state.workspace;
    },
    readWorkspaceForStagePlan: () => state.workspace,
    validateImplementationOrder: () => {},
    readWorkspace: () => {
      state.readWorkspaceCalls += 1;
      return state.workspace;
    },
    WorkspaceGateError: MockWorkspaceGateError,
  },
});
mock.module("./runner.js", {
  exports: {
    runWorkspaceLoop: async (options: Record<string, unknown>) => {
      state.runOptions = options;
      if (state.runError) throw state.runError;
      return state.runResult;
    },
    allPackagesAreEndpoint: () => state.allPackagesEndpoint,
    isRecoverableError: () => false,
    retryPolicy: { maxAttempts: 1, baseDelayMs: 0, maxDelayMs: 0, jitterMs: 0 },
    retryWithBackoff: async (operation: () => Promise<unknown>) => operation(),
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
  exports: {
    isWithinTimeWindow: () => state.withinWindow,
    waitForWindow: async () => {
      state.waitForWindowCalls += 1;
    },
  },
});
mock.module("./stage-engine.js", {
  exports: {
    runStagePlan: async (input: {
      plan: { selections: Array<{ name: string; count: number }> };
      options?: { watcherConfig?: unknown };
    }) => {
      state.stagePlans.push(input.plan);
      state.stageWatcherConfigs.push(input.options?.watcherConfig);
      return state.stageOutcome;
    },
  },
});
mock.module("./cron-scheduler.js", {
  exports: {
    CronScheduler: class {
      start(callback: () => void): void {
        state.schedulerStarted = true;
        state.callback = callback;
      }
      stop(): void {
        state.schedulerStopped = true;
      }
    },
  },
});
mock.module("./termination.js", {
  exports: {
    createTerminationHandle: () => ({
      wait: () => state.termination.promise,
      stop: () => state.termination.resolve(),
    }),
    waitForTerminationSignal: () => state.termination.promise,
  },
});
mock.module("./package-selection.js", {
  exports: {
    resolvePackageSelection: () => state.workspace.packages,
    resolveRequestedPackages: () => state.workspace.packages,
    PackageSelectionError: MockPackageSelectionError,
  },
});
mock.module("./tickets.js", {
  exports: { pendingTicketsOf: () => [] },
});
// The startup check is the only runtime-dependency behaviour these tests
// exercise. The other exports exist because session.js imports them; keeping
// the whole-module mock free of the real module's evaluation preserves the
// mock registry for the other modules in this file.
mock.module("./runtime-dependencies.js", {
  exports: {
    checkRuntimeDependencies: () => state.runtimeCheck,
    MissingRuntimeDependencyError: class extends Error {},
    buildAcpInstallCommands: () => [],
    resolveAcpBinaryForProcess: () => null,
  },
});

const { main, reportFatalError, installCrashHandlers } = await import("./conver.js");

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function mockExit(): void {
  state.exitCalls = [];
  mock.method(process, "exit", (code?: number) => {
    state.exitCalls.push(code ?? 0);
  });
}

function captureStream(stream: NodeJS.WriteStream): { chunks: string[]; restore: () => void } {
  const chunks: string[] = [];
  const originalWrite = stream.write.bind(stream);
  stream.write = ((chunk: string | Uint8Array) => {
    chunks.push(chunk.toString());
    return true;
  }) as typeof stream.write;
  return {
    chunks,
    restore: () => {
      stream.write = originalWrite;
    },
  };
}

beforeEach(() => {
  state.runOptions = null;
  state.runError = null;
  state.gateError = null;
  state.watcherError = null;
  state.withinWindow = true;
  state.schedulerStarted = false;
  state.schedulerStopped = false;
  state.termination = createDeferred();
  state.callback = null;
  state.cli.watcherConfig = undefined;
  state.cli.tasks = "make,plan,start,review,resolve,consolidate,find";
  state.cli.packages = [];
  state.runtimeCheck = { blocked: false, message: "" };
  state.runResult = { processed: 0, allSelectedComplete: false };
  state.allPackagesEndpoint = false;
  state.readWorkspaceCalls = 0;
  state.readInitialWorkspaceCalls = 0;
  state.stagePlans = [];
  state.stageOutcome = "workspace-complete";
  state.waitForWindowCalls = 0;
  state.stageWatcherConfigs = [];
});

// @verifies C003 — endpoint exit and non-endpoint continuation
describe("main", () => {
  it("runs the workspace loop in normal mode", async () => {
    mockExit();
    await main();
    assert.strictEqual(state.exitCalls.length, 0);
    assert.ok(state.runOptions !== null);
    const workspace = state.runOptions?.workspace as MockWorkspace;
    assert.strictEqual(workspace.name, "ws");
  });

  it("prints the -P target packages at startup", async () => {
    mockExit();
    state.cli.packages = ["doors-core", "doors-operation"];
    const stdout = captureStream(process.stdout);
    try {
      await main();
    } finally {
      stdout.restore();
    }

    assert.ok(
      stdout.chunks.join("").includes("  targetPackages=doors-core, doors-operation\n"),
    );
  });

  it("prints targetPackages=(all) when -P is omitted", async () => {
    mockExit();
    const stdout = captureStream(process.stdout);
    try {
      await main();
    } finally {
      stdout.restore();
    }

    assert.ok(stdout.chunks.join("").includes("  targetPackages=(all)\n"));
  });

  it("exits 1 when the workspace gate fails", async () => {
    mockExit();
    state.gateError = new MockWorkspaceGateError("no manifests");
    await main();
    assert.deepStrictEqual(state.exitCalls, [1]);
    assert.strictEqual(state.runOptions, null);
  });

  it("exits 1 before the loop when required runtime dependencies are missing", async () => {
    mockExit();
    state.runtimeCheck = { blocked: true, message: "missing required\n" };
    const stderr = captureStream(process.stderr);
    try {
      await main();
    } finally {
      stderr.restore();
    }

    assert.deepStrictEqual(state.exitCalls, [1]);
    assert.strictEqual(state.runOptions, null);
    assert.ok(stderr.chunks.join("").includes("missing required"));
  });

  it("reports optional runtime dependencies after starting and still runs the loop", async () => {
    mockExit();
    state.runtimeCheck = { blocked: false, message: "missing optional\n" };
    const stderr = captureStream(process.stderr);
    try {
      await main();
    } finally {
      stderr.restore();
    }

    assert.strictEqual(state.exitCalls.length, 0);
    assert.ok(state.runOptions !== null);
    assert.ok(stderr.chunks.join("").includes("missing optional"));
  });

  it("exits 1 when the workspace loop stops", async () => {
    mockExit();
    state.runError = new MockLoopStoppedError({ reason: "escalation-exhausted" });
    await main();
    assert.deepStrictEqual(state.exitCalls, [1]);
  });

  it("keeps the watcher running until a termination signal and then stops the scheduler", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    let settled = false;
    const running = main().then(() => {
      settled = true;
    });

    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(state.schedulerStarted, true);
    assert.strictEqual(
      settled,
      false,
      "watcher mode must not return while cron can still fire; returning stops the dashboard",
    );
    assert.ok(state.callback !== null);
    state.callback?.();
    assert.ok(state.runOptions !== null);
    assert.strictEqual(state.stagePlans.length, 0, "the implementation group keeps the ticket loop");
    assert.strictEqual(state.waitForWindowCalls, 0, "the ticket loop owns its own window wait");

    state.termination.resolve();
    await running;
    assert.strictEqual(state.schedulerStopped, true);
    assert.deepStrictEqual(state.exitCalls, [0]);
  });

  it("exits 0 when every selected package is already endpoint at startup", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    state.workspace.packages = [
      {
        id: "pkg-a",
        name: "a",
        path: "crates/a",
        directory: "/ws/crates/a",
        ticketsPath: "/ws/crates/a/Tickets.json",
      },
    ];
    state.allPackagesEndpoint = true;

    await main();

    assert.strictEqual(state.schedulerStarted, false);
    assert.deepStrictEqual(state.exitCalls, [0]);
  });

  it("exits 0 when a watcher tick reaches the endpoint", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    state.runResult = { processed: 0, allSelectedComplete: true };

    const running = main();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.strictEqual(state.schedulerStarted, true);
    state.callback?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    await new Promise<void>((resolve) => setImmediate(resolve));
    await running;

    assert.strictEqual(state.schedulerStopped, true);
    assert.deepStrictEqual(state.exitCalls, [0]);
  });

  it("exits 1 when the watcher config cannot be loaded", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    state.watcherError = new Error("bad config");
    await main();
    assert.deepStrictEqual(state.exitCalls, [1]);
  });

  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("C001: -w without -T uses the default full plan and the stage engine", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    state.cli.tasks = undefined;
    const stdout = captureStream(process.stdout);
    const running = main();
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepStrictEqual(state.exitCalls, []);
      assert.strictEqual(state.schedulerStarted, true);
      assert.ok(state.readInitialWorkspaceCalls > 0, "the stage-aware model is read");
      assert.strictEqual(state.readWorkspaceCalls, 0, "the implementation-group model is not read at startup");
      assert.ok(stdout.chunks.join("").includes("tasks=(default)"), "the banner keeps the shared default");
      state.callback?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      stdout.restore();
      state.termination.resolve();
      await running;
    }

    assert.strictEqual(state.schedulerStopped, true);
    assert.deepStrictEqual(state.exitCalls, [0]);
    assert.strictEqual(state.stagePlans.length, 1);
    assert.strictEqual(state.stagePlans[0]?.selections.length, 17);
    assert.strictEqual(state.stagePlans[0]?.selections[0]?.name, "workspacify");
    assert.strictEqual(state.stagePlans[0]?.selections.at(-1)?.name, "drill");
    assert.ok(state.waitForWindowCalls > 0, "the stage tick waits for the configured window");
    assert.strictEqual(state.stageWatcherConfigs.length, 1);
    assert.ok(
      state.stageWatcherConfigs[0] !== undefined,
      "the implementation loop inside the tick keeps the watcher window config",
    );
  });

  it("C001: -w treats an empty -T as the default full plan", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    state.cli.tasks = "   ";
    const running = main();
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      state.callback?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));
    } finally {
      state.termination.resolve();
      await running;
    }

    assert.deepStrictEqual(state.exitCalls, [0]);
    assert.strictEqual(state.stagePlans.length, 1);
    assert.strictEqual(state.stagePlans[0]?.selections.length, 17);
  });

  it("C001: -w accepts an explicit non-implementation plan and runs it", async () => {
    mockExit();
    state.cli.watcherConfig = "/tmp/watcher.json";
    state.cli.tasks = "workspacify,educe,explain";
    state.stageOutcome = "budget-exhausted";
    const running = main();
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepStrictEqual(state.exitCalls, []);
      state.callback?.();
      await new Promise<void>((resolve) => setImmediate(resolve));
      await new Promise<void>((resolve) => setImmediate(resolve));

      assert.strictEqual(state.stagePlans.length, 1);
      assert.deepStrictEqual(
        state.stagePlans[0]?.selections.map((selection) => selection.name),
        ["workspacify", "educe", "explain"],
      );
    } finally {
      state.termination.resolve();
      await running;
    }
    assert.deepStrictEqual(state.exitCalls, [0]);
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
