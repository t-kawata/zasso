// command-history.test.ts — FIFO history, repetition detection and escalation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMMAND_HISTORY_LIMIT,
  CommandHistory,
  MAX_ESCALATIONS,
  StopRequestedError,
  composePrompt,
  COMPLETION_REPORT_DIRECTIVE,
  CROSS_PACKAGE_DIRECTIVE,
  ESCALATION_MESSAGES,
} from "./command-history.js";
import type { CommandExecution } from "./command-history.js";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function execution(overrides: Partial<CommandExecution> = {}): CommandExecution {
  return {
    workspace: "doors",
    packageName: "doors-core",
    ticketKey: "P0-1",
    command: "/make-ticket",
    statusBefore: "todo",
    at: 0,
    ...overrides,
  };
}

describe("CommandHistory", () => {
  it("keeps at most ten executions and evicts only the oldest", () => {
    const history = new CommandHistory();
    for (let index = 0; index < COMMAND_HISTORY_LIMIT + 2; index++) {
      history.record(execution({ command: `/command-${index}` }));
    }
    const snapshot = history.snapshot();
    assert.strictEqual(snapshot.length, COMMAND_HISTORY_LIMIT);
    assert.strictEqual(snapshot[0]?.command, "/command-2");
    assert.strictEqual(snapshot[snapshot.length - 1]?.command, `/command-${COMMAND_HISTORY_LIMIT + 1}`);
  });

  it("detects the same ticket and command in the FIFO", () => {
    const history = new CommandHistory();
    history.record(execution());
    assert.strictEqual(history.hasRepeated("P0-1", "/make-ticket"), true);
    assert.strictEqual(history.hasRepeated("P0-2", "/make-ticket"), false);
    assert.strictEqual(history.hasRepeated("P0-1", "/review-ticket"), false);
  });

  // @verifies C004
  it("C004: three stronger English prompts are sent and then conver stops", () => {
    const history = new CommandHistory();
    for (let level = 1; level <= MAX_ESCALATIONS; level++) {
      assert.strictEqual(history.nextEscalation("P0-1", "/make-ticket"), level);
    }
    assert.throws(
      () => history.nextEscalation("P0-1", "/make-ticket"),
      (error: unknown) =>
        error instanceof StopRequestedError && error.reason === "escalation-exhausted",
    );
  });

  it("resets escalation counters for a ticket when the status advances", () => {
    const history = new CommandHistory();
    history.nextEscalation("P0-1", "/make-ticket");
    history.resetTicket("P0-1");
    assert.strictEqual(history.nextEscalation("P0-1", "/make-ticket"), 1);
  });
});

describe("composePrompt", () => {
  it("separates the command from the directive by two newlines", () => {
    const prompt = composePrompt("/make-ticket P0-1", 0);
    assert.ok(prompt.startsWith("/make-ticket P0-1\n\n"));
    assert.ok(prompt.includes(CROSS_PACKAGE_DIRECTIVE));
  });

  it("pins the completion report rule: telegraphic, max 100 chars, no details", () => {
    assert.strictEqual(
      COMPLETION_REPORT_DIRECTIVE,
      "On completion: brief telegraphic report, max 100 chars. No details.",
    );
  });

  it("carries the completion report rule at every escalation level", () => {
    for (let level = 0; level <= MAX_ESCALATIONS; level++) {
      const prompt = composePrompt("/consolidate-stubs", level);
      assert.ok(
        prompt.includes(COMPLETION_REPORT_DIRECTIVE),
        `level=${level} lost the completion report rule`,
      );
    }
  });

  it("adds exactly one escalation message for the requested level", () => {
    for (let level = 1; level <= MAX_ESCALATIONS; level++) {
      const prompt = composePrompt("/make-ticket P0-1", level);
      assert.ok(prompt.includes(ESCALATION_MESSAGES[level - 1]));
      for (let other = 0; other < MAX_ESCALATIONS; other++) {
        if (other !== level - 1) {
          assert.strictEqual(prompt.includes(ESCALATION_MESSAGES[other]), false);
        }
      }
    }
  });
});
