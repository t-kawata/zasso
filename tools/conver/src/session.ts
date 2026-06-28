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
import path from "node:path";
import fs from "node:fs";
import { Writable, Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import * as acp from "@agentclientprotocol/sdk";
import { CommandTimeoutError } from "./error.js";

// claude-agent-acp バイナリの検索
//
// 同一ディレクトリの node_modules/.bin/ を優先し、なければ PATH からの
// 解決にフォールバックする。これにより npm install でローカルインス
// トールされたバイナリが PATH に追加されていなくても動作する。
const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

function resolveAcpBinary(): string {
  // tsc 出力時は DIRNAME = dist/、バンドル時はプロジェクトルート
  const candidates = [
    path.join(DIRNAME, "node_modules", ".bin", "claude-agent-acp"),
    path.join(DIRNAME, "..", "node_modules", ".bin", "claude-agent-acp"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return "claude-agent-acp";
}

const ACP_BINARY = resolveAcpBinary();

// ACP セッションの状態を保持するインターフェース
export interface AcpSession {
  proc: ChildProcess;
  stream: acp.Stream;
  sessionId: string;
  ctx: acp.ClientContext;
  session: acp.ActiveSession;
  /** connectWith 経由で開いた接続（disposeSession で close する） */
  connection: { close: (error?: unknown) => void };
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
//   CLAUDE_CODE_EFFORT_LEVEL=high — 推論努力レベル
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
      CLAUDE_CODE_EFFORT_LEVEL: "high",
    },
  });

  // claude-agent-acp の起動失敗（ENOENT）のみ捕捉する。
  // 起動後のエラー（EPIPE など）は createSession / runUntil が適切に処理
  // するため、ここでは process.exit を呼ばない（セッション終了時のパイプ
  // 切断エラーでプロセス全体が強制終了するのを防ぐ）。
  proc.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      console.error("");
      console.error("エラー: claude-agent-acp が見つかりません。");
      console.error("conver.js は外部プロセスとして claude-agent-acp を起動する必要があります。");
      console.error("");
      console.error("インストール方法:");
      console.error("  npm install -g @agentclientprotocol/claude-agent-acp");
      console.error("");
      console.error("またはカレントディレクトリにインストール:");
      console.error("  npm install @agentclientprotocol/claude-agent-acp");
      console.error("");
      process.exit(1);
    }
    // 起動後のエラーは無視する（createSession / runUntil がハンドリングする）
  });

  // パイプのエラーをサイレントに抑止 — 子プロセス終了時の EPIPE などは
  // 上位のエラー処理で既にカバーされている。
  // 各パイプに対して2重にエラーハンドラを設定し、どのレベルでエラーが
  // 発生しても確実に捕捉する。
  proc.stdin?.on("error", () => {});
  proc.stdout?.on("error", () => {});

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
          optionId: option?.optionId ?? params.options[0]?.optionId ?? "",
        },
      };
    })
    .onNotification(acp.methods.client.session.update, () => {});
}

// withSession — ACP セッションのライフサイクルを管理する
//
// 1. spawnAgent() で claude-agent-acp 子プロセス + ndjson stream 起動
// 2. connectWith() で接続を開き、initialize → buildSession を実行
// 3. fn(session) を connectWith のコールバック内部で実行（接続が閉じる前）
// 4. finally でセッションと子プロセスをクリーンアップ
//
// 注意: connectWith の runUntil はコールバック完了後に接続を閉じるため、
// fn は必ずコールバック内部で実行しなければならない。
export async function withSession<T>(
  cwd: string,
  apiKey: string,
  model: string,
  fn: (session: AcpSession) => Promise<T>,
): Promise<T> {
  const { proc, stream } = spawnAgent(apiKey, model);
  const app = buildClientApp();

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("ACPセッション初期化タイムアウト"));
    }, 30000);

    // ★ acp-test.mjs と同じ connectWith パターン
    //    fn をコールバック内部で実行し、接続が閉じられる前に完了させる
    app.connectWith(stream, async (ctx) => {
      let activeSession: acp.ActiveSession | null = null;
      try {
        await ctx.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {} as never,
        });

        const s = await ctx.buildSession(cwd).start();
        activeSession = s;
        clearTimeout(timeout);

        const acpSession: AcpSession = {
          proc,
          stream,
          sessionId: s.sessionId,
          ctx,
          session: s,
          connection: { close: () => { proc.stdin?.end(); proc.kill(); } },
        };

        resolve(await fn(acpSession));
      } catch (err) {
        reject(err);
      } finally {
        try { activeSession?.dispose(); } catch { /* ignore */ }
        proc.stdin?.end();
        proc.kill();
      }
    });
  });
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

    // verbose モード: agent_message_chunk を出力
    // 1回のメッセージが完了した（句点等で終わる）タイミングで改行する
    if (
      options.verbose &&
      msg.kind === "session_update" &&
      msg.update?.sessionUpdate === "agent_message_chunk"
    ) {
      const text = (msg.update.content as { text?: string })?.text ?? "";
      if (text) {
        process.stdout.write(text);
        // 句点・改行・閉じ括弧などメッセージの区切りで改行する
        if (/[。．\n！？）」】]/.test(text)) {
          process.stdout.write("\n");
        }
      }
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
  try {
    acpSession.connection.close();
  } catch {
    // close エラーは無視する
  }
  acpSession.proc.stdin?.end();
  acpSession.proc.kill();
}
