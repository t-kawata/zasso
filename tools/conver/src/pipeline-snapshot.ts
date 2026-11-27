// pipeline-snapshot.ts — one immutable reading of the facts a scheduler step needs.
//
// The snapshot is read before every step. It carries the ticket set, its boundary
// endpoint, and the stage counters; it decides nothing. A reader seam keeps the
// reducer testable without a file system, while the default reader is the real one.
import { existsSync, readFileSync } from "node:fs";

import {
  computeTicketSetDigest,
  isPackageEndpoint,
  readBoundaryState,
} from "./boundary-state.js";
import type { BoundaryState } from "./boundary-state.js";
import { readStageExecutionCount } from "./stage-counters.js";
import type { StageCounterTarget } from "./stage-counters.js";
import type { StageName, StagePlan } from "./stage-plan.js";
import type { TicketsJson } from "./tickets.js";
import type { WorkspaceModel } from "./workspace.js";

/** Stages whose counter belongs to the workspace root, not to one package. */
const WORKSPACE_COUNTER_STAGES: readonly StageName[] = ["workspacify", "educe", "smooth"];

/** Package-scoped stages whose counter is recorded beside the package artifacts. */
const PACKAGE_COUNTER_STAGES: readonly StageName[] = [
  "explain",
  "grill",
  "graphify",
  "boundify",
  "split",
];

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface PipelinePackageSnapshot {
  readonly id: string;
  readonly path: string;
  readonly directory: string;
  /** Null when the package has not reached split yet. */
  readonly tickets: TicketsJson | null;
  readonly ticketSetDigest: string;
  readonly endpoint: boolean;
  readonly seedRequired: boolean;
  readonly counts: ReadonlyMap<StageName, number | null>;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface PipelineSnapshot {
  readonly root: string;
  readonly packages: readonly PipelinePackageSnapshot[];
  readonly rootCounts: ReadonlyMap<StageName, number | null>;
  readonly plan: StagePlan;
}

/** File-system and counter seams; tests supply a deterministic variant. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface PipelineSnapshotIo {
  readTickets(ticketsPath: string): TicketsJson | null;
  readBoundary(packageDirectory: string): BoundaryState | null;
  readCount(stage: StageName, target: StageCounterTarget): number | null;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type PipelineSnapshotErrorCode = "TICKETS_UNREADABLE";

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export class PipelineSnapshotError extends Error {
  constructor(
    readonly code: PipelineSnapshotErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PipelineSnapshotError";
  }
}

/** Read one package's Tickets.json; absence is a fact, malformed JSON is an error. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function readTicketsFile(ticketsPath: string): TicketsJson | null {
  if (!existsSync(ticketsPath)) return null;
  try {
    return JSON.parse(readFileSync(ticketsPath, "utf8")) as TicketsJson;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PipelineSnapshotError("TICKETS_UNREADABLE", `${ticketsPath}: ${reason}`);
  }
}

export const nodePipelineSnapshotIo: PipelineSnapshotIo = {
  readTickets: readTicketsFile,
  readBoundary: (packageDirectory) => readBoundaryState(packageDirectory),
  readCount: (stage, target) => readStageExecutionCount(stage, target),
};

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function readRootCounts(
  root: string,
  readCount: PipelineSnapshotIo["readCount"],
): Map<StageName, number | null> {
  const counts = new Map<StageName, number | null>();
  for (const stage of WORKSPACE_COUNTER_STAGES) {
    counts.set(stage, readCount(stage, { root }));
  }
  return counts;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function readPackage(
  root: string,
  pkg: WorkspaceModel["packages"][number],
  io: PipelineSnapshotIo,
): PipelinePackageSnapshot {
  const tickets = io.readTickets(pkg.ticketsPath);
  const boundary = io.readBoundary(pkg.directory);
  const ticketSetDigest = tickets === null ? "" : computeTicketSetDigest(tickets);
  const counts = new Map<StageName, number | null>();
  for (const stage of PACKAGE_COUNTER_STAGES) {
    counts.set(stage, io.readCount(stage, {
      root,
      packagePath: pkg.path,
      directory: pkg.directory,
    }));
  }
  return {
    id: pkg.id,
    path: pkg.path,
    directory: pkg.directory,
    tickets,
    ticketSetDigest,
    endpoint: tickets !== null && isPackageEndpoint(tickets, boundary),
    seedRequired: pkg.seedRequired !== false,
    counts,
  };
}

export function readPipelineSnapshot(input: {
  readonly root: string;
  readonly plan: StagePlan;
  readonly workspace: WorkspaceModel;
  readonly io?: Partial<PipelineSnapshotIo>;
}): PipelineSnapshot {
  const io: PipelineSnapshotIo = { ...nodePipelineSnapshotIo, ...input.io };
  return {
    root: input.root,
    packages: input.workspace.packages.map((pkg) => readPackage(input.root, pkg, io)),
    rootCounts: readRootCounts(input.root, io.readCount),
    plan: input.plan,
  };
}
