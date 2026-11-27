// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// stage-plan.test.ts — the -T grammar, contiguous-slice validation and stage metadata.
//
// The canonical order is the pipeline's own order: workspacify, educe, explain,
// grill, smooth, graphify, boundify, split, the implementation group, crystalize, drill.
// A selected plan must be a contiguous slice of it; a gap or a reversal is a
// startup error, never a silently skipped stage.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CANONICAL_STAGE_DEFINITIONS,
  DEFAULT_STAGE_PLAN_RAW,
  StagePlanError,
  isDefaultImplementationPlan,
  parseStagePlan,
  resolveStageGate,
  stageDefinition,
  stageForCommand,
} from "./stage-plan.js";

const CANONICAL_NAMES = CANONICAL_STAGE_DEFINITIONS.map((definition) => definition.name);

// @verifies C001
describe("parseStagePlan", () => {
  it("C001: parses the full canonical schema and keeps the declared repeat counts", () => {
    const plan = parseStagePlan(
      "workspacify,educe:2,explain,grill:3,smooth,graphify,boundify,split,make,plan,start,review,resolve,consolidate,find,crystalize:2,drill",
    );

    assert.deepStrictEqual(plan.selections.map((selection) => selection.name), CANONICAL_NAMES);
    assert.strictEqual(plan.selections.find((selection) => selection.name === "educe")?.count, 2);
    assert.strictEqual(plan.selections.find((selection) => selection.name === "grill")?.count, 3);
    assert.strictEqual(plan.selections.find((selection) => selection.name === "crystalize")?.count, 2);
    assert.strictEqual(plan.selections.find((selection) => selection.name === "drill")?.count, 1);
    assert.strictEqual(plan.selections.find((selection) => selection.name === "workspacify")?.count, 1);
    assert.strictEqual(plan.selections.find((selection) => selection.name === "make")?.count, 1);
  });

  it("C001: an absent -T uses the default implementation plan", () => {
    for (const raw of [undefined, ""] as const) {
      const plan = parseStagePlan(raw);
      assert.deepStrictEqual(plan.selections.map((selection) => selection.name), [
        "make",
        "plan",
        "start",
        "review",
        "resolve",
        "consolidate",
        "find",
      ]);
      assert.strictEqual(plan.selections.every((selection) => selection.count === 1), true);
    }
  });

  it("C001: a single token is a contiguous slice of length one", () => {
    for (const raw of ["workspacify", "educe:2", "nope"] as const) {
      if (raw === "nope") {
        assert.throws(
          () => parseStagePlan(raw),
          (error: unknown) => error instanceof StagePlanError && error.code === "UNKNOWN_STAGE",
        );
        continue;
      }
      const plan = parseStagePlan(raw);
      assert.strictEqual(plan.selections.length, 1);
      assert.strictEqual(plan.selections[0]?.name, raw.startsWith("educe") ? "educe" : "workspacify");
    }
  });

  it("C001: rejects unknown, duplicate, gapped, reversed, empty and count-on-non-repeatable tokens", () => {
    const cases: Array<[string, StagePlanError["code"]]> = [
      ["nope", "UNKNOWN_STAGE"],
      ["make,plan,make", "DUPLICATE_STAGE"],
      ["make,start", "GAP"],
      ["smooth,educe", "OUT_OF_ORDER"],
      ["make,,plan", "UNKNOWN_STAGE"],
      ["make:2", "COUNT_NOT_ALLOWED"],
      ["explain:2", "COUNT_NOT_ALLOWED"],
      ["find:2", "COUNT_NOT_ALLOWED"],
      ["educe:0", "INVALID_COUNT"],
      ["educe:-1", "INVALID_COUNT"],
      ["educe:abc", "INVALID_COUNT"],
      ["educe:1:2", "INVALID_COUNT"],
    ];

    for (const [raw, code] of cases) {
      assert.throws(
        () => parseStagePlan(raw),
        (error: unknown) => error instanceof StagePlanError && error.code === code,
        `raw=${raw}`,
      );
    }
  });

  it("C001: the default plan is exactly the implementation group", () => {
    const plan = parseStagePlan(DEFAULT_STAGE_PLAN_RAW);
    assert.strictEqual(isDefaultImplementationPlan(plan), true);
    assert.strictEqual(isDefaultImplementationPlan(parseStagePlan("make,plan")), false);
    assert.strictEqual(isDefaultImplementationPlan(parseStagePlan("split,make,plan,start,review,resolve,consolidate,find")), false);
  });
});

