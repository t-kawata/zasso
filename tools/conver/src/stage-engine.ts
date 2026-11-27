// stage-engine.ts — execute the five-loop pipeline one derived action at a time.
//
// The engine holds no command list. Before every command it reads an immutable
// snapshot and asks the pure reducer for exactly one action. Upstream stages use
// their recorded counters; the implementation phase delegates to the unchanged
// runner; shipping and evolution run for every package in proved order, and the
// cycle returns to implementation only when a drill changed a ticket-set digest.
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  DRILL_OVERRIDE,
  EDUCE_FIXED_SPEC_OVERRIDE,
  EXPLAIN_OVERRIDE,
  GRILL_OVERRIDE,
} from "./command-history.js";
import {
  advanceAfterImplementation,
  createInitialPipelineState,
  deriveNextPipelineStep,
} from "./pipeline-action.js";
import type { PipelineAction, PipelinePhase } from "./pipeline-action.js";
import { readPipelineSnapshot } from "./pipeline-snapshot.js";
import type { PipelineSnapshot } from "./pipeline-snapshot.js";
import type { WorkspaceLoopOptions, WorkspaceLoopResult } from "./runner.js";
import { IMPLEMENTATION_STAGES, stageDefinition } from "./stage-plan.js";
import type { StageName, StagePlan } from "./stage-plan.js";
import type { WorkspaceModel, WorkspacePackage } from "./workspace.js";

const IMPLEMENTATION_STAGE_SET = new Set<StageName>(IMPLEMENTATION_STAGES);

// [::TICKET::] PX-455, PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-455|PX-456) --for-spec --no-implementation-order`.
export type StageEngineErrorCode =
  | "MISSING_STAGE_INPUT"
  | "MISSING_STAGE_ARTIFACT"
  | "STAGE_NOT_ADVANCING";

export class StageEngineError extends Error {
  constructor(
    readonly code: StageEngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StageEngineError";
  }
}

export interface StageRunRecord {
  stage: StageName;
  cwd: string;
  round: number;
  packageId: string | null;
}

