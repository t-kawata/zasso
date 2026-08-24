// step-timer.ts — ステップ境界時間制御（endTime ガード）
//
// 責務:
// - isWithinTimeWindow: WatcherConfig が設定されている場合、現在時刻が時間枠内か
//   を判定する。config が null（通常モード）の場合は常に true を返し後方互換を確保。
// - checkStepDeadline: 各ステップ実行前に期限超過をチェックし、超過時は警告を発する。
//
// 内部で P6-2 (time-window.ts) の isInTimeWindow を呼び出す。
//
// Layer 0/1 純粋ロジック（副作用なし）
// 依存: P6-2 (isInTimeWindow), P6-1 (WatcherConfig)
import type { WatcherConfig } from "./watcher.js";
import { isInTimeWindow } from "./time-window.js";

/**
 * WatcherConfig が設定されている場合、現在時刻が時間枠内かを判定する。
 * config が null（通常モード）の場合は常に true を返し、後方互換性を確保する。
 *
 * @param config WatcherConfig（null または undefined の場合は常に通過）
 * @param now 現在時刻の取得関数（テストでクロック注入するための任意引数）
 * @returns 時間枠内なら true、枠外なら false
 * @throws config が不正な場合、内部の isInTimeWindow から Error が伝播する
 */
// [::TICKET::] PX-173 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-173 --for-spec --no-implementation-order`.
export function isWithinTimeWindow(
  config: WatcherConfig | null | undefined,
  now: () => Date = () => new Date(),
): boolean {
  if (!config) {
    // 通常モード（-w 未指定）では常に通過
    return true;
  }

  return isInTimeWindow(
    now(),
    config.startTime,
    config.endTime,
    config.timezone,
    config.daysOfWeek,
  );
}

/** 時間枠外のときの待機間隔（ミリ秒） */
export const WINDOW_WAIT_SLEEP_MS = 60_000;

/** 指定ミリ秒だけ待機する既定のスリープ実装 */
// [::TICKET::] PX-174 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-174 --for-spec --no-implementation-order`.
function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 時間枠内に戻るまで sleepMs 間隔で待機する。枠内なら即 return。
 * config が null/undefined（非 Watcher モード）なら何もせず return する。
 *
 * テストではクロック（now）とスリープ（sleep）を注入して実時間待ちを回避する。
 *
 * @param config WatcherConfig（null/undefined は no-op）
 * @param sleepMs 枠外判定の再試行間隔（ミリ秒）
 * @param now 現在時刻の取得関数（クロック注入用）
 * @param sleep 待機関数（スリープ注入用）
 */
export async function waitForWindow(
  config: WatcherConfig | null | undefined,
  sleepMs: number = WINDOW_WAIT_SLEEP_MS,
  now: () => Date = () => new Date(),
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<void> {
  if (!config) {
    return;
  }
  if (isWithinTimeWindow(config, now)) {
    return;
  }
  process.stdout.write(
    `\n⏳ 時間枠外のため待機します（${sleepMs}ms 間隔で再判定）\n`,
  );
  while (!isWithinTimeWindow(config, now)) {
    await sleep(sleepMs);
  }
  process.stdout.write("✅ 時間枠内に復帰しました。処理を再開します。\n");
}

/**
 * 指定されたステップの実行前に期限超過をチェックする。
 * 時間枠内なら true（実行可）、枠外なら false（スキップ）を返す。
 * スキップ時は console.warn で警告を出力する。
 *
 * @param stepName チェック対象のステップ名（ログ出力用）
 * @param config WatcherConfig（null または undefined の場合は常に通過）
 * @returns 実行可なら true、スキップなら false
 */
export function checkStepDeadline(
  stepName: string,
  config: WatcherConfig | null | undefined,
): boolean {
  if (isWithinTimeWindow(config)) {
    return true;
  }

  console.warn(
    `⏰ 時間枠外のため ${stepName} をスキップします（endTime: ${config?.endTime ?? "なし"}）`,
  );
  return false;
}
