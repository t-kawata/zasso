// stage-engine.ts — execute a -T plan with the cwd, repetition and delegation
// rules the pipeline requires.
//
// The engine is additive: the default implementation plan is delegated as one
// loop with no selected-stage filter, so the existing make..find path is exactly
// the path it was before. Upstream stages run at the workspace root or at each
// package root according to the canonical table, and the model is re-read after
// workspacify and split because those stages create the inputs the next stage
// reads.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  EDUCE_FIXED_SPEC_OVERRIDE,
  EXPLAIN_OVERRIDE,
  GRILL_OVERRIDE,
} from "./command-history.js";
import type { WorkspaceLoopOptions } from "./runner.js";
import { stageDefinition } from "./stage-plan.js";
import type { StageName, StagePlan } from "./stage-plan.js";
import type { WorkspaceModel, WorkspacePackage } from "./workspace.js";

const IMPLEMENTATION_STAGES: readonly StageName[] = Object.freeze([
  "make",
  "plan",
  "start",
  "review",
  "resolve",
  "consolidate",
  "find",
]);

const IMPLEMENTATION_STAGE_SET = new Set<StageName>(IMPLEMENTATION_STAGES);

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export type StageEngineErrorCode = "MISSING_STAGE_INPUT" | "MISSING_STAGE_ARTIFACT";

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export class StageEngineError extends Error {
  constructor(
    readonly code: StageEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StageEngineError";
  }
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StageRunRecord {
  stage: StageName;
  cwd: string;
  round: number;
  packageId: string | null;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StageCommandInput {
  cwd: string;
  command: string;
  stage: StageName;
  round: number;
  packageId: string | null;
  promptOverride?: string;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export type StageCommandRunner = (input: StageCommandInput) => Promise<void>;

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StageCheckInput {
  stage: StageName;
  cwd: string;
  pkg: WorkspacePackage | null;
  workspace: WorkspaceModel;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface StageEngineDeps {
  /** One command execution seam; the production adapter uses withSession/runCommand. */
  runStageCommand: StageCommandRunner;
  /** The existing implementation loop, called once with the selected-stage set. */
  runImplementationLoop: (options: WorkspaceLoopOptions) => Promise<unknown>;
  /** Re-read the model after workspacify or split. */
  readWorkspace: (plan: StagePlan, orderStartStage: StageName) => WorkspaceModel;
  /** Optional fail-fast gates; omitted means the defaults below run. */
  assertPrecondition?: (input: StageCheckInput) => void;
  assertArtifact?: (input: StageCheckInput) => void;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface RunStagePlanInput {
  plan: StagePlan;
  workspace: WorkspaceModel;
  options: WorkspaceLoopOptions;
  deps: StageEngineDeps;
  onStageStart?: (record: StageRunRecord) => void;
  onStageEnd?: (record: StageRunRecord) => void;
}

/** The override a stage appends to the shared prompt, or undefined. */
export function promptOverrideFor(stage: StageName): string | undefined {
  if (stage === "educe") return EDUCE_FIXED_SPEC_OVERRIDE;
  if (stage === "explain") return EXPLAIN_OVERRIDE;
  if (stage === "grill") return GRILL_OVERRIDE;
  return undefined;
}

/** True for a package that owes the seed-reading stages. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function owesSeed(pkg: WorkspacePackage): boolean {
  return pkg.seedRequired !== false;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function requireFile(file: string, code: StageEngineErrorCode, stage: StageName): void {
  if (!existsSync(file)) {
    throw new StageEngineError(
      code,
      `stage ${stage} requires ${file}, which is absent`,
    );
  }
}

/** The default fail-fast input gate. The command preflight remains the authority. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function defaultAssertPrecondition({ stage, cwd, pkg }: StageCheckInput): void {
  if (stage === "workspacify" || stage === "educe") {
    requireFile(path.join(cwd, "SYSTEM-DESIGN.md"), "MISSING_STAGE_INPUT", stage);
    return;
  }
  if (pkg === null) return;
  if (stage === "explain" || stage === "grill") {
    if (owesSeed(pkg)) requireFile(path.join(pkg.directory, "RFC-SEED.md"), "MISSING_STAGE_INPUT", stage);
    return;
  }
  if (stage === "graphify") {
    requireFile(path.join(pkg.directory, "RFC.md"), "MISSING_STAGE_INPUT", stage);
    return;
  }
  if (stage === "boundify") {
    requireFile(path.join(pkg.directory, "RFC-GRAPH.json"), "MISSING_STAGE_INPUT", stage);
    return;
  }
  if (stage === "split") {
    requireFile(path.join(pkg.directory, "RFC.md"), "MISSING_STAGE_INPUT", stage);
    requireFile(path.join(pkg.directory, "RFC-GRAPH.json"), "MISSING_STAGE_INPUT", stage);
    return;
  }
  if (stage === "crystalize") {
    requireFile(path.join(pkg.directory, "Tickets.json"), "MISSING_STAGE_INPUT", stage);
  }
}

/** The default post-stage evidence gate: existence, not freshness. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function defaultAssertArtifact({ stage, cwd, pkg }: StageCheckInput): void {
  if (stage === "workspacify") {
    requireFile(path.join(cwd, "WORKSPACIFY-TREE-MANIFEST.json"), "MISSING_STAGE_ARTIFACT", stage);
    requireFile(path.join(cwd, "WORKSPACIFY-ALLOCATE-MANIFEST.json"), "MISSING_STAGE_ARTIFACT", stage);
    return;
  }
  if (stage === "educe") {
    const artifact = readdirSync(cwd).find((name) => name.endsWith("-sequences.json"));
    if (artifact === undefined) {
      throw new StageEngineError(
        "MISSING_STAGE_ARTIFACT",
        `stage educe requires a root *-sequences.json in ${cwd}, which is absent`,
      );
    }
    return;
  }
  if (stage === "smooth") {
    requireFile(path.join(cwd, "smooth-sequences", "status.json"), "MISSING_STAGE_ARTIFACT", stage);
    return;
  }
  if (pkg === null) return;
  if (stage === "explain") {
    requireFile(path.join(pkg.directory, "EXPLAIN-RFC-SEED.md"), "MISSING_STAGE_ARTIFACT", stage);
    return;
  }
  if (stage === "grill") {
    requireFile(path.join(pkg.directory, "RFC.md"), "MISSING_STAGE_ARTIFACT", stage);
    return;
  }
  if (stage === "graphify") {
    requireFile(path.join(pkg.directory, "RFC-GRAPH.json"), "MISSING_STAGE_ARTIFACT", stage);
    return;
  }
  if (stage === "boundify") {
    requireFile(path.join(pkg.directory, "RFC-Dirs-Tree.json"), "MISSING_STAGE_ARTIFACT", stage);
    return;
  }
  if (stage === "split") {
    requireFile(path.join(pkg.directory, "Tickets.json"), "MISSING_STAGE_ARTIFACT", stage);
    return;
  }
  if (stage === "crystalize") {
    requireFile(path.join(pkg.directory, "README.md"), "MISSING_STAGE_ARTIFACT", stage);
  }
}

/**
 * Execute a stage plan.
 *
 * Workspace-scoped stages run at the workspace root; package-scoped stages run
 * for every selected package in order. A package-scoped count N means N full
 * rounds; a workspace-scoped count N means N consecutive runs. The implementation
 * group is delegated once to the existing loop with only the selected stages.
 */
export async function runStagePlan(input: RunStagePlanInput): Promise<void> {
  const previousCwd = process.cwd();
  const checkPrecondition = input.deps.assertPrecondition ?? defaultAssertPrecondition;
  const checkArtifact = input.deps.assertArtifact ?? defaultAssertArtifact;
  const implementationSelections = input.plan.selections.filter((selection) =>
    IMPLEMENTATION_STAGE_SET.has(selection.name),
  );
  const selectedImplementationStages = implementationSelections.length === IMPLEMENTATION_STAGES.length
    ? undefined
    : new Set(implementationSelections.map((selection) => selection.name));

  let currentWorkspace = input.workspace;
  let implementationRan = false;

  try {
    for (const selection of input.plan.selections) {
      if (IMPLEMENTATION_STAGE_SET.has(selection.name)) {
        if (!implementationRan) {
          implementationRan = true;
          await input.deps.runImplementationLoop({
            ...input.options,
            workspace: currentWorkspace,
            ...(selectedImplementationStages === undefined
              ? {}
              : { selectedImplementationStages }),
          });
        }
        continue;
      }

      if (stageDefinition(selection.name).scope === "workspace") {
        await runWorkspaceStage({
          selection,
          workspace: currentWorkspace,
          onStageStart: input.onStageStart,
          onStageEnd: input.onStageEnd,
          checkPrecondition,
          checkArtifact,
          runStageCommand: input.deps.runStageCommand,
        });
      } else {
        await runPackageStage({
          selection,
          workspace: currentWorkspace,
          onStageStart: input.onStageStart,
          onStageEnd: input.onStageEnd,
          checkPrecondition,
          checkArtifact,
          runStageCommand: input.deps.runStageCommand,
        });
      }

      // workspacify creates the two manifests every later stage reads, and split
      // creates the tickets the implementation group reads. Re-read once, at the
      // stage that made the new inputs available, so the next stage sees them.
      if ((selection.name === "workspacify" || selection.name === "split")
        && hasFollowingSelection(input.plan, selection.name)) {
        currentWorkspace = input.deps.readWorkspace(
          input.plan,
          selection.name === "workspacify" ? "educe" : "make",
        );
      }
    }
  } finally {
    process.chdir(previousCwd);
  }
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function hasFollowingSelection(plan: StagePlan, name: StageName): boolean {
  const index = plan.selections.findIndex((selection) => selection.name === name);
  return index >= 0 && index < plan.selections.length - 1;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
interface StageRunDeps {
  selection: { name: StageName; count: number };
  workspace: WorkspaceModel;
  onStageStart?: (record: StageRunRecord) => void;
  onStageEnd?: (record: StageRunRecord) => void;
  checkPrecondition: (input: StageCheckInput) => void;
  checkArtifact: (input: StageCheckInput) => void;
  runStageCommand: StageCommandRunner;
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
async function runWorkspaceStage(deps: StageRunDeps): Promise<void> {
  const definition = stageDefinition(deps.selection.name);
  for (let round = 1; round <= deps.selection.count; round++) {
    const record: StageRunRecord = {
      stage: deps.selection.name,
      cwd: deps.workspace.root,
      round,
      packageId: null,
    };
    deps.onStageStart?.(record);
    deps.checkPrecondition({
      stage: deps.selection.name,
      cwd: deps.workspace.root,
      pkg: null,
      workspace: deps.workspace,
    });
    for (const command of definition.commands) {
      await deps.runStageCommand({
        cwd: deps.workspace.root,
        command,
        stage: deps.selection.name,
        round,
        packageId: null,
        promptOverride: promptOverrideFor(deps.selection.name),
      });
    }
    deps.checkArtifact({
      stage: deps.selection.name,
      cwd: deps.workspace.root,
      pkg: null,
      workspace: deps.workspace,
    });
    deps.onStageEnd?.(record);
  }
}

// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
async function runPackageStage(deps: StageRunDeps): Promise<void> {
  const definition = stageDefinition(deps.selection.name);
  const packages = deps.workspace.packages.filter((pkg) =>
    deps.selection.name === "explain" || deps.selection.name === "grill" ? owesSeed(pkg) : true,
  );

  for (let round = 1; round <= deps.selection.count; round++) {
    for (const pkg of packages) {
      const record: StageRunRecord = {
        stage: deps.selection.name,
        cwd: pkg.directory,
        round,
        packageId: pkg.id,
      };
      deps.onStageStart?.(record);
      deps.checkPrecondition({
        stage: deps.selection.name,
        cwd: pkg.directory,
        pkg,
        workspace: deps.workspace,
      });
      for (const command of definition.commands) {
        await deps.runStageCommand({
          cwd: pkg.directory,
          command,
          stage: deps.selection.name,
          round,
          packageId: pkg.id,
          promptOverride: promptOverrideFor(deps.selection.name),
        });
      }
      deps.checkArtifact({
        stage: deps.selection.name,
        cwd: pkg.directory,
        pkg,
        workspace: deps.workspace,
      });
      deps.onStageEnd?.(record);
    }
  }
}
