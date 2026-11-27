// stage-engine.test.ts — the five-loop scheduler: cwd, counters, barriers, cycle.
//
// These tests drive runStagePlan with a fake snapshot, a fake command runner and a
// fake implementation loop. They assert the full command log, because a wrong
// phase order is the failure mode this ticket exists to prevent.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  StageEngineError,
  defaultAssertArtifact,
  defaultAssertPrecondition,
  runStagePlan,
} from "./stage-engine.js";
import type {
  PipelineStepRecord,
  StageCheckInput,
  StageCommandInput,
  StageEngineDeps,
  StageRunRecord,
} from "./stage-engine.js";
import type { PipelinePackageSnapshot, PipelineSnapshot } from "./pipeline-snapshot.js";
import { parseStagePlan } from "./stage-plan.js";
import type { StageName, StagePlan } from "./stage-plan.js";
import type { WorkspaceLoopOptions } from "./runner.js";
import type { WorkspaceModel, WorkspacePackage } from "./workspace.js";
import {
  DRILL_OVERRIDE,
  EDUCE_FIXED_SPEC_OVERRIDE,
  EXPLAIN_OVERRIDE,
  GRILL_OVERRIDE,
} from "./command-history.js";

const WORKSPACE_STAGES: readonly StageName[] = ["workspacify", "educe", "smooth"];
const PACKAGE_STAGES: readonly StageName[] = ["explain", "grill", "graphify", "boundify", "split"];

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
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

