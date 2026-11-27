// runner.ts — the strict 5-layer execution loop.
//
// The workspace loop walks packages in the order workspacify-order proved
// safe. The package loop walks tickets in Tickets.json array order and asks
// `deriveNextAction` before every execution, so it can never skip a ticket or
// enter a phase out of order. Every command runs with the package directory as
// cwd. A repeated command escalates three times and then stops conver instead
// of silently moving on.
//
// A package that arrives with every ticket terminal and no completed boundary
// for its ticket set is adopted, never scanned. A completed find with a stale
// digest, and a review-created record with no started boundary, still run it.
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { withSession, runCommand } from "./session.js";
import type { RunCommandOptions, AcpSession, SessionConfig } from "./session.js";
import {
  PICKUP_COMMAND,
  runPickupAtBoundary,
} from "./pickup-at-boundary.js";
import type { PickupAvailability } from "./pickup-at-boundary.js";
import {
  sendSlackBoundaryComplete,
  sendSlackFindUnfinished,
  sendSlackPhaseComplete,
  sendSlackStop,
} from "./notifier.js";
import type {
  BoundaryCompleteContext,
  FindUnfinishedContext,
  PhaseCompleteContext,
  StopContext,
} from "./notifier.js";
import {
  BOUNDARY_STATUS_COMPLETE,
  BOUNDARY_STATUS_SKIPPED,
  boundaryStatePath,
  computeTicketSetDigest,
  createBoundaryState,
  createLegacyCompletionState,
  isPackageEndpoint,
  isTicketSetTerminal,
  markBoundaryCompleted,
  markBoundaryStarted,
  markFindSkipped,
  markReviewed,
  markResolved,
  nodeBoundaryStateIo,
  readBoundaryState,
  ticketKeysOf,
  writeBoundaryState,
} from "./boundary-state.js";
import type { BoundaryState, BoundaryStateIo } from "./boundary-state.js";
import {
  clearForNextRound,
  packageProgress,
  pendingTicketsOf,
  phaseProgress,
} from "./tickets.js";
import type { Ticket, TicketsJson } from "./tickets.js";
import { isTerminalStatus, REMANDED_STATUS } from "./ticket-status.js";
import {
  deriveNextAction,
  FindRoundLimitError,
  InvalidTicketStatusError,
} from "./next-action.js";
import type { CommandName, NextAction, PackageProgress } from "./next-action.js";
import { stageForCommand } from "./stage-plan.js";
import type { StageName } from "./stage-plan.js";
import {
  commandHistory,
  StopRequestedError,
} from "./command-history.js";
import type { CommandExecution } from "./command-history.js";
import {
  resolvePackageSelection,
  resolveRequestedPackages,
  PackageSelectionError,
} from "./package-selection.js";
import type { WorkspaceModel, WorkspacePackage } from "./workspace.js";
import type { WatcherConfig } from "./watcher.js";
import { waitForWindow } from "./step-timer.js";
import type { SessionUpdate } from "@agentclientprotocol/sdk";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
/** The display layer's hooks; absent in non-TTY/plain runs. */
// [::TICKET::] PX-404, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-404|PX-449) --for-spec --no-implementation-order`.
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
export interface DisplayHooks {
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
  onUpdate(update: SessionUpdate): void;
  onFlush(): void;
  onPackageStart(packageName: string): void;
  /** The NOW row onCommandStart; absent when no dashboard exists. */
  // [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
  onCommandStart?(packageName: string, command: string, ticketKey: string | null): void;
  /** The NOW row returns to idle even when the command throws. */
  // [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
  onCommandEnd?(): void;
}

// [::TICKET::] PX-404, PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-404|PX-454) --for-spec --no-implementation-order`.
export interface LoopOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  packages?: string[];
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
  bindReviewInOneSession: boolean;
  noFind?: boolean;
  /** Overrides {@link MAX_FIND_ROUNDS} for every package in this run. */
  maxFindRounds?: number;
  /**
   * When defined, the implementation loop stops at the first action whose stage is
   * outside this set. Undefined keeps the existing behavior exactly.
   */
  selectedImplementationStages?: ReadonlySet<StageName>;
  watcherConfig?: WatcherConfig;
  display?: DisplayHooks;
}

/** Options for the workspace loop: the validated model is the package source. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface WorkspaceLoopOptions extends LoopOptions {
  workspace: WorkspaceModel;
}

/** One package's unfinished-find evidence, as the detector reports it. */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
export interface UnfinishedFindReport {
  unfinished: boolean;
  evidence: Array<{ kind: string }>;
}

/** Mechanical evidence seam; the default reads the installed detector script. */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
export type DetectUnfinishedFind = (
  pkg: WorkspacePackage,
) => Promise<UnfinishedFindReport>;

/** Session and notification seams, injected by tests. */
// [::TICKET::] PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
export interface PackageLoopDeps {
  withSession: typeof withSession;
  runCommand: typeof runCommand;
  sendSlackPhaseComplete: typeof sendSlackPhaseComplete;
  sendSlackStop: typeof sendSlackStop;
  /** Optional so existing test seams keep their shape; the real notifier is the default. */
  sendSlackBoundaryComplete?: typeof sendSlackBoundaryComplete;
  /** Optional second notice, sent only when a find is resumed. */
  sendSlackFindUnfinished?: typeof sendSlackFindUnfinished;
  /** Optional detector seam; the default shells out to the installed script. */
  detectUnfinishedFind?: DetectUnfinishedFind;
  /** Optional file-system seam for deterministic boundary-state failures. */
  boundaryStateIo?: BoundaryStateIo;
  /**
   * Runs the reflection command in its own session rooted at the workspace.
   * Undefined disables the boundary (test seams and non-pushing runs).
   */
  runPickup?: (
    root: string,
    config: SessionConfig,
    runOptions: RunCommandOptions,
  ) => Promise<void>;
  /** Availability seam; absent means the installed-command/upstream check runs. */
  pickupAvailability?: (root: string) => PickupAvailability;
  now: () => number;
}

