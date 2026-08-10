// session.test.ts — session.ts のユニットテスト
//
// テスト方針:
//   runCommand / disposeSession はモック AcpSession で検証可能。
//   buildClientApp はインストール済みの @agentclientprotocol/sdk を実際に使用。
//   createSession（非公開）は claude-agent-acp バイナリ依存のため test.sh で検証。
//   withSession は createSession 経由のため実際のセッションが必要 — エラーハンドリングのみ検証。
//
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する。
import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  buildClientApp,
  runCommand,
  disposeSession,
  shutdownChildProcess,
  runSession,
} from "./session.js";
import type { AcpSession, RunCommandOptions } from "./session.js";
import { CommandTimeoutError } from "./error.js";

// --- モック用ヘルパー ---

/**
 * ChildProcess モックを生成する。
 * runCommand / shutdownChildProcess は proc.once / proc.off / proc.exitCode を
 * 使うため、EventEmitter を基底にしたモックが必要。
 */
// [::TICKET::] PX-149 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-149 --for-spec --no-implementation-order`.
function mockProc(overrides?: Record<string, unknown>): any {
  const proc = new EventEmitter() as any;
  proc.exitCode = null;
  proc.signalCode = null;
  proc.kill = () => {};
  proc.stdin = { end: () => {} };
  proc.stdout = { on: () => {} };
  return Object.assign(proc, overrides);
}

/** AcpSession モックを生成する */
// [::TICKET::] PX-149 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-149 --for-spec --no-implementation-order`.
function mockSession(overrides?: Partial<AcpSession>): AcpSession {
  return {
    proc: mockProc(),
    stream: {} as any,
    sessionId: "mock-sid",
    ctx: {} as any,
    session: {
      sessionId: "mock-sid",
      prompt: () => {},
      nextUpdate: () => new Promise(() => {}),
      dispose: () => {},
    } as any,
    connection: { close: () => {} },
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

  // C001: 子プロセスが stop 前に終了したら、タイムアウトを待たずに
  // command / exit code / signal を含むエラーで fail-fast する。
  // @verifies C001

  it("子プロセスが exit code 1 で終了するとタイムアウト前に reject する", async () => {
    const proc = mockProc();
    const session = mockSession({
      proc,
      session: {
        sessionId: "s",
// [::TICKET::] PX-149 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-149 --for-spec --no-implementation-order`.
        prompt() {},
        nextUpdate: () => new Promise(() => {}), // stop を返さずハングする
// [::TICKET::] PX-149 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-149 --for-spec --no-implementation-order`.
        dispose() {},
      } as any,
    });

    const pending = runCommand(session, "/resolve-ticket", {
      timeoutMs: 60_000,
      verbose: false,
    });
    setImmediate(() => proc.emit("exit", 1, null));

    await assert.rejects(pending, (err: Error) => {
      assert.ok(err.message.includes("/resolve-ticket"));
      assert.ok(err.message.includes("1"));
      return true;
    });
  });

  it("子プロセスが signal で終了すると signal を含むエラーで reject する", async () => {
    const proc = mockProc();
    const session = mockSession({
      proc,
      session: {
        sessionId: "s",
// [::TICKET::] PX-149 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-149 --for-spec --no-implementation-order`.
        prompt() {},
        nextUpdate: () => new Promise(() => {}),
// [::TICKET::] PX-149 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-149 --for-spec --no-implementation-order`.
        dispose() {},
      } as any,
    });

    const pending = runCommand(session, "/resolve-ticket", {
      timeoutMs: 60_000,
      verbose: false,
    });
    setImmediate(() => proc.emit("exit", null, "SIGTERM"));

    await assert.rejects(pending, (err: Error) => {
      assert.ok(err.message.includes("SIGTERM"));
      return true;
    });
  });

  it("子プロセスが既に終了している場合は prompt を呼ばず reject する", async () => {
    let promptCalled = false;
    const session = mockSession({
      proc: mockProc({ exitCode: 3 }),
      session: {
        sessionId: "s",
// [::TICKET::] PX-149, PX-150 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-149|PX-150) --for-spec --no-implementation-order`.
        prompt() { promptCalled = true; },
        nextUpdate: () => new Promise(() => {}),
// [::TICKET::] PX-149, PX-150 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=(PX-149|PX-150) --for-spec --no-implementation-order`.
        dispose() {},
      } as any,
    });

    await assert.rejects(
      runCommand(session, "/resolve-ticket", { timeoutMs: 1000, verbose: false }),
      (err: Error) => {
        assert.ok(err.message.includes("3"));
        assert.strictEqual(promptCalled, false);
        return true;
      },
    );
  });

  it("正常完了後に exit リスナが除去される", async () => {
    const proc = mockProc();
    const session = mockSession({
      proc,
      session: mockSessionWithUpdates([{ kind: "stop", response: "ok" }]) as any,
    });

    const result = await runCommand(session, "/test", { timeoutMs: 1000, verbose: false });
    assert.strictEqual(result, "ok");
    assert.strictEqual(proc.listenerCount("exit"), 0);
  });

  it("タイムアウト時も exit リスナが除去される", async () => {
    const proc = mockProc();
    const session = mockSession({ proc });

    await assert.rejects(
      runCommand(session, "/test", { timeoutMs: 0, verbose: false }),
      CommandTimeoutError,
    );
    assert.strictEqual(proc.listenerCount("exit"), 0);
  });

  // C001: 接続切断時に session.prompt() が reject しても、未処理 rejection にせず
  // 次の nextUpdate() 経由で同じエラーを拾って reject する。
  // @verifies C001
  it("session.prompt が reject しても unhandledRejection にならない", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (r: unknown) => { unhandled.push(r); };
    process.on("unhandledRejection", onUnhandled);
    try {
      const session = mockSession({
        session: {
          sessionId: "mock-sid",
          prompt: () => Promise.reject(new Error("ACP connection closed")),
          nextUpdate: () => Promise.reject(new Error("ACP connection closed")),
          dispose: () => {},
        } as any,
      });
      await assert.rejects(
        runCommand(session, "/resolve-ticket /tmp/x", { timeoutMs: 1000, verbose: false }),
        /ACP connection closed/,
      );
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
    }
    assert.deepStrictEqual(unhandled, []);
  });
});

