// session.test.ts — session.ts のユニットテスト
//
// テスト方針:
//   runCommand / disposeSession はモック AcpSession で検証可能。
//   buildClientApp はインストール済みの @agentclientprotocol/sdk を実際に使用。
//   spawnAgent / createSession は claude-agent-acp バイナリ依存のため test.sh で検証。
//   withSession は createSession 経由のため実際のセッションが必要 — エラーハンドリングのみ検証。
//
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildClientApp, runCommand, disposeSession } from "./session.js";
import type { AcpSession, RunCommandOptions } from "./session.js";
import { CommandTimeoutError } from "./error.js";

// --- モック用ヘルパー ---

/** AcpSession モックを生成する */
function mockSession(overrides?: Partial<AcpSession>): AcpSession {
  return {
    proc: { kill: () => {} } as any,
    stream: {} as any,
    sessionId: "mock-sid",
    ctx: {} as any,
    session: {
      sessionId: "mock-sid",
      prompt: () => {},
      nextUpdate: () => new Promise(() => {}),
      dispose: () => {},
    } as any,
    ...overrides,
  };
}

/** 指定された順序で nextUpdate が値を返すモック session */
function mockSessionWithUpdates(
  updates: Array<Record<string, unknown>>,
  promptImpl?: (cmd: string) => void,
) {
  let index = 0;
  return {
    sessionId: "mock-sid",
    prompt: promptImpl ?? (() => {}),
    nextUpdate: () => {
      if (index < updates.length) {
        return Promise.resolve(updates[index++]);
      }
      return new Promise(() => {}); // ブロック
    },
    dispose: () => {},
  };
}

// --- buildClientApp ---

describe("buildClientApp", () => {
  it("ClientApp インスタンスを返す", () => {
    const app = buildClientApp();
    assert.ok(app);
    assert.strictEqual(typeof app.connectWith, "function");
    assert.strictEqual(typeof app.onRequest, "function");
  });

  it("エラーなく構築できる", () => {
    assert.doesNotThrow(() => buildClientApp());
  });
});

// --- runCommand ---

describe("runCommand", () => {
  const baseOptions: RunCommandOptions = { timeoutMs: 5000, verbose: false };

  it("prompt → nextUpdate stop で fullResponse を返す", async () => {
    let promptArg = "";
    const session = mockSession({
      session: mockSessionWithUpdates(
        [{ kind: "stop", response: "result-ok" }],
        (cmd: string) => { promptArg = cmd as any; },
      ) as any,
    });

    const result = await runCommand(session, "/test-cmd", baseOptions);
    assert.strictEqual(result, "result-ok");
    assert.strictEqual(promptArg, "/test-cmd");
  });

  it("タイムアウト時に CommandTimeoutError を throw", async () => {
    const session = mockSession();
    await assert.rejects(
      () => runCommand(session, "/test", { timeoutMs: 0, verbose: false }),
      CommandTimeoutError,
    );
  });

  it("verbose=true 時 agent_message_chunk を出力", async () => {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string) => { lines.push(s); return true; }) as any;

    try {
      const session = mockSession({
        session: mockSessionWithUpdates([
          {
            kind: "session_update",
            update: { sessionUpdate: "agent_message_chunk", content: { text: "chunk1" } },
          },
          { kind: "stop", response: "" },
        ]) as any,
      });
      await runCommand(session, "/test", { timeoutMs: 5000, verbose: true });
      assert.strictEqual(lines.length, 1);
      assert.ok(lines[0]!.includes("chunk1"));
    } finally {
      process.stdout.write = orig;
    }
  });

  it("verbose=false 時 chunk を出力しない", async () => {
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((s: string) => { lines.push(s); return true; }) as any;

    try {
      const session = mockSession({
        session: mockSessionWithUpdates([
          { kind: "session_update", update: { sessionUpdate: "agent_message_chunk" } },
          { kind: "stop", response: "" },
        ]) as any,
      });
      await runCommand(session, "/test", { timeoutMs: 5000, verbose: false });
      assert.strictEqual(lines.length, 0);
    } finally {
      process.stdout.write = orig;
    }
  });
});

// --- disposeSession ---

describe("disposeSession", () => {
  it("session.dispose() と proc.kill() が呼ばれる", () => {
    let disposed = false;
    let killed = false;
    const session = mockSession({
      proc: { kill: () => { killed = true; } } as any,
      session: { sessionId: "s", prompt() {}, nextUpdate() { return new Promise(() => {}); }, dispose: () => { disposed = true; } } as any,
    });
    disposeSession(session);
    assert.strictEqual(disposed, true);
    assert.strictEqual(killed, true);
  });

  it("dispose() エラー時も proc.kill() が呼ばれる", () => {
    let killed = false;
    const session = mockSession({
      proc: { kill: () => { killed = true; } } as any,
      session: { sessionId: "s", prompt() {}, nextUpdate() { return new Promise(() => {}); }, dispose: () => { throw new Error("err"); } } as any,
    });
    disposeSession(session);
    assert.strictEqual(killed, true);
  });

  it("複数回呼び出しでもエラーにならない", () => {
    let disp = 0, kill = 0;
    const session = mockSession({
      proc: { kill: () => { kill++; } } as any,
      session: { sessionId: "s", prompt() {}, nextUpdate() { return new Promise(() => {}); }, dispose: () => { disp++; } } as any,
    });
    disposeSession(session);
    disposeSession(session);
    assert.strictEqual(disp, 2);
    assert.strictEqual(kill, 2);
  });
});
