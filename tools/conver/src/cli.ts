// cli.ts — CLI引数パース（副作用ゼロの純粋関数 + 必須検証を伴うエントリ関数）
import path from "node:path";
import { parseArgs } from "node:util";
import { VERSION } from "./settings.js";

// プロバイダー非依存化（PX-151）: -u/--url 未指定時の既定の Anthropic 互換エンドポイント。
// 後方互換のため従来の DeepSeek エンドポイントを維持する。
export const DEFAULT_BASE_URL = "https://api.deepseek.com/anthropic";

/**
 * baseUrl を正規化する。
 * - 空文字・空白のみはデフォルトへフォールバック
 * - 末尾スラッシュは除去（OpenRouter は末尾スラッシュを拒否する）
 * - スキーマなし（localhost:11434 等）はそのまま透過（プロバイダー検出マジックは行わない）
 */
export function normalizeBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  return trimmed === "" ? DEFAULT_BASE_URL : trimmed.replace(/\/+$/, "");
}

// [::TICKET::] PX-145, PX-146, PX-151 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-145|PX-146|PX-151) --for-spec --no-implementation-order`.
export interface CliOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  ticketsPath: string;
  maxCount: number;
  resolveEvery: number;
  /** 同一チケットのリトライ上限（PX-145/PX-146）。デフォルト 3。 */
  maxRetries: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
  bindReviewInOneSession: boolean;
  noFind: boolean;
  /** Watcher 設定ファイルへのパス。指定がない場合は未定義（通常モード） */
  watcherConfig?: string;
}

// [::TICKET::] PX-145, PX-146, PX-151 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-145|PX-146|PX-151) --for-spec --no-implementation-order`.
function showUsage(): void {
  process.stdout.write(`conver.js ${VERSION} — ACP-based ticket processing pipeline (provider-agnostic)

Usage:
  node dist/conver.js -k <api_key> -s <webhook_url> [options]

Options:
  -k, --api-key <key>        API key (optional; keyless providers use a placeholder)
  -t, --tickets <path>       Tickets.json path (default: ./Tickets.json)
  -c, --count <number>       Max tickets to process (default: 999999)
  -r, --resolve-every <num>  Resolve interval (default: 3)
  -x, --max-retries <num>    Max review retries per ticket (default: 3)
  -p, --push <0|1>           Auto epush-branch after resolve (default: 1)
  -m, --model <name>         AI model (default: deepseek-v4-flash)
  -u, --url <url>            Anthropic-compatible base URL (default: https://api.deepseek.com/anthropic)
  -s, --slack-url <url>      Slack Incoming Webhook URL (required)
  -v, --verbose <0|1>        Verbose output (default: 1)
  --timeout <seconds>        Command timeout in seconds (default: 1800)
  -b, --bind-review-in-one-session <0|1>
                             Bind review in same session (default: 1)
  -w, --watcher <path>       Watcher config JSON path
  -n, --no-find <0|1>        Skip find-omissions after all done (default: 0)
  -h, --help                 Show this message
  --version                  Show version number\n`);
}

export function parseCliOptions(argv: string[]): CliOptions {
  const parsed = parseArgs({
    args: argv.slice(2),
    options: {
      "api-key": { type: "string", short: "k" },
      model: { type: "string", short: "m", default: "deepseek-v4-flash" },
      url: { type: "string", short: "u", default: DEFAULT_BASE_URL },
      tickets: { type: "string", short: "t", default: "./Tickets.json" },
      count: { type: "string", short: "c", default: "999999" },
      "resolve-every": { type: "string", short: "r", default: "3" },
      "max-retries": { type: "string", short: "x", default: "3" },
      push: { type: "string", short: "p", default: "1" },
      "slack-url": { type: "string", short: "s" },
      verbose: { type: "string", short: "v", default: "1" },
      timeout: { type: "string", default: "1800" },
      "bind-review-in-one-session": { type: "string", short: "b", default: "1" },
      "no-find": { type: "string", short: "n", default: "0" },
      watcher: { type: "string", short: "w" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });

  if (parsed.values.version) {
    process.stdout.write(`conver.js ${VERSION}\n`);
    process.exit(0);
  }

  if (parsed.values.help) {
    showUsage();
    process.exit(0);
  }

  // -k/--api-key は任意（keyless プロバイダー対応のため必須チェックを廃止）
  if (!parsed.values["slack-url"]) {
    console.error("エラー: -s / --slack-url は必須です。");
    showUsage();
    process.exit(1);
  }

  return {
    apiKey: parsed.values["api-key"] ?? "",
    model: parsed.values.model,
    baseUrl: normalizeBaseUrl(parsed.values.url),
    ticketsPath: path.resolve(parsed.values.tickets),
    maxCount: parseInt(parsed.values.count, 10),
    resolveEvery: parseInt(parsed.values["resolve-every"], 10),
    maxRetries: parseInt(parsed.values["max-retries"], 10),
    pushEnabled: parsed.values.push === "1",
    slackWebhookUrl: parsed.values["slack-url"],
    verbose: parsed.values.verbose === "1",
    timeoutMs: parseInt(parsed.values.timeout, 10) * 1000,
    bindReviewInOneSession: parsed.values["bind-review-in-one-session"] === "1",
    noFind: parsed.values["no-find"] === "1",
    watcherConfig: parsed.values.watcher,
  };
}
