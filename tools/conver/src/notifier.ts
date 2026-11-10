// notifier.ts — Slack Incoming Webhook へのエラー通知モジュール
//
// 責務:
// - ErrorContext を受け取り、規定の Markdown フォーマットで Slack に通知する
// - ネットワークエラー時は最大3回の指数バックオフリトライを行う
// - リトライ全失敗時も throw せず console.error に出力する（メインループを停止させない）
//
// 参照: RFC_ROOT.md §5 (Slack 通知)
// 依存: P0-2 (CommandTimeoutError — classifyError で error.name を参照)
import http from "node:http";
import https from "node:https";
import { execSync } from "node:child_process";
import { realpathSync } from "node:fs";

/** エラー通知に必要なコンテキスト情報 */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface ErrorContext {
  /** エラーが発生したチケットID（例: "P2-1"） */
  ticketId: string;
  /** エラーが発生した工程（例: "make-ticket"） */
  phase: string;
  /** 発生したエラーオブジェクト（name, message, stack を利用） */
  error: Error;
  /** Tickets.json のパス（絶対パス解決に使用） */
  ticketsPath: string;
  /** Workspace name, when the error belongs to a workspace run. */
  workspace?: string;
  /** Package name, when the error belongs to a package. */
  packageName?: string;
}

/**
 * whoami コマンドで実行ユーザー名を取得する。
 * execSync が失敗した場合（CI 環境など）は "unknown" を返す。
 * エラーを throw しない理由: Slack 通知がユーザー名の取得失敗で停止してはならない。
 */