// --- runSession ---
// @verifies C001

describe("runSession", () => {
  it("connectWith が reject しても unhandledRejection にならず reject する", async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (r: unknown) => { unhandled.push(r); };
    process.on("unhandledRejection", onUnhandled);
    try {
      // connectWith はコールバックを呼ばずに即 reject する（確立前の接続切断）
      const app = { connectWith: () => Promise.reject(new Error("ACP connection closed")) } as any;
      const stream = {} as any;
      const proc = mockProc();
      await assert.rejects(
        runSession(app, stream, proc, "/tmp/x", async () => "ok"),
        /ACP connection closed/,
      );
    } finally {
      process.removeListener("unhandledRejection", onUnhandled);
    }
    assert.deepStrictEqual(unhandled, []);
  });
});

// --- disposeSession ---

describe("disposeSession", () => {
  // shutdownChildProcess が同期部で proc.kill() を呼ぶため、kill は
  // disposeSession 直後に true になる。pending の grace タイマーを
  // クリアするため、後続の setImmediate で 'exit' を emit する。

  it("session.dispose() と proc.kill() が呼ばれる", async () => {
    let disposed = false;
    let killed = false;
    const proc = mockProc({ kill: () => { killed = true; } });
    const session = mockSession({
      proc,
      session: { sessionId: "s", prompt() {}, nextUpdate() { return new Promise(() => {}); }, dispose: () => { disposed = true; } } as any,
    });
    disposeSession(session);
    assert.strictEqual(disposed, true);
    assert.strictEqual(killed, true);
    setImmediate(() => proc.emit("exit", 0, null));
    await new Promise<void>((r) => setImmediate(r));
  });

  it("dispose() エラー時も proc.kill() が呼ばれる", async () => {
    let killed = false;
    const proc = mockProc({ kill: () => { killed = true; } });
    const session = mockSession({
      proc,
      session: { sessionId: "s", prompt() {}, nextUpdate() { return new Promise(() => {}); }, dispose: () => { throw new Error("err"); } } as any,
    });
    disposeSession(session);
    assert.strictEqual(killed, true);
    setImmediate(() => proc.emit("exit", 0, null));
    await new Promise<void>((r) => setImmediate(r));
  });

  it("複数回呼び出しでもエラーにならない", async () => {
    let disp = 0, kill = 0;
    const proc = mockProc({ kill: () => { kill++; } });
    const session = mockSession({
      proc,
      session: { sessionId: "s", prompt() {}, nextUpdate() { return new Promise(() => {}); }, dispose: () => { disp++; } } as any,
    });
    disposeSession(session);
    disposeSession(session);
    assert.strictEqual(disp, 2);
    assert.strictEqual(kill, 2);
    setImmediate(() => proc.emit("exit", 0, null));
    await new Promise<void>((r) => setImmediate(r));
  });
});

