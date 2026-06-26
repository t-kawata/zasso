// runner.ts — チケット実行ループ制御
//
// 責務:
//   Tickets.json から未処理チケットを逐次取得し、ACP セッションを介して
//   make → plan → start → review → resolve → find のパイプラインを自動実行する。
//   各工程は独立した ACP セッションで実行され、エラー時は Slack 通知 + プロセス停止を行う。
//
// ループフロー:
//   1. loadPendingTickets: 未処理チケットの読み込み
//   2. [Session A] /make-ticket → /plan-ticket → /start-ticket
//   3. [Session B] /review-ticket
//   4. reviewedCount % resolveEvery === 0 → [Session C] /resolve-ticket
//      → pushEnabled → /jpush-branch
//   5. 全件 reviewed → [Session D] /find-omissions-for-next-rfc
//   6. 次のチケットへ（ループ継続）
//
// 参照: RFC_ROOT.md §3（内部ループ制御）
// 依存: P3-1 (session.ts — withSession/runCommand),
//       P2-1 (notifier.ts — sendSlackError),
//       P1-1 (tickets.ts — loadPendingTickets / checkAllReviewed / getSourceFromTickets)
import path from "node:path";
import { withSession, runCommand } from "./session.js";
import type { RunCommandOptions } from "./session.js";
import { sendSlackError } from "./notifier.js";
import type { ErrorContext } from "./notifier.js";
import { loadPendingTickets, checkAllReviewed, getSourceFromTickets } from "./tickets.js";

// --- インターフェース定義 ---

/** ループ制御に必要な全オプション。cli.ts の CliOptions と同一フィールドだが
 *  将来的な分離可能性のため独立定義する。 */
export interface LoopOptions {
  apiKey: string;
  model: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
}

/** チケットの最小情報。Tickets.json から抽出した未処理チケットを表す。 */
export interface Ticket {
  id: number;
  phaseId: number;
  status: string;
  title: string;
}

// --- 内部関数 ---

/**
 * エラーメッセージから工程名を抽出する。
 * メッセージに工程名を含む場合、対応する工程名文字列を返す。
 * 不明なエラーや Error 以外の throw に対しては "unknown" を返す。
 */
function getCurrentPhase(error: unknown): string {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("make-ticket")) return "make-ticket";
  if (message.includes("plan-ticket")) return "plan-ticket";
  if (message.includes("start-ticket")) return "start-ticket";
  if (message.includes("review-ticket")) return "review-ticket";
  if (message.includes("resolve-ticket")) return "resolve-ticket";
  if (message.includes("find-omissions")) return "find-omissions";
  if (message.includes("jpush-branch")) return "jpush-branch";
  return "unknown";
}

/**
 * LoopOptions から runCommand に必要なオプションを抽出する。
 */
function toRunCommandOptions(options: LoopOptions): RunCommandOptions {
  return {
    timeoutMs: options.timeoutMs,
    verbose: options.verbose,
  };
}

// --- 公開 API ---

/**
 * メインループ制御。
 * Tickets.json から未処理チケットを順次取得し、各チケットに対して
 * make/plan/start → review → resolve → find の工程を自動実行する。
 *
 * エラー発生時の動作:
 * 1. sendSlackError で Slack 通知（3回リトライ）
 * 2. コンソールにエラー出力
 * 3. process.exit(1) でプロセス終了
 */
export async function runLoop(options: LoopOptions): Promise<void> {
  const cwd = path.resolve(process.cwd());
  const pending = loadPendingTickets(options.ticketsPath).sort((a, b) => a.id - b.id);
  const target = pending.slice(0, options.maxCount);

  let reviewedCount = 0;

  for (const ticket of target) {
    const ticketId = `P${ticket.phaseId}-${ticket.id}`;
    const runOptions = toRunCommandOptions(options);

    console.log(`\n▶ [${ticketId}] ${ticket.title}`);

    try {
      // Step 1: Session A — make / plan / start（1セッションで3コマンド連続実行）
      console.log("  make/plan/start...");
      await withSession(cwd, options.apiKey, options.model, async (session) => {
        await runCommand(session, `/make-ticket ${ticketId}`, runOptions);
        await runCommand(session, `/plan-ticket ${ticketId}`, runOptions);
        await runCommand(session, `/start-ticket ${ticketId}`, runOptions);
      });
      console.log("  ✅ make/plan/start 完了");

      // Step 2: Session B — review
      console.log("  review...");
      await withSession(cwd, options.apiKey, options.model, async (session) => {
        await runCommand(session, `/review-ticket ${ticketId}`, runOptions);
      });
      console.log("  ✅ review 完了");
      reviewedCount++;

      // Step 3: Session C — resolve（resolveEvery の間隔で実行）
      if (reviewedCount % options.resolveEvery === 0) {
        console.log(`  resolve (${reviewedCount}件完了)...`);
        await withSession(cwd, options.apiKey, options.model, async (session) => {
          await runCommand(session, `/resolve-ticket ${cwd}`, runOptions);
        });
        console.log("  ✅ resolve 完了");

        // Step 3b: オプション — jpush-branch（pushEnabled が true の場合のみ）
        if (options.pushEnabled) {
          try {
            console.log("  jpush-branch...");
            await withSession(cwd, options.apiKey, options.model, async (session) => {
              await runCommand(session, "/jpush-branch", runOptions);
            });
            console.log("  ✅ jpush-branch 完了");
          } catch (pushError) {
            await sendSlackError(options.slackWebhookUrl, {
              ticketId,
              phase: "jpush-branch",
              error: pushError as Error,
              ticketsPath: options.ticketsPath,
            });
            throw pushError;
          }
        }

        // Step 4: 全チケット reviewed チェック → Session D: find-omissions
        if (checkAllReviewed(options.ticketsPath)) {
          console.log("  🎯 全チケット reviewed → find-omissions...");
          const source = getSourceFromTickets(options.ticketsPath);
          await withSession(cwd, options.apiKey, options.model, async (session) => {
            await runCommand(
              session,
              `/find-omissions-for-next-rfc ${source}`,
              runOptions,
            );
          });
          console.log("  ✅ find-omissions 完了");
        }
      }
    } catch (error) {
      const err = error as Error;
      await sendSlackError(options.slackWebhookUrl, {
        ticketId,
        phase: getCurrentPhase(err),
        error: err,
        ticketsPath: options.ticketsPath,
      });
      console.error(`\n❌ エラー発生: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ 全${target.length}チケットの処理が完了しました。`);
}
