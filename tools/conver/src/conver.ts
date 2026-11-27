// conver.ts — process entry: the 5-layer workspace gate, watcher and loop.
import { parseCliOptions } from "./cli.js";
import type { CliOptions } from "./cli.js";
import {
  allPackagesAreEndpoint,
  isRecoverableError,
  retryPolicy,
  retryWithBackoff,
  runWorkspaceLoop,
} from "./runner.js";
import type { WorkspaceLoopOptions, WorkspaceLoopResult } from "./runner.js";
import { runCommand, withSession } from "./session.js";
import {
  isImplementationGroupPlan,
  parseStagePlan,
  StagePlanError,
} from "./stage-plan.js";
import type { StageName, StagePlan } from "./stage-plan.js";
import { runStagePlan } from "./stage-engine.js";
import type { PipelineStepRecord } from "./stage-engine.js";
import type { StageEngineDeps, StageRunRecord } from "./stage-engine.js";
import { loadWatcherConfig } from "./watcher.js";
import type { WatcherConfig } from "./watcher.js";
import { isWithinTimeWindow, waitForWindow } from "./step-timer.js";
import type { PipelineCompletionReason } from "./pipeline-action.js";
import { CronScheduler } from "./cron-scheduler.js";
import { createTerminationHandle } from "./termination.js";
import {
  readInitialWorkspaceForPlan,
  readWorkspace,
  readWorkspaceForStagePlan,
  resolveStageWorkspaceRoot,
  resolveWorkspaceRoot,
  validateImplementationOrder,
  WorkspaceGateError,
} from "./workspace.js";
import type { WorkspaceModel } from "./workspace.js";
import { CANONICAL_STAGE_DEFINITIONS } from "./stage-plan.js";
import {
  resolvePackageSelection,
  resolveRequestedPackages,
  PackageSelectionError,
} from "./package-selection.js";
import { LoopStoppedError } from "./runner.js";
import { pendingTicketsOf } from "./tickets.js";
import { readFileSync } from "node:fs";
import readline from "node:readline";
import { DisplayRenderer } from "./display/renderer.js";
import { DisplayLifecycle } from "./display/lifecycle.js";
import { toDisplayEvent } from "./display/events.js";
import { ProgressDashboard } from "./progress/dashboard.js";
import { readProgressSnapshot } from "./progress/model.js";
import { setAgentStderrSink } from "./session.js";
import { checkRuntimeDependencies } from "./runtime-dependencies.js";
import type { DisplayHooks } from "./runner.js";
import {
  PICKUP_COMMAND,
  runPickupAtBoundary,
} from "./pickup-at-boundary.js";

/** Fallback width for a TTY whose column count the platform does not report. */
const DEFAULT_TERMINAL_WIDTH = 120;
const DEFAULT_TERMINAL_ROWS = 24;

/**
 * Format the -P selection for the startup banner. An omitted selection runs
 * every package, so it says "(all)" rather than echoing an empty list.
 */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function formatTargetPackages(requested: readonly string[]): string {
  const unique = [...new Set(requested)];
  return unique.length === 0 ? "(all)" : unique.join(", ");
}

/** Log a fatal error without a raw trace. */
export function reportFatalError(prefix: string, err: unknown): void {
  console.error(`${prefix}:`, err instanceof Error ? err.message : String(err));
}

