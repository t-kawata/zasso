// conver.ts — process entry: the 5-layer workspace gate, watcher and loop.
import { parseCliOptions } from "./cli.js";
import type { CliOptions } from "./cli.js";
import { allPackagesAreEndpoint, runWorkspaceLoop } from "./runner.js";
import type { WorkspaceLoopOptions, WorkspaceLoopResult } from "./runner.js";
import { loadWatcherConfig } from "./watcher.js";
import type { WatcherConfig } from "./watcher.js";
import { isWithinTimeWindow } from "./step-timer.js";
import { CronScheduler } from "./cron-scheduler.js";
import { createTerminationHandle } from "./termination.js";
import {
  readWorkspace,
  resolveWorkspaceRoot,
  validateImplementationOrder,
  WorkspaceGateError,
} from "./workspace.js";
import type { WorkspaceModel } from "./workspace.js";
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

/** Fallback width for a TTY whose column count the platform does not report. */
const DEFAULT_TERMINAL_WIDTH = 120;
const DEFAULT_TERMINAL_ROWS = 24;

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
): WorkspaceLoopOptions {
  const { watcherConfig: _ignored, ...loop } = cli;
  return { ...loop, workspace: model, ...(display === undefined ? {} : { display }) };
}

// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
async function runNormalMode(
  cli: CliOptions,
  model: WorkspaceModel,
  display?: DisplayHooks,
): Promise<void> {
  await runWorkspaceLoop(buildLoopOptions(cli, model, display));
}

// [::TICKET::] PX-403, PX-404, PX-408, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404|PX-408|PX-413) --for-spec --no-implementation-order`.
type WatcherModeResult = "terminated" | "endpoint" | "config-error";

// [::TICKET::] PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-413 --for-spec --no-implementation-order`.
async function runWatcherMode(
  cli: CliOptions,
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

  // An explicit endpoint selection is terminal even when an earlier package
  // still has pending work: nothing is processed, so no order is crossed.
  const requestedPackages = resolveRequestedPackages(model.packages, requested);
  if (requestedPackages.length > 0 && allPackagesAreEndpoint(requestedPackages)) {
    process.stdout.write("Watcher mode: endpoint reached; exiting\n");
    return "endpoint";
  }

  // Validate the selection before the first firing so an ambiguous or
  // order-crossing choice fails at startup, not hours later.
  resolvePackageSelection({
    packages: model.packages,
    requested,
    hasPending: (pkg) => hasPendingTickets(pkg.ticketsPath),
  });

  if (!isWithinTimeWindow(config)) {
    process.stdout.write(
      "Watcher mode: 現在時刻は時間枠外です。枠内に戻るまで待機します（cron 発火時に waitForWindow が再判定）\n",
    );
  }

  const loopOptions = buildLoopOptions(cli, model, display);
  loopOptions.watcherConfig = config;
  let isLoopRunning = false;
  let exitReason: "terminated" | "endpoint" = "terminated";
  const terminationHandle = createTerminationHandle();

  const scheduler = new CronScheduler(config);
  scheduler.start(() => {
    if (isLoopRunning) {
      console.warn("Watcher mode: 前回の runLoop が未完了のためスキップします");
      return;
    }
    isLoopRunning = true;
    runWorkspaceLoop(loopOptions)
      .then((result: WorkspaceLoopResult) => {
        if (result.allSelectedComplete) {
          exitReason = "endpoint";
          scheduler.stop();
          terminationHandle.stop();
        }
      })
      .catch((err) => {
        console.error(
          "Watcher runLoop error:",
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

  if (options.apiKey === "") {
    process.stderr.write(
      "警告: -k/--api-key が未指定です（keyless プロバイダー向け）。認証が必要なプロバイダーでは指定してください。\n",
    );
  }

  let model: WorkspaceModel;
  try {
    const root = resolveWorkspaceRoot(process.cwd());
    validateImplementationOrder(root);
    model = readWorkspace(root);
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
      };
  dashboard?.start();
  if (runtimeDependencies.message !== "") {
    process.stderr.write(runtimeDependencies.message);
  }

  process.stdout.write("conver.js — ワークスペース処理を開始します\n");
  process.stdout.write(`  workspace=${model.name}\n`);
  process.stdout.write(`  packages=${model.packages.length}\n`);
  process.stdout.write(`  model=${options.model}\n`);
  process.stdout.write(`  baseUrl=${options.baseUrl}\n`);
  process.stdout.write(`  maxCount=${options.maxCount}\n`);
  process.stdout.write(`  resolveEvery=${options.resolveEvery}\n`);
  process.stdout.write(`  pushEnabled=${options.pushEnabled}\n`);
  process.stdout.write(`  timeoutMs=${options.timeoutMs}\n`);
  process.stdout.write(`  noFind=${options.noFind}\n`);
  process.stdout.write(`  watcherConfig=${options.watcherConfig}\n`);

  try {
    if (options.watcherConfig) {
      const result = await runWatcherMode(options, model, display);
      // The scheduler and dashboard have already been released; exit through
      // the shared shutdown path so stdin listeners do not keep the process up.
      // A config error already exited with 1 and must not be re-exited as 0
      // when process.exit is replaced by a test double.
      if (result === "terminated" || result === "endpoint") lifecycle.shutdown(0);
    } else {
      await runNormalMode(options, model, display);
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
