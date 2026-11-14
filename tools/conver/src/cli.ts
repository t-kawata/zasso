// cli.ts — CLI引数パース（副作用ゼロの純粋関数 + 必須検証を伴うエントリ関数）
import { parseArgs } from "node:util";
import { VERSION } from "./settings.js";
import { MAX_FIND_ROUNDS } from "./find-policy.js";

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

// [::TICKET::] PX-145, PX-146, PX-151, PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-145|PX-146|PX-151|PX-403|PX-404) --for-spec --no-implementation-order`.
export interface CliOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  /** Partial package names; empty means every package. */
  packages: string[];
  maxCount: number;
  resolveEvery: number;
  pushEnabled: boolean;
  slackWebhookUrl: string;
  verbose: boolean;
  timeoutMs: number;
  bindReviewInOneSession: boolean;
  noFind: boolean;
  /** Find executions allowed per package before the run stops. */
  maxFindRounds: number;
  /** Disable the fixed progress header. */
  noDashboard: boolean;
  /** Header poll interval in seconds (5-10 recommended). */
  dashboardIntervalSeconds: number;
  /** Watcher 設定ファイルへのパス。指定がない場合は未定義（通常モード） */
  watcherConfig?: string;
}

// [::TICKET::] PX-145, PX-146, PX-151, PX-403, PX-404, PX-413 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-145|PX-146|PX-151|PX-403|PX-404|PX-413) --for-spec --no-implementation-order`.
function showUsage(): void {
  process.stdout.write(`conver.js ${VERSION} — ACP-based ticket processing pipeline (provider-agnostic)

Usage:
  node dist/conver.js -k <api_key> -s <webhook_url> [options]

Options:
  -k, --api-key <key>        API key (optional; keyless providers use a placeholder)
  -P, --package <name>       Package name (repeatable or comma-separated; default: all)
                             With -w, the watcher exits 0 when every selected package is endpoint
  -c, --count <number>       Max tickets to process in this workspace (default: 999999)
  -r, --resolve-every <num>  Resolve interval per package (default: 3)
  -p, --push <0|1>           Auto epush-branch after resolve (default: 1)
  -m, --model <name>         AI model (default: deepseek-flash)
  -u, --url <url>            Anthropic-compatible base URL (default: https://api.deepseek.com/anthropic)
  -s, --slack-url <url>      Slack Incoming Webhook URL (required)
  -v, --verbose <0|1>        Verbose output (default: 1)
  --timeout <seconds>        Command timeout in seconds (default: 1800)
  -b, --bind-review-in-one-session <0|1>
                             Bind review in same session (default: 1)
  -w, --watcher <path>       Watcher config JSON path (exits 0 at the endpoint)
  -n, --no-find <0|1>        Skip find after all done; consolidate still runs (default: 0)
  --max-find-rounds <num>    Find executions allowed per package before stopping (default: 5)
  --no-dashboard             Disable the fixed progress header
  --dashboard-interval <sec> Header poll interval in seconds (default: 5)
  -h, --help                 Show this message
  --version                  Show version number\n`);
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function clampDashboardInterval(raw: string): number {
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(60, parsed));
}

/** A limit below one would stop every package before it ever reaches find. */
function parseMaxFindRounds(raw: string): number {
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : MAX_FIND_ROUNDS;
}

export function parseCliOptions(argv: string[]): CliOptions {
  const parsed = parseArgs({
    args: argv.slice(2),
    options: {
      "api-key": { type: "string", short: "k" },
      model: { type: "string", short: "m", default: "deepseek-flash" },
      url: { type: "string", short: "u", default: DEFAULT_BASE_URL },
      package: { type: "string", short: "P", multiple: true },
      count: { type: "string", short: "c", default: "999999" },
      "resolve-every": { type: "string", short: "r", default: "3" },
      push: { type: "string", short: "p", default: "1" },
      "slack-url": { type: "string", short: "s" },
      verbose: { type: "string", short: "v", default: "1" },
      timeout: { type: "string", default: "1800" },
      "bind-review-in-one-session": { type: "string", short: "b", default: "1" },
      "no-find": { type: "string", short: "n", default: "0" },
      "max-find-rounds": { type: "string", default: String(MAX_FIND_ROUNDS) },
      "no-dashboard": { type: "boolean", default: false },
      "dashboard-interval": { type: "string", default: "5" },
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
    packages: (parsed.values.package ?? [])
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    maxCount: parseInt(parsed.values.count, 10),
    resolveEvery: parseInt(parsed.values["resolve-every"], 10),
    pushEnabled: parsed.values.push === "1",
    slackWebhookUrl: parsed.values["slack-url"],
    verbose: parsed.values.verbose === "1",
    timeoutMs: parseInt(parsed.values.timeout, 10) * 1000,
    bindReviewInOneSession: parsed.values["bind-review-in-one-session"] === "1",
    noFind: parsed.values["no-find"] === "1",
    maxFindRounds: parseMaxFindRounds(parsed.values["max-find-rounds"]),
    noDashboard: parsed.values["no-dashboard"],
    dashboardIntervalSeconds: clampDashboardInterval(parsed.values["dashboard-interval"]),
    watcherConfig: parsed.values.watcher,
  };
}
