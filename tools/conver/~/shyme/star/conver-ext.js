// src/cli.ts
import path from "node:path";
import { parseArgs } from "node:util";

// src/settings.ts
var VERSION = "v0.0.1";

// src/cli.ts
function showUsage() {
  console.log(`conver.js ${VERSION} \u2014 ACP-based ticket processing pipeline (DeepSeek V4)

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
  -h, --help                 Show this message
  --version                  Show version number`);
}
function parseCliOptions(argv) {
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
      version: { type: "boolean", default: false }
    },
    allowPositionals: false
  });
  if (parsed.values.version) {
    console.log(`conver.js ${VERSION}`);
    process.exit(0);
  }
  if (parsed.values.help) {
    showUsage();
    process.exit(0);
  }
  if (!parsed.values["api-key"]) {
    console.error("\u30A8\u30E9\u30FC: -k / --api-key \u306F\u5FC5\u9808\u3067\u3059\u3002");
    showUsage();
    process.exit(1);
  }
  if (!parsed.values["slack-url"]) {
    console.error("\u30A8\u30E9\u30FC: -s / --slack-url \u306F\u5FC5\u9808\u3067\u3059\u3002");
    showUsage();
    process.exit(1);
  }
  return {
    apiKey: parsed.values["api-key"],
    model: parsed.values.model,
    ticketsPath: path.resolve(parsed.values.tickets),
    maxCount: parseInt(parsed.values.count, 10),
    resolveEvery: parseInt(parsed.values["resolve-every"], 10),
    pushEnabled: parsed.values.push === "1",
    slackWebhookUrl: parsed.values["slack-url"],
    verbose: parsed.values.verbose === "1",
    timeoutMs: parseInt(parsed.values.timeout, 10) * 1e3
  };
}

// src/runner.ts
import path3 from "node:path";

// src/session.ts
import { spawn } from "node:child_process";
import path2 from "node:path";
import fs from "node:fs";
import { Writable, Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import * as acp from "@agentclientprotocol/sdk";

// src/error.ts
var CommandTimeoutError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandTimeoutError";
  }
};

