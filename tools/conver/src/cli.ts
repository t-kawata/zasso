// cli.ts — CLI引数パース（副作用ゼロの純粋関数 + 必須検証を伴うエントリ関数）
import { parseArgs } from "node:util";

export interface CliOptions {
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

function showUsage(): void {
  console.log(`conver.js — ACP-based ticket processing pipeline (DeepSeek V4)

Usage:
  node dist/conver.js -k <api_key> -s <webhook_url> [options]

Options:
  -k, --api-key <key>        DeepSeek API Key (required)
  -t, --tickets <path>       Tickets.json path (default: ./Tickets.json)
  -c, --count <number>       Max tickets to process (default: 999999)
  -r, --resolve-every <num>  Resolve interval (default: 3)
  -p, --push <0|1>           Auto jpush-branch after resolve (default: 1)
  -m, --model <name>         AI model (default: deepseek-v4-flash)
  -s, --slack-url <url>      Slack Incoming Webhook URL (required)
  -v, --verbose <0|1>        Verbose output (default: 0)
  --timeout <seconds>        Command timeout in seconds (default: 1800)
  -h, --help                 Show this message`);
}

export function parseCliOptions(argv: string[]): CliOptions {
  const parsed = parseArgs({
    args: argv.slice(2),
    options: {
      "api-key": { type: "string", short: "k" },
      model: { type: "string", short: "m", default: "deepseek-v4-flash" },
      tickets: { type: "string", short: "t", default: "./Tickets.json" },
      count: { type: "string", short: "c", default: "999999" },
      "resolve-every": { type: "string", short: "r", default: "3" },
      push: { type: "string", short: "p", default: "1" },
      "slack-url": { type: "string", short: "s" },
      verbose: { type: "string", short: "v", default: "0" },
      timeout: { type: "string", default: "1800" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (parsed.values.help) {
    showUsage();
    process.exit(0);
  }

  if (!parsed.values["api-key"]) {
    console.error("エラー: -k / --api-key は必須です。");
    showUsage();
    process.exit(1);
  }
  if (!parsed.values["slack-url"]) {
    console.error("エラー: -s / --slack-url は必須です。");
    showUsage();
    process.exit(1);
  }

  return {
    apiKey: parsed.values["api-key"],
    model: parsed.values.model,
    ticketsPath: parsed.values.tickets,
    maxCount: parseInt(parsed.values.count, 10),
    resolveEvery: parseInt(parsed.values["resolve-every"], 10),
    pushEnabled: parsed.values.push === "1",
    slackWebhookUrl: parsed.values["slack-url"],
    verbose: parsed.values.verbose === "1",
    timeoutMs: parseInt(parsed.values.timeout, 10) * 1000,
  };
}
