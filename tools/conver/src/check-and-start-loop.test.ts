// check-and-start-loop.test.ts — reentrancy guard around the workspace loop.
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { WorkspaceLoopOptions } from "./runner.js";

const mockRunWorkspaceLoop = mock.fn(async (_options: WorkspaceLoopOptions): Promise<void> => {});

mock.module("./runner.js", {
  namedExports: {
    runWorkspaceLoop: mockRunWorkspaceLoop,
  },
});

const { checkAndStartLoop } = await import("./check-and-start-loop.js");

const OPTIONS: WorkspaceLoopOptions = {
  apiKey: "",
  model: "test-model",
  baseUrl: "http://localhost",
  packages: [],
  maxCount: 1,
  resolveEvery: 3,
  pushEnabled: false,
  slackWebhookUrl: "https://example.invalid",
  verbose: false,
  timeoutMs: 1000,
  bindReviewInOneSession: true,
  workspace: { root: "/ws", name: "ws", packages: [] },
};

beforeEach(() => {
  mockRunWorkspaceLoop.mock.resetCalls();
});

describe("checkAndStartLoop", () => {
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
// [::TICKET::] PX-403 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-403 --for-spec --no-implementation-order`.
  it("runs the workspace loop once", async () => {
    await checkAndStartLoop(OPTIONS);
    assert.strictEqual(mockRunWorkspaceLoop.mock.callCount(), 1);
  });

  it("skips a call while the previous loop is still running", async () => {
    let release!: () => void;
    mockRunWorkspaceLoop.mock.mockImplementationOnce(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => warnings.push(message);
    try {
      const first = checkAndStartLoop(OPTIONS);
      await Promise.resolve();
      await checkAndStartLoop(OPTIONS);
      assert.strictEqual(mockRunWorkspaceLoop.mock.callCount(), 1);
      assert.strictEqual(warnings.length, 1);
      release();
      await first;
    } finally {
      console.warn = originalWarn;
    }
  });

  it("resets the guard after an error", async () => {
    mockRunWorkspaceLoop.mock.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    await assert.rejects(() => checkAndStartLoop(OPTIONS), /boom/);
    await checkAndStartLoop(OPTIONS);
    assert.strictEqual(mockRunWorkspaceLoop.mock.callCount(), 2);
  });
});