// src/session.ts
var DIRNAME = path2.dirname(fileURLToPath(import.meta.url));
function resolveAcpBinary() {
  const local = path2.join(
    DIRNAME,
    "node_modules",
    ".bin",
    "claude-agent-acp"
  );
  return fs.existsSync(local) ? local : "claude-agent-acp";
}
var ACP_BINARY = resolveAcpBinary();
function spawnAgent(apiKey, model) {
  const proc = spawn(ACP_BINARY, [], {
    stdio: ["pipe", "pipe", "inherit"],
    env: {
      ...process.env,
      ACP_PERMISSION_MODE: "bypassPermissions",
      ANTHROPIC_BASE_URL: "https://api.deepseek.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_MODEL: model,
      ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-v4-pro",
      ANTHROPIC_DEFAULT_SONNET_MODEL: model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: model,
      CLAUDE_CODE_SUBAGENT_MODEL: model,
      CLAUDE_CODE_EFFORT_LEVEL: "xhigh"
    }
  });
  proc.on("error", (err) => {
    if (err.code === "ENOENT") {
      console.error("");
      console.error("\u30A8\u30E9\u30FC: claude-agent-acp \u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002");
      console.error("conver.js \u306F\u5916\u90E8\u30D7\u30ED\u30BB\u30B9\u3068\u3057\u3066 claude-agent-acp \u3092\u8D77\u52D5\u3059\u308B\u5FC5\u8981\u304C\u3042\u308A\u307E\u3059\u3002");
      console.error("");
      console.error("\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB\u65B9\u6CD5:");
      console.error("  npm install -g @agentclientprotocol/claude-agent-acp");
      console.error("");
      console.error("\u307E\u305F\u306F\u30AB\u30EC\u30F3\u30C8\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\u306B\u30A4\u30F3\u30B9\u30C8\u30FC\u30EB:");
      console.error("  npm install @agentclientprotocol/claude-agent-acp");
      console.error("");
      process.exit(1);
    }
  });
  proc.stdin?.on("error", () => {
  });
  proc.stdout?.on("error", () => {
  });
  proc.on("close", () => {
  });
  const stream = acp.ndJsonStream(
    Writable.toWeb(proc.stdin),
    Readable.toWeb(proc.stdout)
  );
  return { proc, stream };
}
function buildClientApp() {
  return acp.client({ name: "conver" }).onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
    const option = params.options.find(
      (o) => o.kind === "allow_always" || o.kind === "allow_once"
    );
    return {
      outcome: {
        outcome: "selected",
        optionId: option?.optionId ?? params.options[0]?.optionId ?? ""
      }
    };
  }).onNotification(acp.methods.client.session.update, () => {
  });
}
async function createSession(cwd, apiKey, model) {
  const { proc, stream } = spawnAgent(apiKey, model);
  const app = buildClientApp();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("ACP\u30BB\u30C3\u30B7\u30E7\u30F3\u521D\u671F\u5316\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8"));
    }, 3e4);
    app.connectWith(stream, async (ctx) => {
      try {
        await ctx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {}
        });
        const session = await ctx.buildSession(cwd).start();
        clearTimeout(timeout);
        resolve({
          proc,
          stream,
          sessionId: session.sessionId,
          ctx,
          session
        });
      } catch (err) {
        clearTimeout(timeout);
        proc.stdin?.end();
        reject(err);
      }
    });
  });
}
async function withSession(cwd, apiKey, model, fn) {
  const session = await createSession(cwd, apiKey, model);
  try {
    return await fn(session);
  } finally {
    disposeSession(session);
  }
}
async function runCommand(acpSession, command, options) {
  void acpSession.session.prompt(command);
  const startTime = Date.now();
  let fullResponse = "";
  for (; ; ) {
    if (Date.now() - startTime >= options.timeoutMs) {
      throw new CommandTimeoutError(
        `\u30B3\u30DE\u30F3\u30C9\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F: ${command} (${options.timeoutMs}ms)`
      );
    }
    const msg = await acpSession.session.nextUpdate();
    if (!msg) {
      continue;
    }
    if (msg.kind === "stop") {
      fullResponse = msg.response?.toString() ?? "";
      break;
    }
    if (options.verbose && msg.kind === "session_update" && msg.update?.sessionUpdate === "agent_message_chunk") {
      const text = msg.update.content?.text ?? "";
      process.stdout.write(text);
    }
  }
  return fullResponse;
}
function disposeSession(acpSession) {
  try {
    acpSession.session.dispose();
  } catch {
  }
  try {
    acpSession.proc.stdin?.end();
  } catch {
  }
  acpSession.proc.kill();
}

