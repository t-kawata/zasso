// check-and-start-loop.ts — 定期点検ロジック
//
// 責務:
//   CronScheduler の定期コールバックとして動作し、Tickets.json に
//   未reviewedチケットが存在する場合に runLoop を起動する。
//   再入防止フラグにより、ループ実行中は別の定期点検をスキップする。
//
// 依存: P1-1 (tickets.ts — loadPendingTickets)
//        P4-1 (runner.ts — runLoop, LoopOptions)
// 依存出力: P8-3 (Watcher 起動パス — コールバック登録)
import { loadPendingTickets } from "./tickets.js";
import { runLoop } from "./runner.js";
import type { LoopOptions } from "./runner.js";

/** ループ実行中フラグ。CronScheduler のコールバックからの再入を防止する。 */
let isLoopRunning = false;

/**
 * CronScheduler の定期コールバックとして動作し、未reviewedチケットが
 * 存在する場合にループを開始する。
 *
 * 処理フロー:
 * 1. 既にループ実行中ならスキップ（再入防止）
 * 2. Tickets.json から未reviewedチケットを取得
 * 3. 件数が 0 なら何もせず return
 * 4. 件数が 1 以上なら runLoop を呼び出し
 * 5. 完了後に終了。エラー時も finally でフラグを確実にリセット
 *
 * @param ticketsPath Tickets.json のファイルパス
 * @param loopOptions runLoop に渡すオプション
 * @returns ループ完了時に解決。ループ不要時は即時解決。
 * @throws Tickets.json 読み込みエラー時、または runLoop 内部エラー時
 */
export async function checkAndStartLoop(
  ticketsPath: string,
  loopOptions: LoopOptions,
): Promise<void> {
  if (isLoopRunning) {
    console.log("[Watcher] ループ実行中のためスキップします。");
    return;
  }

  isLoopRunning = true;
  try {
    const pendingTickets = loadPendingTickets(ticketsPath);
    if (pendingTickets.length === 0) {
      console.log("[Watcher] 未reviewedチケットはありません。");
      return;
    }

    console.log(
      `[Watcher] ${pendingTickets.length} 件の未reviewedチケットを検出しました。ループを開始します。`,
    );
    await runLoop(loopOptions);
    console.log("[Watcher] ループが完了しました。");
  } finally {
    isLoopRunning = false;
  }
}