export interface StageCommandInput {
  cwd: string;
  command: string;
  stage: StageName;
  round: number;
  packageId: string | null;
  promptOverride?: string;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export type StageCommandRunner = (input: StageCommandInput) => Promise<void>;

export interface StageCheckInput {
  stage: StageName;
  cwd: string;
  pkg: WorkspacePackage | null;
  workspace: WorkspaceModel;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface StageEngineDeps {
  /** One command execution seam; the production adapter uses withSession/runCommand. */
  runStageCommand: StageCommandRunner;
  /** The existing implementation loop, called once per implementation phase entry. */
  runImplementationLoop: (options: WorkspaceLoopOptions) => Promise<WorkspaceLoopResult>;
  /** Re-read the model after workspacify, split or drill. */
  readWorkspace: (plan: StagePlan, orderStartStage: StageName) => WorkspaceModel;
  /** Optional snapshot seam; omitted means the real artifact reader runs. */
  readSnapshot?: (input: {
    root: string;
    plan: StagePlan;
    workspace: WorkspaceModel;
  }) => PipelineSnapshot;
  /** Optional fail-fast gates; omitted means the defaults below run. */
  assertPrecondition?: (input: StageCheckInput) => void;
  assertArtifact?: (input: StageCheckInput) => void;
}

/** One scheduler decision, emitted before the command it describes. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface PipelineStepRecord {
  readonly phase: PipelinePhase;
  readonly stage: StageName | null;
  readonly packageId: string | null;
  readonly command: string | null;
  readonly decision: "run" | "skip" | "delegate" | "complete";
  readonly round?: number;
  readonly reason?: string;
  readonly runs: number;
  readonly skips: number;
  readonly cycles: number;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
export interface RunStagePlanInput {
  plan: StagePlan;
  workspace: WorkspaceModel;
  options: WorkspaceLoopOptions;
  deps: StageEngineDeps;
  onStageStart?: (record: StageRunRecord) => void;
  onStageEnd?: (record: StageRunRecord) => void;
  onPipelineStep?: (record: PipelineStepRecord) => void;
}

/** The override a stage appends to the shared prompt, or undefined. */
export function promptOverrideFor(stage: StageName): string | undefined {
  if (stage === "educe") return EDUCE_FIXED_SPEC_OVERRIDE;
  if (stage === "explain") return EXPLAIN_OVERRIDE;
  if (stage === "grill") return GRILL_OVERRIDE;
  if (stage === "drill") return DRILL_OVERRIDE;
  return undefined;
}

/** True for a package that owes the seed-reading stages. */
function owesSeed(pkg: WorkspacePackage): boolean {
  return pkg.seedRequired !== false;
}

function requireFile(file: string, code: StageEngineErrorCode, stage: StageName): void {
  if (!existsSync(file)) {
    throw new StageEngineError(
      code,
      `stage ${stage} requires ${file}, which is absent`,
    );
  }
}

/** The default fail-fast input gate. The command preflight remains the authority. */
export function defaultAssertPrecondition({ stage, cwd, pkg }: StageCheckInput): void {
  if (stage === "workspacify" || stage === "educe") {
    requireFile(path.join(cwd, "SYSTEM-DESIGN.md"), "MISSING_STAGE_INPUT", stage);
    return;
  }
  if (stage === "smooth") {
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
    return;
  }
  if (stage === "drill") {
    requireFile(path.join(pkg.directory, "RFC.md"), "MISSING_STAGE_INPUT", stage);
    requireFile(path.join(pkg.directory, "RFC-GRAPH.json"), "MISSING_STAGE_INPUT", stage);
    requireFile(path.join(pkg.directory, "RFC-Dirs-Tree.json"), "MISSING_STAGE_INPUT", stage);
  }
}

/** The default post-stage evidence gate: existence, not freshness. */
export function defaultAssertArtifact({ stage, cwd, pkg }: StageCheckInput): void {
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
    return;
  }
  if (stage === "drill") {
    requireFile(path.join(pkg.directory, "Tickets.json"), "MISSING_STAGE_ARTIFACT", stage);
  }
}

/** True for the stages whose execution changes the workspace the next step reads. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function createsWorkspaceInputs(stage: StageName): boolean {
  return stage === "workspacify" || stage === "split" || stage === "drill";
}

/** The stage whose gate governs the re-read after a structural stage. */
// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
function reReadStartStage(plan: StagePlan, stage: StageName): StageName {
  if (stage === "workspacify") return "educe";
  if (stage === "split" || stage === "drill") return "make";
  return plan.selections[0]?.name ?? "make";
}

/**
 * The identity of one stage action.
 *
 * Two consecutive derivations of the same identity mean the counter did not
 * advance: the stage would run forever otherwise.
 */
// [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
function stageActionSignature(action: {
  layer: string;
  stage: StageName;
  packageId: string | null;
  round: number;
}): string {
  return `${action.layer}:${action.stage}:${action.packageId ?? ""}:${action.round}`;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
interface StageActionInput {
  action: Extract<PipelineAction, { kind: "stage" }>;
  workspace: WorkspaceModel;
  checkPrecondition: (input: StageCheckInput) => void;
  checkArtifact: (input: StageCheckInput) => void;
  runStageCommand: StageCommandRunner;
  onStageStart?: (record: StageRunRecord) => void;
  onStageEnd?: (record: StageRunRecord) => void;
}

// [::TICKET::] PX-455 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-455 --for-spec --no-implementation-order`.
async function runStageAction(input: StageActionInput): Promise<void> {
  const { action } = input;
  const definition = stageDefinition(action.stage);
  const pkg = action.packageId === null
    ? null
    : input.workspace.packages.find((candidate) => candidate.id === action.packageId) ?? null;
  if (action.packageId !== null && pkg === null) {
    throw new StageEngineError(
      "MISSING_STAGE_INPUT",
      `stage ${action.stage} names package ${action.packageId}, which is absent from the workspace model`,
    );
  }
  const cwd = pkg === null ? input.workspace.root : pkg.directory;
  const record: StageRunRecord = {
    stage: action.stage,
    cwd,
    round: action.round,
    packageId: action.packageId,
  };

  input.onStageStart?.(record);
  input.checkPrecondition({ stage: action.stage, cwd, pkg, workspace: input.workspace });
  for (const command of definition.commands) {
    await input.runStageCommand({
      cwd,
      command,
      stage: action.stage,
      round: action.round,
      packageId: action.packageId,
      promptOverride: promptOverrideFor(action.stage),
    });
  }
  input.checkArtifact({ stage: action.stage, cwd, pkg, workspace: input.workspace });
  input.onStageEnd?.(record);
}

/**
 * Execute a plan until the reducer returns complete.
 *
 * A phase transition is a state change, not a remembered command: the next
 * iteration re-reads the snapshot before it sends anything.
 */
export async function runStagePlan(input: RunStagePlanInput): Promise<void> {
  const previousCwd = process.cwd();
  const checkPrecondition = input.deps.assertPrecondition ?? defaultAssertPrecondition;
  const checkArtifact = input.deps.assertArtifact ?? defaultAssertArtifact;
  const readSnapshot = input.deps.readSnapshot ?? readPipelineSnapshot;

  const implementationSelections = input.plan.selections.filter((selection) =>
    IMPLEMENTATION_STAGE_SET.has(selection.name),
  );
  const selectedImplementationStages = implementationSelections.length === IMPLEMENTATION_STAGES.length
    ? undefined
    : new Set(implementationSelections.map((selection) => selection.name));

  let model = input.workspace;
  let state = createInitialPipelineState(input.plan, input.options.maxCount);
  let runs = 0;
  let skips = 0;
  let cycles = 0;
  let lastStageSignature: string | null = null;
  const ranPairs = new Set<string>();
  const skippedPairs = new Set<string>();

  try {
    for (;;) {
      const phase = state.phase;
      const snapshot = readSnapshot({ root: model.root, plan: input.plan, workspace: model });
      const step = deriveNextPipelineStep(snapshot, state);

      for (const skipped of step.skipped) {
        const pair = `${skipped.stage}:${skipped.packageId ?? ""}`;
        if (ranPairs.has(pair) || skippedPairs.has(pair)) continue;
        skippedPairs.add(pair);
        skips += 1;
        input.onPipelineStep?.({
          phase,
          stage: skipped.stage,
          packageId: skipped.packageId,
          command: null,
          decision: "skip",
          runs,
          skips,
          cycles,
        });
      }

      if (step.action.kind === "complete") {
        input.onPipelineStep?.({
          phase: "complete",
          stage: null,
          packageId: null,
          command: null,
          decision: "complete",
          reason: step.action.reason,
          runs,
          skips,
          cycles,
        });
        return;
      }

      if (phase === "evolve" && step.nextState.phase === "implement") cycles += 1;
      state = step.nextState;

      if (step.action.kind === "implement") {
        // The implementation loop must see the published implementation order.
        // Re-reading here covers a skipped split, whose own re-read never runs.
        // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
        model = input.deps.readWorkspace(input.plan, "make");
        lastStageSignature = null;
        input.onPipelineStep?.({
          phase: "implement",
          stage: null,
          packageId: null,
          command: null,
          decision: "delegate",
          runs,
          skips,
          cycles,
        });
        const outcome = await input.deps.runImplementationLoop({
          ...input.options,
          workspace: model,
          ...(selectedImplementationStages === undefined
            ? {}
            : { selectedImplementationStages }),
        });
        state = advanceAfterImplementation(state, outcome);
        continue;
      }

      // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
      const stageSignature = stageActionSignature(step.action);
      if (stageSignature === lastStageSignature) {
        throw new StageEngineError(
          "STAGE_NOT_ADVANCING",
          `stage ${step.action.stage} (package ${step.action.packageId ?? "-"}, round ${step.action.round}) was derived again without its counter advancing`,
        );
      }
      lastStageSignature = stageSignature;

      runs += 1;
      ranPairs.add(`${step.action.stage}:${step.action.packageId ?? ""}`);
      input.onPipelineStep?.({
        phase: step.action.layer,
        stage: step.action.stage,
        packageId: step.action.packageId,
        command: stageDefinition(step.action.stage).commands.join(","),
        decision: "run",
        round: step.action.round,
        runs,
        skips,
        cycles,
      });

      await runStageAction({
        action: step.action,
        workspace: model,
        checkPrecondition,
        checkArtifact,
        runStageCommand: input.deps.runStageCommand,
        onStageStart: input.onStageStart,
        onStageEnd: input.onStageEnd,
      });

      if (createsWorkspaceInputs(step.action.stage)) {
        model = input.deps.readWorkspace(input.plan, reReadStartStage(input.plan, step.action.stage));
      }
    }
  } finally {
    process.chdir(previousCwd);
  }
}