function workspace(): WorkspaceModel {
  return {
    root: "/ws",
    name: "ws",
    packages: [packageEntry("pkg-a", "a"), packageEntry("pkg-b", "b")],
  };
}

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

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
interface CommandRecord {
  command: string;
  cwd: string;
  stage: StageName;
  round: number;
  packageId: string | null;
  promptOverride?: string;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
interface FakeState {
  readonly counts: Map<string, number>;
  readonly endpoints: Set<string>;
  readonly digests: Map<string, string>;
  readonly drillAdds: Set<string>;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function key(stage: StageName, directory: string): string {
  return `${stage}:${directory}`;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function createFakeState(overrides: Partial<FakeState> = {}): FakeState {
  return {
    counts: new Map(),
    endpoints: new Set(["pkg-a", "pkg-b"]),
    digests: new Map(),
    drillAdds: new Set(),
    ...overrides,
  };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function snapshotOf(
  state: FakeState,
  plan: StagePlan,
  model: WorkspaceModel,
  root = "/ws",
): PipelineSnapshot {
  const packages: PipelinePackageSnapshot[] = model.packages.map((pkg) => ({
    id: pkg.id,
    path: pkg.path,
    directory: pkg.directory,
    tickets: null,
    ticketSetDigest: state.digests.get(pkg.id) ?? `sha256:${pkg.id}`,
    endpoint: state.endpoints.has(pkg.id),
    seedRequired: true,
    counts: new Map(PACKAGE_STAGES.map((stage) => [stage, state.counts.get(key(stage, pkg.directory)) ?? 0])),
  }));
  return {
    root,
    plan,
    rootCounts: new Map(WORKSPACE_STAGES.map((stage) => [stage, state.counts.get(key(stage, root)) ?? 0])),
    packages,
  };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
interface FakeDeps {
  readonly deps: StageEngineDeps;
  readonly records: CommandRecord[];
  readonly calls: string[];
  selected(): readonly StageName[] | undefined;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function createFakeDeps(
  state: FakeState,
  overrides: Partial<StageEngineDeps> = {},
  model: WorkspaceModel = workspace(),
): FakeDeps {
  const records: CommandRecord[] = [];
  const calls: string[] = [];
  let selectedSeen: readonly StageName[] | undefined;

  const deps: StageEngineDeps = {
    runStageCommand: async (input: StageCommandInput) => {
      records.push({ ...input });
      state.counts.set(key(input.stage, input.cwd), (state.counts.get(key(input.stage, input.cwd)) ?? 0) + 1);
      if (input.stage === "drill" && input.packageId !== null && state.drillAdds.has(input.packageId)) {
        state.drillAdds.delete(input.packageId);
        state.digests.set(input.packageId, `sha256:${input.packageId}:changed`);
      }
    },
    runImplementationLoop: async (options: WorkspaceLoopOptions) => {
      calls.push("loop");
      selectedSeen = options.selectedImplementationStages === undefined
        ? undefined
        : [...options.selectedImplementationStages];
      for (const pkg of options.workspace.packages) state.endpoints.add(pkg.id);
      return { processed: 1, allSelectedComplete: true };
    },
    readWorkspace: (_plan, orderStartStage) => {
      calls.push(orderStartStage);
      return model;
    },
    readSnapshot: ({ root, plan, workspace: snapModel }) => snapshotOf(state, plan, snapModel, root),
    assertPrecondition: () => {},
    assertArtifact: () => {},
    ...overrides,
  };

  return {
    deps,
    records,
    calls,
    selected: () => selectedSeen,
  };
}

describe("runStagePlan — command contract", () => {
  it("uses the root for workspace stages and the package directory for package stages", async () => {
    const originalCwd = process.cwd();
    const fake = createFakeDeps(createFakeState());

    await runStagePlan({
      plan: parseStagePlan("educe,explain,grill"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });

    assert.deepStrictEqual(
      fake.records.map((record) => `${record.stage}:${record.cwd}`),
      ["educe:/ws", "explain:/ws/a", "explain:/ws/b", "grill:/ws/a", "grill:/ws/b"],
    );
    assert.strictEqual(process.cwd(), originalCwd);
  });

  it("runs a package stage N rounds across every package and a workspace stage N times", async () => {
    const fake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("grill:2"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });
    assert.deepStrictEqual(
      fake.records
        .filter((record) => record.stage === "grill")
        .map((record) => `${record.round}:${record.packageId}`),
      ["1:pkg-a", "1:pkg-b", "2:pkg-a", "2:pkg-b"],
    );

    const smoothFake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("smooth:2"),
      workspace: workspace(),
      options: loopOptions(),
      deps: smoothFake.deps,
    });
    assert.deepStrictEqual(
      smoothFake.records
        .filter((record) => record.stage === "smooth")
        .map((record) => `${record.round}:${record.cwd}`),
      ["1:/ws", "2:/ws"],
    );
  });

  it("skips a stage whose recorded count already reached the target", async () => {
    const state = createFakeState({
      counts: new Map([
        [key("graphify", "/ws/a"), 1],
        [key("graphify", "/ws/b"), 2],
      ]),
    });
    const fake = createFakeDeps(state);

    await runStagePlan({
      plan: parseStagePlan("graphify:2"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });

    assert.deepStrictEqual(
      fake.records.filter((record) => record.stage === "graphify").map((record) => `${record.round}:${record.packageId}`),
      ["2:pkg-a"],
    );
  });

  it("runs when the count cannot be proved", async () => {
    const state = createFakeState({
      counts: new Map([[key("split", "/ws/a"), 0], [key("split", "/ws/b"), 0]]),
    });
    const fake = createFakeDeps(state);
    await runStagePlan({
      plan: parseStagePlan("split,make"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });
    assert.strictEqual(fake.records.filter((record) => record.stage === "split").length, 2);
  });

  it("sends the declared prompt override to educe, explain, grill and drill", async () => {
    const fake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("educe,explain,grill"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });
    assert.strictEqual(fake.records.find((record) => record.stage === "educe")?.promptOverride, EDUCE_FIXED_SPEC_OVERRIDE);
    assert.strictEqual(fake.records.find((record) => record.stage === "explain")?.promptOverride, EXPLAIN_OVERRIDE);
    assert.strictEqual(fake.records.find((record) => record.stage === "grill")?.promptOverride, GRILL_OVERRIDE);

    const drillFake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("crystalize,drill"),
      workspace: workspace(),
      options: loopOptions(),
      deps: drillFake.deps,
    });
    const drill = drillFake.records.find((record) => record.stage === "drill");
    assert.strictEqual(drill?.command, "/drill-rfc-down");
    assert.strictEqual(drill?.promptOverride, DRILL_OVERRIDE);
    assert.strictEqual(drill?.cwd, "/ws/a");
    assert.strictEqual(drill?.round, 1);
  });

  it("runs workspacify's two commands consecutively and re-reads the model for educe", async () => {
    const fake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("workspacify,educe"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });
    assert.deepStrictEqual(fake.records.map((record) => record.command), [
      "/workspacify-tree",
      "/workspacify-allocate",
      "/educe-sequences",
    ]);
    assert.deepStrictEqual(fake.calls, ["educe"]);
  });

  it("re-reads the model after split and delegates the implementation group once", async () => {
    const fake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("split,make,plan"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });
    assert.deepStrictEqual(fake.records.map((record) => record.command), [
      "/split-to-tickets",
      "/split-to-tickets",
    ]);
    assert.deepStrictEqual(fake.calls, ["make", "make", "make", "loop"]);
    assert.deepStrictEqual(fake.selected(), ["make", "plan"]);
  });

  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("delegates the implementation group as one no-filter loop", async () => {
    const fake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("make,plan,start,review,resolve,consolidate,find"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });
    assert.strictEqual(fake.records.length, 0);
    assert.deepStrictEqual(fake.calls, ["make", "loop"]);
    assert.strictEqual(fake.selected(), undefined);
  });

  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("C003: a skipped split still reads the implementation order before the loop", async () => {
    const state = createFakeState({
      counts: new Map([
        [key("split", "/ws/a"), 1],
        [key("split", "/ws/b"), 1],
      ]),
    });
    const fake = createFakeDeps(state);

    await runStagePlan({
      plan: parseStagePlan("split,make"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });

    assert.deepStrictEqual(fake.calls, ["make", "loop"]);
    assert.strictEqual(fake.records.some((record) => record.stage === "split"), false);
  });

  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("C003: the loop never receives the build-order model", async () => {
    let loopPackages: string[] = [];
    const state = createFakeState({
      counts: new Map([
        [key("split", "/ws/a"), 1],
        [key("split", "/ws/b"), 1],
      ]),
    });
    const fake = createFakeDeps(state, {
      readWorkspace: (_plan, orderStartStage) =>
        orderStartStage === "make"
          ? workspace()
          : { ...workspace(), packages: [...workspace().packages].reverse() },
      runImplementationLoop: async (options) => {
        loopPackages = options.workspace.packages.map((pkg) => pkg.id);
        return { processed: 1, allSelectedComplete: true };
      },
    });

    await runStagePlan({
      plan: parseStagePlan("split,make"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });

    assert.deepStrictEqual(loopPackages, ["pkg-a", "pkg-b"]);
  });

  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("C004: a stage whose counter never advances stops instead of looping", async () => {
    const records: StageCommandInput[] = [];
    const fake = createFakeDeps(createFakeState());
    const deps: StageEngineDeps = {
      ...fake.deps,
      runStageCommand: async (input) => {
        records.push(input);
      },
    };

    await assert.rejects(
      runStagePlan({
        plan: parseStagePlan("educe:2"),
        workspace: workspace(),
        options: loopOptions(),
        deps,
      }),
      (error: unknown) => error instanceof StageEngineError && error.code === "STAGE_NOT_ADVANCING",
    );
    assert.strictEqual(records.filter((record) => record.stage === "educe").length, 1);
  });

  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("C004: an advancing counter is not stopped", async () => {
    const fake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("educe:2"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });
    assert.strictEqual(fake.records.filter((record) => record.stage === "educe").length, 2);
  });

  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("C001: grill round 2 runs only for a package below the target", async () => {
    const state = createFakeState({
      counts: new Map([
        [key("grill", "/ws/a"), 1],
        [key("grill", "/ws/b"), 2],
      ]),
    });
    const fake = createFakeDeps(state);

    await runStagePlan({
      plan: parseStagePlan("grill:2"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });

    assert.deepStrictEqual(
      fake.records.map((record) => `${record.round}:${record.packageId}`),
      ["2:pkg-a"],
    );
  });

  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  it("C003: the full plan skips upstream at target and ships every package", async () => {
    const packages = Array.from({ length: 23 }, (_, index) =>
      packageEntry(`pkg-${index}`, `pkg-${index}`),
    );
    const model: WorkspaceModel = { root: "/ws", name: "ws", packages };
    const counts = new Map<string, number>([
      [key("workspacify", "/ws"), 1],
      [key("educe", "/ws"), 2],
      [key("smooth", "/ws"), 2],
    ]);
    for (const pkg of packages) {
      counts.set(key("explain", pkg.directory), 1);
      counts.set(key("grill", pkg.directory), 2);
      counts.set(key("graphify", pkg.directory), 1);
      counts.set(key("boundify", pkg.directory), 1);
      counts.set(key("split", pkg.directory), 1);
    }
    const state = createFakeState({
      counts,
      endpoints: new Set(packages.map((pkg) => pkg.id)),
    });
    const fake = createFakeDeps(state, {}, model);

    await runStagePlan({
      plan: parseStagePlan(
        "workspacify,educe:2,explain,grill:2,smooth:2,graphify:1,boundify:1,split:1,make,plan,start,review,resolve,consolidate,find,crystalize,drill",
      ),
      workspace: model,
      options: loopOptions(model),
      deps: fake.deps,
    });

    const upstreamStages = new Set([
      "workspacify",
      "educe",
      "explain",
      "grill",
      "smooth",
      "graphify",
      "boundify",
      "split",
    ]);
    assert.strictEqual(
      fake.records.filter((record) => upstreamStages.has(record.stage)).length,
      0,
    );
    assert.strictEqual(fake.calls.filter((call) => call === "loop").length, 1);
    assert.strictEqual(fake.records.filter((record) => record.stage === "crystalize").length, 23);
    assert.strictEqual(fake.records.filter((record) => record.stage === "drill").length, 23);
    assert.strictEqual(fake.records.at(-1)?.stage, "drill");
  });

  it("reports skip, run, delegate and complete decisions with metrics", async () => {
    const state = createFakeState({
      counts: new Map([
        [key("split", "/ws/a"), 1],
        [key("split", "/ws/b"), 0],
      ]),
    });
    const fake = createFakeDeps(state);
    const steps: PipelineStepRecord[] = [];

    await runStagePlan({
      plan: parseStagePlan("split,make"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
      onPipelineStep: (record) => steps.push(record),
    });

    assert.deepStrictEqual(steps.map((step) => step.decision), ["skip", "run", "delegate", "complete"]);
    assert.strictEqual(steps[0]?.stage, "split");
    assert.strictEqual(steps[0]?.packageId, "pkg-a");
    assert.strictEqual(steps[1]?.packageId, "pkg-b");
    assert.strictEqual(steps[1]?.round, 1);
    const final = steps[steps.length - 1];
    assert.strictEqual(final?.runs, 1);
    assert.strictEqual(final?.skips, 1);
    assert.strictEqual(final?.cycles, 0);
    assert.strictEqual(final?.reason, "workspace-complete");
  });

  it("stops on a non-zero stage command and sends no later command", async () => {
    const recorded: StageCommandInput[] = [];
    const fake = createFakeDeps(createFakeState(), {
      runStageCommand: async (input) => {
        recorded.push({ ...input });
        throw new Error("command failed");
      },
    });
    await assert.rejects(() =>
      runStagePlan({
        plan: parseStagePlan("explain,grill"),
        workspace: workspace(),
        options: loopOptions(),
        deps: fake.deps,
      }),
    );
    assert.strictEqual(recorded.length, 1);
  });
});

describe("runStagePlan — barriers and cycle", () => {
  it("refuses crystalize while one package is not endpoint and sends no command", async () => {
    const state = createFakeState({ endpoints: new Set(["pkg-a"]) });
    const fake = createFakeDeps(state);

    await assert.rejects(
      () =>
        runStagePlan({
          plan: parseStagePlan("crystalize"),
          workspace: workspace(),
          options: loopOptions(),
          deps: fake.deps,
        }),
      (error: unknown) =>
        error instanceof Error && error.name === "PipelineActionError",
    );
    assert.strictEqual(fake.records.length, 0);
  });

  it("runs crystalize for every package before any drill", async () => {
    const fake = createFakeDeps(createFakeState());
    await runStagePlan({
      plan: parseStagePlan("crystalize,drill"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });

    assert.deepStrictEqual(
      fake.records.map((record) => `${record.stage}:${record.packageId}`),
      [
        "crystalize:pkg-a",
        "crystalize:pkg-b",
        "drill:pkg-a",
        "drill:pkg-b",
      ],
    );
  });

  it("returns to implementation when drill adds a ticket, then completes when it adds none", async () => {
    const state = createFakeState({ drillAdds: new Set(["pkg-b"]) });
    const fake = createFakeDeps(state);
    const steps: PipelineStepRecord[] = [];

    await runStagePlan({
      plan: parseStagePlan("make,plan,start,review,resolve,consolidate,find,crystalize,drill"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
      onPipelineStep: (record) => steps.push(record),
    });

    const stages = fake.records.map((record) => `${record.stage}:${record.packageId ?? "root"}`);
    assert.deepStrictEqual(stages, [
      "crystalize:pkg-a",
      "crystalize:pkg-b",
      "drill:pkg-a",
      "drill:pkg-b",
      "crystalize:pkg-a",
      "crystalize:pkg-b",
      "drill:pkg-a",
      "drill:pkg-b",
    ]);
    assert.strictEqual(fake.calls.filter((call) => call === "loop").length, 2);
    const final = steps.find((step) => step.decision === "complete");
    assert.strictEqual(final?.cycles, 1);
  });

  it("ends after evolve when tickets were added but implementation is outside the slice", async () => {
    const state = createFakeState({ drillAdds: new Set(["pkg-b"]) });
    const fake = createFakeDeps(state);

    await runStagePlan({
      plan: parseStagePlan("crystalize,drill"),
      workspace: workspace(),
      options: loopOptions(),
      deps: fake.deps,
    });

    assert.strictEqual(fake.calls.includes("loop"), false);
    assert.deepStrictEqual(
      fake.records.map((record) => `${record.stage}:${record.packageId}`),
      ["crystalize:pkg-a", "crystalize:pkg-b", "drill:pkg-a", "drill:pkg-b"],
    );
  });

  it("stops before ship when the implementation budget is exhausted", async () => {
    const state = createFakeState({ endpoints: new Set() });
    const fake = createFakeDeps(state, {
      runImplementationLoop: async () => {
        fake.calls.push("loop");
        return { processed: 1, allSelectedComplete: false };
      },
    });

    await runStagePlan({
      plan: parseStagePlan("find,crystalize"),
      workspace: workspace(),
      options: { ...loopOptions(), maxCount: 1 },
      deps: fake.deps,
    });

    assert.strictEqual(fake.records.length, 0);
    assert.strictEqual(fake.calls.filter((call) => call === "loop").length, 1);
  });
});

describe("default stage gates", () => {
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
  function checkInput(stage: StageName, cwd: string, pkg: WorkspacePackage | null): StageCheckInput {
    return { stage, cwd, pkg, workspace: workspace() };
  }

  it("requires RFC, GRAPH and Dirs-Tree before drill", () => {
    const root = mkdtempSync(join(tmpdir(), "px455-gate-"));
    try {
      const cwd = join(root, "pkg-a");
      mkdirSync(cwd, { recursive: true });
      const pkg: WorkspacePackage = { ...packageEntry("pkg-a", "pkg-a"), directory: cwd, ticketsPath: join(cwd, "Tickets.json") };
      assert.throws(
        () => defaultAssertPrecondition(checkInput("drill", cwd, pkg)),
        (error: unknown) => error instanceof StageEngineError && error.code === "MISSING_STAGE_INPUT",
      );
      writeFileSync(join(cwd, "RFC.md"), "# rfc\n");
      writeFileSync(join(cwd, "RFC-GRAPH.json"), "{}");
      writeFileSync(join(cwd, "RFC-Dirs-Tree.json"), "{}");
      assert.doesNotThrow(() => defaultAssertPrecondition(checkInput("drill", cwd, pkg)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires Tickets.json after drill", () => {
    const root = mkdtempSync(join(tmpdir(), "px455-gate-"));
    try {
      const cwd = join(root, "pkg-a");
      mkdirSync(cwd, { recursive: true });
      const pkg: WorkspacePackage = { ...packageEntry("pkg-a", "pkg-a"), directory: cwd, ticketsPath: join(cwd, "Tickets.json") };
      assert.throws(
        () => defaultAssertArtifact(checkInput("drill", cwd, pkg)),
        (error: unknown) => error instanceof StageEngineError && error.code === "MISSING_STAGE_ARTIFACT",
      );
      writeFileSync(join(cwd, "Tickets.json"), "{}");
      assert.doesNotThrow(() => defaultAssertArtifact(checkInput("drill", cwd, pkg)));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires SYSTEM-DESIGN.md before workspacify", async () => {
    const root = mkdtempSync(join(tmpdir(), "px455-gate-"));
    const model: WorkspaceModel = { root, name: "ws", packages: [] };
    try {
      const state = createFakeState();
      const fake = createFakeDeps(state, {
        assertPrecondition: undefined,
        readSnapshot: ({ plan, workspace: snapModel }) => snapshotOf(state, plan, snapModel, root),
      });
      await assert.rejects(
        () =>
          runStagePlan({
            plan: parseStagePlan("workspacify"),
            workspace: model,
            options: loopOptions(model),
            deps: fake.deps,
          }),
        (error: unknown) => error instanceof StageEngineError && error.code === "MISSING_STAGE_INPUT",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