// src/notifier.ts
import http from "node:http";
import https from "node:https";
import { execSync } from "node:child_process";
import { realpathSync } from "node:fs";
function getUsername() {
  try {
    return execSync("whoami", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}
function getAbsolutePath(relativePath) {
  try {
    return realpathSync(relativePath);
  } catch {
    return relativePath;
  }
}
function classifyError(error) {
  if (error.name === "CommandTimeoutError") return "CommandTimeout";
  if (error.message?.includes("permission")) return "PermissionDenied";
  if (error.message?.includes("ENOENT")) return "FileNotFound";
  return "Unknown";
}
function buildSlackMessage(context) {
  const absolutePath = getAbsolutePath(context.ticketsPath);
  const username = getUsername();
  const errorType = classifyError(context.error);
  const text = [
    "\u25A0 conver \u30A8\u30E9\u30FC\u5831\u544A",
    `\u2022 Tickets.json: \`${absolutePath}\``,
    `\u2022 \u30E6\u30FC\u30B6\u30FC: \`${username}\``,
    `\u2022 \u30C1\u30B1\u30C3\u30C8: ${context.ticketId}`,
    `\u2022 \u5DE5\u7A0B: ${context.phase}`,
    `\u2022 \u30A8\u30E9\u30FC\u7A2E\u5225: ${errorType}`,
    "\u2022 \u8AAC\u660E:",
    `  > ${context.error.message || "\u8A73\u7D30\u60C5\u5831\u306A\u3057"}`
  ].join("\n");
  return {
    username: "conver",
    icon_emoji: ":x:",
    text
  };
}
function sendSlackOnce(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = new URLSearchParams();
    body.append("payload", JSON.stringify(payload));
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
          "Content-Type": "application/x-www-form-urlencoded"
        }
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`Slack API returned ${res.statusCode}`));
        }
      }
    );
    req.on("error", (err) => reject(err));
    req.write(body.toString());
    req.end();
  });
}
async function sendSlackWithRetry(webhookUrl, payload, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await sendSlackOnce(webhookUrl, payload);
      return;
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = 1e3 * attempt;
        await new Promise((r) => setTimeout(r, delay));
      } else {
        console.error(
          `[conver] Slack\u901A\u77E5\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08${maxRetries}\u56DE\u8A66\u884C\uFF09: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
}
async function sendSlackError(webhookUrl, context) {
  const payload = buildSlackMessage(context);
  await sendSlackWithRetry(webhookUrl, payload);
}

// src/tickets.ts
import { readFileSync } from "node:fs";
function loadPendingTickets(ticketsPath) {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data = JSON.parse(raw);
  return data.phases.flatMap(
    (phase) => phase.tickets.map((t) => ({ ...t, phaseId: phase.id }))
  ).filter((t) => t.status !== "reviewed");
}
function checkAllReviewed(ticketsPath) {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data = JSON.parse(raw);
  for (const phase of data.phases) {
    for (const ticket of phase.tickets) {
      if (ticket.status !== "reviewed") {
        return false;
      }
    }
  }
  return true;
}
function getSourceFromTickets(ticketsPath) {
  const raw = readFileSync(ticketsPath, "utf-8");
  const data = JSON.parse(raw);
  if (data.metadata?.source) {
    return data.metadata.source;
  }
  return ticketsPath;
}

// src/runner.ts
function getCurrentPhase(error) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("make-ticket")) return "make-ticket";
  if (message.includes("plan-ticket")) return "plan-ticket";
  if (message.includes("start-ticket")) return "start-ticket";
  if (message.includes("review-ticket")) return "review-ticket";
  if (message.includes("resolve-ticket")) return "resolve-ticket";
  if (message.includes("find-omissions")) return "find-omissions";
  if (message.includes("jpush-branch")) return "jpush-branch";
  return "unknown";
}
function toRunCommandOptions(options) {
  return {
    timeoutMs: options.timeoutMs,
    verbose: options.verbose
  };
}
async function runLoop(options) {
  const cwd = path3.resolve(process.cwd());
  const pending = loadPendingTickets(options.ticketsPath).sort((a, b) => a.id - b.id);
  const target = pending.slice(0, options.maxCount);
  let reviewedCount = 0;
  for (const ticket of target) {
    const ticketId = `P${ticket.phaseId}-${ticket.id}`;
    const runOptions = toRunCommandOptions(options);
    console.log(`
\u25B6 [${ticketId}] ${ticket.title}`);
    try {
      console.log("  make/plan/start...");
      await withSession(cwd, options.apiKey, options.model, async (session) => {
        await runCommand(session, `/make-ticket ${ticketId}`, runOptions);
        await runCommand(session, `/plan-ticket ${ticketId}`, runOptions);
        await runCommand(session, `/start-ticket ${ticketId}`, runOptions);
      });
      console.log("  \u2705 make/plan/start \u5B8C\u4E86");
      console.log("  review...");
      await withSession(cwd, options.apiKey, options.model, async (session) => {
        await runCommand(session, `/review-ticket ${ticketId}`, runOptions);
      });
      console.log("  \u2705 review \u5B8C\u4E86");
      reviewedCount++;
      if (reviewedCount % options.resolveEvery === 0) {
        console.log(`  resolve (${reviewedCount}\u4EF6\u5B8C\u4E86)...`);
        await withSession(cwd, options.apiKey, options.model, async (session) => {
          await runCommand(session, `/resolve-ticket ${cwd}`, runOptions);
        });
        console.log("  \u2705 resolve \u5B8C\u4E86");
        if (options.pushEnabled) {
          try {
            console.log("  jpush-branch...");
            await withSession(cwd, options.apiKey, options.model, async (session) => {
              await runCommand(session, "/jpush-branch", runOptions);
            });
            console.log("  \u2705 jpush-branch \u5B8C\u4E86");
          } catch (pushError) {
            await sendSlackError(options.slackWebhookUrl, {
              ticketId,
              phase: "jpush-branch",
              error: pushError,
              ticketsPath: options.ticketsPath
            });
            throw pushError;
          }
        }
        if (checkAllReviewed(options.ticketsPath)) {
          console.log("  \u{1F3AF} \u5168\u30C1\u30B1\u30C3\u30C8 reviewed \u2192 find-omissions...");
          const source = getSourceFromTickets(options.ticketsPath);
          await withSession(cwd, options.apiKey, options.model, async (session) => {
            await runCommand(
              session,
              `/find-omissions-for-next-rfc ${source}`,
              runOptions
            );
          });
          console.log("  \u2705 find-omissions \u5B8C\u4E86");
        }
      }
    } catch (error) {
      const err = error;
      await sendSlackError(options.slackWebhookUrl, {
        ticketId,
        phase: getCurrentPhase(err),
        error: err,
        ticketsPath: options.ticketsPath
      });
      console.error(`
\u274C \u30A8\u30E9\u30FC\u767A\u751F: ${err.message}`);
      if (err.message.includes("connect") || err.message.includes("initialize")) {
        console.error("");
        console.error("ACP \u30BB\u30C3\u30B7\u30E7\u30F3\u306E\u521D\u671F\u5316\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u8003\u3048\u3089\u308C\u308B\u539F\u56E0:");
        console.error("  - DeepSeek API \u30AD\u30FC\u304C\u6B63\u3057\u304F\u306A\u3044");
        console.error("  - \u30CD\u30C3\u30C8\u30EF\u30FC\u30AF\u63A5\u7D9A\u306E\u554F\u984C");
        console.error("  - claude-agent-acp \u306E\u30D0\u30FC\u30B8\u30E7\u30F3\u4E0D\u4E00\u81F4");
        console.error("\u74B0\u5883\u5909\u6570 ANTHROPIC_BASE_URL \u304C\u6B63\u3057\u3044\u304B\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      }
      process.exit(1);
    }
  }
  console.log(`
\u2705 \u5168${target.length}\u30C1\u30B1\u30C3\u30C8\u306E\u51E6\u7406\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F\u3002`);
}

// src/conver.ts
process.on("uncaughtException", (err) => {
  if (err.code !== "EPIPE") {
    console.error("\n\u274C \u4E88\u671F\u3057\u306A\u3044\u30A8\u30E9\u30FC:", err.message);
  }
});
process.on("unhandledRejection", (err) => {
  if (err.code !== "EPIPE") {
    console.error("\n\u274C \u672A\u51E6\u7406\u306E rejected promise:", err.message);
  }
});
async function main() {
  const options = parseCliOptions(process.argv);
  console.log("conver.js \u2014 \u30C1\u30B1\u30C3\u30C8\u51E6\u7406\u3092\u958B\u59CB\u3057\u307E\u3059");
  console.log("  model=%s", options.model);
  console.log("  ticketsPath=%s", options.ticketsPath);
  console.log("  maxCount=%d", options.maxCount);
  console.log("  resolveEvery=%d", options.resolveEvery);
  console.log("  pushEnabled=%s", options.pushEnabled);
  console.log("  timeoutMs=%d", options.timeoutMs);
  await runLoop(options);
}
main().catch((err) => {
  console.error("\u81F4\u547D\u7684\u30A8\u30E9\u30FC:", err.message);
  process.exit(1);
});
export {
  main
};
