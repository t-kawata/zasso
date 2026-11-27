// pipeline-action.test.ts — the pure phase reducer that decides every command.
//
// These tests drive the reducer directly. They require one action per step, the
// exact barrier order, a return to implementation only on a digest change, and a
// deterministic answer for the same snapshot and state.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PipelineActionError,
  advanceAfterImplementation,
  createInitialPipelineState,
  deriveNextPipelineStep,
} from "./pipeline-action.js";
import type { PipelineRunState } from "./pipeline-action.js";
import type { PipelinePackageSnapshot, PipelineSnapshot } from "./pipeline-snapshot.js";
import type { StageName, StagePlan } from "./stage-plan.js";
import type { TicketsJson } from "./tickets.js";

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function plan(...entries: Array<[StageName, number?]>): StagePlan {
  return { selections: entries.map(([name, count = 1]) => ({ name, count })) };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function createPackage(
  id: string,
  overrides: Partial<PipelinePackageSnapshot> = {},
): PipelinePackageSnapshot {
  return {
    id,
    path: id,
    directory: `/ws/${id}`,
    tickets: null,
    ticketSetDigest: `sha256:${id}`,
    endpoint: false,
    seedRequired: true,
    counts: new Map(),
    ...overrides,
  };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function createSnapshot(
  packages: PipelinePackageSnapshot[],
  selected: StagePlan,
  rootCounts: ReadonlyMap<StageName, number | null> = new Map(),
): PipelineSnapshot {
  return { root: "/ws", packages, rootCounts, plan: selected };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function state(overrides: Partial<PipelineRunState> = {}): PipelineRunState {
  return {
    phase: "upstream",
    shipIndex: 0,
    shipRound: 1,
    evolveIndex: 0,
    baseline: new Map(),
    remainingBudget: 100,
    implementationRan: false,
    implementationSettled: false,
    ...overrides,
  };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function reviewedTickets(): TicketsJson {
  return { phases: [{ id: 0, tickets: [{ id: 1, status: "reviewed" }] }] } as TicketsJson;
}

describe("upstream phase", () => {
  it("returns the first unsatisfied package stage in canonical order", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { counts: new Map([["explain", 0], ["grill", 0]]) }),
        createPackage("pkg-b", { counts: new Map([["explain", 1], ["grill", 0]]) }),
      ],
      plan(["explain", 1], ["grill", 1]),
    );

    const step = deriveNextPipelineStep(snapshot, state());
    assert.equal(step.action.kind, "stage");
    if (step.action.kind !== "stage") return;
    assert.equal(step.action.stage, "explain");
    assert.equal(step.action.packageId, "pkg-a");
    assert.equal(step.action.layer, "upstream");
    assert.equal(step.action.round, 1);
  });

  it("skips a satisfied package and returns the next one", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { counts: new Map([["explain", 1]]) }),
        createPackage("pkg-b", { counts: new Map([["explain", 0]]) }),
      ],
      plan(["explain", 1]),
    );

    const step = deriveNextPipelineStep(snapshot, state());
    assert.equal(step.action.kind, "stage");
    if (step.action.kind !== "stage") return;
    assert.equal(step.action.packageId, "pkg-b");
  });

  it("uses the root count for a workspace-scoped stage", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a")],
      plan(["educe", 2]),
      new Map<StageName, number | null>([["educe", 1]]),
    );

    const step = deriveNextPipelineStep(snapshot, state());
    assert.equal(step.action.kind, "stage");
    if (step.action.kind !== "stage") return;
    assert.equal(step.action.stage, "educe");
    assert.equal(step.action.packageId, null);
    assert.equal(step.action.round, 2);
  });

  it("reports the upstream pairs the recorded counts already satisfied", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { counts: new Map([["explain", 1]]) }),
        createPackage("pkg-b", { counts: new Map([["explain", 1]]) }),
      ],
      plan(["explain", 1], ["make"]),
    );

    const step = deriveNextPipelineStep(snapshot, state());
    assert.deepEqual(step.skipped, [
      { stage: "explain", packageId: "pkg-a" },
      { stage: "explain", packageId: "pkg-b" },
    ]);
    assert.deepEqual(step.action, { kind: "implement" });
  });

  it("advances to implementation when every upstream stage is satisfied", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { counts: new Map([["explain", 1]]) })],
      plan(["explain", 1], ["make"]),
    );

    const step = deriveNextPipelineStep(snapshot, state());
    assert.deepEqual(step.action, { kind: "implement" });
    assert.equal(step.nextState.phase, "implement");
    assert.equal(step.nextState.implementationRan, false);
  });

  it("skips explain and grill for a package that owes no seed", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { seedRequired: false, counts: new Map([["explain", 0]]) })],
      plan(["explain", 1], ["make"]),
    );

    const step = deriveNextPipelineStep(snapshot, state());
    assert.deepEqual(step.action, { kind: "implement" });
  });
});

