import { parseCliOptions } from "./cli.js";
import type { CliOptions } from "./cli.js";
import { runLoop } from "./runner.js";
import type { LoopOptions } from "./runner.js";
import { loadWatcherConfig } from "./watcher.js";
import type { WatcherConfig } from "./watcher.js";
import { isWithinTimeWindow } from "./step-timer.js";
import { CronScheduler } from "./cron-scheduler.js";

// グローバルエラーハンドラは SDK の内部処理を阻害するため登録しない。
// EPIPE は子プロセス終了時の正常な副作用であり上位のエラー処理で対応する。

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

  // Step 2: 初回時間枠チェック — 枠外なら即時終了
  if (!isWithinTimeWindow(config)) {
    console.log("Watcher mode: 現在時刻は時間枠外です。終了します。");
    process.exit(0);
    return;
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

  console.log(
    `Watcher mode started: interval=${config.intervalMinutes}min, ` +
      `window=${config.startTime}-${config.endTime}, tz=${config.timezone}`,
  );
}

export async function main(): Promise<void> {
  const options = parseCliOptions(process.argv);

  console.log("conver.js — チケット処理を開始します");
  console.log("  model=%s", options.model);
  console.log("  ticketsPath=%s", options.ticketsPath);
  console.log("  maxCount=%d", options.maxCount);
  console.log("  resolveEvery=%d", options.resolveEvery);
  console.log("  pushEnabled=%s", options.pushEnabled);
  console.log("  timeoutMs=%d", options.timeoutMs);
  console.log("  noFind=%s", options.noFind);
  console.log("  watcherConfig=%s", options.watcherConfig);

  if (options.watcherConfig) {
    await runWatcherMode(options);
  } else {
    await runNormalMode(options);
  }
}

// 子プロセス後片付け時の EPIPE をサイレントに抑止
process.on("uncaughtException", () => {});

// main() の実行は entry.ts が行う（esbuild バンドル用エントリポイント）
