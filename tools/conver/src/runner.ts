// runner.ts — the strict 5-layer execution loop.
//
// The workspace loop walks packages in the order workspacify-order proved
// safe. The package loop walks tickets in Tickets.json array order and asks
// `deriveNextAction` before every execution, so it can never skip a ticket or
// enter a phase out of order. Every command runs with the package directory as
// cwd. A repeated command escalates three times and then stops conver instead
// of silently moving on.
import { readFileSync } from "node:fs";
import { withSession, runCommand } from "./session.js";
import type { RunCommandOptions, AcpSession, SessionConfig } from "./session.js";
import {
  sendSlackPhaseComplete,
  sendSlackStop,
} from "./notifier.js";
import type { PhaseCompleteContext, StopContext } from "./notifier.js";
import {
  clearForNextRound,
  packageProgress,
  pendingTicketsOf,
  phaseProgress,
} from "./tickets.js";
import type { Ticket, TicketsJson } from "./tickets.js";
import { isTerminalStatus } from "./ticket-status.js";
import {
  deriveNextAction,
  FindRoundLimitError,
  InvalidTicketStatusError,
} from "./next-action.js";
import type { CommandName, NextAction, PackageProgress } from "./next-action.js";
import {
  commandHistory,
  StopRequestedError,
} from "./command-history.js";
import type { CommandExecution } from "./command-history.js";
import {
  resolvePackageSelection,
  PackageSelectionError,
} from "./package-selection.js";
import type { WorkspaceModel, WorkspacePackage } from "./workspace.js";
import type { WatcherConfig } from "./watcher.js";
import { waitForWindow } from "./step-timer.js";
import type { SessionUpdate } from "@agentclientprotocol/sdk";

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
/** The display layer's hooks; absent in non-TTY/plain runs. */
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface DisplayHooks {
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
  onUpdate(update: SessionUpdate): void;
  onFlush(): void;
  onPackageStart(packageName: string): void;
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
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
  watcherConfig?: WatcherConfig;
  display?: DisplayHooks;
}