/** Install process-level crash handlers that log and continue. */
export function installCrashHandlers(): void {
  process.on("uncaughtException", (err) => {
    reportFatalError("致命的エラー (uncaughtException)", err);
  });
  process.on("unhandledRejection", (reason) => {
    reportFatalError("致命的エラー (unhandledRejection)", reason);
  });
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function hasPendingTickets(ticketsPath: string): boolean {
  return pendingTicketsOf(JSON.parse(readFileSync(ticketsPath, "utf-8"))).length > 0;
}

/** Convert CLI options plus the validated model into loop options. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function buildLoopOptions(
  cli: CliOptions,
  model: WorkspaceModel,
  display?: DisplayHooks,
  watcherConfig?: WatcherConfig,
): WorkspaceLoopOptions {
  const { watcherConfig: _ignored, ...loop } = cli;
  return {
    ...loop,
    workspace: model,
    ...(display === undefined ? {} : { display }),
    ...(watcherConfig === undefined ? {} : { watcherConfig }),
  };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
async function runNormalMode(
  cli: CliOptions,
  model: WorkspaceModel,
  display?: DisplayHooks,
): Promise<void> {
  await runWorkspaceLoop(buildLoopOptions(cli, model, display));
}

/** The canonical index of make; every stage before it is an upstream stage. */
const MAKE_STAGE_INDEX = CANONICAL_STAGE_DEFINITIONS.findIndex(
  (definition) => definition.name === "make",
);

/** True when the plan selects a stage that runs before the implementation group. */
// [::TICKET::] PX-454 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-454 --for-spec --no-implementation-order`.
function hasUpstreamStage(plan: StagePlan): boolean {
  return plan.selections.some(
    (selection) =>
      CANONICAL_STAGE_DEFINITIONS.findIndex(
        (definition) => definition.name === selection.name,
      ) < MAKE_STAGE_INDEX,
  );
}

/**
 * Run a non-default -T plan.
 *
 * The implementation group is delegated to the existing loop through the stage
 * engine, so the make..find path itself is unchanged. The model is re-read after
 * workspacify and split because those stages create the inputs the next stage
 * reads.
 */
interface StageModeInput {
  readonly cli: CliOptions;
  readonly plan: StagePlan;
  readonly root: string;
  readonly initialModel: WorkspaceModel;
  readonly display?: DisplayHooks;
  readonly watcherConfig?: WatcherConfig;
}

// [::TICKET::] PX-454, PX-455, PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-454|PX-455|PX-456) --for-spec --no-implementation-order`.
async function runStageMode(input: StageModeInput): Promise<PipelineCompletionReason> {
  const { cli, plan, root, initialModel, display, watcherConfig } = input;
  const sessionConfig = { apiKey: cli.apiKey, model: cli.model, baseUrl: cli.baseUrl };
  const runOptions = {
    timeoutMs: cli.timeoutMs,
    verbose: cli.verbose,
    ...(display === undefined
      ? {}
      : { onUpdate: display.onUpdate, onFlush: display.onFlush }),
  };
  const runSessionCommand = async (
    cwd: string,
    command: string,
    promptOverride?: string,
  ): Promise<void> => {
    await retryWithBackoff(
      () =>
        withSession(cwd, sessionConfig, async (session) => {
          await runCommand(session, command, {
            ...runOptions,
            promptOverride,
          });
        }),
      {
        maxAttempts: retryPolicy.maxAttempts,
        baseDelayMs: retryPolicy.baseDelayMs,
        maxDelayMs: retryPolicy.maxDelayMs,
        jitterMs: retryPolicy.jitterMs,
        isRetryable: isRecoverableError,
      },
    );
  };
  const deps: StageEngineDeps = {
    runStageCommand: (input) =>
      runSessionCommand(input.cwd, input.command, input.promptOverride),
    runImplementationLoop: (options) => runWorkspaceLoop(options),
    beforeImplementation: ({ root }) =>
      runPickupAtBoundary({
        root,
        execute: (cwd) => runSessionCommand(cwd, PICKUP_COMMAND),
      }),
    readWorkspace: (planToRead, orderStartStage) => {
      // The implementation group is entered with the published order, so the
      // same sidecar gate the default path runs applies here too.
      if (orderStartStage === "make") validateImplementationOrder(root);
      return readWorkspaceForStagePlan(root, planToRead, undefined, orderStartStage);
    },
  };
  const stageHooks = {
    onStageStart: (record: StageRunRecord) => {
      const target = record.packageId === null ? record.cwd : `${record.cwd} package=${record.packageId}`;
      process.stdout.write(`[stage] ${record.stage} round=${record.round} ${target}\n`);
    },
    onPipelineStep: (record: PipelineStepRecord) => {
      const detail = record.decision === "complete"
        ? `reason=${record.reason ?? "-"} runs=${record.runs} skips=${record.skips} cycles=${record.cycles}`
        : `command=${record.command ?? "-"} round=${record.round ?? "-"}`;
      process.stdout.write(
        `[pipeline] phase=${record.phase} stage=${record.stage ?? "-"} package=${record.packageId ?? "-"} decision=${record.decision} ${detail}\n`,
      );
    },
  };

  // The scheduler re-reads the workspace after workspacify, split and drill, so a
  // plan that starts at workspacify is one call like every other plan.
  return runStagePlan({
    plan,
    workspace: initialModel,
    options: buildLoopOptions(cli, initialModel, display, watcherConfig),
    deps,
    ...stageHooks,
  });
}

// [::TICKET::] PX-403, PX-404, PX-408, PX-413, PX-449, PX-454, PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-408|PX-413|PX-449|PX-454|PX-456) --for-spec --no-implementation-order`.
type WatcherModeResult = "terminated" | "endpoint" | "stopped" | "config-error";

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
async function runWatcherMode(
  cli: CliOptions,
  plan: StagePlan,
  model: WorkspaceModel,
  display?: DisplayHooks,
): Promise<WatcherModeResult> {
  let config: WatcherConfig;
  try {
    config = loadWatcherConfig(cli.watcherConfig!);
  } catch (err) {
    console.error(
      "Watcher設定ファイルの読み込みに失敗しました:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
    return "config-error";
  }

  const requested = cli.packages.length > 0
    ? cli.packages
    : config.packages ?? [];

  // Only the implementation group has a ticket-boundary endpoint that can be
  // decided before a tick. A plan that includes upstream, shipping or evolution
  // stages is complete only when the stage engine says so after a tick.
  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  const usesImplementationGroupPlan = isImplementationGroupPlan(plan);
  // A plan that starts at workspacify has no packages yet; resolving a package
  // selection against that empty model would refuse a valid request before the
  // workspace exists. The implementation loop validates the selection when it
  // starts, so only the implementation-group startup shortcut resolves it here.
  const requestedPackages = usesImplementationGroupPlan
    ? resolveRequestedPackages(model.packages, requested)
    : [];
  if (
    usesImplementationGroupPlan
    && requestedPackages.length > 0
    && allPackagesAreEndpoint(requestedPackages)
  ) {
    process.stdout.write("Watcher mode: endpoint reached; exiting\n");
    return "endpoint";
  }

  // The ticket selection only decides which packages the implementation loop
  // processes. Upstream stages are workspace-scoped, so their selection rule
  // does not apply to a plan that starts before make.
  if (usesImplementationGroupPlan) {
    resolvePackageSelection({
      packages: model.packages,
      requested,
      hasPending: (pkg) => hasPendingTickets(pkg.ticketsPath),
    });
  }

  if (!isWithinTimeWindow(config)) {
    process.stdout.write(
      "Watcher mode: 現在時刻は時間枠外です。枠内に戻るまで待機します（cron 発火時に waitForWindow が再判定）\n",
    );
  }

  const loopOptions = buildLoopOptions(cli, model, display);
  loopOptions.watcherConfig = config;
  let isLoopRunning = false;
  let exitReason: "terminated" | "endpoint" | "stopped" = "terminated";
  const terminationHandle = createTerminationHandle();

  // One tick runs the selected plan: the implementation group keeps its ticket
  // loop, and every other plan runs the stage engine from upstream to evolution.
  // [::TICKET::] PX-456 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-456 --for-spec --no-implementation-order`.
  const runTick = async (): Promise<"continue" | "settled" | "stopped"> => {
    if (usesImplementationGroupPlan) {
      const result: WorkspaceLoopResult = await runWorkspaceLoop(loopOptions);
      return result.allSelectedComplete ? "settled" : "continue";
    }
    await waitForWindow(config);
    const reason = await runStageMode({
      cli,
      plan,
      root: model.root,
      initialModel: model,
      display,
      watcherConfig: config,
    });
    if (
      reason === "workspace-complete"
      || reason === "no-selected-work"
      || reason === "implementation-not-selected"
    ) {
      return "settled";
    }
    return reason === "implementation-stopped" ? "stopped" : "continue";
  };

  const scheduler = new CronScheduler(config);
  scheduler.start(() => {
    if (isLoopRunning) {
      console.warn("Watcher mode: 前回の runLoop が未完了のためスキップします");
      return;
    }
    isLoopRunning = true;
    runTick()
      .then((outcome) => {
        if (outcome === "settled") {
          exitReason = "endpoint";
          scheduler.stop();
          terminationHandle.stop();
        } else if (outcome === "stopped") {
          exitReason = "stopped";
          scheduler.stop();
          terminationHandle.stop();
        }
      })
      .catch((err) => {
        console.error(
          "Watcher tick error:",
          err instanceof Error ? err.message : err,
        );
        if (err instanceof LoopStoppedError) {
          scheduler.stop();
          process.exit(1);
        }
      })
      .finally(() => {
        isLoopRunning = false;
      });
  });

  const windows = config.filters
    .map((filter) => `${filter.startTime}-${filter.endTime}`)
    .join(", ");
  process.stdout.write(
    `Watcher mode started: interval=${config.intervalMinutes}min, ` +
      `filters=${windows}, tz=${config.timezone}\n`,
  );

  // The wait ends on a signal or when a tick proves every selected package is
  // endpoint. Returning early without this wait would stop the dashboard while
  // cron still fires.
  await terminationHandle.wait();
  scheduler.stop();
  return exitReason;
}

export async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);

  // -T has one initial value in every mode: the pipeline's full canonical plan.
  // Watcher mode runs the same plan on each tick; it does not substitute a
  // narrower default.
  let plan: StagePlan;
  try {
    plan = parseStagePlan(options.tasks);
  } catch (error) {
    if (error instanceof StagePlanError) {
      process.stderr.write(`conver.js — invalid -T plan: ${error.message}\n`);
      process.exit(1);
      return;
    }
    throw error;
  }

  const usesImplementationGroupPlan = isImplementationGroupPlan(plan);

  if (options.apiKey === "") {
    process.stderr.write(
      "警告: -k/--api-key が未指定です（keyless プロバイダー向け）。認証が必要なプロバイダーでは指定してください。\n",
    );
  }

  let model!: WorkspaceModel;
  try {
    if (usesImplementationGroupPlan) {
      const root = resolveWorkspaceRoot(process.cwd());
      validateImplementationOrder(root);
      model = readWorkspace(root);
    } else {
      const root = resolveStageWorkspaceRoot(process.cwd(), plan);
      model = readInitialWorkspaceForPlan(root, plan);
    }
  } catch (error) {
    if (!(error instanceof WorkspaceGateError)) {
      throw error;
    }
    process.stderr.write(`conver.js — workspace gate failed: ${error.message}\n`);
    process.exit(1);
    return;
  }

  // Required packages or a too-old Node stop the run here, before the fixed
  // header can overwrite the remedy. Optional packages are reported after the
  // header starts so the command list scrolls into the log instead of being
  // erased by the first redraw.
  const runtimeDependencies = checkRuntimeDependencies();
  if (runtimeDependencies.blocked) {
    process.stderr.write(runtimeDependencies.message);
    process.exit(1);
    return;
  }

  const richDisplay = process.stdout.isTTY === true;
  const dashboardEnabled = richDisplay && !options.noDashboard;
  const renderer = richDisplay
    ? new DisplayRenderer({
        width: process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH,
        color: true,
        write: (chunk) => process.stdout.write(chunk),
      })
    : null;
  const dashboard = dashboardEnabled && renderer !== null
    ? new ProgressDashboard({
        workspace: model,
        intervalMs: options.dashboardIntervalSeconds * 1000,
        isTty: true,
        write: (chunk) => process.stdout.write(chunk),
        readSnapshot: () => readProgressSnapshot(model),
        terminalSize: () => ({
          columns: process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH,
          rows: process.stdout.rows ?? DEFAULT_TERMINAL_ROWS,
        }),
        now: Date.now,
        setRawMode: (enabled) => process.stdin.setRawMode?.(enabled),
        highlightPackages: options.packages,
      })
    : null;
  if (renderer !== null) setAgentStderrSink((text) => renderer.writeStderr(text));

  let keypressHandler: ((text: string, key: readline.Key) => void) | null = null;
// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
  function onResize(): void {
    lifecycle.resize();
  }
  // [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
  const lifecycle = new DisplayLifecycle({
    renderer,
    dashboard,
    detachInput: () => {
      if (keypressHandler !== null) process.stdin.off("keypress", keypressHandler);
      process.removeListener("SIGWINCH", onResize);
    },
    terminalWidth: () => process.stdout.columns ?? DEFAULT_TERMINAL_WIDTH,
    exit: (code) => process.exit(code) as never,
  });
  if (dashboard !== null && process.stdin.isTTY === true) {
    readline.emitKeypressEvents(process.stdin);
    keypressHandler = (_text, key) => {
      dashboard.handleKeypress(key?.name ?? "", key?.ctrl === true);
      if (key?.ctrl === true && key.name === "c") lifecycle.shutdown(0);
    };
    process.stdin.on("keypress", keypressHandler);
    process.on("SIGWINCH", onResize);
  }
  process.once("exit", () => lifecycle.stop());

  const display: DisplayHooks | undefined = renderer === null
    ? undefined
    : {
        onUpdate: (update) => renderer.handle(toDisplayEvent(update)),
        onFlush: () => renderer.flush(),
        onPackageStart: (packageName) => dashboard?.follow(packageName),
        // [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
        onCommandStart: (packageName, command, ticketKey) =>
          dashboard?.setActivity({ packageName, command, ticketKey }),
        // [::TICKET::] PX-449 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-449 --for-spec --no-implementation-order`.
        onCommandEnd: () => dashboard?.setActivity(null),
      };
  dashboard?.start();
  if (runtimeDependencies.message !== "") {
    process.stderr.write(runtimeDependencies.message);
  }

  process.stdout.write("conver.js — ワークスペース処理を開始します\n");
  process.stdout.write(`  workspace=${model.name}\n`);
  process.stdout.write(`  packages=${model.packages.length}\n`);
  process.stdout.write(`  targetPackages=${formatTargetPackages(options.packages)}\n`);
  process.stdout.write(`  model=${options.model}\n`);
  process.stdout.write(`  baseUrl=${options.baseUrl}\n`);
  process.stdout.write(`  maxCount=${options.maxCount}\n`);
  process.stdout.write(`  resolveEvery=${options.resolveEvery}\n`);
  process.stdout.write(`  pushEnabled=${options.pushEnabled}\n`);
  process.stdout.write(`  timeoutMs=${options.timeoutMs}\n`);
  process.stdout.write(`  noFind=${options.noFind}\n`);
  process.stdout.write(`  maxFindRounds=${options.maxFindRounds}\n`);
  process.stdout.write(`  tasks=${options.tasks ?? "(default)"}\n`);
  process.stdout.write(`  watcherConfig=${options.watcherConfig}\n`);

  try {
    if (options.watcherConfig) {
      const result = await runWatcherMode(options, plan, model, display);
      // The scheduler and dashboard have already been released; exit through
      // the shared shutdown path so stdin listeners do not keep the process up.
      // A config error already exited with 1 and must not be re-exited as 0
      // when process.exit is replaced by a test double.
      if (result === "terminated" || result === "endpoint") lifecycle.shutdown(0);
      else if (result === "stopped") lifecycle.shutdown(1);
    } else if (usesImplementationGroupPlan) {
      await runNormalMode(options, model, display);
    } else {
      await runStageMode({
        cli: options,
        plan,
        root: model.root,
        initialModel: model,
        display,
      });
    }
  } catch (error) {
    if (error instanceof LoopStoppedError) {
      process.stderr.write(`conver.js — stopped: ${error.context.reason}\n`);
      lifecycle.shutdown(1);
    } else if (error instanceof PackageSelectionError) {
      process.stderr.write(
        `conver.js — package selection failed: ${error.message}` +
          (error.candidates.length === 0 ? "\n" : ` (candidates: ${error.candidates.join(", ")})\n`),
      );
      lifecycle.shutdown(1);
    } else {
      process.stderr.write(
        `conver.js — fatal: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      lifecycle.shutdown(1);
    }
  } finally {
    // Normal completion must release the poll timer; watcher mode exits via
    // shutdown(), whose exit handler also stops the dashboard.
    lifecycle.stop();
  }
}

// main() の実行は entry.ts が行う（esbuild バンドル用エントリポイント）
