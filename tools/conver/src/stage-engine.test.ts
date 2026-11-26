// stage-engine.test.ts — cwd discipline, package rounds, prompt overrides,
// no record-based skipping, and the order re-read after workspacify/split.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  StageEngineError,
  runStagePlan,
} from "./stage-engine.js";
import type { StageEngineDeps, StageRunRecord } from "./stage-engine.js";
import { parseStagePlan } from "./stage-plan.js";
import type { WorkspaceLoopOptions } from "./runner.js";
import type { WorkspaceModel, WorkspacePackage } from "./workspace.js";
import {
  EDUCE_FIXED_SPEC_OVERRIDE,
  EXPLAIN_OVERRIDE,
  GRILL_OVERRIDE,
} from "./command-history.js";

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function packageEntry(id: string, path: string): WorkspacePackage {
  return {
    id,
    name: id,
    path,
    directory: `/ws/${path}`,
    ticketsPath: `/ws/${path}/Tickets.json`,
    seedRequired: true,
  };
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function workspace(): WorkspaceModel {
  return {
    root: "/ws",
    name: "ws",
    packages: [packageEntry("pkg-a", "a"), packageEntry("pkg-b", "b")],
  };
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function loopOptions(model: WorkspaceModel = workspace()): WorkspaceLoopOptions {
  return {
    apiKey: "",
    model: "test-model",
    baseUrl: "http://localhost",
    packages: [],
    maxCount: 999,
    resolveEvery: 3,
    pushEnabled: false,
    slackWebhookUrl: "https://example.invalid",
    verbose: false,
    timeoutMs: 1000,
    bindReviewInOneSession: true,
    noFind: false,
    workspace: model,
  };
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
interface CommandRecord {
  command: string;
  cwd: string;
  stage: string;
  round: number;
  packageId: string | null;
  promptOverride?: string;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function makeDeps(
  records: CommandRecord[],
  overrides: Partial<StageEngineDeps> = {},
): StageEngineDeps {
  return {
    runStageCommand: async (input) => {
      records.push({ ...input });
    },
    runImplementationLoop: async () => 0,
    readWorkspace: () => workspace(),
    assertPrecondition: () => {},
    assertArtifact: () => {},
    ...overrides,
  };
}

// @verifies C002
describe("runStagePlan — cwd", () => {
  it("C002: workspace stages use the root and package stages use the package directory", async () => {
    const records: CommandRecord[] = [];
    const originalCwd = process.cwd();

    await runStagePlan({
      plan: parseStagePlan("educe,explain,grill"),
      workspace: workspace(),
      options: loopOptions(),
      deps: makeDeps(records),
    });

    assert.deepStrictEqual(
      records.map((record) => `${record.stage}:${record.cwd}`),
      [
        "educe:/ws",
        "explain:/ws/a",
        "explain:/ws/b",
        "grill:/ws/a",
        "grill:/ws/b",
      ],
    );
    assert.strictEqual(process.cwd(), originalCwd);
  });
});

// @verifies C003
describe("runStagePlan — repetition", () => {
  it("C003: a package stage with N runs N full rounds, and a workspace stage N consecutive times", async () => {
    const packageRecords: CommandRecord[] = [];
    await runStagePlan({
      plan: parseStagePlan("grill:2"),
      workspace: workspace(),
      options: loopOptions(),
      deps: makeDeps(packageRecords),
    });
    assert.deepStrictEqual(
      packageRecords
        .filter((record) => record.stage === "grill")
        .map((record) => `${record.round}:${record.packageId}`),
      ["1:pkg-a", "1:pkg-b", "2:pkg-a", "2:pkg-b"],
    );

    const workspaceRecords: CommandRecord[] = [];
    await runStagePlan({
      plan: parseStagePlan("smooth:2"),
      workspace: workspace(),
      options: loopOptions(),
      deps: makeDeps(workspaceRecords),
    });
    assert.deepStrictEqual(
      workspaceRecords
        .filter((record) => record.stage === "smooth")
        .map((record) => `${record.round}:${record.cwd}`),
      ["1:/ws", "2:/ws"],
    );
  });

  it("C007: every selected repetition runs, with no record consulted to skip it", async () => {
    const records: CommandRecord[] = [];
    await runStagePlan({
      plan: parseStagePlan("grill:3"),
      workspace: workspace(),
      options: loopOptions(),
      deps: makeDeps(records),
    });
    assert.strictEqual(records.filter((record) => record.stage === "grill").length, 6);
  });
});

// @verifies C006
describe("runStagePlan — prompt overrides", () => {
  it("C006: educe, explain and grill receive their declared override and no other stage does", async () => {
    const records: CommandRecord[] = [];
    await runStagePlan({
      plan: parseStagePlan("educe,explain,grill"),
      workspace: workspace(),
      options: loopOptions(),
      deps: makeDeps(records),
    });
    assert.strictEqual(
      records.find((record) => record.stage === "educe")?.promptOverride,
      EDUCE_FIXED_SPEC_OVERRIDE,
    );
    assert.strictEqual(
      records.find((record) => record.stage === "explain")?.promptOverride,
      EXPLAIN_OVERRIDE,
    );
    assert.strictEqual(
      records.find((record) => record.stage === "grill")?.promptOverride,
      GRILL_OVERRIDE,
    );
  });
});

// @verifies C008
describe("runStagePlan — order source and implementation delegation", () => {
  it("C008: workspacify runs its two commands consecutively and the model is re-read for educe", async () => {
    const records: CommandRecord[] = [];
    const reloads: string[] = [];
    await runStagePlan({
      plan: parseStagePlan("workspacify,educe"),
      workspace: workspace(),
      options: loopOptions(),
      deps: makeDeps(records, {
        readWorkspace: (_plan, orderStartStage) => {
          reloads.push(orderStartStage);
          return workspace();
        },
      }),
    });
    assert.deepStrictEqual(records.map((record) => record.command), [
      "/workspacify-tree",
      "/workspacify-allocate",
      "/educe-sequences",
    ]);
    assert.deepStrictEqual(records.map((record) => record.cwd), ["/ws", "/ws", "/ws"]);
    assert.deepStrictEqual(reloads, ["educe"]);
  });

  it("C008: split re-reads the model with the sidecar order and delegates the implementation group once", async () => {
    const records: CommandRecord[] = [];
    const calls: string[] = [];
    let selectedSeen: readonly string[] | undefined;

    await runStagePlan({
      plan: parseStagePlan("split,make,plan"),
      workspace: workspace(),
      options: loopOptions(),
      deps: makeDeps(records, {
        readWorkspace: (_plan, orderStartStage) => {
          calls.push(orderStartStage);
          return workspace();
        },
        runImplementationLoop: async (options) => {
          calls.push("loop");
          selectedSeen = options.selectedImplementationStages === undefined
            ? undefined
            : [...options.selectedImplementationStages];
          return 0;
        },
      }),
    });

    assert.deepStrictEqual(records.map((record) => record.command), [
      "/split-to-tickets",
      "/split-to-tickets",
    ]);
    assert.deepStrictEqual(calls, ["make", "loop"]);
    assert.deepStrictEqual(selectedSeen, ["make", "plan"]);
  });

  it("C008: the default implementation plan is delegated as one no-op-selected loop", async () => {
    const records: CommandRecord[] = [];
    let selected: readonly string[] | undefined;
    await runStagePlan({
      plan: parseStagePlan(undefined),
      workspace: workspace(),
      options: loopOptions(),
      deps: makeDeps(records, {
        runImplementationLoop: async (options) => {
          selected = options.selectedImplementationStages === undefined
            ? undefined
            : [...options.selectedImplementationStages];
          return 0;
        },
      }),
    });
    assert.strictEqual(records.length, 0);
    assert.strictEqual(selected, undefined);
  });
});

// @verifies C005
describe("runStagePlan — default preconditions", () => {
  it("C005: a workspacify start requires SYSTEM-DESIGN.md", async () => {
    const root = mkdtempSync(join(tmpdir(), "px454-engine-"));
    try {
      const model: WorkspaceModel = { root, name: "ws", packages: [] };
      const deps = makeDeps([], {
        runStageCommand: async () => {},
        assertPrecondition: undefined,
        assertArtifact: undefined,
      });
      await assert.rejects(
        () =>
          runStagePlan({
            plan: parseStagePlan("workspacify"),
            workspace: model,
            options: loopOptions(model),
            deps,
          }),
        (error: unknown) =>
          error instanceof StageEngineError && error.code === "MISSING_STAGE_INPUT",
      );

      writeFileSync(join(root, "SYSTEM-DESIGN.md"), "# design\n");
      const writes: string[] = [];
      await runStagePlan({
        plan: parseStagePlan("workspacify"),
        workspace: model,
        options: loopOptions(model),
        deps: makeDeps([], {
          runStageCommand: async (input) => {
            writes.push(input.command);
          },
          assertPrecondition: undefined,
          assertArtifact: () => {},
        }),
      });
      assert.deepStrictEqual(writes, ["/workspacify-tree", "/workspacify-allocate"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