function getUsername(): string {
  try {
    return execSync("whoami", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * 相対パスを絶対パスに変換する。
 * realpathSync が失敗した場合（ファイル不在など）は引数をそのまま返す。
 * エラーを throw しない理由: パス解決の失敗で Slack 通知が停止してはならない。
 */
function getAbsolutePath(relativePath: string): string {
  try {
    return realpathSync(relativePath);
  } catch {
    return relativePath;
  }
}

/**
 * エラーオブジェクトを Slack 通知用の文字列に分類する。
 * 分類ルール（if-else 優先順）:
 * 1. error.name === 'CommandTimeoutError' → "CommandTimeout"
 * 2. error.message に "permission" を含む → "PermissionDenied"
 * 3. error.message に "ENOENT" を含む → "FileNotFound"
 * 4. 上記以外 → "Unknown"
 */
function classifyError(error: Error): string {
  if (error.name === "CommandTimeoutError") return "CommandTimeout";
  if (error.message?.includes("permission")) return "PermissionDenied";
  if (error.message?.includes("ENOENT")) return "FileNotFound";
  return "Unknown";
}

/**
 * ErrorContext から Slack Webhook に送信するペイロードを構築する。
 * Slack Incoming Webhook は 'text' フィールドの Markdown を解釈して表示する。
 * 戻り値の形式:
 *   { username: "conver", icon_emoji: ":x:", text: "■ conver エラー報告\n..." }
 */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
function buildSlackMessage(context: ErrorContext): object {
  const absolutePath = getAbsolutePath(context.ticketsPath);
  const username = getUsername();
  const errorType = classifyError(context.error);

  const location = [
    context.workspace ? `workspace ${context.workspace}` : null,
    context.packageName ? `package ${context.packageName}` : null,
  ].filter((part): part is string => part !== null);
  const text = [
    "■ conver エラー報告",
    ...(location.length === 0 ? [] : [`• 位置: ${location.join(" / ")}`]),
    `• Tickets.json: \`${absolutePath}\``,
    `• ユーザー: \`${username}\``,
    `• チケット: ${context.ticketId}`,
    `• 工程: ${context.phase}`,
    `• エラー種別: ${errorType}`,
    "• 説明:",
    `  > ${context.error.message || "詳細情報なし"}`,
  ].join("\n");

  return {
    username: "conver",
    icon_emoji: ":x:",
    text,
  };
}

/**
 * Slack Incoming Webhook に1回だけ通知を送信する。
 * Content-Type は application/x-www-form-urlencoded で、payload パラメータに JSON 文字列を格納する。
 * @param webhookUrl Slack Incoming Webhook URL
 * @param payload 送信するペイロードオブジェクト
 * @returns ステータスコード 2xx で resolve、それ以外またはネットワークエラーで reject
 */
function sendSlackOnce(
  webhookUrl: string,
  payload: object,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = new URLSearchParams();
    body.append("payload", JSON.stringify(payload));

    // webhook URL のプロトコルに応じて http/https を切り替える
    // 本番 Slack Webhook は HTTPS、テスト用モックサーバーは HTTP を使用する
    const isHttps = url.protocol === "https:";
    const requestFn = isHttps ? https.request : http.request;
    const defaultPort = isHttps ? 443 : 80;

    const req = requestFn(
      {
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : defaultPort,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Slack API returned ${res.statusCode}`));
        }
      },
    );

    req.on("error", (err) => reject(err));
    req.write(body.toString());
    req.end();
  });
}

/**
 * Slack 通知を最大 maxRetries 回リトライする。
 * リトライ間隔は 1秒 → 2秒 → 3秒 と指数バックオフする（delay = 1000 * attempt）。
 * 全試行失敗時は console.error にエラーを出力し、throw はしない。
 * throw しない理由: Slack 通知の失敗がメインループを停止させてはならない。
 * @param webhookUrl Slack Incoming Webhook URL
 * @param payload 送信するペイロードオブジェクト
 * @param maxRetries 最大リトライ回数（デフォルト 3）
 */
async function sendSlackWithRetry(
  webhookUrl: string,
  payload: object,
  maxRetries: number = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendSlackOnce(webhookUrl, payload);
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = 1000 * attempt; // 1s, 2s, 3s
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error(
          `[conver] Slack通知送信に失敗しました（${maxRetries}回試行）: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}

/**
 * ErrorContext を受け取り、Slack Webhook にエラー通知を送信する。
 * 外部向け公開 API。内部で buildSlackMessage → sendSlackWithRetry を連鎖実行する。
 * @param webhookUrl Slack Incoming Webhook URL
 * @param context エラー通知コンテキスト
 */
export async function sendSlackError(
  webhookUrl: string,
  context: ErrorContext,
): Promise<void> {
  const payload = buildSlackMessage(context);
  await sendSlackWithRetry(webhookUrl, payload);
}

/** Phase-completion notification context. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface PhaseCompleteContext {
  workspace: string;
  packageName: string;
  phaseId: number;
  reviewed: number;
  total: number;
  lastTicketKey: string;
  packageComplete: boolean;
}

/** Fail-stop notification context, including the reason conver stopped. */
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
export interface StopContext {
  workspace: string;
  packageName: string;
  phaseId: number | null;
  ticketKey: string | null;
  command: string | null;
  reason: string;
}

/**
 * Notify Slack that one phase reached reviewed for every ticket in it.
 * This is the only success notification; progress lists and find details are
 * deliberately absent so the message stays one line.
 */
export async function sendSlackPhaseComplete(
  webhookUrl: string,
  context: PhaseCompleteContext,
): Promise<void> {
  const label = context.phaseId === -1 ? "PX" : `P${context.phaseId}`;
  const suffix = context.packageComplete ? " — package complete" : "";
  const text =
    `[${context.workspace}] ${context.packageName} ${label} ` +
    `${context.reviewed}/${context.total} reviewed (last: ${context.lastTicketKey})${suffix}`;
  await sendSlackWithRetry(webhookUrl, {
    username: "conver",
    icon_emoji: ":white_check_mark:",
    text,
  });
}

/** Notify Slack that conver is stopping, with the location and reason. */
export async function sendSlackStop(
  webhookUrl: string,
  context: StopContext,
): Promise<void> {
  const location = [
    context.packageName,
    context.phaseId === null ? null : context.phaseId === -1 ? "PX" : `P${context.phaseId}`,
    context.ticketKey,
    context.command,
  ].filter((part): part is string => part !== null && part !== "");
  const text =
    `[${context.workspace}] stopped: ${context.reason}` +
    (location.length === 0 ? "" : ` (${location.join(" ")})`);
  await sendSlackWithRetry(webhookUrl, {
    username: "conver",
    icon_emoji: ":octagonal_sign:",
    text,
  });
}
