// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
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
  EDUCE_FIXED_SPEC_OVERRIDE,
  ESCALATION_MESSAGES,
  EXPLAIN_OVERRIDE,
  GRILL_OVERRIDE,
  DRILL_OVERRIDE,
  NON_INTERACTIVE_OVERRIDE,
} from "./command-history.js";
import type { CommandExecution } from "./command-history.js";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
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

// @verifies C006
describe("prompt overrides", () => {
  it("C006: leaves the default composition byte-identical", () => {
    const expected = `/make-ticket P0-1\n\n${CROSS_PACKAGE_DIRECTIVE}\n${COMPLETION_REPORT_DIRECTIVE}`;
    assert.strictEqual(composePrompt("/make-ticket P0-1", 0), expected);
    assert.strictEqual(
      composePrompt("/make-ticket P0-1", 0).includes(NON_INTERACTIVE_OVERRIDE),
      false,
    );
  });

  it("C006: appends an override after the existing directives", () => {
    const prompt = composePrompt("/explain-seed", 0, EXPLAIN_OVERRIDE);
    assert.ok(prompt.startsWith("/explain-seed\n\n"));
    assert.ok(prompt.endsWith(`\n\n${EXPLAIN_OVERRIDE}`));
    assert.ok(prompt.includes(CROSS_PACKAGE_DIRECTIVE));
  });

  it("C006: explain and grill carry the full non-interactive block, and grill forbids chosen_default skipping", () => {
    assert.ok(EXPLAIN_OVERRIDE.includes(NON_INTERACTIVE_OVERRIDE));
    assert.ok(GRILL_OVERRIDE.includes(NON_INTERACTIVE_OVERRIDE));
    assert.ok(GRILL_OVERRIDE.includes("chosen_default"));
    assert.ok(EXPLAIN_OVERRIDE.includes("Answer every direction question"));
    assert.ok(NON_INTERACTIVE_OVERRIDE.startsWith("# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION"));
  });

  it("C006: educe carries only the fixed-argument override", () => {
    assert.ok(EDUCE_FIXED_SPEC_OVERRIDE.includes("SYSTEM-DESIGN.md"));
    assert.strictEqual(EDUCE_FIXED_SPEC_OVERRIDE.includes(NON_INTERACTIVE_OVERRIDE), false);
  });
});

describe("DRILL_OVERRIDE", () => {
  it("starts with the CRITICAL non-interactive header", () => {
    assert.ok(DRILL_OVERRIDE.startsWith("# CRITICAL — NON-INTERACTIVE, END-TO-END EXECUTION"));
  });

  it("carries the three telegraphic clauses", () => {
    assert.ok(DRILL_OVERRIDE.includes("Settle every direction question yourself; never bundle one to a human."));
    assert.ok(DRILL_OVERRIDE.includes("Anything causing, or potentially causing, cross-package omission/contradiction/deficiency/danger: complete design, authoring, update in this drill, spanning packages."));
    assert.ok(DRILL_OVERRIDE.includes("Directory contradiction: no dangerous mechanical fix; judge; fix across packages."));
  });

  it("keeps each drill clause ASCII while the shared CRITICAL header keeps its em dash", () => {
    const clauses = [
      "Settle every direction question yourself; never bundle one to a human.",
      "Anything causing, or potentially causing, cross-package omission/contradiction/deficiency/danger: complete design, authoring, update in this drill, spanning packages.",
      "Directory contradiction: no dangerous mechanical fix; judge; fix across packages.",
    ];
    for (const clause of clauses) assert.strictEqual(/^[\x00-\x7F]*$/.test(clause), true);
    assert.strictEqual(/[^\x00-\x7F]/.test(DRILL_OVERRIDE.replace("—", "-")), false);
  });

  it("is appended after the shared directives and never replaces them", () => {
    const prompt = composePrompt("/drill-rfc-down", 0, DRILL_OVERRIDE);
    const overrideIndex = prompt.indexOf(DRILL_OVERRIDE);
    assert.ok(prompt.startsWith("/drill-rfc-down\n\n"));
    assert.ok(prompt.indexOf(CROSS_PACKAGE_DIRECTIVE) < overrideIndex);
    assert.ok(prompt.indexOf(COMPLETION_REPORT_DIRECTIVE) < overrideIndex);
  });

  it("keeps the default composition byte-identical when no override is passed", () => {
    const prompt = composePrompt("/make-ticket P0-1", 0);
    assert.strictEqual(prompt, "/make-ticket P0-1\n\n" + CROSS_PACKAGE_DIRECTIVE + "\n" + COMPLETION_REPORT_DIRECTIVE);
  });
});