/** What one workspace tick did, and whether every selected package is at its endpoint. */
// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
export interface WorkspaceLoopResult {
  processed: number;
  allSelectedComplete: boolean;
}

/** The real seams. Kept outside the signatures so the parameter list stays readable. */
const DEFAULT_PACKAGE_LOOP_DEPS: PackageLoopDeps = {
  withSession,
  runCommand,
  sendSlackPhaseComplete,
  sendSlackStop,
  sendSlackBoundaryComplete,
  sendSlackFindUnfinished,
  detectUnfinishedFind: detectUnfinishedFindForPackage,
  boundaryStateIo: nodeBoundaryStateIo,
  runPickup: async (root, config, runOptions) => {
    await withSession(root, config, async (session) => {
      await runCommand(session, PICKUP_COMMAND, runOptions);
    });
  },
  now: Date.now,
};

/** Raised after a Slack stop message was sent. main() turns this into exit 1. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export class LoopStoppedError extends Error {
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
  constructor(readonly context: StopContext) {
    super(`conver stopped: ${context.reason}`);
    this.name = "LoopStoppedError";
  }
}

/** Tickets.json could not be read or parsed; the loop must not guess. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export class TicketReadError extends Error {
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
  constructor(readonly ticketsPath: string, cause: unknown) {
    super(`cannot read ${ticketsPath}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TicketReadError";
  }
}

/** Session retry policy; tests may shorten the delays. */
export const retryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  jitterMs: 500,
};

const RECOVERABLE_ERROR_MARKERS = [
  "ACP connection closed",
  "子プロセス",
  "EPIPE",
  "ECONNRESET",
  "タイムアウト",
  "timeout",
  "connect",
  "initialize",
];

import { MAX_FIND_ROUNDS } from "./find-policy.js";
export { MAX_FIND_ROUNDS };

/**
 * Fixed operator directive attached to a resumed find.
 *
 * A resumed run must not re-open the decision the operator already made: the
 * evidence says the previous run stopped early, so the only correct action is
 * to finish it. The wording is fixed so the invocation is deterministic.
 */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
export const FIND_RESUME_DIRECTIVE =
  "Previous /find-omissions detected incomplete. Re-run it. Do not ask the human; decide everything and complete.";

/** Build the find invocation; the command resolves its graph from the package. */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
// [::TICKET::] PX-439 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-439 --for-spec --no-implementation-order`.
export function buildFindCommand(resume: boolean): string {
  const base = "/find-omissions";
  return resume ? `${base}\n\n${FIND_RESUME_DIRECTIVE}` : base;
}

/** Candidate location of the detector, relative to a package's enclosing tree. */
const DETECTOR_RELATIVE_PATH = [
  ".claude",
  "scripts",
  "tickets",
  "detect-unfinished-find.js",
];

/** Walk up from the package to the tree that owns .claude/scripts. */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
function resolveDetectorScript(startDirectory: string): string | null {
  let directory = path.resolve(startDirectory);
  for (;;) {
    const candidate = path.join(directory, ...DETECTOR_RELATIVE_PATH);
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

/**
 * Default detector: run the same installed script /find-omissions runs itself.
 * A missing script or a malformed run is not evidence, so it reports clean and
 * the loop keeps its existing stop path.
 */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
async function detectUnfinishedFindForPackage(
  pkg: WorkspacePackage,
): Promise<UnfinishedFindReport> {
  const script = resolveDetectorScript(pkg.directory);
  if (script === null) {
    process.stderr.write(
      `[find-detector] detector not found above ${pkg.directory}; no recovery evidence\n`,
    );
    return { unfinished: false, evidence: [] };
  }
  const result = spawnSync(
    process.execPath,
    [script, "--cwd=.", "--format=json"],
    { cwd: pkg.directory, encoding: "utf8" },
  );
  if (result.status !== 0 && result.status !== 10) {
    process.stderr.write(
      `[find-detector] detector exited ${String(result.status)}: ${result.stderr ?? ""}`,
    );
    return { unfinished: false, evidence: [] };
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      unfinished?: boolean;
      evidence?: Array<{ kind: string }>;
    };
    return {
      unfinished: parsed.unfinished === true,
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [],
    };
  } catch {
    return { unfinished: false, evidence: [] };
  }
}

export function isRecoverableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RECOVERABLE_ERROR_MARKERS.some((marker) => msg.includes(marker));
}

