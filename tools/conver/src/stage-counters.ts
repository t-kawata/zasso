// stage-counters.ts — one typed reading of the shared pipeline counters.
//
// The counters belong to the stages that write them: educe and smooth record a
// root generation, grill records a package generation, and graphify, boundify and
// split record runs beside their artifact stem. This module maps a stage to the
// reader the pipeline already owns; it never reads a status file itself.
import {
  readBoundifyRuns,
  readExplainRuns,
  readGraphRuns,
  readGrillGeneration,
  readRootEduceGeneration,
  readRootSmoothGeneration,
  readSplitRuns,
  readWorkspacifyRuns,
} from "../.claude/scripts/workspacify-order/lib/counters.mjs";
import { artifactStem } from "../.claude/scripts/workspacify-order/lib/workspace.mjs";
import type { StageName } from "./stage-plan.js";

/** The package a package-scoped counter belongs to, plus the workspace root. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface StageCounterTarget {
  readonly root: string;
  /** Path relative to the workspace root; "." for the root package. */
  readonly packagePath?: string;
  /** Absolute package directory. */
  readonly directory?: string;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type StageRunDecision = "run" | "skip";

/** A package-scoped stage cannot answer without the package directory. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function packageDirectoryOf(stage: StageName, target: StageCounterTarget): string {
  if (target.directory === undefined) {
    throw new Error(`stage ${stage} requires a package directory to read its counter`);
  }
  return target.directory;
}

/**
 * The recorded execution count of one stage, or null when the record cannot
 * prove a count. Null is not zero: the caller runs the stage because a missing
 * record never proves a stage complete.
 */
export function readStageExecutionCount(
  stage: StageName,
  target: StageCounterTarget,
): number | null {
  if (stage === "workspacify") return readWorkspacifyRuns(target.root);
  if (stage === "educe") return readRootEduceGeneration(target.root);
  if (stage === "smooth") return readRootSmoothGeneration(target.root);
  if (stage === "explain") return readExplainRuns(packageDirectoryOf(stage, target));
  if (stage === "grill") return readGrillGeneration(packageDirectoryOf(stage, target));

  if (stage === "graphify" || stage === "boundify" || stage === "split") {
    if (target.packagePath === undefined) return null;
    const directory = packageDirectoryOf(stage, target);
    const stem = artifactStem({ root: target.root, packagePath: target.packagePath });
    if (stem === null) return null;
    if (stage === "graphify") return readGraphRuns(directory, stem);
    if (stage === "boundify") return readBoundifyRuns(directory, stem);
    return readSplitRuns(directory, stem);
  }

  return null;
}

/**
 * Decide whether a stage still owes a run for the requested target count.
 *
 * The target is cumulative: `-T grill:2` means the workspace must stand at grill
 * generation 2, not that this invocation must send grill twice. An unprovable
 * count runs, because skipping on an absent record could leave a stage unrun.
 */
export function decideStageRun(input: { count: number | null; target: number }): StageRunDecision {
  if (input.count === null) return "run";
  return input.count >= input.target ? "skip" : "run";
}
