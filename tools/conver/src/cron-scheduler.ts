// cron-scheduler.ts — node-cron ジョブ管理
//
// 責務:
//   WatcherConfig の intervalMinutes に基づいて node-cron ジョブを設定・起動・停止する。
//   Layer 2 コンポーネント（副作用・I/O を含む）。
//
// 依存: P6-1 (WatcherConfig)
// 依存出力: P8-3 (Watcher 起動パス), P7-2 (定期点検)
import cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import type { WatcherConfig } from "./watcher.js";

/** intervalMinutes の最小値（分） */
const INTERVAL_MIN_MINUTES = 1;

/** intervalMinutes の最大値（分）— node-cron の式制限に基づく実用上限 */
const INTERVAL_MAX_MINUTES = 525_600;

/**
 * CronScheduler — node-cron による定期ジョブ管理クラス。
 *
 * WatcherConfig の intervalMinutes に基づいて cron 式を生成し、
 * node-cron のスケジューリング機能をラップする。
 *
 * @example
 * ```typescript
 * const scheduler = new CronScheduler(config);
 * scheduler.start(() => { });
 * // ... 後で停止
 * scheduler.stop();
 * ```
 */
export class CronScheduler {
  /** node-cron のジョブタスク（未起動時は null） */
  #cronTask: ScheduledTask | null = null;

  /** 実行中フラグ */
  #isActive: boolean = false;

  /** WatcherConfig（cron 式生成の元データ） */
  readonly #config: WatcherConfig;

  /** コンストラクタで生成済みの cron 式 */
  readonly #cronExpression: string;

  /**
   * @param config WatcherConfig（intervalMinutes が必須）
   * @throws intervalMinutes が 0以下または非整数の場合 Error
   * @throws intervalMinutes から生成した cron 式が無効な場合 Error
   */
  constructor(config: WatcherConfig) {
    this.#validateInterval(config.intervalMinutes);
    this.#config = config;
    this.#cronExpression = this.#buildCronExpression(config.intervalMinutes);
  }

  /**
   * intervalMinutes の値を検証する。
   * @param minutes 検証対象の値
   * @throws 0以下または非整数の場合 Error
   */
  #validateInterval(minutes: number): void {
    if (typeof minutes !== "number" || !Number.isFinite(minutes)) {
      throw new Error(
        `intervalMinutes は有限な数値である必要があります: ${minutes}`,
      );
    }
    if (!Number.isInteger(minutes)) {
      throw new Error(
        `intervalMinutes は整数である必要があります: ${minutes}`,
      );
    }
    if (minutes < INTERVAL_MIN_MINUTES || minutes > INTERVAL_MAX_MINUTES) {
      throw new Error(
        `intervalMinutes は ${INTERVAL_MIN_MINUTES} 以上 ${INTERVAL_MAX_MINUTES} 以下である必要があります: ${minutes}`,
      );
    }
  }

  /**
   * intervalMinutes（分）から標準 cron 式（5フィールド）を生成する。
   *
   * 変換ルール:
   * - 1〜60 分 = "分/N 時 * * *"（N 分ごと）
   * - 60 分 = 1時間 = "分0 時 * * *"（毎時0分）
   * - 60 の倍数（例: 120分 = 2時間）= "分0 時/N * * *"（N 時間ごと、毎時0分）
   * - 60 超かつ60の倍数でない = "分/N 時 * * *"（N 分ごと）
   *
   * @param minutes 実行間隔（分）
   * @returns 標準 cron 式（5フィールド）
   * @throws 生成した cron 式が node-cron で無効と判定された場合 Error
   */
  #buildCronExpression(minutes: number): string {
    let expression: string;

    if (minutes >= INTERVAL_MIN_MINUTES && minutes < 60) {
      // 1〜59 分: "*/N * * * *"
      expression = `*/${minutes} * * * *`;
    } else if (minutes % 60 === 0) {
      // 60 の倍数（時間単位）
      const hours = minutes / 60;
      if (hours === 1) {
        // 60分 = 1時間: "0 * * * *"（毎時0分）
        expression = "0 * * * *";
      } else {
        // N 時間ごと: "0 */N * * *"
        expression = `0 */${hours} * * *`;
      }
    } else {
      // 60 超かつ60の倍数でない: "*/N * * * *"
      expression = `*/${minutes} * * * *`;
    }

    // node-cron.validate() で cron 式の有効性を確認
    if (!cron.validate(expression)) {
      throw new Error(
        `cron 式の生成に失敗しました: intervalMinutes=${minutes}, expression="${expression}"`,
      );
    }

    return expression;
  }

  /**
   * cron ジョブを開始する。
   * 既に起動中の場合は何もせず正常終了する（二重起動防止）。
   *
   * @param callback 定期実行時に呼び出すコールバック関数
   * @throws node-cron.schedule() がエラーを投げた場合、上位に伝播する
   */
  start(callback: () => void): void {
    if (this.#isActive) {
      // 二重起動防止: 既に起動中なら何もしない
      return;
    }

    const task = cron.schedule(this.#cronExpression, callback);
    task.start();
    this.#cronTask = task;
    this.#isActive = true;
  }

  /**
   * cron ジョブを停止する。
   * 未起動の場合は何もせず正常終了する（冪等）。
   */
  stop(): void {
    if (!this.#isActive || this.#cronTask === null) {
      // 未起動なら何もしない
      return;
    }

    this.#cronTask.stop();
    this.#cronTask = null;
    this.#isActive = false;
  }

  /**
   * cron ジョブが現在実行中か判定する。
   * @returns 実行中なら true、未起動または停止済みなら false
   */
  isRunning(): boolean {
    return this.#isActive;
  }
}
