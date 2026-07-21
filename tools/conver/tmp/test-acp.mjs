#!/usr/bin/env node
/**
 * test-acp.mjs — ACP 経由で Claude Code にリクエストを送り、全応答を詳細表示する
 *
 * 使用法:
 *   cd /Users/shyme/shyme/zasso/tools/conver
 *   node tmp/test-acp.mjs               # デフォルトモデル (deepseek-anthropic/deepseek-v4-flash)
 *   node tmp/test-acp.mjs -m ternary-bonsai-27b
 *
 * 環境変数は zed-lmpx-launch.sh と同一のものを子プロセスに注入する（モデルは -m で上書き可能）。
 * これにより Zed 経由と同じ設定で Claude Code が起動され、Zed では隠れて
 * しまうエラーの詳細を取得できる。
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";

// ── Paths ──────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");
const ACP_BINARY = join(PROJECT_ROOT, "node_modules", ".bin", "claude-agent-acp");

// ── CLI 引数パース ─────────────────────────────────────────────────
function parseCliArgs() {
  const args = process.argv.slice(2);
  let model = "deepseek-anthropic/deepseek-v4-flash"; // デフォルト

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "-m" && i + 1 < args.length) {
      model = args[++i];
    } else if (args[i] === "-h" || args[i] === "--help") {
      console.log("Usage: node tmp/test-acp.mjs [-m <model>]");
      console.log("  -m <model>   Model name (default: deepseek-anthropic/deepseek-v4-flash)");
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${args[i]}`);
      console.error("Usage: node tmp/test-acp.mjs [-m <model>]");
      process.exit(1);
    }
  }
  return { model };
}

// ── Bifrost 向け環境変数（zed-lmpx-launch.sh と同一） ──────────────
function buildBifrostEnv(model) {
  return {
    ...process.env,
    ANTHROPIC_BASE_URL: "http://127.0.0.1:8080/anthropic",
    ANTHROPIC_AUTH_TOKEN: "dummy",
    ANTHROPIC_MODEL: model,
    ANTHROPIC_DEFAULT_OPUS_MODEL: "deepseek-anthropic/deepseek-v4-pro",
    ANTHROPIC_DEFAULT_SONNET_MODEL: model,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "ternary-bonsai-27b",
    CLAUDE_CODE_SUBAGENT_MODEL: model,
    CLAUDE_CODE_EFFORT_LEVEL: "high",
    ACP_PERMISSION_MODE: "bypassPermissions",
  };
}

// ── EPIPE をプロセスレベルで握りつぶす ───────────────────────────
// acp.ndJsonStream 内部の Web Stream ラッパーが子プロセス切断後に
// 発生させる EPIPE を確実に抑制する。3段階の防御:
//   1. stdin/stdout の error ハンドラ（session.ts と同一）
//   2. unhandledRejection（Web Stream 内部の reject）
//   3. uncaughtException（それでも漏れた場合の最終手段）
process.on("unhandledRejection", (reason) => {
  if (reason?.code === "EPIPE") return;
});
process.on("uncaughtException", (err) => {
  if (err?.code === "EPIPE") return;
  console.error("\n[UNCAUGHT EXCEPTION]", err);
});
function formatTimestamp() {
  return new Date().toISOString();
}

function log(level, label, data) {
  const prefix = `[${formatTimestamp()}] [${level}]`;
  if (typeof data === "string") {
    console.log(`${prefix} ${label}: ${data}`);
  } else {
    console.log(`${prefix} ${label}:`);
    console.log(JSON.stringify(data, null, 2));
  }
}

// ── メイン ──────────────────────────────────────────────────────────
async function main() {
  // 0. CLI 引数パース
  const { model } = parseCliArgs();

  console.log("=".repeat(72));
  console.log("  test-acp.mjs — ACP Session Test with Bifrost Config");
  console.log("=".repeat(72));
  console.log();

  // 1. 起動設定を表示
  console.log("── 1. Startup Configuration ──");
  console.log(`  Model:      ${model}`);
  console.log(`  ACP Binary: ${ACP_BINARY}`);
  console.log(`  exists:     ${existsSync(ACP_BINARY) ? "yes" : "NO (will fail)"}`);
  console.log(`  CWD:        ${PROJECT_ROOT}`);
  console.log();
  console.log("  Environment variables for child process:");
  const bifrostEnv = buildBifrostEnv(model);
  for (const key of [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "CLAUDE_CODE_SUBAGENT_MODEL",
    "CLAUDE_CODE_EFFORT_LEVEL",
    "ACP_PERMISSION_MODE",
  ]) {
    console.log(`    ${key}=${bifrostEnv[key] || "(unset)"}`);
  }
  console.log();

  // 2. claude-agent-acp を起動
  console.log("── 2. Spawning claude-agent-acp ──");
  console.log();

  const agentProc = spawn(ACP_BINARY, [], {
    // stderr は ignore: 子プロセス終了時の EPIPE ノイズを抑制する
    stdio: ["pipe", "pipe", "ignore"],
    env: bifrostEnv,
    cwd: PROJECT_ROOT,
  });

  // 子プロセスのエラーを監視
  agentProc.on("error", (err) => {
    log("FATAL", "Child process error", err.message);
    console.error("  Stack:", err.stack);
  });

  agentProc.on("exit", (code, signal) => {
    log("INFO", "Child process exited", { code: code ?? "null", signal: signal ?? "null" });
  });

  // パイプエラーを完全に握りつぶす（session.ts と同一パターン）
  // 子プロセス終了後の後始末で EPIPE が発生するが、上位のエラー処理で
  // 既にカバーされているため無視してよい
  agentProc.stdin?.on("error", () => {});
  agentProc.stdout?.on("error", () => {});

  // 3. ACP 接続
  console.log("── 3. ACP Connection ──");
  const input = Writable.toWeb(agentProc.stdin);
  const output = Readable.toWeb(agentProc.stdout);
  const stream = acp.ndJsonStream(input, output);

  try {
    const result = await acp
      .client({ name: "test-acp" })
      .onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
        const allowAlways = params.options.find(
          (o) => o.kind === "allow_always" || o.kind === "allow_once",
        );
        const selected = allowAlways?.name ?? params.options[0]?.name ?? "fallback";
        log("PERM", "Auto-approved permission", {
          toolCall: params.toolCall?.title ?? "(unknown)",
          selected,
        });
        return {
          outcome: {
            outcome: "selected",
            optionId: allowAlways?.optionId ?? params.options[0]?.optionId ?? "",
          },
        };
      })
      .onRequest(acp.methods.client.fs.writeTextFile, () => ({}))
      .onRequest(acp.methods.client.fs.readTextFile, () => ({ content: "" }))
      .connectWith(stream, async (ctx) => {
        // 3a. Initialize
        console.log("  Initializing ACP connection...");
        const initResult = await ctx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: true, writeTextFile: true },
          },
        });
        console.log(`  ✅ Connected (protocol v${initResult.protocolVersion})`);
        console.log();

        // 3b. Build and start session
        console.log("── 4. Session ──");
        const sessionDir = resolve(PROJECT_ROOT, "tmp");
        const session = await ctx.buildSession(sessionDir).start();
        console.log(`  Session ID: ${session.sessionId}`);
        console.log();

        // 3c. Send prompt
        console.log("── 5. Sending Prompt ──");
        const prompt = "テストです。Hello とだけ答えてください。";
        console.log(`  Prompt: "${prompt}"`);
        console.log();
        console.log("── 6. Response (streaming) ──");

        void session.prompt(prompt);

        // 3d. Read streaming updates
        let fullResponse = "";
        let stopReason = "";
        let responseMetadata = null;
        let updateCount = 0;
        const errors = [];

        for (;;) {
          const msg = await session.nextUpdate();
          if (!msg) continue;

          updateCount++;

          if (msg.kind === "stop") {
            // response はオブジェクトの場合があるので toString() ではなく
            // typeof で分岐する
            const raw = msg.response;
            if (typeof raw === "string") {
              fullResponse = raw;
            } else if (raw !== null && raw !== undefined) {
              // ContentBlock 配列か {content, ...} 形式の場合、テキスト内容を抽出
              fullResponse = JSON.stringify(raw, null, 2);
            } else {
              fullResponse = "";
            }
            stopReason = msg.stopReason ?? "";
            responseMetadata = msg.metadata ?? null;
            log("STOP", `Stop (reason: ${stopReason})`, {
              responseLength: fullResponse.length,
              stopReason,
              responseType: raw === null ? "null" : typeof raw,
            });
            break;
          }

          if (msg.kind === "notification") {
            const update = msg.notification?.update;
            if (!update) continue;

            switch (update.sessionUpdate) {
              case "agent_message_chunk":
                if (update.content?.type === "text") {
                  const text = update.content.text ?? "";
                  process.stdout.write(text);
                  fullResponse += text;
                } else {
                  log("CHUNK", "Non-text chunk", update.content);
                }
                break;
              case "tool_call":
                log("TOOL", "Tool call", {
                  title: update.title,
                  status: update.status,
                  toolCallId: update.toolCallId,
                });
                break;
              case "tool_call_update":
                log("TOOL-UPD", "Tool call update", {
                  toolCallId: update.toolCallId,
                  status: update.status,
                });
                break;
              case "plan":
                log("PLAN", "Plan update", {});
                break;
              case "error": {
                const errDetail = {
                  message: update.message,
                  code: update.code,
                  data: update.data,
                };
                errors.push(errDetail);
                log("ERROR", "Session error", errDetail);
                break;
              }
              default:
                log("UPDATE", `Session update: ${update.sessionUpdate}`, {});
                break;
            }
          }
        }

        console.log("\n");
        console.log("── 7. Response Summary ──");
        console.log(`  Total updates received:  ${updateCount}`);
        console.log(`  Stop reason:             ${stopReason}`);
        console.log(`  Response length:         ${fullResponse.length} chars`);
        console.log(`  Errors encountered:      ${errors.length}`);
        console.log();

        console.log("── 8. Full Response Text ──");
        console.log("  ```");
        console.log(fullResponse);
        console.log("  ```");
        console.log();

        if (errors.length > 0) {
          console.log("── 9. Error Details ──");
          errors.forEach((err, i) => {
            console.log(`  Error #${i + 1}:`);
            console.log(`    message: ${err.message}`);
            console.log(`    code:    ${err.code}`);
            console.log(`    data:    ${JSON.stringify(err.data, null, 4)}`);
          });
          console.log();
        }

        if (responseMetadata) {
          console.log("── 10. Response Metadata ──");
          console.log(JSON.stringify(responseMetadata, null, 2));
          console.log();
        }

        return {
          response: fullResponse,
          stopReason,
          errors,
          metadata: responseMetadata,
          updateCount,
        };
      });

    console.log("── 11. Result ──");
    console.log(`  Status:       ✅ Completed`);
    console.log(`  Stop reason:  ${result.stopReason}`);
    console.log(`  Error count:  ${result.errors?.length ?? 0}`);
    console.log();
  } catch (err) {
    console.log();
    console.log("── !! EXCEPTION !! ──");
    console.log(`  Type:    ${err.constructor?.name ?? typeof err}`);
    console.log(`  Message: ${err.message ?? String(err)}`);
    if (err.stack) {
      console.log(`  Stack:`);
      console.log(err.stack);
    }
    if (err.cause) {
      console.log(`  Cause:   ${JSON.stringify(err.cause, null, 2)}`);
    }
    const extraKeys = Object.keys(err).filter(
      (k) => !["name", "message", "stack", "cause"].includes(k),
    );
    if (extraKeys.length > 0) {
      console.log(`  Extra properties:`);
      for (const key of extraKeys) {
        console.log(`    ${key}: ${JSON.stringify(err[key], null, 4)}`);
      }
    }
    console.log();
  } finally {
    // 子プロセスを正順で後始末: stdin → end → 子プロセスの自然終了
    try { agentProc.stdin?.end(); } catch { /* ignore */ }
    try { agentProc.kill(); } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
});