// @verifies C008
describe("stage metadata", () => {
  it("C008: defines the scope and repeatability of every stage", () => {
    const workspaceStages = CANONICAL_STAGE_DEFINITIONS
      .filter((definition) => definition.scope === "workspace")
      .map((definition) => definition.name);
    assert.deepStrictEqual(workspaceStages, ["workspacify", "educe", "smooth"]);

    const repeatable = CANONICAL_STAGE_DEFINITIONS
      .filter((definition) => definition.repeatable)
      .map((definition) => definition.name);
    assert.deepStrictEqual(repeatable, [
      "educe",
      "grill",
      "smooth",
      "graphify",
      "boundify",
      "split",
      "crystalize",
    ]);
  });

  it("C008: maps every stage to its command and the gate it owes", () => {
    assert.deepStrictEqual(stageDefinition("workspacify").commands, [
      "/workspacify-tree",
      "/workspacify-allocate",
    ]);
    assert.deepStrictEqual(stageDefinition("educe").commands, ["/educe-sequences"]);
    assert.deepStrictEqual(stageDefinition("crystalize").commands, ["/crystalize-readme"]);

    assert.strictEqual(resolveStageGate("workspacify").requiresSystemDesign, true);
    assert.strictEqual(resolveStageGate("educe").requiresTreeAndAllocate, true);
    assert.strictEqual(resolveStageGate("make").requiresExistingWorkspaceGate, true);
    assert.strictEqual(resolveStageGate("crystalize").requiresExistingWorkspaceGate, true);
  });

  it("C008: maps an executed command back to its stage", () => {
    assert.strictEqual(stageForCommand("/make-ticket"), "make");
    assert.strictEqual(stageForCommand("/plan-ticket"), "plan");
    assert.strictEqual(stageForCommand("/start-ticket"), "start");
    assert.strictEqual(stageForCommand("/review-ticket"), "review");
    assert.strictEqual(stageForCommand("/resolve-ticket"), "resolve");
    assert.strictEqual(stageForCommand("/consolidate-stubs"), "consolidate");
    assert.strictEqual(stageForCommand("/find-omissions"), "find");
    assert.strictEqual(stageForCommand("/unknown"), null);
  });
});

// @verifies C001
describe("drill stage", () => {
  it("C001: drill is the last canonical stage and is not repeatable", () => {
    const names = CANONICAL_STAGE_DEFINITIONS.map((definition) => definition.name);
    assert.strictEqual(names[names.length - 1], "drill");
    assert.strictEqual(names[names.length - 2], "crystalize");
    assert.strictEqual(stageDefinition("drill").repeatable, false);
    assert.strictEqual(stageDefinition("drill").scope, "package");
    assert.deepStrictEqual(stageDefinition("drill").commands, ["/drill-rfc-down"]);
    assert.strictEqual(stageForCommand("/drill-rfc-down"), "drill");
  });

  it("C001: accepts a contiguous slice that ends at drill", () => {
    const plan = parseStagePlan("crystalize:2,drill");
    assert.deepStrictEqual(plan.selections.map((selection) => selection.name), ["crystalize", "drill"]);
    assert.strictEqual(plan.selections[0]?.count, 2);
    assert.strictEqual(plan.selections[1]?.count, 1);
  });

  it("C001: refuses a count on drill", () => {
    assert.throws(
      () => parseStagePlan("drill:2"),
      (error: unknown) => error instanceof StagePlanError && error.code === "COUNT_NOT_ALLOWED",
    );
  });

  it("C001: refuses drill without crystalize", () => {
    assert.throws(
      () => parseStagePlan("drill"),
      (error: unknown) => error instanceof StagePlanError && error.code === "DRILL_REQUIRES_CRYSTALIZE",
    );
  });

  it("C001: keeps the order rules around drill", () => {
    assert.throws(
      () => parseStagePlan("drill,crystalize"),
      (error: unknown) => error instanceof StagePlanError && error.code === "OUT_OF_ORDER",
    );
    assert.throws(
      () => parseStagePlan("find,drill"),
      (error: unknown) => error instanceof StagePlanError && error.code === "GAP",
    );
  });

  it("C001: drill owes the existing package gate", () => {
    assert.deepStrictEqual(resolveStageGate("drill"), {
      requiresSystemDesign: false,
      requiresTreeAndAllocate: false,
      requiresExistingWorkspaceGate: true,
    });
  });
});
