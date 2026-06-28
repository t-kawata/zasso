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
import path from "node:path";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, realpathSync } from "node:fs";

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

// severity → 絵文字のマッピング
const SEVERITY_EMOJI: Record<string, string> = {
  high: "🔴",
  medium: "🟡",
  low: "🔵",
};

// omission type → 日本語ラベル（convert-omissions-to-markdown.js から移植）
const TYPE_LABEL: Record<string, string> = {
  missing_implementation: "実装漏れ",
  incomplete_implementation: "実装不足",
  design_deviation: "設計不一致",
  bug: "バグ",
  stub_remaining: "スタブ残存",
  test_missing: "テスト欠落",
  inconsistency: "不整合",
};

/** OMISSIONS 配列の各要素をコードブロック用の文字列に整形する */
export function buildOmissionsBlocks(
  omissions: Array<{
    id?: string;
    type?: string;
    severity?: string;
    rfcSection?: string;
    description?: string;
    details?: string;
    affectedFiles?: string[];
    suggestedResolution?: string;
  }>,
): string {
  if (omissions.length === 0) {
    return "🔍 設計との乖離は見つかりませんでした。\n";
  }

  const lines: string[] = [`🔍 ${omissions.length}件の設計との乖離が見つかりました。`];
  for (const o of omissions) {
    const emoji = SEVERITY_EMOJI[o.severity ?? ""] ?? "⚪";
    const tl = TYPE_LABEL[o.type ?? ""] ?? o.type ?? "?";
    const sec = o.rfcSection ? " §" + o.rfcSection : "";
    lines.push("");
    lines.push(`### ${o.id ?? "(no-id)"} ${emoji} [${tl}]${sec}`);
    lines.push("");
    lines.push(o.description ?? "");
    if (o.details) {
      lines.push("");
      lines.push(`**詳細**: ${o.details}`);
    }
    if (o.affectedFiles && o.affectedFiles.length > 0) {
      lines.push("");
      lines.push("**該当ファイル**:");
      for (const af of o.affectedFiles) {
        lines.push("- `" + af + "`");
      }
    }
    if (o.suggestedResolution) {
      lines.push("");
      lines.push(`**解決方法**: ${o.suggestedResolution}`);
    }
    lines.push("");
    lines.push("---");
  }
  return lines.join("\n") + "\n";
}

/**
 * カレントディレクトリの OMISSIONS-XXX.json を検索し、
 * その内容を Slack に通知する。
 */
export async function sendOmissionsNotification(
  webhookUrl: string,
  cwd: string,
): Promise<void> {
  let text: string;
  let summaryLine: string = "";

  try {
    const files = readdirSync(cwd).filter((f) => /^OMISSIONS-\d+\.json$/.test(f));
    if (files.length === 0) {
      text = "OMISSIONS は生成されませんでした（ファイルが見つかりません）。";
    } else {
      const latest = files.sort().pop()!;
      const latestPath = path.join(cwd, latest);
      const raw = readFileSync(latestPath, "utf-8");
      const data = JSON.parse(raw);
      const count = (data.omissions ?? []).length;
      summaryLine = `---\n漏れ・矛盾・不足が、${count}件見つかりました（ \`${latestPath}\` ）。`;
      const header = [
        `# ${path.basename(latest, ".json")}`,
        `> 生成元: \`${latestPath}\``,
        data.parentRfcTitle ? `- **タイトル**: ${data.parentRfcTitle}` : "",
        data.summary ? `- **サマリ**: ${data.summary}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      text = header + "\n\n" + buildOmissionsBlocks(data.omissions ?? []);
    }
  } catch {
    text = "OMISSIONS の読み取り中にエラーが発生しました。";
  }

  const payload = {
    username: "conver",
    icon_emoji: ":mag:",
    text: summaryLine ? `${summaryLine}\n\`\`\`\n${text}\`\`\`` : `\`\`\`\n${text}\`\`\``,
  };

  await sendSlackWithRetry(webhookUrl, payload);
}
