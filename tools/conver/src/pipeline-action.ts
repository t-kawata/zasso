// pipeline-action.ts — the pure phase reducer that decides one command at a time.
//
// The scheduler never keeps a command list. Every step asks this reducer for one
// action and the state after it. A phase transition happens only when the cursor
// has passed the last package, so the next step re-reads the workspace before any
// command of the next phase is sent.
import type { PipelineSnapshot } from "./pipeline-snapshot.js";
import { decideStageRun } from "./stage-counters.js";
import { IMPLEMENTATION_STAGES } from "./stage-plan.js";
import type { StageName, StagePlan } from "./stage-plan.js";
import { isKnownTicketStatus, ticketKeyOf } from "./ticket-status.js";

/** The workspace-wide loops in execution order. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type PipelinePhase = "upstream" | "implement" | "ship" | "evolve" | "complete";

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type PipelineStopReason = "budget-exhausted" | "implementation-stopped";

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type PipelineCompletionReason =
  | "workspace-complete"
  | "no-selected-work"
  | "implementation-not-selected"
  | PipelineStopReason;

/** The minimal in-run state; every other fact is re-read from the snapshot. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface PipelineRunState {
  readonly phase: PipelinePhase;
  readonly shipIndex: number;
  readonly shipRound: number;
  readonly evolveIndex: number;
  readonly baseline: ReadonlyMap<string, string>;
  readonly remainingBudget: number;
  readonly implementationRan: boolean;
  readonly implementationSettled: boolean;
  readonly stopReason?: PipelineStopReason;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type PipelineStageLayer = "upstream" | "ship" | "evolve";

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type PipelineAction =
  | {
      readonly kind: "stage";
      readonly layer: PipelineStageLayer;
      readonly stage: StageName;
      readonly packageId: string | null;
      readonly round: number;
    }
  | { readonly kind: "implement" }
  | { readonly kind: "complete"; readonly reason: PipelineCompletionReason };

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
/** One upstream (stage, package) pair that the count already satisfied. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface PipelineSkip {
  readonly stage: StageName;
  readonly packageId: string | null;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface PipelineStep {
  readonly action: PipelineAction;
  readonly nextState: PipelineRunState;
  readonly skipped: readonly PipelineSkip[];
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type PipelineActionErrorCode =
  | "IMPLEMENTATION_NOT_SETTLED"
  | "INVALID_TICKET_STATUS"
  | "DRILL_WITHOUT_CRYSTALIZE";

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export class PipelineActionError extends Error {
  constructor(
    readonly code: PipelineActionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PipelineActionError";
  }
}

/** The upstream stages in canonical order. */
const UPSTREAM_STAGES: readonly StageName[] = [
  "workspacify",
  "educe",
  "explain",
  "grill",
  "smooth",
  "graphify",
  "boundify",
  "split",
];

const WORKSPACE_SCOPED_STAGES: ReadonlySet<StageName> = new Set(["workspacify", "educe", "smooth"]);

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function selectedCounts(plan: StagePlan): Map<StageName, number> {
  return new Map(plan.selections.map((selection) => [selection.name, selection.count]));
}

export function createInitialPipelineState(plan: StagePlan, budget: number): PipelineRunState {
  return {
    phase: "upstream",
    shipIndex: 0,
    shipRound: 1,
    evolveIndex: 0,
    baseline: new Map(),
    remainingBudget: budget,
    implementationRan: false,
    implementationSettled: false,
  };
}

/**
 * Fold one implementation-loop outcome into the run state.
 *
 * The budget is cumulative across cycles. A round that processed nothing while the
 * workspace is still unfinished must stop: repeating it would recreate the same
 * snapshot forever.
 */