describe("implementation phase", () => {
  it("returns implement while a package is not endpoint", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { endpoint: false })],
      plan(["make"]),
    );

    const step = deriveNextPipelineStep(snapshot, state({ phase: "implement" }));
    assert.deepEqual(step.action, { kind: "implement" });
    assert.equal(step.nextState.phase, "implement");
  });

  it("calls the implementation loop once even when every package is already endpoint", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { endpoint: true, tickets: reviewedTickets() })],
      plan(["make"]),
    );

    const step = deriveNextPipelineStep(
      snapshot,
      state({ phase: "implement", implementationRan: false }),
    );
    assert.deepEqual(step.action, { kind: "implement" });
  });

  it("enters ship after the implementation loop ran and every package is endpoint", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { endpoint: true, tickets: reviewedTickets() })],
      plan(["make"], ["crystalize"], ["drill"]),
    );

    const step = deriveNextPipelineStep(
      snapshot,
      state({ phase: "implement", implementationRan: true }),
    );
    assert.equal(step.action.kind, "stage");
    if (step.action.kind !== "stage") return;
    assert.equal(step.action.stage, "crystalize");
    assert.equal(step.action.layer, "ship");
    assert.equal(step.nextState.phase, "ship");
    assert.equal(step.nextState.baseline.get("pkg-a"), "sha256:pkg-a");
  });

  it("stops with the recorded reason", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a")],
      plan(["make"]),
    );

    const step = deriveNextPipelineStep(
      snapshot,
      state({ phase: "implement", stopReason: "budget-exhausted" }),
    );
    assert.deepEqual(step.action, { kind: "complete", reason: "budget-exhausted" });
  });

  it("advances the budget and records a stop when no progress is made", () => {
    const advanced = advanceAfterImplementation(state({ phase: "implement", remainingBudget: 3 }), {
      processed: 1,
      allSelectedComplete: false,
    });
    assert.equal(advanced.remainingBudget, 2);
    assert.equal(advanced.stopReason, undefined);

    const stopped = advanceAfterImplementation(state({ phase: "implement", remainingBudget: 3 }), {
      processed: 0,
      allSelectedComplete: false,
    });
    assert.equal(stopped.stopReason, "implementation-stopped");

    const exhausted = advanceAfterImplementation(state({ phase: "implement", remainingBudget: 1 }), {
      processed: 1,
      allSelectedComplete: false,
    });
    assert.equal(exhausted.stopReason, "budget-exhausted");
  });
});

describe("ship barrier", () => {
  it("refuses crystalize while one package is not endpoint", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { endpoint: true, tickets: reviewedTickets() }),
        createPackage("pkg-b", { endpoint: false }),
      ],
      plan(["make"], ["crystalize"]),
    );

    assert.throws(
      () => deriveNextPipelineStep(snapshot, state({ phase: "ship" })),
      (error: unknown) =>
        error instanceof PipelineActionError && error.code === "IMPLEMENTATION_NOT_SETTLED",
    );
  });

  it("runs the requested number of shipping passes", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { endpoint: true, tickets: reviewedTickets() }),
        createPackage("pkg-b", { endpoint: true, tickets: reviewedTickets() }),
      ],
      plan(["crystalize", 2], ["drill"]),
    );
    let current = state({
      phase: "ship",
      baseline: new Map([["pkg-a", "sha256:pkg-a"], ["pkg-b", "sha256:pkg-b"]]),
    });
    const passes: Array<[string, number]> = [];
    for (;;) {
      const step = deriveNextPipelineStep(snapshot, current);
      if (step.action.kind !== "stage" || step.action.stage !== "crystalize") break;
      passes.push([step.action.packageId ?? "", step.action.round]);
      current = step.nextState;
    }
    assert.deepEqual(passes, [["pkg-a", 1], ["pkg-b", 1], ["pkg-a", 2], ["pkg-b", 2]]);
    const next = deriveNextPipelineStep(snapshot, current);
    assert.equal(next.action.kind, "stage");
    if (next.action.kind !== "stage") return;
    assert.equal(next.action.stage, "drill");
  });

  it("returns crystalize for each package in proved order", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { endpoint: true, tickets: reviewedTickets() }),
        createPackage("pkg-b", { endpoint: true, tickets: reviewedTickets() }),
      ],
      plan(["make"], ["crystalize"], ["drill"]),
    );

    const first = deriveNextPipelineStep(
      snapshot,
      state({ phase: "ship", baseline: new Map([["pkg-a", "sha256:pkg-a"], ["pkg-b", "sha256:pkg-b"]]) }),
    );
    assert.equal(first.action.kind, "stage");
    if (first.action.kind !== "stage") return;
    assert.equal(first.action.stage, "crystalize");
    assert.equal(first.action.packageId, "pkg-a");
    assert.equal(first.nextState.shipIndex, 1);

    const second = deriveNextPipelineStep(snapshot, first.nextState);
    assert.equal(second.action.kind, "stage");
    if (second.action.kind !== "stage") return;
    assert.equal(second.action.packageId, "pkg-b");
    assert.equal(second.nextState.phase, "ship");
    assert.equal(second.nextState.shipIndex, 2);

    const third = deriveNextPipelineStep(snapshot, second.nextState);
    assert.equal(third.action.kind, "stage");
    if (third.action.kind !== "stage") return;
    assert.equal(third.action.stage, "drill");
    assert.equal(third.action.packageId, "pkg-a");
  });
});

