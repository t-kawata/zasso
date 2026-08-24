

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
//      → pushEnabled → /epush-branch
//   5. 全件 reviewed → [Session D1] /consolidate-stubs → [Session D2] /find-omissions
//   6. 次のチケットへ（ループ継続）
//
// 参照: RFC_ROOT.md §3（内部ループ制御）
// 依存: P3-1 (session.ts — withSession/runCommand),
//       P2-1 (notifier.ts — sendSlackError),
//       P1-1 (tickets.ts — loadPendingTickets / checkAllReviewed / getGraphPathFromTickets)
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { withSession, runCommand } from "./session.js";
import type { RunCommandOptions, AcpSession, SessionConfig } from "./session.js";
import {
  sendSlackError,
  sendSlackSuccess,
  sendFindOutcomeNotification,
} from "./notifier.js";
import type { SuccessContext } from "./notifier.js";
import {
  loadPendingTickets,
  checkAllReviewed,
  getGraphPathFromTickets,
  countPhasesAndTickets,
  clearForNextRound,
} from "./tickets.js";
import type { TicketsJson } from "./tickets.js";
import type { WatcherConfig } from "./watcher.js";
import { waitForWindow } from "./step-timer.js";

// --- インターフェース定義 ---

/** ループ制御に必要な全オプション。cli.ts の CliOptions と同一フィールドだが
 *  将来的な分離可能性のため独立定義する。 */
// [::TICKET::] PX-146, PX-151 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-146|PX-151) --for-spec --no-implementation-order`.
export interface LoopOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  /** 同一チケットのリトライ上限（PX-146）。デフォルト 3。 */
  maxRetries: number;
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
  if (message.includes("consolidate-stubs")) return "consolidate-stubs";
  if (message.includes("find-omissions")) return "find-omissions";
  if (message.includes("epush-branch")) return "epush-branch";
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

// --- PX-150: セッション障害からの回復（再試行・継続） ---

/** セッション再試行ポリシー。テストから遅延を短縮できるよう mutable に保つ。 */
// [::TICKET::] PX-150 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-150 --for-spec --no-implementation-order`.
export const retryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
  jitterMs: 500,
};

/** 回復可能エラーと判定するためのキーワード（接続切断・子プロセス死亡・一時障害） */
const RECOVERABLE_ERROR_MARKERS = [
  "ACP connection closed",
  "子プロセス",
  "EPIPE",
  "ECONNRESET",
  "タイムアウト",
  "timeout",
  "connect",
  "initialize",
];

/**
 * 回復可能（接続切断・子プロセス死亡・タイムアウト等）なエラーかを判定する。
 * 回復可能なエラーはセッション確立を再試行し、システム障害（設定・ENOENT等）は
 * 即座に伝播する。
 */
export function isRecoverableError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return RECOVERABLE_ERROR_MARKERS.some((m) => msg.includes(m));
}

/**
 * 指数バックオフ + ジッタ付きで操作を再試行する。
 * - recoverable エラー: maxAttempts まで再試行
 * - non-recoverable エラー: 即座に throw
 * - 上限到達: 最後のエラーを throw
 */