/** Options for the workspace loop: the validated model is the package source. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface WorkspaceLoopOptions extends LoopOptions {
  workspace: WorkspaceModel;
}

/** Session and notification seams, injected by tests. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface PackageLoopDeps {
  withSession: typeof withSession;
  runCommand: typeof runCommand;
  sendSlackPhaseComplete: typeof sendSlackPhaseComplete;
  sendSlackStop: typeof sendSlackStop;
  now: () => number;
}

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

/** Maximum find executions in one package. */
export const MAX_FIND_ROUNDS = 3;

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

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function createPackageState(options: LoopOptions): PackageState {
  return {
    progress: {
      reviewedSinceResolve: 0,
      resolveEvery: options.resolveEvery,
      consolidateDone: false,
      findDone: false,
      findRounds: 0,
      maxFindRounds: MAX_FIND_ROUNDS,
      noFind: options.noFind === true,
    },
    notifiedPhases: new Set<number>(),
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
async function notifyPhaseIfComplete(
  options: WorkspaceLoopOptions,
  pkg: WorkspacePackage,
  state: PackageState,
  ticketsData: TicketsJson,
  phaseId: number,
  deps: PackageLoopDeps,
): Promise<void> {
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

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function stopContextFor(
  options: WorkspaceLoopOptions,
  pkg: WorkspacePackage,
  action: NextAction | null,
  reason: string,
  ticketKey?: string,
  command?: string,
): StopContext {
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

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
async function runResolve(
  pkg: WorkspacePackage,
  options: WorkspaceLoopOptions,
  ticketKey: string,
  deps: PackageLoopDeps,
): Promise<void> {
  const config = toSessionConfig(options);
  const runOptions = toRunCommandOptions(options);
  printCommandHeader("/resolve-ticket", ticketKey);
  await runWithDeps(pkg, config, deps, async (session) => {
    await deps.runCommand(session, `/resolve-ticket ${pkg.directory}`, runOptions);
  });
  process.stdout.write("\n>>> ✅ resolve 完了\n");

  if (options.pushEnabled) {
    printCommandHeader("/epush-branch");
    await runWithDeps(pkg, config, deps, async (session) => {
      await deps.runCommand(session, "/epush-branch", runOptions);
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

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
async function runBoundary(
  pkg: WorkspacePackage,
  command: "/consolidate-stubs" | "/find-omissions",
  options: WorkspaceLoopOptions,
  deps: PackageLoopDeps,
): Promise<void> {
  const runOptions = toRunCommandOptions(options);
  printCommandHeader(command);
  await runWithDeps(pkg, toSessionConfig(options), deps, async (session) => {
    await deps.runCommand(session, command, runOptions);
  });
  process.stdout.write(`\n>>> ✅ ${command.replace("/", "")} 完了\n`);
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

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
async function executeCommand(
  session: AcpSession,
  options: WorkspaceLoopOptions,
  pkg: WorkspacePackage,
  action: Extract<NextAction, { kind: "command" }>,
  escalationLevel: number,
  deps: PackageLoopDeps,
): Promise<void> {
  printCommandHeader(action.command, action.ticketKey);
  await deps.runCommand(session, `${action.command} ${action.ticketKey}`, {
    ...toRunCommandOptions(options),
    escalationLevel,
  });
  recordExecution(options, pkg, action, deps);
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function escalationLevelFor(action: Extract<NextAction, { kind: "command" }>): number {
  if (!commandHistory.hasRepeated(action.ticketKey, action.command)) return 0;
  return commandHistory.nextEscalation(action.ticketKey, action.command);
}

/** Run one derived ticket command, optionally binding the whole pipeline to one session. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
async function runTicketStep(
  pkg: WorkspacePackage,
  options: WorkspaceLoopOptions,
  action: Extract<NextAction, { kind: "command" }>,
  state: PackageState,
  deps: PackageLoopDeps,
): Promise<void> {
  await waitForWindow(options.watcherConfig);
  const config = toSessionConfig(options);
  const firstLevel = escalationLevelFor(action);

  if (!options.bindReviewInOneSession) {
    await runWithDeps(pkg, config, deps, async (session) => {
      await executeCommand(session, options, pkg, action, firstLevel, deps);
    });
    return;
  }

  await runWithDeps(pkg, config, deps, async (session) => {
    let currentAction = action;
    let currentLevel = firstLevel;
    for (;;) {
      await executeCommand(session, options, pkg, currentAction, currentLevel, deps);
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
  deps: PackageLoopDeps = {
    withSession,
    runCommand,
    sendSlackPhaseComplete,
    sendSlackStop,
    now: Date.now,
  },
  budget: number = options.maxCount,
): Promise<number> {
  const previousCwd = process.cwd();
  process.chdir(pkg.directory);
  options.display?.onPackageStart(pkg.name);
  try {
    clearForNextRound(pkg.ticketsPath);
    const state = createPackageState(options);
    let processed = 0;

    while (processed < budget) {
      const ticketsData = readTicketsOrThrow(pkg.ticketsPath);
      let action: NextAction;
      try {
        action = deriveNextAction(ticketsData, state.progress);
      } catch (error) {
        if (error instanceof InvalidTicketStatusError) {
          return await stopAndThrow(
            options,
            pkg,
            deps,
            stopContextFor(options, pkg, null, `invalid status ${error.status} on ${error.ticketKey}`, error.ticketKey),
          );
        }
        if (error instanceof FindRoundLimitError) {
          return await stopAndThrow(
            options,
            pkg,
            deps,
            stopContextFor(options, pkg, null, error.message),
          );
        }
        throw error;
      }

      if (action.kind === "complete") break;

      if (action.kind === "command") {
        await runTicketStep(pkg, options, action, state, deps);
        const afterData = readTicketsOrThrow(pkg.ticketsPath);
        const { phaseId, id } = parseTicketKey(action.ticketKey);
        const afterStatus = statusOfTicket(afterData, phaseId, id);
        if (afterStatus !== action.status) {
          commandHistory.resetTicket(action.ticketKey);
          if (isTerminalStatus(afterStatus)) {
            processed++;
            state.progress.reviewedSinceResolve++;
            await notifyPhaseIfComplete(options, pkg, state, afterData, phaseId, deps);
          }
        }
        continue;
      }

      if (action.kind === "resolve") {
        await waitForWindow(options.watcherConfig);
        await runResolve(pkg, options, action.ticketKey, deps);
        state.progress.reviewedSinceResolve = 0;
        continue;
      }

      if (action.kind === "consolidate") {
        await waitForWindow(options.watcherConfig);
        await runBoundary(pkg, "/consolidate-stubs", options, deps);
        state.progress.consolidateDone = true;
        continue;
      }

      await waitForWindow(options.watcherConfig);
      await runBoundary(pkg, "/find-omissions", options, deps);
      state.progress.findRounds++;
      state.progress.findDone = true;
      const afterFind = readTicketsOrThrow(pkg.ticketsPath);
      if (pendingTicketsOf(afterFind).length > 0) {
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
        stopContextFor(
          options,
          pkg,
          null,
          "repeated command exhausted three escalations",
          error.ticketKey,
          error.command,
        ),
      );
    }
    if (error instanceof PackageSelectionError) throw error;
    return await stopAndThrow(
      options,
      pkg,
      deps,
      stopContextFor(
        options,
        pkg,
        null,
        error instanceof Error ? error.message : String(error),
      ),
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
  deps: PackageLoopDeps = {
    withSession,
    runCommand,
    sendSlackPhaseComplete,
    sendSlackStop,
    now: Date.now,
  },
): Promise<void> {
  const cliPackages = options.packages ?? [];
  const requested = cliPackages.length > 0
    ? cliPackages
    : options.watcherConfig?.packages ?? [];
  const selected = resolvePackageSelection({
    packages: options.workspace.packages,
    requested,
    hasPending: (pkg) => hasPendingTickets(pkg.ticketsPath),
  });

  let budget = options.maxCount;
  for (const pkg of selected) {
    if (budget <= 0) break;
    const processed = await runPackageLoop(pkg, options, deps, budget);
    budget -= processed;
  }

  process.stdout.write(
    `\n✅ ワークスペース ${options.workspace.name} の処理が完了しました。\n`,
  );
}
