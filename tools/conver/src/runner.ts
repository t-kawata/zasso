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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { withSession, runCommand } from "./session.js";
import type { RunCommandOptions } from "./session.js";
import {
  sendSlackError,
  sendSlackSuccess,
  sendOmissionsNotification,
} from "./notifier.js";
import type { ErrorContext, SuccessContext } from "./notifier.js";
import {
  loadPendingTickets,
  checkAllReviewed,
  getSourceFromTickets,
} from "./tickets.js";
import type { WatcherConfig } from "./watcher.js";
import { checkStepDeadline } from "./step-timer.js";

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
  bindReviewInOneSession: boolean;
  noFind?: boolean;
  /** Watcher モード設定。指定がある場合はループ開始前に時間枠チェックを行う。 */
  watcherConfig?: WatcherConfig;
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
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
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

/** update-ticket.js を呼び出し、チケットの status を確定的に設定する */
function updateStatus(ticketsPath: string, ticketId: string, status: string): void {
  try {
    const script = path.join(
      process.cwd(),
      ".claude",
      "scripts",
      "tickets",
      "update-ticket.js",
    );
    const input = JSON.stringify({ status });
    execSync(`echo '${input}' | node "${script}" "${ticketsPath}" "${ticketId}"`, {
      encoding: "utf-8",
      timeout: 5000,
    });
  } catch {
    // 失敗してもループは継続
  }
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
/** コマンド実行前に視認性の高いヘッダーを出力する */
function printCommandHeader(
  command: string,
  ticketId?: string,
  title?: string,
): void {
  const separator = "=".repeat(46);
  console.log(`\n${separator}`);
  if (ticketId && title) {
    console.log(`🟢 ${command} ${ticketId}: ${title}`);
  } else {
    console.log(`🟢 ${command}`);
  }
  console.log(`${separator}\n`);
}

/** Tickets.json から処理済みチケットをフェーズ別に整形する */
function buildProcessedText(
  ticketsPath: string,
  processed: Array<{ id: string; title: string; phaseId: number }>,
): string[] {
  try {
    const raw = readFileSync(ticketsPath, "utf-8");
    const data = JSON.parse(raw);
    const phaseNames = new Map<number, string>();
    for (const phase of data.phases || []) {
      phaseNames.set(phase.id, phase.name);
    }

    // phaseId 順にグループ化
    const byPhase = new Map<number, typeof processed>();
    for (const t of processed) {
      const list = byPhase.get(t.phaseId) ?? [];
      list.push(t);
      byPhase.set(t.phaseId, list);
    }

    const lines: string[] = [];
    const sortedPhaseIds = [...byPhase.keys()].sort((a, b) => a - b);
    for (const pid of sortedPhaseIds) {
      const pname = phaseNames.get(pid) ?? "";
      const phaseLabel = pid === -1 ? "PX" : `P${pid}`;
      lines.push(`${phaseLabel}: ${pname}`);
      for (const t of byPhase.get(pid)!) {
        lines.push(`    * ${t.id}: ${t.title}`);
      }
    }
    return lines;
  } catch {
    return ["(処理済みチケット一覧の生成に失敗しました)"];
  }
}

/** カレントディレクトリの `.claude/scripts/tickets/list-phases-and-tickets.js` を実行して進捗一覧を取得する */
function buildProgressText(ticketsPath: string): string {
  try {
    const script = path.join(
      process.cwd(),
      ".claude",
      "scripts",
      "tickets",
      "list-phases-and-tickets.js",
    );
    return execSync(`node "${script}" "${ticketsPath}"`, {
      encoding: "utf-8",
    }).trim();
  } catch {
    return "(進捗一覧の生成に失敗しました)";
  }
}

export async function runLoop(options: LoopOptions): Promise<void> {
  const cwd = path.resolve(process.cwd());
  const pending = loadPendingTickets(options.ticketsPath).sort(
    (a, b) => a.phaseId - b.phaseId || a.id - b.id,
  );
  const target = pending.slice(0, options.maxCount);

  let reviewedCount = 0;
  const processedTickets: Array<{
    id: string;
    title: string;
    phaseId: number;
  }> = [];

  for (const ticket of target) {
    // Watcher モード時: 時間枠外ならループを終了
    const ticketLabel = ticket.phaseId === -1 ? `PX-${ticket.id}` : `P${ticket.phaseId}-${ticket.id}`;
    if (!checkStepDeadline(ticketLabel, options.watcherConfig)) {
      break;
    }

    const ticketId = ticket.phaseId === -1 ? `PX-${ticket.id}` : `P${ticket.phaseId}-${ticket.id}`;
    processedTickets.push({
      id: ticketId,
      title: ticket.title,
      phaseId: ticket.phaseId,
    });
    const runOptions = toRunCommandOptions(options);

    try {
      const status = ticket.status;
      const bindReview = options.bindReviewInOneSession ?? true;

      // Session A: make/plan/start/review（統合モード時は同セッション）
      //   -b 1（デフォルト）: [make→plan→start→review]
      //   -b 0:              [make→plan→start] → 別セッションで review
      if (status === "todo" || status === "made" || status === "planned") {
        await withSession(
          cwd,
          options.apiKey,
          options.model,
          async (session) => {
            if (status === "todo") {
              printCommandHeader("/make-ticket", ticketId, ticket.title);
              await runCommand(session, `/make-ticket ${ticketId}`, runOptions);
              console.log("\n>>> ✅ make-ticket 完了");
              updateStatus(options.ticketsPath, ticketId, "made");
            }
            if (status !== "planned") {
              printCommandHeader("/plan-ticket", ticketId, ticket.title);
              await runCommand(session, `/plan-ticket ${ticketId}`, runOptions);
              console.log("\n>>> ✅ plan-ticket 完了");
              updateStatus(options.ticketsPath, ticketId, "planned");
            }
            printCommandHeader("/start-ticket", ticketId, ticket.title);
            await runCommand(session, `/start-ticket ${ticketId}`, runOptions);
            console.log("\n>>> ✅ start-ticket 完了");
            updateStatus(options.ticketsPath, ticketId, "done");
            if (bindReview) {
              printCommandHeader("/review-ticket", ticketId, ticket.title);
              await runCommand(session, `/review-ticket ${ticketId}`, runOptions);
              console.log("\n>>> ✅ review 完了");
              updateStatus(options.ticketsPath, ticketId, "reviewed");
            }
          },
        );
      }

      // review を別セッションで実行（分離モード または done）
      if (!bindReview || status === "done") {
        printCommandHeader("/review-ticket", ticketId, ticket.title);
        await withSession(
          cwd,
          options.apiKey,
          options.model,
          async (session) => {
            await runCommand(session, `/review-ticket ${ticketId}`, runOptions);
          },
        );
        console.log("\n>>> ✅ review 完了");
        updateStatus(options.ticketsPath, ticketId, "reviewed");
      }
      reviewedCount++;

      // Step 3: Session C — resolve（resolveEvery の間隔 OR 最終チケットで実行）
      if (
        reviewedCount % options.resolveEvery === 0 ||
        reviewedCount === target.length
      ) {
        printCommandHeader("/resolve-ticket", ticketId, ticket.title);
        await withSession(
          cwd,
          options.apiKey,
          options.model,
          async (session) => {
            await runCommand(session, `/resolve-ticket ${cwd}`, runOptions);
          },
        );
        console.log("\n>>> ✅ resolve 完了");

        // Step 3b: オプション — jpush-branch（pushEnabled が true の場合のみ）
        if (options.pushEnabled) {
          try {
            printCommandHeader("/jpush-branch");
            await withSession(
              cwd,
              options.apiKey,
              options.model,
              async (session) => {
                await runCommand(session, "/jpush-branch", runOptions);
              },
            );
            console.log("\n>>> ✅ jpush-branch 完了");
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

        // 全チケット完了時: Slack に完了通知を送信
        if (reviewedCount === target.length) {
          const processed = buildProcessedText(
            options.ticketsPath,
            processedTickets,
          );
          const progress = buildProgressText(options.ticketsPath);
          const successCtx: SuccessContext = {
            count: target.length,
            processed,
            progress,
          };
          // 失敗してもメインループは停止しない
          sendSlackSuccess(options.slackWebhookUrl, successCtx).catch(() => {});
        }

        // Step 4: 全チケット reviewed チェック → Session D: find-omissions
        // noFind が true の場合はスキップする
        if (!options.noFind && checkAllReviewed(options.ticketsPath)) {
          printCommandHeader("/find-omissions-for-next-rfc");
          const source = getSourceFromTickets(options.ticketsPath);
          await withSession(
            cwd,
            options.apiKey,
            options.model,
            async (session) => {
              await runCommand(
                session,
                `/find-omissions-for-next-rfc ${source}`,
                runOptions,
              );
            },
          );
          console.log("\n>>> ✅ find-omissions 完了");
          // find-omissions の結果を Slack 通知
          sendOmissionsNotification(options.slackWebhookUrl, cwd).catch(
            () => {},
          );
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
      if (
        err.message.includes("connect") ||
        err.message.includes("initialize")
      ) {
        console.error("");
        console.error("ACP セッションの初期化に失敗しました。考えられる原因:");
        console.error("  - DeepSeek API キーが正しくない");
        console.error("  - ネットワーク接続の問題");
        console.error("  - claude-agent-acp のバージョン不一致");
        console.error(
          "環境変数 ANTHROPIC_BASE_URL が正しいか確認してください。",
        );
      }
      process.exit(1);
    }
  }

  console.log(`\n✅ 全${target.length}チケットの処理が完了しました。`);
}