export async function retryWithBackoff<T>(
  op: () => Promise<T>,
  opts: {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
    jitterMs: number;
    isRetryable: (err: unknown) => boolean;
  },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      lastError = err;
      if (!opts.isRetryable(err) || attempt === opts.maxAttempts) break;
      const base = Math.min(opts.baseDelayMs * 2 ** (attempt - 1), opts.maxDelayMs);
      const delay = base + Math.random() * opts.jitterMs;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/** LoopOptions からセッション起動用の SessionConfig を抽出する（PX-151）。 */
// [::TICKET::] PX-151 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-151 --for-spec --no-implementation-order`.
function toSessionConfig(options: LoopOptions): SessionConfig {
  return {
    apiKey: options.apiKey,
    model: options.model,
    baseUrl: options.baseUrl,
  };
}

/** withSession をセッション確立の再試行付きで実行する（PX-150 C003）。 */
async function runWithSession<T>(
  cwd: string,
  config: SessionConfig,
  fn: (session: AcpSession) => Promise<T>,
): Promise<T> {
  return retryWithBackoff(() => withSession(cwd, config, fn), {
    maxAttempts: retryPolicy.maxAttempts,
    baseDelayMs: retryPolicy.baseDelayMs,
    maxDelayMs: retryPolicy.maxDelayMs,
    jitterMs: retryPolicy.jitterMs,
    isRetryable: isRecoverableError,
  });
}

/** チケットキー（P{phaseId}-{id} / PX-{id}）を生成する（PX-146: wave / リトライ追跡用）。 */
// [::TICKET::] PX-146 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-146 --for-spec --no-implementation-order`.
function ticketKey(ticket: { phaseId: number; id: number }): string {
  return ticket.phaseId === -1 ? `PX-${ticket.id}` : `P${ticket.phaseId}-${ticket.id}`;
}

/**
 * チケットキー（"P{phaseId}-{id}" / "PX-{id}"）を phaseId と id に分解する。
 */
// [::TICKET::] PX-174 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-174 --for-spec --no-implementation-order`.
function parseTicketKey(key: string): { phaseId: number; id: number } {
  const separator = key.indexOf("-");
  const phasePart = key.slice(0, separator);
  const idPart = key.slice(separator + 1);
  const phaseId = phasePart === "PX" ? -1 : parseInt(phasePart.slice(1), 10);
  const id = parseInt(idPart, 10);
  return { phaseId, id };
}

/**
 * Tickets.json を読み直し、指定チケットの現在の status を返す（PX-174 C003 status 再読込）。
 * チケットが見つからない・ファイルが読めない場合は "todo" を返す（新規扱いで安全側）。
 */
// [::TICKET::] PX-174 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-174 --for-spec --no-implementation-order`.
function readTicketStatus(ticketsPath: string, key: string): string {
  let raw: string;
  try {
    raw = readFileSync(ticketsPath, "utf-8");
  } catch {
    return "todo";
  }
  const ticketsData: TicketsJson = JSON.parse(raw);
  const { phaseId, id } = parseTicketKey(key);
  for (const phase of ticketsData.phases) {
    if (phase.id !== phaseId) continue;
    const ticket = (phase.tickets || []).find((t) => t.id === id);
    if (!ticket) return "todo";
    return ticket.status;
  }
  return "todo";
}

/** status 文字列が terminal（reviewed または R<round>）か判定する（PX-174 review ゲート用）。 */
// [::TICKET::] PX-174 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-174 --for-spec --no-implementation-order`.
function isTerminalStatusValue(status: string): boolean {
  return status === "reviewed" || /^R[1-9]\d*$/.test(status);
}

/**
 * Tickets.json を読み直し、指定チケットが terminal（reviewed または R<round>）に
 * 到達したかを判定する（PX-146 C002 事後検証）。ファイルが読めない場合は false。
 */
// [::TICKET::] PX-146, PX-174 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-146|PX-174) --for-spec --no-implementation-order`.
function isTerminalStatus(ticketsPath: string, key: string): boolean {
  return isTerminalStatusValue(readTicketStatus(ticketsPath, key));
}

/** 実行するフェーズの定義（runPhaseIfNeeded に渡す） */
// [::TICKET::] PX-174 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-174 --for-spec --no-implementation-order`.
interface PhaseSpec {
  /** 実行コマンド（例: "/make-ticket"） */
  command: string;
  /** チケットタイトル（ログ用） */
  title: string;
  /** 現在 status を受け、フェーズを実行すべきか判定する述語 */
  shouldRun: (status: string) => boolean;
}

/**
 * 1つのフェーズを「status 再読込 → 枠外待機 → 実行」の順で行う（PX-174 C003）。
 * 現在の status で phase.shouldRun が false なら完了済みとみなし、フェーズをスキップする。
 * セッション再試行時も status 再読込により完了済みフェーズは再実行されない。
 */
// [::TICKET::] PX-174 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-174 --for-spec --no-implementation-order`.
async function runPhaseIfNeeded(
  session: AcpSession,
  options: LoopOptions,
  ticketId: string,
  phase: PhaseSpec,
): Promise<void> {
  await waitForWindow(options.watcherConfig);
  const current = readTicketStatus(options.ticketsPath, ticketId);
  if (!phase.shouldRun(current)) {
    return;
  }
  printCommandHeader(phase.command, ticketId, phase.title);
  await runCommand(session, `${phase.command} ${ticketId}`, toRunCommandOptions(options));
  process.stdout.write(`\n>>> ✅ ${phase.command.replace("/", "")} 完了\n`);
}

/** resolve + epush を実行する（PX-146: resolveEvery のリズムと find 前の最終 resolve を一元化）。 */
// [::TICKET::] PX-146, PX-150, PX-151 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-146|PX-150|PX-151) --for-spec --no-implementation-order`.
async function runResolve(
  cwd: string,
  options: LoopOptions,
  ticketId: string,
): Promise<void> {
  const runOptions = toRunCommandOptions(options);
  printCommandHeader("/resolve-ticket", ticketId, "resolve");
  await runWithSession(
    cwd,
    toSessionConfig(options),
    async (session) => {
      await runCommand(session, `/resolve-ticket ${cwd}`, runOptions);
    },
  );
  process.stdout.write("\n>>> ✅ resolve 完了\n");

  if (options.pushEnabled) {
    try {
      printCommandHeader("/epush-branch");
      await runWithSession(
        cwd,
        toSessionConfig(options),
        async (session) => {
          await runCommand(session, "/epush-branch", runOptions);
        },
      );
      process.stdout.write("\n>>> ✅ epush-branch 完了\n");
    } catch (pushError) {
      await sendSlackError(options.slackWebhookUrl, {
        ticketId,
        phase: "epush-branch",
        error: pushError as Error,
        ticketsPath: options.ticketsPath,
      });
      throw pushError;
    }
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
// [::TICKET::] PX-150 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-150 --for-spec --no-implementation-order`.
function printCommandHeader(
  command: string,
  ticketId?: string,
  title?: string,
): void {
  const separator = "=".repeat(46);
  process.stdout.write(`\n${separator}\n`);
  if (ticketId && title) {
    process.stdout.write(`🟢 ${command} ${ticketId}: ${title}\n`);
  } else {
    process.stdout.write(`🟢 ${command}\n`);
  }
  process.stdout.write(`${separator}\n`);
}

/** Tickets.json から処理済みチケットをフェーズ別に整形する */
// [::TICKET::] PX-116 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-116 --for-spec --no-implementation-order`.
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
    for (const ticket of processed) {
      const list = byPhase.get(ticket.phaseId) ?? [];
      list.push(ticket);
      byPhase.set(ticket.phaseId, list);
    }

    const lines: string[] = [];
    const sortedPhaseIds = [...byPhase.keys()].sort((a, b) => a - b);
    for (const pid of sortedPhaseIds) {
      const pname = phaseNames.get(pid) ?? "";
      const phaseLabel = pid === -1 ? "PX" : `P${pid}`;
      lines.push(`${phaseLabel}: ${pname}`);
      for (const ticket of byPhase.get(pid)!) {
        lines.push(`    * ${ticket.id}: ${ticket.title}`);
      }
    }
    return lines;
  } catch {
    return ["(処理済みチケット一覧の生成に失敗しました)"];
  }
}

/** カレントディレクトリの `.claude/scripts/tickets/list-phases-and-tickets.js` を実行して進捗一覧を取得する */
// [::TICKET::] PX-116 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-116 --for-spec --no-implementation-order`.
// [::TICKET::] PX-117 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-117 --for-spec --no-implementation-order`.
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
  // PX-146 C005: 安全網 — 中断ラウンドで残った forNextRound を解除してから開始する。
  clearForNextRound(options.ticketsPath);

  let reviewedCount = 0;
  const processedTickets: Array<{
    id: string;
    title: string;
    phaseId: number;
  }> = [];
  const processedDistinct = new Set<string>();
  const retryCount = new Map<string, number>();
  /** リトライ上限到達で諦めたチケット — 再取得しない（通知付き穴）（PX-146 C003） */
  const giveUp = new Set<string>();

  while (true) {
    const pending = loadPendingTickets(options.ticketsPath).sort(
      (a, b) => a.phaseId - b.phaseId || a.id - b.id,
    );
    if (pending.length === 0) break;

    // 重複なし maxCount 予算: 新規チケットは残り予算まで、リトライ対象は予算を消費しない。
    const remainingBudget = options.maxCount - processedDistinct.size;
    const newCandidates = pending
      .filter((t) => !processedDistinct.has(ticketKey(t)))
      .slice(0, Math.max(0, remainingBudget));
    const retryCandidates = pending.filter(
      (t) => processedDistinct.has(ticketKey(t)) && !giveUp.has(ticketKey(t)),
    );
    if (newCandidates.length === 0 && retryCandidates.length === 0) break;

    const target = [...retryCandidates, ...newCandidates];

    for (const ticket of target) {
      const ticketId = ticketKey(ticket);

      // Watcher モード時: 時間枠外なら枠内に戻るまで待機する（PX-174）
      await waitForWindow(options.watcherConfig);

      if (!processedDistinct.has(ticketId)) {
        processedDistinct.add(ticketId);
        reviewedCount++;
        processedTickets.push({
          id: ticketId,
          title: ticket.title,
          phaseId: ticket.phaseId,
        });
      }
      const runOptions = toRunCommandOptions(options);

      try {
        const bindReview = options.bindReviewInOneSession ?? true;
        const initialStatus = readTicketStatus(options.ticketsPath, ticketId);

        // Session A: make/plan/start/review（統合モード時は同セッション）
        //   各フェーズ直前に status を再読込し、完了済みフェーズをスキップする（PX-174 C003）。
        //   -b 1（デフォルト）: [make→plan→start→review]
        //   -b 0:              [make→plan→start] → 別セッションで review
        if (initialStatus === "todo" || initialStatus === "made" || initialStatus === "planned") {
          await runWithSession(
            cwd,
            toSessionConfig(options),
            async (session) => {
              await runPhaseIfNeeded(session, options, ticketId, { command: "/make-ticket", title: ticket.title, shouldRun: (s) => s === "todo" });
              await runPhaseIfNeeded(session, options, ticketId, { command: "/plan-ticket", title: ticket.title, shouldRun: (s) => s === "todo" || s === "made" });
              await runPhaseIfNeeded(session, options, ticketId, { command: "/start-ticket", title: ticket.title, shouldRun: (s) => ["todo", "made", "planned"].includes(s) });
              if (bindReview) {
                await runPhaseIfNeeded(session, options, ticketId, { command: "/review-ticket", title: ticket.title, shouldRun: (s) => !isTerminalStatusValue(s) });
              }
            },
          );
        }

        // review を別セッションで実行（分離モード または done）
        const statusForReview = readTicketStatus(options.ticketsPath, ticketId);
        if (!bindReview || statusForReview === "done") {
          await waitForWindow(options.watcherConfig);
          printCommandHeader("/review-ticket", ticketId, ticket.title);
          await runWithSession(
            cwd,
            toSessionConfig(options),
            async (session) => {
              await runCommand(session, `/review-ticket ${ticketId}`, runOptions);
            },
          );
          process.stdout.write("\n>>> ✅ review 完了\n");
        }

        // resolve 間隔（C001 invariant: resolveEvery のリズムを維持）— 枠外なら待機してから実行
        if (reviewedCount % options.resolveEvery === 0) {
          await waitForWindow(options.watcherConfig);
          await runResolve(cwd, options, ticketId);
        }
      // C002: 事後検証 — Tickets.json を読み直し、terminal 到達を確認する。
      if (isTerminalStatus(options.ticketsPath, ticketId)) {
        retryCount.delete(ticketId);
      } else {
        const attempts = (retryCount.get(ticketId) ?? 0) + 1;
        retryCount.set(ticketId, attempts);
        if (attempts > options.maxRetries) {
          // C003: リトライ上限到達 — Slack 通知し、通知付き穴として再取得を停止する。
          giveUp.add(ticketId);
          await sendSlackError(options.slackWebhookUrl, {
            ticketId,
            phase: "review-retry",
            error: new Error(
              `Ticket ${ticketId} did not reach reviewed after ${options.maxRetries} retries`,
            ),
            ticketsPath: options.ticketsPath,
          });
          console.error(
            `\n⚠️ ${ticketId} が ${options.maxRetries} 回のリトライ後も未完了です（通知付きで継続）`,
          );
        }
        // 非 terminal のまま次 wave へ — 再取得で再処理される（救済）。
        continue;
      }

      // C004: 全チケット reviewed → consolidate → find → 通知 → return（1インボケーション=1ラウンド）
      if (!options.noFind && checkAllReviewed(options.ticketsPath)) {
        await waitForWindow(options.watcherConfig);
        await runResolve(cwd, options, ticketId); // 最終 resolve（冪等）
        const processed = buildProcessedText(
          options.ticketsPath,
          processedTickets,
        );
        const progress = buildProgressText(options.ticketsPath);
        const successCtx: SuccessContext = {
          count: reviewedCount,
          processed,
          progress,
        };
        sendSlackSuccess(options.slackWebhookUrl, successCtx).catch(() => {});

        printCommandHeader("/consolidate-stubs");
        await runWithSession(
          cwd,
          toSessionConfig(options),
          async (session) => {
            await runCommand(session, "/consolidate-stubs", runOptions);
          },
        );
        process.stdout.write("\n>>> ✅ consolidate-stubs 完了\n");

        printCommandHeader("/find-omissions");
        const graphPath = getGraphPathFromTickets(options.ticketsPath);
        const before = countPhasesAndTickets(options.ticketsPath);
        await runWithSession(
          cwd,
          toSessionConfig(options),
          async (session) => {
            await runCommand(
              session,
              `/find-omissions ${graphPath}`,
              runOptions,
            );
          },
        );
        process.stdout.write("\n>>> ✅ find-omissions 完了\n");
        const after = countPhasesAndTickets(options.ticketsPath);
        const mergedPhases = after.phaseCount - before.phaseCount;
        const mergedTickets = after.ticketCount - before.ticketCount;
        const progressAfter = buildProgressText(options.ticketsPath);
        sendFindOutcomeNotification(options.slackWebhookUrl, {
          progress: progressAfter,
          integrationSucceeded: mergedPhases > 0 || mergedTickets > 0,
          mergedPhases,
          mergedTickets,
        }).catch(() => {});
        return; // 1ラウンド完結 — ループを抜けて conver.js を終了する
      }
    } catch (error) {
      const err = error as Error;
      // PX-150: フェーズ失敗は process.exit せず、リトライ上限までは次 wave で
      // 再処理し、上限到達で give-up（Slack 通知）して次のチケットへ継続する。
      const attempts = (retryCount.get(ticketId) ?? 0) + 1;
      retryCount.set(ticketId, attempts);
      if (attempts <= options.maxRetries) {
        console.error(
          `\n⚠️ ${ticketId} セッション失敗（${attempts}/${options.maxRetries}）: ${err.message} — 次ラウンドで再試行`,
        );
      } else {
        giveUp.add(ticketId);
        await sendSlackError(options.slackWebhookUrl, {
          ticketId,
          phase: getCurrentPhase(err),
          error: err,
          ticketsPath: options.ticketsPath,
        });
        console.error(`\n⚠️ ${ticketId} を諦めて次へ継続: ${err.message}`);
      }
      // 明確な完了点以外で終了しない。giveUp でない失敗チケットは
      // retryCandidates に残り、次 wave で再処理される。
      continue;
    }
    }

    // ラウンド完了（pending 空）時の最終 resolve — resolveEvery 境界を外れた
    // 最終チケットも resolve する（旧 `reviewedCount === target.length` 相当）。
    if (reviewedCount % options.resolveEvery !== 0 && reviewedCount > 0) {
      const remaining = loadPendingTickets(options.ticketsPath);
      if (remaining.length === 0) {
        await waitForWindow(options.watcherConfig);
        await runResolve(cwd, options, "final");
      }
    }
  }

  process.stdout.write(`\n✅ 全${reviewedCount}チケットの処理が完了しました。\n`);
}