export async function retryWithBackoff<T>(
  op: () => Promise<T>,
  opts: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterMs: number;
    isRetryable: (err: unknown) => boolean;
  },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastError = err;
      if (!opts.isRetryable(err) || attempt === opts.maxAttempts) break;
      const base = Math.min(opts.baseDelayMs * 2 ** (attempt - 1), opts.maxDelayMs);
      const delay = base + Math.random() * opts.jitterMs;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function toSessionConfig(options: LoopOptions): SessionConfig {
  return { apiKey: options.apiKey, model: options.model, baseUrl: options.baseUrl };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function toRunCommandOptions(options: LoopOptions): RunCommandOptions {
  return {
    timeoutMs: options.timeoutMs,
    verbose: options.verbose,
    ...(options.display === undefined
      ? {}
      : { onUpdate: (update: SessionUpdate) => options.display?.onUpdate(update), onFlush: () => options.display?.onFlush() }),
  };
}

function runWithSession<T>(
  cwd: string,
  config: SessionConfig,
  fn: (session: AcpSession) => Promise<T>,
): Promise<T> {
  return retryWithBackoff(() => withSession(cwd, config, fn), {
    maxAttempts: retryPolicy.maxAttempts,
    baseDelayMs: retryPolicy.baseDelayMs,
    maxDelayMs: retryPolicy.maxDelayMs,
    jitterMs: retryPolicy.jitterMs,
    isRetryable: isRecoverableError,
  });
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function readTicketsOrThrow(ticketsPath: string): TicketsJson {
  try {
    return JSON.parse(readFileSync(ticketsPath, "utf-8")) as TicketsJson;
  } catch (error) {
    throw new TicketReadError(ticketsPath, error);
  }
}

/** True when every package has a complete boundary record for its current ticket set. */
export function allPackagesAreEndpoint(
  packages: readonly WorkspacePackage[],
  io: BoundaryStateIo = nodeBoundaryStateIo,
): boolean {
  return packages.every((pkg) => {
    const ticketsData = readTicketsOrThrow(pkg.ticketsPath);
    const state = readBoundaryState(pkg.directory, io);
    return isPackageEndpoint(ticketsData, state);
  });
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function parseTicketKey(key: string): { phaseId: number; id: number } {
  const separator = key.indexOf("-");
  const phasePart = key.slice(0, separator);
  const idPart = key.slice(separator + 1);
  return {
    phaseId: phasePart === "PX" ? -1 : parseInt(phasePart.slice(1), 10),
    id: parseInt(idPart, 10),
  };
}

/** Read the current status of one ticket; a missing ticket is an error. */
export function readTicketStatus(ticketsPath: string, key: string): string {
  const { phaseId, id } = parseTicketKey(key);
  const ticketsData = readTicketsOrThrow(ticketsPath);
  const phase = ticketsData.phases.find((candidate) => candidate.id === phaseId);
  const ticket = phase?.tickets.find((candidate) => candidate.id === id);
  if (ticket === undefined) {
    throw new TicketReadError(ticketsPath, new Error(`ticket ${key} not found`));
  }
  return ticket.status;
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function statusOfTicket(ticketsData: TicketsJson, phaseId: number, ticketId: number): string {
  const phase = ticketsData.phases.find((candidate) => candidate.id === phaseId);
  const ticket: Ticket | undefined = phase?.tickets.find((candidate) => candidate.id === ticketId);
  if (ticket === undefined) {
    throw new Error(`ticket P${phaseId}-${ticketId} not found during status re-read`);
  }
  return ticket.status;
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function printCommandHeader(command: string, ticketKey?: string, title?: string): void {
  const separator = "=".repeat(46);
  process.stdout.write(`\n${separator}\n`);
  if (ticketKey && title) {
    process.stdout.write(`🟢 ${command} ${ticketKey}: ${title}\n`);
  } else if (ticketKey) {
    process.stdout.write(`🟢 ${command} ${ticketKey}\n`);
  } else {
    process.stdout.write(`🟢 ${command}\n`);
  }
  process.stdout.write(`${separator}\n`);
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function hasPendingTickets(ticketsPath: string): boolean {
  return pendingTicketsOf(readTicketsOrThrow(ticketsPath)).length > 0;
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
interface PackageState {
  progress: PackageProgress;
  notifiedPhases: Set<number>;
}

// [::TICKET::] PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
function createPackageState(
  options: LoopOptions,
  reviewedSinceResolve = 0,
): PackageState {
  return {
    progress: {
      reviewedSinceResolve,
      resolveEvery: options.resolveEvery,
      consolidateDone: false,
      findDone: false,
      findRounds: 0,
      maxFindRounds: options.maxFindRounds ?? MAX_FIND_ROUNDS,
      noFind: options.noFind === true,
    },
    notifiedPhases: new Set<number>(),
  };
}

/**
 * True when a terminal ticket set must be adopted instead of scanned.
 *
 * The implementation is complete, so a missing, unreadable or interrupted
 * boundary is not evidence of pending work. Two records still owe a boundary:
 * a completed find whose digest differs (the ticket set changed), and a record
 * with no started boundary but a review timestamp or pending resolve.
 */
// [::TICKET::] PX-446, PX-448 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-446|PX-448) --for-spec --no-implementation-order`.
function shouldAdoptTerminalPackage(
  initialState: BoundaryState | null,
  ticketsData: TicketsJson,
): boolean {
  if (!isTicketSetTerminal(ticketsData)) return false;
  if (initialState === null) return true;

  const completedFind =
    initialState.find?.status === BOUNDARY_STATUS_COMPLETE ||
    initialState.find?.status === BOUNDARY_STATUS_SKIPPED;
  if (
    completedFind &&
    initialState.ticketSetDigest !== computeTicketSetDigest(ticketsData)
  ) {
    return false;
  }

  if (initialState.consolidate !== null || initialState.find !== null) {
    return true;
  }
  return (
    initialState.lastReviewedAt === null &&
    initialState.reviewedSinceResolve === 0
  );
}

/**
 * Return the action to execute now.
 *
 * A durable resolve must not preempt the first ticket command of a run. When a
 * ticket command exists, derive it with only the pending resolve count zeroed;
 * the resolve still runs on the next iteration.
 */
// [::TICKET::] PX-446, PX-448 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-446|PX-448) --for-spec --no-implementation-order`.
function deriveActionForNextStep(
  ticketsData: TicketsJson,
  progress: PackageProgress,
  hasRunCommand: boolean,
): NextAction {
  const action = deriveNextAction(ticketsData, progress);
  if (hasRunCommand || action.kind !== "resolve") return action;
  try {
    const ticketAction = deriveNextAction(ticketsData, {
      ...progress,
      reviewedSinceResolve: 0,
    });
    return ticketAction.kind === "command" ? ticketAction : action;
  } catch (error) {
    // No ticket command exists for this status (remanded or unknown); keep the
    // original resolve action and let the existing recovery handle the status.
    if (error instanceof InvalidTicketStatusError) return action;
    throw error;
  }
}

/** The implementation stage an action belongs to, or null for completion. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function stageForNextAction(action: NextAction): StageName | null {
  if (action.kind === "command") return stageForCommand(action.command);
  if (action.kind === "resolve") return "resolve";
  if (action.kind === "consolidate") return "consolidate";
  if (action.kind === "find") return "find";
  return null;
}

// [::TICKET::] PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
interface PhaseNotificationInput {
  options: WorkspaceLoopOptions;
  pkg: WorkspacePackage;
  state: PackageState;
  ticketsData: TicketsJson;
  phaseId: number;
  deps: PackageLoopDeps;
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
async function notifyPhaseIfComplete(input: PhaseNotificationInput): Promise<void> {
  const { options, pkg, state, ticketsData, phaseId, deps } = input;
  if (state.notifiedPhases.has(phaseId)) return;
  const phase = phaseProgress(ticketsData, phaseId);
  if (!phase.complete) return;
  state.notifiedPhases.add(phaseId);
  const context: PhaseCompleteContext = {
    workspace: options.workspace.name,
    packageName: pkg.name,
    phaseId,
    reviewed: phase.reviewed,
    total: phase.total,
    lastTicketKey: phase.lastTicketKey,
    packageComplete: packageProgress(ticketsData).allTerminal,
  };
  await deps.sendSlackPhaseComplete(options.slackWebhookUrl, context);
}

// [::TICKET::] PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
interface StopContextInput {
  options: WorkspaceLoopOptions;
  pkg: WorkspacePackage;
  action: NextAction | null;
  reason: string;
  ticketKey?: string;
  command?: string;
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function stopContextFor(input: StopContextInput): StopContext {
  const { options, pkg, action, reason, ticketKey, command } = input;
  return {
    workspace: options.workspace.name,
    packageName: pkg.name,
    phaseId: action?.kind === "command" ? action.phaseId : null,
    ticketKey: ticketKey ?? (action?.kind === "command" ? action.ticketKey : null),
    command: command ?? (action?.kind === "command" ? action.command : null),
    reason,
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
async function stopAndThrow(
  options: WorkspaceLoopOptions,
  pkg: WorkspacePackage,
  deps: PackageLoopDeps,
  context: StopContext,
): Promise<never> {
  await deps.sendSlackStop(options.slackWebhookUrl, context);
  throw new LoopStoppedError(context);
}

/**
 * Reflect on local .claude changes immediately before the push that will carry
 * them. The session is rooted at the workspace, not the package directory,
 * because the command scans the .claude that owns the run.
 */
async function runPickupBeforePush(
  options: WorkspaceLoopOptions,
  deps: PackageLoopDeps,
): Promise<void> {
  const runPickup = deps.runPickup;
  if (runPickup === undefined) return;
  await runPickupAtBoundary({
    root: options.workspace.root,
    execute: (cwd) =>
      runPickup(cwd, toSessionConfig(options), toRunCommandOptions(options)),
    ...(deps.pickupAvailability === undefined
      ? {}
      : { isAvailable: deps.pickupAvailability }),
  });
}

// [::TICKET::] PX-403, PX-404, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-449) --for-spec --no-implementation-order`.
async function runResolve(
  pkg: WorkspacePackage,
  options: WorkspaceLoopOptions,
  deps: PackageLoopDeps,
): Promise<void> {
  const config = toSessionConfig(options);
  const runOptions = toRunCommandOptions(options);
  // Resolve is directory-scoped batch cleanup: its optional argument is a ticket
  // key, not a path, and the package loop has no single ticket to attribute. The
  // session already runs in the package directory, so the command takes no
  // argument and the display shows no ticket key.
  printCommandHeader("/resolve-ticket");
  await runDisplayedCommand({
    pkg,
    options,
    command: "/resolve-ticket",
    ticketKey: null,
    execute: () =>
      runWithDeps(pkg, config, deps, async (session) => {
        await deps.runCommand(session, "/resolve-ticket", runOptions);
      }),
  });
  process.stdout.write("\n>>> ✅ resolve 完了\n");

  if (options.pushEnabled) {
    // Reflect before the push, not after: the push is what carries the local
    // .claude changes to the upstream the scan compares against.
    await runPickupBeforePush(options, deps);
    printCommandHeader("/epush-branch");
    await runDisplayedCommand({
      pkg,
      options,
      command: "/epush-branch",
      ticketKey: null,
      execute: () =>
        runWithDeps(pkg, config, deps, async (session) => {
          await deps.runCommand(session, "/epush-branch", runOptions);
        }),
    });
    process.stdout.write("\n>>> ✅ epush-branch 完了\n");
  }
}

function runWithDeps<T>(
  pkg: WorkspacePackage,
  config: SessionConfig,
  deps: PackageLoopDeps,
  fn: (session: AcpSession) => Promise<T>,
): Promise<T> {
  return retryWithBackoff(
    () => deps.withSession(pkg.directory, config, fn),
    {
      maxAttempts: retryPolicy.maxAttempts,
      baseDelayMs: retryPolicy.baseDelayMs,
      maxDelayMs: retryPolicy.maxDelayMs,
      jitterMs: retryPolicy.jitterMs,
      isRetryable: isRecoverableError,
    },
  );
}

// [::TICKET::] PX-403, PX-404, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-449) --for-spec --no-implementation-order`.
async function runBoundary(
  pkg: WorkspacePackage,
  command: string,
  options: WorkspaceLoopOptions,
  deps: PackageLoopDeps,
  ticketKey: string | null,
): Promise<void> {
  const runOptions = toRunCommandOptions(options);
  // The resume directive is a prompt suffix, not a command name; keep both the
  // console header and the NOW row to the first line.
  const label = command.split("\n")[0] ?? command;
  printCommandHeader(label);
  await runDisplayedCommand({
    pkg,
    options,
    command: label,
    ticketKey,
    execute: () =>
      runWithDeps(pkg, toSessionConfig(options), deps, async (session) => {
        await deps.runCommand(session, command, runOptions);
      }),
  });
  process.stdout.write(`\n>>> ✅ ${label.replace("/", "")} 完了\n`);
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function boundaryIoOf(deps: PackageLoopDeps): BoundaryStateIo {
  return deps.boundaryStateIo ?? nodeBoundaryStateIo;
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function nowIso(deps: PackageLoopDeps): string {
  return new Date(deps.now()).toISOString();
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
function persistBoundaryState(
  pkg: WorkspacePackage,
  state: BoundaryState,
  deps: PackageLoopDeps,
): void {
  writeBoundaryState(pkg.directory, state, boundaryIoOf(deps));
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
interface BoundaryRunResult {
  state: BoundaryState;
  addedTicketKeys: string[];
}

/**
 * Run one boundary command and persist its lifecycle. A crash between the start
 * write and the completion write leaves IN_PROGRESS, which is never endpoint.
 */
// [::TICKET::] PX-413, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-413|PX-449) --for-spec --no-implementation-order`.
interface BoundaryRunInput {
  pkg: WorkspacePackage;
  kind: "consolidate" | "find";
  command: string;
  options: WorkspaceLoopOptions;
  deps: PackageLoopDeps;
  state: BoundaryState;
  /** The ticket a resumed find is attributed to; null for consolidate. */
  ticketKey?: string | null;
}

// [::TICKET::] PX-413, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-413|PX-449) --for-spec --no-implementation-order`.
async function runPackageBoundary(
  input: BoundaryRunInput,
): Promise<BoundaryRunResult> {
  const { pkg, kind, command, options, deps, state } = input;
  const started = markBoundaryStarted(state, kind, nowIso(deps));
  persistBoundaryState(pkg, started, deps);

  const beforeKeys = new Set(ticketKeysOf(readTicketsOrThrow(pkg.ticketsPath)));
  await runBoundary(pkg, command, options, deps, input.ticketKey ?? null);

  const afterData = readTicketsOrThrow(pkg.ticketsPath);
  const addedTicketKeys = ticketKeysOf(afterData).filter(
    (key) => !beforeKeys.has(key),
  );
  const completed = markBoundaryCompleted(started, kind, nowIso(deps), {
    digest: computeTicketSetDigest(afterData),
    addedTicketKeys,
  });
  persistBoundaryState(pkg, completed, deps);
  return { state: completed, addedTicketKeys };
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
async function notifyBoundaryComplete(
  options: WorkspaceLoopOptions,
  pkg: WorkspacePackage,
  state: BoundaryState,
  addedTicketKeys: string[],
  deps: PackageLoopDeps,
): Promise<void> {
  const notify = deps.sendSlackBoundaryComplete ?? sendSlackBoundaryComplete;
  const context: BoundaryCompleteContext = {
    workspace: options.workspace.name,
    packageName: pkg.name,
    lastReviewedTicketKey: state.lastReviewedTicketKey ?? "none",
    consolidateFinishedAt: state.consolidate?.finishedAt ?? "",
    findFinishedAt:
      state.find?.status === BOUNDARY_STATUS_COMPLETE
        ? state.find.finishedAt
        : null,
    addedTicketCount: addedTicketKeys.length,
    timezone:
      options.watcherConfig?.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
  await notify(options.slackWebhookUrl, context);
}

/** Send the second, separate notice that a find is being resumed. */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
async function notifyFindUnfinished(
  options: WorkspaceLoopOptions,
  pkg: WorkspacePackage,
  ticketKey: string | null,
  deps: PackageLoopDeps,
): Promise<void> {
  const notify = deps.sendSlackFindUnfinished ?? sendSlackFindUnfinished;
  const context: FindUnfinishedContext = {
    workspace: options.workspace.name,
    packageName: pkg.name,
    ticketKey,
  };
  await notify(options.slackWebhookUrl, context);
}

/**
 * One find boundary request: the package, the loop context, the durable state
 * and whether this run resumes an interrupted find.
 */
interface FindBoundaryRequest {
  pkg: WorkspacePackage;
  options: WorkspaceLoopOptions;
  deps: PackageLoopDeps;
  state: BoundaryState;
  resume: boolean;
  ticketKey: string | null;
}

/**
 * Run find with mechanical evidence and, when evidence exists, the fixed
 * resume directive. No argument is passed: the command resolves its graph from
 * the package directory, so conver never injects a path.
 */
// [::TICKET::] P27-2 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=P27-2 --for-spec --no-implementation-order`.
// [::TICKET::] PX-439, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-439|PX-449) --for-spec --no-implementation-order`.
async function runFindBoundary(request: FindBoundaryRequest): Promise<BoundaryRunResult> {
  const { pkg, options, deps, state, resume, ticketKey } = request;
  await waitForWindow(options.watcherConfig);
  if (resume) await notifyFindUnfinished(options, pkg, ticketKey, deps);
  const command = buildFindCommand(resume);
  return runPackageBoundary({ pkg, kind: "find", command, options, deps, state, ticketKey });
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function recordExecution(
  options: WorkspaceLoopOptions,
  pkg: WorkspacePackage,
  action: Extract<NextAction, { kind: "command" }>,
  deps: PackageLoopDeps,
): void {
  const execution: CommandExecution = {
    workspace: options.workspace.name,
    packageName: pkg.name,
    ticketKey: action.ticketKey,
    command: action.command,
    statusBefore: action.status,
    at: deps.now(),
  };
  commandHistory.record(execution);
}

// [::TICKET::] PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
interface CommandExecutionInput {
  session: AcpSession;
  options: WorkspaceLoopOptions;
  pkg: WorkspacePackage;
  action: Extract<NextAction, { kind: "command" }>;
  escalationLevel: number;
  deps: PackageLoopDeps;
}

/**
 * Run one command while publishing it to the display. The end hook is in a
 * finally block: a failed command must not leave its name on the NOW row.
 */
// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
interface DisplayedCommandInput {
  pkg: WorkspacePackage;
  options: WorkspaceLoopOptions;
  command: string;
  ticketKey: string | null;
  execute: () => Promise<void>;
}

// [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
async function runDisplayedCommand(input: DisplayedCommandInput): Promise<void> {
  input.options.display?.onCommandStart?.(input.pkg.name, input.command, input.ticketKey);
  try {
    await input.execute();
  } finally {
    input.options.display?.onCommandEnd?.();
  }
}

// [::TICKET::] PX-413, PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-413|PX-449) --for-spec --no-implementation-order`.
async function executeCommand(input: CommandExecutionInput): Promise<void> {
  const { session, options, pkg, action, escalationLevel, deps } = input;
  printCommandHeader(action.command, action.ticketKey);
  await runDisplayedCommand({
    pkg,
    options,
    command: action.command,
    ticketKey: action.ticketKey,
    execute: async () => {
      await deps.runCommand(session, `${action.command} ${action.ticketKey}`, {
        ...toRunCommandOptions(options),
        escalationLevel,
      });
    },
  });
  recordExecution(options, pkg, action, deps);
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function escalationLevelFor(action: Extract<NextAction, { kind: "command" }>): number {
  if (!commandHistory.hasRepeated(action.ticketKey, action.command)) return 0;
  return commandHistory.nextEscalation(action.ticketKey, action.command);
}

/** Run one derived ticket command, optionally binding the whole pipeline to one session. */
// [::TICKET::] PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
interface TicketStepInput {
  pkg: WorkspacePackage;
  options: WorkspaceLoopOptions;
  action: Extract<NextAction, { kind: "command" }>;
  state: PackageState;
  deps: PackageLoopDeps;
}

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
async function runTicketStep(input: TicketStepInput): Promise<void> {
  const { pkg, options, action, state, deps } = input;
  await waitForWindow(options.watcherConfig);
  const config = toSessionConfig(options);
  const firstLevel = escalationLevelFor(action);

  if (!options.bindReviewInOneSession) {
    await runWithDeps(pkg, config, deps, async (session) => {
      await executeCommand({
        session,
        options,
        pkg,
        action,
        escalationLevel: firstLevel,
        deps,
      });
    });
    return;
  }

  await runWithDeps(pkg, config, deps, async (session) => {
    let currentAction = action;
    let currentLevel = firstLevel;
    for (;;) {
      await executeCommand({
        session,
        options,
        pkg,
        action: currentAction,
        escalationLevel: currentLevel,
        deps,
      });
      const ticketsData = readTicketsOrThrow(pkg.ticketsPath);
      const next = deriveNextAction(ticketsData, state.progress);
      if (next.kind !== "command" || next.ticketKey !== action.ticketKey) {
        return;
      }
      currentAction = next;
      currentLevel = escalationLevelFor(next);
    }
  });
}

/**
 * Run one package to completion and return the number of tickets that reached
 * a terminal status during this call.
 */
export async function runPackageLoop(
  pkg: WorkspacePackage,
  options: WorkspaceLoopOptions,
  deps: PackageLoopDeps = DEFAULT_PACKAGE_LOOP_DEPS,
  budget: number = options.maxCount,
): Promise<number> {
  const previousCwd = process.cwd();
  process.chdir(pkg.directory);
  options.display?.onPackageStart(pkg.name);
  try {
    const initialState = readBoundaryState(pkg.directory, boundaryIoOf(deps));
    const currentData = readTicketsOrThrow(pkg.ticketsPath);
    if (isPackageEndpoint(currentData, initialState)) {
      process.stdout.write(
        `[boundary] package=${pkg.name} endpoint=true reason=digest-match\n`,
      );
      return 0;
    }

    // A terminal ticket set whose boundary did not complete for it is adopted,
    // never scanned. A started-but-incomplete boundary is not evidence of
    // pending implementation; the written record also lets the watcher terminate.
    // [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
    if (shouldAdoptTerminalPackage(initialState, currentData)) {
      if (initialState === null && existsSync(boundaryStatePath(pkg.directory))) {
        process.stderr.write(
          `[boundary] package=${pkg.name} unreadable boundary state; adopting the completed ticket set\n`,
        );
      } else if (initialState !== null) {
        process.stderr.write(
          `[boundary] package=${pkg.name} incomplete boundary abandoned; adopting the terminal ticket set\n`,
        );
      }
      const adopted = createLegacyCompletionState(pkg.id, currentData, nowIso(deps));
      persistBoundaryState(pkg, adopted, deps);
      process.stdout.write(
        `[boundary] package=${pkg.name} endpoint=true reason=legacy-adoption\n`,
      );
      return 0;
    }

    let boundaryState = initialState ?? createBoundaryState(pkg.id);
    // A readable record can predate the review bookkeeping. When the ticket set
    // is already terminal and the record carries no review time, seed it now so
    // the completed boundary can prove it belongs to this ticket set.
    // [::TICKET::] PX-446 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-446 --for-spec --no-implementation-order`.
    if (boundaryState.lastReviewedAt === null && isTicketSetTerminal(currentData)) {
      const keys = ticketKeysOf(currentData);
      const lastKey = keys[keys.length - 1];
      if (lastKey !== undefined) {
        boundaryState = {
          ...boundaryState,
          lastReviewedTicketKey: lastKey,
          lastReviewedAt: nowIso(deps),
        };
      }
    }

    clearForNextRound(pkg.ticketsPath);
    const state = createPackageState(
      options,
      initialState?.reviewedSinceResolve ?? 0,
    );
    let processed = 0;
    let hasRunCommand = false;

    while (processed < budget) {
      const ticketsData = readTicketsOrThrow(pkg.ticketsPath);
      let action: NextAction;
      try {
        action = deriveActionForNextStep(ticketsData, state.progress, hasRunCommand);
      } catch (error) {
        if (error instanceof InvalidTicketStatusError) {
          const stopContext = stopContextFor({
            options,
            pkg,
            action: null,
            reason: `invalid status ${error.status} on ${error.ticketKey}`,
            ticketKey: error.ticketKey,
          });

          // `remanded` is owned by the find stage, not by the per-ticket
          // command table. Positive mechanical evidence turns it into a
          // resume; anything else keeps the existing stop.
          if (error.status !== REMANDED_STATUS || options.noFind === true) {
            return await stopAndThrow(options, pkg, deps, stopContext);
          }
          if (state.progress.findRounds >= state.progress.maxFindRounds) {
            return await stopAndThrow(
              options,
              pkg,
              deps,
              stopContextFor({
                options,
                pkg,
                action: null,
                reason: new FindRoundLimitError(
                  state.progress.findRounds,
                  state.progress.maxFindRounds,
                ).message,
              }),
            );
          }

          await deps.sendSlackStop(options.slackWebhookUrl, stopContext);
          const detector = deps.detectUnfinishedFind ?? detectUnfinishedFindForPackage;
          const report = await detector(pkg);
          if (!report.unfinished) throw new LoopStoppedError(stopContext);

          const found = await runFindBoundary({
            pkg,
            options,
            deps,
            state: boundaryState,
            resume: true,
            ticketKey: error.ticketKey,
          });
          boundaryState = found.state;
          state.progress.findRounds++;
          state.progress.findDone = true;
          const afterFind = readTicketsOrThrow(pkg.ticketsPath);
          await notifyBoundaryComplete(
            options,
            pkg,
            boundaryState,
            found.addedTicketKeys,
            deps,
          );
          if (!isTicketSetTerminal(afterFind)) {
            state.progress.consolidateDone = false;
            state.progress.findDone = false;
            state.notifiedPhases.clear();
          }
          continue;
        }
        if (error instanceof FindRoundLimitError) {
          return await stopAndThrow(
            options,
            pkg,
            deps,
            stopContextFor({
              options,
              pkg,
              action: null,
              reason: error.message,
            }),
          );
        }
        throw error;
      }

      if (action.kind === "complete") break;

      // A -T block that starts inside the implementation group must not skip an
      // unselected stage: skipping would advance the ticket out of order. The
      // default path passes no set, so this branch is unreachable there.
      const selectedStage = stageForNextAction(action);
      if (
        selectedStage !== null &&
        options.selectedImplementationStages !== undefined &&
        !options.selectedImplementationStages.has(selectedStage)
      ) {
        return await stopAndThrow(
          options,
          pkg,
          deps,
          stopContextFor({
            options,
            pkg,
            action,
            reason: `stage ${selectedStage} is not selected by -T`,
          }),
        );
      }

      if (action.kind === "command") {
        await runTicketStep({ pkg, options, action, state, deps });
        hasRunCommand = true;
        const afterData = readTicketsOrThrow(pkg.ticketsPath);
        const { phaseId, id } = parseTicketKey(action.ticketKey);
        const afterStatus = statusOfTicket(afterData, phaseId, id);
        if (afterStatus !== action.status) {
          commandHistory.resetTicket(action.ticketKey);
          if (isTerminalStatus(afterStatus)) {
            processed++;
            state.progress.reviewedSinceResolve++;
            boundaryState = markReviewed(
              boundaryState,
              action.ticketKey,
              nowIso(deps),
            );
            persistBoundaryState(pkg, boundaryState, deps);
            await notifyPhaseIfComplete({
              options,
              pkg,
              state,
              ticketsData: afterData,
              phaseId,
              deps,
            });
          }
        }
        continue;
      }

      if (action.kind === "resolve") {
        await waitForWindow(options.watcherConfig);
        await runResolve(pkg, options, deps);
        state.progress.reviewedSinceResolve = 0;
        boundaryState = markResolved(boundaryState);
        persistBoundaryState(pkg, boundaryState, deps);
        continue;
      }

      if (action.kind === "consolidate") {
        await waitForWindow(options.watcherConfig);
        const consolidated = await runPackageBoundary({
          pkg,
          kind: "consolidate",
          command: "/consolidate-stubs",
          options,
          deps,
          state: boundaryState,
        });
        boundaryState = consolidated.state;
        state.progress.consolidateDone = true;

        if (options.noFind === true) {
          const afterConsolidate = readTicketsOrThrow(pkg.ticketsPath);
          boundaryState = markFindSkipped(
            boundaryState,
            nowIso(deps),
            computeTicketSetDigest(afterConsolidate),
          );
          persistBoundaryState(pkg, boundaryState, deps);
          state.progress.findDone = true;
          await notifyBoundaryComplete(options, pkg, boundaryState, [], deps);
        }
        continue;
      }

      const detector = deps.detectUnfinishedFind ?? detectUnfinishedFindForPackage;
      const report = await detector(pkg);
      const found = await runFindBoundary({
        pkg,
        options,
        deps,
        state: boundaryState,
        resume: report.unfinished,
        ticketKey: null,
      });
      boundaryState = found.state;
      state.progress.findRounds++;
      state.progress.findDone = true;
      const afterFind = readTicketsOrThrow(pkg.ticketsPath);
      await notifyBoundaryComplete(
        options,
        pkg,
        boundaryState,
        found.addedTicketKeys,
        deps,
      );
      if (!isTicketSetTerminal(afterFind)) {
        state.progress.consolidateDone = false;
        state.progress.findDone = false;
        state.notifiedPhases.clear();
      }
    }

    return processed;
  } catch (error) {
    if (error instanceof LoopStoppedError) throw error;
    if (error instanceof StopRequestedError) {
      return await stopAndThrow(
        options,
        pkg,
        deps,
        stopContextFor({
          options,
          pkg,
          action: null,
          reason: "repeated command exhausted three escalations",
          ticketKey: error.ticketKey,
          command: error.command,
        }),
      );
    }
    if (error instanceof PackageSelectionError) throw error;
    return await stopAndThrow(
      options,
      pkg,
      deps,
      stopContextFor({
        options,
        pkg,
        action: null,
        reason: error instanceof Error ? error.message : String(error),
      }),
    );
  } finally {
    process.chdir(previousCwd);
  }
}

/**
 * Run the selected packages in implementation order. A stop inside a package
 * is not recovered: the error propagates so main() can exit non-zero after
 * the terminal is restored.
 */
export async function runWorkspaceLoop(
  options: WorkspaceLoopOptions,
  deps: PackageLoopDeps = DEFAULT_PACKAGE_LOOP_DEPS,
): Promise<WorkspaceLoopResult> {
  const cliPackages = options.packages ?? [];
  const requested = cliPackages.length > 0
    ? cliPackages
    : options.watcherConfig?.packages ?? [];
  const boundaryIo = boundaryIoOf(deps);
  const requestedPackages = resolveRequestedPackages(
    options.workspace.packages,
    requested,
  );

  if (requestedPackages.length > 0 && allPackagesAreEndpoint(requestedPackages, boundaryIo)) {
    process.stdout.write(
      `\n✅ ワークスペース ${options.workspace.name} の処理が完了しました。\n`,
    );
    return { processed: 0, allSelectedComplete: true };
  }

  const selected = resolvePackageSelection({
    packages: options.workspace.packages,
    requested,
    hasPending: (pkg) => hasPendingTickets(pkg.ticketsPath),
  });

  let budget = options.maxCount;
  let processed = 0;
  for (const pkg of selected) {
    if (budget <= 0) break;
    const packageProcessed = await runPackageLoop(pkg, options, deps, budget);
    processed += packageProcessed;
    budget -= packageProcessed;
  }

  process.stdout.write(
    `\n✅ ワークスペース ${options.workspace.name} の処理が完了しました。\n`,
  );
  return {
    processed,
    allSelectedComplete: allPackagesAreEndpoint(selected, boundaryIo),
  };
}
