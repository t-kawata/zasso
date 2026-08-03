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
export interface ErrorContext {
  /** エラーが発生したチケットID（例: "P2-1"） */
  ticketId: string;
  /** エラーが発生した工程（例: "make-ticket"） */
  phase: string;
  /** 発生したエラーオブジェクト（name, message, stack を利用） */
  error: Error;
  /** Tickets.json のパス（絶対パス解決に使用） */
  ticketsPath: string;
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
function buildSlackMessage(context: ErrorContext): object {
  const absolutePath = getAbsolutePath(context.ticketsPath);
  const username = getUsername();
  const errorType = classifyError(context.error);

  const text = [
    "■ conver エラー報告",
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

/** 完了通知の引数 */
export interface SuccessContext {
  /** 今回処理したチケット数 */
  count: number;
  /** 今回処理したチケットの一覧（"P0-1: title" 形式） */
  processed: string[];
  /** 全チケットの進捗一覧（Markdown 形式） */
  progress: string;
}

/**
 * 完了通知を Slack に送信する。
 * エラー通知と同様に sendSlackWithRetry を使用する。
 * @param webhookUrl Slack Incoming Webhook URL
 * @param context 完了通知の内容
 */
export async function sendSlackSuccess(
  webhookUrl: string,
  context: SuccessContext,
): Promise<void> {
  const text = [
    `---\n${context.count}件のチケットの実装が完了しました。`,
    "```",
    context.processed.join("\n"),
    "```",
    "現在の進捗状況は以下のとおりです。",
    "```",
    context.progress,
    "```",
  ].join("\n");

  const payload = {
    username: "conver",
    icon_emoji: ":tada:",
    text,
  };

  await sendSlackWithRetry(webhookUrl, payload);
}

/** find 完了後通知の引数 */
// [::TICKET::] PX-117 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-117 --for-spec --no-implementation-order`.
export interface FindOutcomeContext {
  /** list-phases-and-tickets.js の出力（find 後・統合後の進捗一覧） */
  progress: string;
  /** Tickets.json への統合が発生したか（フェーズ/チケット数の増加で判定） */
  integrationSucceeded: boolean;
  /** 統合で増加したフェーズ数 */
  mergedPhases: number;
  /** 統合で増加したチケット数 */
  mergedTickets: number;
}

/**
 * find 完了後の Slack 通知を送信する。
 * 進捗一覧（list-phases-and-tickets.js の出力）と、Tickets.json への統合成否を送る。
 * @param webhookUrl Slack Incoming Webhook URL
 * @param context find 完了後の状態
 */
export async function sendFindOutcomeNotification(
  webhookUrl: string,
  context: FindOutcomeContext,
): Promise<void> {
  const status = context.integrationSucceeded
    ? `✅ find 完了: Tickets.json への統合成功（+${context.mergedPhases} フェーズ / +${context.mergedTickets} チケット）`
    : "⚠️ find 完了: Tickets.json への統合は発生しませんでした（omissions なし または 統合失敗）";
  const text = [
    `---\n${status}`,
    "現在の進捗状況は以下のとおりです。",
    "```",
    context.progress,
    "```",
  ].join("\n");

  const payload = {
    username: "conver",
    icon_emoji: ":mag:",
    text,
  };

  await sendSlackWithRetry(webhookUrl, payload);
}