describe("evolve phase", () => {
  it("returns drill for each package in proved order", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { endpoint: true, tickets: reviewedTickets() }),
        createPackage("pkg-b", { endpoint: true, tickets: reviewedTickets() }),
      ],
      plan(["crystalize"], ["drill"]),
    );
    const baseline = new Map([["pkg-a", "sha256:pkg-a"], ["pkg-b", "sha256:pkg-b"]]);

    const step = deriveNextPipelineStep(snapshot, state({ phase: "evolve", baseline }));
    assert.equal(step.action.kind, "stage");
    if (step.action.kind !== "stage") return;
    assert.equal(step.action.stage, "drill");
    assert.equal(step.action.packageId, "pkg-a");
    assert.equal(step.action.layer, "evolve");
  });

  it("returns to implementation when a digest changed", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { ticketSetDigest: "sha256:changed" }),
        createPackage("pkg-b", { ticketSetDigest: "sha256:same" }),
      ],
      plan(["make"], ["crystalize"], ["drill"]),
    );
    const baseline = new Map([["pkg-a", "sha256:before"], ["pkg-b", "sha256:before"]]);

    const step = deriveNextPipelineStep(
      snapshot,
      state({ phase: "evolve", evolveIndex: 2, baseline }),
    );
    assert.deepEqual(step.action, { kind: "implement" });
    assert.equal(step.nextState.phase, "implement");
    assert.equal(step.nextState.implementationRan, false);
    assert.equal(step.nextState.shipIndex, 0);
    assert.equal(step.nextState.evolveIndex, 0);
  });

  it("completes when every digest is unchanged", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { ticketSetDigest: "sha256:same" })],
      plan(["crystalize"], ["drill"]),
    );
    const baseline = new Map([["pkg-a", "sha256:same"]]);

    const step = deriveNextPipelineStep(
      snapshot,
      state({ phase: "evolve", evolveIndex: 1, baseline }),
    );
    assert.deepEqual(step.action, { kind: "complete", reason: "workspace-complete" });
  });

  it("returns to implementation when a package has no baseline digest", () => {
    const snapshot = createSnapshot(
      [
        createPackage("pkg-a", { ticketSetDigest: "sha256:same" }),
        createPackage("pkg-new", { ticketSetDigest: "sha256:new" }),
      ],
      plan(["make"], ["crystalize"], ["drill"]),
    );
    const baseline = new Map([["pkg-a", "sha256:same"]]);

    const step = deriveNextPipelineStep(
      snapshot,
      state({ phase: "evolve", evolveIndex: 2, baseline }),
    );
    assert.equal(step.action.kind, "implement");
  });
});

describe("total and deterministic derivation", () => {
  it("returns the same step for the same snapshot and state", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { counts: new Map([["split", 0]]) })],
      plan(["split"], ["make"]),
    );
    assert.deepEqual(deriveNextPipelineStep(snapshot, state()), deriveNextPipelineStep(snapshot, state()));
  });

  it("raises a named error for an unknown ticket status", () => {
    const tickets = {
      phases: [{ id: 0, tickets: [{ id: 1, status: "not-a-status" }] }],
    } as TicketsJson;
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { tickets })],
      plan(["make"]),
    );

    assert.throws(
      () => deriveNextPipelineStep(snapshot, state({ phase: "implement" })),
      (error: unknown) =>
        error instanceof PipelineActionError && error.code === "INVALID_TICKET_STATUS",
    );
  });

  it("never returns a stage outside the selected slice", () => {
    const snapshot = createSnapshot(
      [createPackage("pkg-a", { endpoint: true, tickets: reviewedTickets() })],
      plan(["make"]),
    );
    const step = deriveNextPipelineStep(
      snapshot,
      state({ phase: "implement", implementationRan: true }),
    );
    assert.deepEqual(step.action, { kind: "complete", reason: "workspace-complete" });
  });
});

describe("initial state", () => {
  it("starts at upstream with the full budget", () => {
    assert.deepEqual(createInitialPipelineState(plan(["make"]), 7), {
      phase: "upstream",
      shipIndex: 0,
      shipRound: 1,
      evolveIndex: 0,
      baseline: new Map(),
      remainingBudget: 7,
      implementationRan: false,
      implementationSettled: false,
    });
  });
});
