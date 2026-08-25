import { parseCliOptions } from "./cli.js";
import type { CliOptions } from "./cli.js";
import { runLoop } from "./runner.js";
import type { LoopOptions } from "./runner.js";
import { loadWatcherConfig } from "./watcher.js";
import type { WatcherConfig } from "./watcher.js";
import { isWithinTimeWindow } from "./step-timer.js";
import { CronScheduler } from "./cron-scheduler.js";

/**
 * Log a fatal error and continue. Used by the process-level crash handlers so
 * conver never dies with a raw unhandled-error trace and, crucially, never
 * exits mid-run: the night loop must only terminate at a defined completion
 * point (PX-150). The message is prefixed for greppability.
 */
// [::TICKET::] PX-149, PX-150 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-149|PX-150) --for-spec --no-implementation-order`.
export function reportFatalError(prefix: string, err: unknown): void {
  console.error(`${prefix}:`, err instanceof Error ? err.message : String(err));
}

/**
 * Install process-level crash handlers (uncaughtException / unhandledRejection)
 * that log and continue. Command-level errors are handled by runLoop's catch;
 * these handlers are a last-resort guard for anything outside that path.
 */
export function installCrashHandlers(): void {
  process.on("uncaughtException", (err) => {
    reportFatalError("致命的エラー (uncaughtException)", err);
  });
  process.on("unhandledRejection", (reason) => {
    reportFatalError("致命的エラー (unhandledRejection)", reason);
  });
}

/**
 * CliOptions を LoopOptions に変換する。
 * watcherConfig（string | undefined）は除外し、呼び出し側が設定する。
 */
function buildLoopOptions(cli: CliOptions): LoopOptions {
  const { watcherConfig: _ignored, ...loop } = cli;
  return loop;
}

/**
 * 通常モード: runLoop を1回実行して終了する。
 * watcherConfig が未指定の場合の起動パス。
 */
async function runNormalMode(cli: CliOptions): Promise<void> {
  await runLoop(buildLoopOptions(cli));
}

/**
 * Watcher モード: 設定ファイルを読み込み、時間枠内でのみ
 * CronScheduler で定期的に runLoop を実行する。
 * SIGINT/SIGTERM でグレースフルシャットダウンする。
 */
// [::TICKET::] PX-149, PX-173 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-149|PX-173) --for-spec --no-implementation-order`.
async function runWatcherMode(cli: CliOptions): Promise<void> {
  // Step 1: 設定ファイルの読み込みと検証
  let config: WatcherConfig;
  try {
    config = loadWatcherConfig(cli.watcherConfig!);
  } catch (err) {
    console.error(
      "Watcher設定ファイルの読み込みに失敗しました:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
    return;
  }

  // Step 2: 初回時間枠チェック — 枠外でもプロセスは生存し、初回 runLoop の waitForWindow が待機する
  if (!isWithinTimeWindow(config)) {
    process.stdout.write(
      "Watcher mode: 現在時刻は時間枠外です。枠内に戻るまで待機します（cron 発火時に waitForWindow が再判定）\n",
    );
  }

  // Step 3: ループオプションを構築し、CronScheduler を起動
  const loopOptions = buildLoopOptions(cli);
  loopOptions.watcherConfig = config;

  // 実行中フラグ — 前回の runLoop 完了前に次の発火が来た場合はスキップする
  let isLoopRunning = false;

  const scheduler = new CronScheduler(config);
  scheduler.start(() => {
    if (isLoopRunning) {
      console.warn(
        "Watcher mode: 前回の runLoop が未完了のためスキップします",
      );
      return;
    }

    isLoopRunning = true;
    runLoop(loopOptions)
      .catch((err) => {
        console.error(
          "Watcher runLoop error:",
          err instanceof Error ? err.message : err,
        );
      })
      .finally(() => {
        isLoopRunning = false;
      });
  });

  // Step 4: SIGINT/SIGTERM でグレースフルシャットダウン
  function cleanup(): void {
    scheduler.stop();
    process.exit(0);
  }
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  process.stdout.write(
    `Watcher mode started: interval=${config.intervalMinutes}min, ` +
      `window=${config.startTime}-${config.endTime}, ` +
      `days=${config.daysOfWeek?.join("-") ?? "all"}, tz=${config.timezone}\n`,
  );
}

export async function main(): Promise<void> {
// [::TICKET::] PX-151 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-151 --for-spec --no-implementation-order`.
  const options = parseCliOptions(process.argv);

  // -k 省略時は keyless モードの旨を警告する（認証必須プロバイダーでは上流エラーになる）
  if (options.apiKey === "") {
    process.stderr.write(
      "警告: -k/--api-key が未指定です（keyless プロバイダー向け）。認証が必要なプロバイダーでは指定してください。\n",
    );
  }

  process.stdout.write("conver.js — チケット処理を開始します\n");
  process.stdout.write(`  model=${options.model}\n`);
  process.stdout.write(`  baseUrl=${options.baseUrl}\n`);
  process.stdout.write(`  ticketsPath=${options.ticketsPath}\n`);
  process.stdout.write(`  maxCount=${options.maxCount}\n`);
  process.stdout.write(`  resolveEvery=${options.resolveEvery}\n`);
  process.stdout.write(`  pushEnabled=${options.pushEnabled}\n`);
  process.stdout.write(`  timeoutMs=${options.timeoutMs}\n`);
  process.stdout.write(`  noFind=${options.noFind}\n`);
  process.stdout.write(`  watcherConfig=${options.watcherConfig}\n`);

  if (options.watcherConfig) {
    await runWatcherMode(options);
  } else {
    await runNormalMode(options);
  }
}

// main() の実行は entry.ts が行う（esbuild バンドル用エントリポイント）
