// session.ts — ACP セッション管理
// claude-agent-acp の起動から dispose までの全ライフサイクルを管理する。
//
// 権限ハンドリングは二重の安全策を取る：
//   1) 環境変数 ACP_PERMISSION_MODE=bypassPermissions
//   2) onRequest(session/request_permission) ハンドラで allow_always 自動選択
//
// dispose エラーは握りつぶす — セッション破棄の失敗がプロセス全体の停止を
// 引き起こしてはならない。
//
// 注: @agentclientprotocol/sdk ^1.0.0 の型名は以下に基づく。
// 旧バージョンでは acp.NdJsonStream / acp.MonadClient という型名が
// 使用されていたが、SDK 更新に伴い現在の型名（acp.Stream / acp.ClientApp）
// に変更された。RFC-001（RFC_ROOT.md）も本実装に追従している。

import { spawn, type ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import { CommandTimeoutError } from "./error.js";

// claude-agent-acp バイナリ名 — PATH に存在することを前提とする
const ACP_BINARY = "claude-agent-acp";

// ACP セッションの状態を保持するインターフェース
export interface AcpSession {
  proc: ChildProcess;
  stream: acp.Stream;
  sessionId: string;
  ctx: acp.ClientContext;
  session: acp.ActiveSession;
}

// runCommand のオプション
export interface RunCommandOptions {
  timeoutMs: number;
  verbose: boolean;
}

// DeepSeek V4 の Anthropic 互換エンドポイント経由で claude-agent-acp 子プロセスを起動する
//
// env に注入する環境変数：
//   ACP_PERMISSION_MODE=bypassPermissions — 権限確認をバイパス
//   ANTHROPIC_BASE_URL=... — DeepSeek の Anthropic 互換エンドポイント
//   ANTHROPIC_AUTH_TOKEN — DeepSeek API キー
//   ANTHROPIC_MODEL / ANTHROPIC_DEFAULT_* — 使用モデル指定
//   CLAUDE_CODE_SUBAGENT_MODEL — サブエージェントモデル
//   CLAUDE_CODE_EFFORT_LEVEL=xhigh — 推論努力レベル
export function spawnAgent(
  apiKey: string,
  model: string,
): { proc: ChildProcess; stream: acp.Stream } {
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
      CLAUDE_CODE_EFFORT_LEVEL: "xhigh",
    },
  });

  // Node.js Stream → Web Stream 変換 → ACP ndjson Stream
  // Writable.toWeb / Readable.toWeb は Node.js 26 の型では any を返すため、
  // ndJsonStream が期待する型にキャストする
  const stream = acp.ndJsonStream(
    Writable.toWeb(proc.stdin!) as unknown as WritableStream<Uint8Array>,
    Readable.toWeb(proc.stdout!) as unknown as ReadableStream<Uint8Array>,
  );

  return { proc, stream };
}

// ClientApp を構築し、permission 自動承認ハンドラを設定する
//
// ACP の session/request_permission に対して allow_always を自動選択する。
// このハンドラは環境変数 ACP_PERMISSION_MODE が効かないケースへの
// 二重の安全策として機能する。
export function buildClientApp(): acp.ClientApp {
  return acp
    .client({ name: "conver" })
    .onRequest(acp.methods.client.session.requestPermission, ({ params }) => {
      const option = params.options.find(
        (o) => o.kind === "allow_always" || o.kind === "allow_once",
      );
      return {
        outcome: {
          outcome: "selected" as const,
          optionId: option!.optionId,
        },
      };
    })
    .onNotification(acp.methods.client.session.update, () => {});
}

// ACP セッションを生成する
//
// 1. spawnAgent() で claude-agent-acp 子プロセス + stream 起動
// 2. initialize でプロトコルバージョン合意
// 3. buildSession(cwd).start() でセッション開始
// 4. 30秒の初期化タイムアウト（超過時は proc.kill + reject）
export async function createSession(
  cwd: string,
  apiKey: string,
  model: string,
): Promise<AcpSession> {
  const { proc, stream } = spawnAgent(apiKey, model);
  const app = buildClientApp();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("ACPセッション初期化タイムアウト"));
    }, 30000);

    app.connectWith(stream, async (ctx) => {
      try {
        await ctx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {} as never,
        });

        const session = await ctx.buildSession(cwd).start();
        clearTimeout(timeout);

        resolve({
          proc,
          stream,
          sessionId: session.sessionId,
          ctx,
          session,
        });
      } catch (err) {
        clearTimeout(timeout);
        proc.kill();
        reject(err);
      }
    });
  });
}

// createSession → fn → finally disposeSession を保証するヘルパー
//
// try/finally でセッションの確率な破棄を保証する。
// fn が例外を throw した場合も disposeSession は実行される。
export async function withSession<T>(
  cwd: string,
  apiKey: string,
  model: string,
  fn: (session: AcpSession) => Promise<T>,
): Promise<T> {
  const session = await createSession(cwd, apiKey, model);
  try {
    return await fn(session);
  } finally {
    disposeSession(session);
  }
}

// ACP セッションでコマンドを実行する
//
// prompt でコマンドを送信後、nextUpdate でストリーミング更新を読み取る。
// verbose モード時は agent_message_chunk を stdout に書き出す。
// timeoutMs 超過時は CommandTimeoutError を throw する。
export async function runCommand(
  acpSession: AcpSession,
  command: string,
  options: RunCommandOptions,
): Promise<string> {
  // prompt() は非同期で開始し、nextUpdate() でストリーミング更新を
  // 読み取るために await しない（意図的）
  void acpSession.session.prompt(command);

  const startTime = Date.now();
  let fullResponse = "";

  for (;;) {
    if (Date.now() - startTime >= options.timeoutMs) {
      throw new CommandTimeoutError(
        `コマンドがタイムアウトしました: ${command} (${options.timeoutMs}ms)`,
      );
    }

    const msg = await acpSession.session.nextUpdate();
    // msg が空（初期化未完など）の場合はスキップする
    if (!msg) {
      continue;
    }

    if (msg.kind === "stop") {
      fullResponse = msg.response?.toString() ?? "";
      break;
    }

    // verbose モード: agent_message_chunk をリアルタイム出力
    if (
      options.verbose &&
      msg.kind === "session_update" &&
      msg.update?.sessionUpdate === "agent_message_chunk"
    ) {
      const text = (msg.update.content as { text?: string })?.text ?? "";
      process.stdout.write(text);
    }
  }

  return fullResponse;
}

// ACP セッションを破棄する
//
// session.dispose() — ActiveSession の更新ルーティングを停止
// proc.kill() — claude-agent-acp 子プロセスを終了
//
// dispose() のエラーは握りつぶす — セッション破棄失敗が原因で
// 後続の処理（proc.kill 等）が阻害されてはならない。
export function disposeSession(acpSession: AcpSession): void {
  try {
    acpSession.session.dispose();
  } catch {
    // dispose エラーは無視する
  }
  acpSession.proc.kill();
}