export function advanceAfterImplementation(
  state: PipelineRunState,
  outcome: { readonly processed: number; readonly allSelectedComplete: boolean },
): PipelineRunState {
  const remaining = state.remainingBudget - Math.max(0, outcome.processed);
  if (outcome.allSelectedComplete) {
    return { ...state, remainingBudget: remaining, implementationRan: true, implementationSettled: true };
  }
  if (remaining <= 0) {
    return { ...state, remainingBudget: 0, implementationRan: true, implementationSettled: false, stopReason: "budget-exhausted" };
  }
  if (outcome.processed <= 0) {
    return { ...state, remainingBudget: remaining, implementationRan: true, implementationSettled: false, stopReason: "implementation-stopped" };
  }
  return { ...state, remainingBudget: remaining, implementationRan: true, implementationSettled: false };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function takeBaseline(snapshot: PipelineSnapshot): Map<string, string> {
  return new Map(snapshot.packages.map((pkg) => [pkg.id, pkg.ticketSetDigest]));
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function digestChanged(snapshot: PipelineSnapshot, baseline: ReadonlyMap<string, string>): boolean {
  if (snapshot.packages.length !== baseline.size) return true;
  return snapshot.packages.some((pkg) => baseline.get(pkg.id) !== pkg.ticketSetDigest);
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function assertImplementationSettled(snapshot: PipelineSnapshot): void {
  const unfinished = snapshot.packages.find((pkg) => !pkg.endpoint);
  if (unfinished !== undefined) {
    throw new PipelineActionError(
      "IMPLEMENTATION_NOT_SETTLED",
      `package ${unfinished.id} is not at its implementation endpoint`,
    );
  }
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function assertKnownTicketStatuses(snapshot: PipelineSnapshot): void {
  for (const pkg of snapshot.packages) {
    if (pkg.tickets === null) continue;
    for (const phase of pkg.tickets.phases) {
      for (const ticket of phase.tickets) {
        if (!isKnownTicketStatus(ticket.status)) {
          throw new PipelineActionError(
            "INVALID_TICKET_STATUS",
            `${ticketKeyOf(phase.id, ticket.id)} has status ${ticket.status}`,
          );
        }
      }
    }
  }
}

/** The first upstream (stage, package) that still owes a run, plus the pairs already satisfied. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
interface UpstreamDecision {
  readonly action: PipelineAction | null;
  readonly skipped: readonly PipelineSkip[];
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function deriveUpstreamAction(
  snapshot: PipelineSnapshot,
  counts: ReadonlyMap<StageName, number>,
): UpstreamDecision {
  const skipped: PipelineSkip[] = [];
  const recorded = new Set<string>();
  const recordSkip = (stage: StageName, packageId: string | null): void => {
    const key = `${stage}:${packageId ?? ""}`;
    if (recorded.has(key)) return;
    recorded.add(key);
    skipped.push({ stage, packageId });
  };

  for (const stage of UPSTREAM_STAGES) {
    const target = counts.get(stage);
    if (target === undefined) continue;

    // The target is cumulative, but the existing pipeline's round shape is kept:
    // every package receives round r before any package receives round r+1.
    for (let round = 1; round <= target; round++) {
      if (WORKSPACE_SCOPED_STAGES.has(stage)) {
        const count = snapshot.rootCounts.get(stage) ?? null;
        if (decideStageRun({ count, target: round }) === "run") {
          return { action: { kind: "stage", layer: "upstream", stage, packageId: null, round }, skipped };
        }
        recordSkip(stage, null);
        continue;
      }

      for (const pkg of snapshot.packages) {
        if ((stage === "explain" || stage === "grill") && !pkg.seedRequired) continue;
        const count = pkg.counts.get(stage) ?? null;
        if (decideStageRun({ count, target: round }) === "run") {
          return { action: { kind: "stage", layer: "upstream", stage, packageId: pkg.id, round }, skipped };
        }
        recordSkip(stage, pkg.id);
      }
    }
  }
  return { action: null, skipped };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function complete(reason: PipelineCompletionReason, state: PipelineRunState): PipelineStep {
  return { action: { kind: "complete", reason }, nextState: { ...state, phase: "complete" }, skipped: [] };
}

/** True when the selected slice contains any implementation stage. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function planSelectsImplementation(plan: StagePlan): boolean {
  return IMPLEMENTATION_STAGES.some((name) => plan.selections.some((selection) => selection.name === name));
}

/** The shipping passes the selected crystalize count asks for, at least one. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function shipPassesOf(counts: ReadonlyMap<StageName, number>): number {
  return Math.max(1, counts.get("crystalize") ?? 1);
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function stepThroughShip(
  snapshot: PipelineSnapshot,
  state: PipelineRunState,
  hasDrill: boolean,
  shipPasses: number,
): PipelineStep {
  assertImplementationSettled(snapshot);
  if (state.shipIndex >= snapshot.packages.length) {
    if (state.shipRound < shipPasses) {
      return stepThroughShip(
        snapshot,
        { ...state, shipRound: state.shipRound + 1, shipIndex: 0 },
        hasDrill,
        shipPasses,
      );
    }
    if (!hasDrill) return complete("workspace-complete", state);
    return stepThroughEvolve(
      snapshot,
      { ...state, phase: "evolve", evolveIndex: 0 },
      planSelectsImplementation(snapshot.plan),
    );
  }
  const pkg = snapshot.packages[state.shipIndex]!;
  return {
    action: { kind: "stage", layer: "ship", stage: "crystalize", packageId: pkg.id, round: state.shipRound },
    nextState: { ...state, shipIndex: state.shipIndex + 1 },
    skipped: [],
  };
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function stepThroughEvolve(
  snapshot: PipelineSnapshot,
  state: PipelineRunState,
  hasImplementation: boolean,
): PipelineStep {
  if (state.evolveIndex < snapshot.packages.length) {
    const pkg = snapshot.packages[state.evolveIndex]!;
    return {
      action: { kind: "stage", layer: "evolve", stage: "drill", packageId: pkg.id, round: 1 },
      nextState: { ...state, evolveIndex: state.evolveIndex + 1 },
      skipped: [],
    };
  }

  if (!digestChanged(snapshot, state.baseline)) {
    return complete("workspace-complete", state);
  }
  if (!hasImplementation) {
    return complete("implementation-not-selected", state);
  }
  return {
    action: { kind: "implement" },
    nextState: {
      ...state,
      phase: "implement",
      shipIndex: 0,
      shipRound: 1,
      evolveIndex: 0,
      baseline: new Map(),
      implementationRan: false,
      implementationSettled: false,
      stopReason: undefined,
    },
    skipped: [],
  };
}

/** The shipping plan the transition needs, grouped so the call stays readable. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
interface ShippingPlan {
  readonly hasCrystalize: boolean;
  readonly hasDrill: boolean;
  readonly shipPasses: number;
  readonly completionReason: PipelineCompletionReason;
}

/** Enter shipping when crystalize is selected, otherwise finish the run. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function enterShippingOrComplete(
  snapshot: PipelineSnapshot,
  state: PipelineRunState,
  shipping: ShippingPlan,
): PipelineStep {
  if (!shipping.hasCrystalize) {
    if (shipping.hasDrill) {
      throw new PipelineActionError(
        "DRILL_WITHOUT_CRYSTALIZE",
        "drill cannot run without crystalize in the selected slice",
      );
    }
    return complete(shipping.completionReason, state);
  }
  assertImplementationSettled(snapshot);
  const shipState: PipelineRunState = {
    ...state,
    phase: "ship",
    shipIndex: 0,
    shipRound: 1,
    evolveIndex: 0,
    baseline: takeBaseline(snapshot),
  };
  return stepThroughShip(snapshot, shipState, shipping.hasDrill, shipping.shipPasses);
}

export function deriveNextPipelineStep(
  snapshot: PipelineSnapshot,
  state: PipelineRunState,
): PipelineStep {
  if (state.stopReason !== undefined) {
    return complete(state.stopReason, state);
  }

  const counts = selectedCounts(snapshot.plan);
  const hasImplementation = IMPLEMENTATION_STAGES.some((name) => counts.has(name));
  const hasCrystalize = counts.has("crystalize");
  const hasDrill = counts.has("drill");
  const shipPasses = shipPassesOf(counts);

  if (state.phase === "upstream") {
    const upstream = deriveUpstreamAction(snapshot, counts);
    if (upstream.action !== null) {
      return { action: upstream.action, nextState: state, skipped: upstream.skipped };
    }
    if (hasImplementation) {
      return {
        action: { kind: "implement" },
        nextState: { ...state, phase: "implement", implementationRan: false, implementationSettled: false },
        skipped: upstream.skipped,
      };
    }
    return {
      ...enterShippingOrComplete(snapshot, state, { hasCrystalize, hasDrill, shipPasses, completionReason: "no-selected-work" }),
      skipped: upstream.skipped,
    };
  }

  if (state.phase === "implement") {
    if (!hasImplementation) {
      return enterShippingOrComplete(snapshot, state, { hasCrystalize, hasDrill, shipPasses, completionReason: "no-selected-work" });
    }
    assertKnownTicketStatuses(snapshot);
    if (state.implementationRan
      && (state.implementationSettled || snapshot.packages.every((pkg) => pkg.endpoint))) {
      return enterShippingOrComplete(snapshot, state, { hasCrystalize, hasDrill, shipPasses, completionReason: "workspace-complete" });
    }
    return { action: { kind: "implement" }, nextState: state, skipped: [] };
  }

  if (state.phase === "ship") {
    if (!hasCrystalize) {
      if (hasDrill) {
        throw new PipelineActionError(
          "DRILL_WITHOUT_CRYSTALIZE",
          "drill cannot run without crystalize in the selected slice",
        );
      }
      return complete("workspace-complete", state);
    }
    return stepThroughShip(snapshot, state, hasDrill, shipPasses);
  }

  if (state.phase === "evolve") {
    if (!hasDrill) return complete("workspace-complete", state);
    return stepThroughEvolve(snapshot, state, hasImplementation);
  }

  return complete("workspace-complete", state);
}