// --- shutdownChildProcess ---
// @verifies C004

describe("shutdownChildProcess", () => {
  it("SIGTERM 送信後、子プロセスの exit を待って resolve する", async () => {
    const kills: Array<string | undefined> = [];
    const proc = mockProc({ kill: (sig?: any) => { kills.push(sig); } });

    const promise = shutdownChildProcess(proc, 2000);
    setImmediate(() => proc.emit("exit", 0, null));
    await promise;

    // pid 未設定のプロセスはグループ kill できないため proc.kill にフォールバックする
    assert.deepStrictEqual(kills, ["SIGTERM"]);
  });

  it("grace 超過で SIGKILL を送信して resolve する", async () => {
    const kills: Array<string | undefined> = [];
    const proc = mockProc({ kill: (sig?: any) => { kills.push(sig); } });

    await shutdownChildProcess(proc, 20); // 子は exit を emit しない

    assert.deepStrictEqual(kills, ["SIGTERM", "SIGKILL"]);
  });

  // C004: claude-code 孫プロセスを確実に終了させるため、プロセスグループへ
  // SIGTERM/SIGKILL を送る。グループ kill が失敗したら単一プロセスへフォールバックする。
  // @verifies C004
  it("プロセスグループ（claude-code 孫）へ kill を送信し、失敗時はフォールバックする", async () => {
    const groupSignals: Array<[number, string]> = [];
    mock.method(process, "kill", (pid: number, sig: string) => {
      groupSignals.push([pid, sig]);
      // 実在しないグループを模倣: SIGKILL 時だけ ESRCH で失敗 → フォールバック検証
      if (sig === "SIGKILL") throw new Error("ESRCH");
    });
    try {
      const proc = mockProc({ pid: 1234 });
      await shutdownChildProcess(proc, 10); // exit を emit しない → grace 後 SIGKILL
      assert.deepStrictEqual(groupSignals[0], [-1234, "SIGTERM"]);
      // SIGKILL はグループ kill が ESRCH のため proc.kill にフォールバックした
      assert.ok(groupSignals.some(([pid, sig]) => pid === -1234 && sig === "SIGKILL"));
    } finally {
      mock.restoreAll();
    }
  });

  it("既に終了したプロセスには何もしない", async () => {
    let killed = false;
    const proc = mockProc({ exitCode: 0, kill: () => { killed = true; } });

    await shutdownChildProcess(proc, 2000);

    assert.strictEqual(killed, false);
  });

  it("stdin.end / kill が throw しても reject しない", async () => {
    const proc = mockProc({
      kill: () => { throw new Error("kill error"); },
      stdin: { end: () => { throw new Error("end error"); } },
    });

    await assert.doesNotReject(shutdownChildProcess(proc, 10));
  });
});
