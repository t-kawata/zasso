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
 * @returns 時間枠内なら true、枠外なら false
 * @throws config が不正な場合、内部の isInTimeWindow から Error が伝播する
 */
export function isWithinTimeWindow(
  config: WatcherConfig | null | undefined,
): boolean {
  if (!config) {
    // 通常モード（-w 未指定）では常に通過
    return true;
  }

  return isInTimeWindow(
    new Date(),
    config.startTime,
    config.endTime,
    config.timezone,
  );
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
