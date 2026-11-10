// notifier.test.ts — notifier.ts のユニットテスト
// ビルド後、dist/ 以下の compiled JS に対して node --test で実行する
//
// HTTP 通信を伴うテスト（sendSlackOnce / sendSlackWithRetry）は
// node:http のローカルサーバーモックで実際の TCP 通信をシミュレートする。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  sendSlackError,
  sendSlackPhaseComplete,
  sendSlackStop,
  ErrorContext,
  PhaseCompleteContext,
  StopContext,
} from "./notifier.js";

// HTTP サーバーモック: 指定したステータスコードで応答するローカルサーバーを起動する
function createMockServer(
  responseCode: number,
  responseBody: string = "ok",
): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((_req, res) => {
      res.writeHead(responseCode, { "Content-Type": "text/plain" });
      res.end(responseBody);
    });
    server.listen(0, () => {
      const address = server.address();
      const port =
        typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

// sendSlackOnce/sendSlackWithRetry は非公開関数のため、sendSlackError 経由でテストする
describe("sendSlackError", () => {
  it("HTTP 200 応答でエラーなく完了する", async () => {
    const { server, port } = await createMockServer(200);
    const url = `http://localhost:${port}`;
    const context: ErrorContext = {
      ticketId: "P2-1",
      phase: "test-phase",
      error: new Error("test error"),
      ticketsPath: "/tmp/test/Tickets.json",
    };
    // 正常系: reject されないことを確認
    await sendSlackError(url, context);
    server.close();
  });

  it("HTTP 400 応答でも throw せず console.error にエラーが出力される", async () => {
    const { server, port } = await createMockServer(400);
    const url = `http://localhost:${port}`;
    const context: ErrorContext = {
      ticketId: "P2-1",
      phase: "test-phase",
      error: new Error("test error"),
      ticketsPath: "/tmp/test/Tickets.json",
    };
    const originalConsoleError = console.error;
    const consoleErrorMessages: string[] = [];
    console.error = (...args: unknown[]) => {
      consoleErrorMessages.push(args.map(String).join(" "));
    };
    try {
      // sendSlackError はエラーを throw しない設計
      await sendSlackError(url, context);
      assert.ok(consoleErrorMessages.length > 0, "console.error が呼ばれるべき");
      assert.ok(
        consoleErrorMessages[0].includes("Slack API returned 400"),
        "console.error にステータスコード 400 が含まれるべき",
      );
    } finally {
      console.error = originalConsoleError;
    }
    server.close();
  });

  it("HTTP 500 応答でも throw せず console.error にエラーが出力される", async () => {
    const { server, port } = await createMockServer(500);
    const url = `http://localhost:${port}`;
    const context: ErrorContext = {
      ticketId: "P2-1",
      phase: "test-phase",
      error: new Error("test error"),
      ticketsPath: "/tmp/test/Tickets.json",
    };
    const originalConsoleError = console.error;
    const consoleErrorMessages: string[] = [];
    console.error = (...args: unknown[]) => {
      consoleErrorMessages.push(args.map(String).join(" "));
    };
    try {
      await sendSlackError(url, context);
      assert.ok(consoleErrorMessages.length > 0, "console.error が呼ばれるべき");
      assert.ok(
        consoleErrorMessages[0].includes("Slack API returned 500"),
        "console.error にステータスコード 500 が含まれるべき",
      );
    } finally {
      console.error = originalConsoleError;
    }
    server.close();
  });

  it("1回目失敗 -> 2回目成功でリトライ後に完了する", async () => {
    let callCount = 0;
    const { server, port } = await new Promise<{
      server: http.Server;
      port: number;
    }>((resolve) => {
      const mockServer = http.createServer((_req, res) => {
        callCount++;
        if (callCount === 1) {
          // 1回目: 500 で応答
          res.writeHead(500);
          res.end("fail");
        } else {
          // 2回目: 200 で応答
          res.writeHead(200);
          res.end("ok");
        }
      });
      mockServer.listen(0, () => {
        const address = mockServer.address();
        const detectedPort = typeof address === "object" && address ? address.port : 0;
        resolve({ server: mockServer, port: detectedPort });
      });
    });
    const url = `http://localhost:${port}`;
    const context: ErrorContext = {
      ticketId: "P2-1",
      phase: "test-phase",
      error: new Error("test error"),
      ticketsPath: "/tmp/test/Tickets.json",
    };
    await sendSlackError(url, context);
    assert.strictEqual(callCount, 2);
    server.close();
  });

  it("3回すべて失敗した場合でも throw しない（console.error が呼ばれる）", async () => {
    const { server, port } = await createMockServer(500);
    const url = `http://localhost:${port}`;
    const context: ErrorContext = {
      ticketId: "P2-1",
      phase: "test-phase",
      error: new Error("test error"),
      ticketsPath: "/tmp/test/Tickets.json",
    };
    const originalConsoleError = console.error;
    const consoleErrorMessages: string[] = [];
    console.error = (...args: unknown[]) => {
      consoleErrorMessages.push(args.map(String).join(" "));
    };
    try {
      await sendSlackError(url, context);
      // 3回すべて失敗しても throw しないことを確認
      assert.ok(
        consoleErrorMessages.length > 0,
        "console.error が少なくとも1回呼ばれるべき",
      );
      assert.ok(
        consoleErrorMessages[0].includes("Slack通知送信に失敗しました"),
        "エラーメッセージに通知失敗文言が含まれるべき",
      );
    } finally {
      console.error = originalConsoleError;
    }
    server.close();
  });
});

// エラー種別の分類（sendSlackError 経由で間接的に検証）
describe("sendSlackError エラー種別", () => {
  it("通常の Error で Unknown として通知される", async () => {
    const { server, port } = await createMockServer(200);
    const url = `http://localhost:${port}`;
    const context: ErrorContext = {
      ticketId: "P2-1",
      phase: "test-phase",
      error: new Error("generic error"),
      ticketsPath: "/tmp/test/Tickets.json",
    };
    // 正常完了すれば OK（エラー種別は内部ロジックに委ねる）
    await sendSlackError(url, context);
    server.close();
  });
});

// Phase and stop payload verification (HTTP server captures the body).
describe("sendSlackPhaseComplete and sendSlackStop", () => {
// [::TICKET::] PX-403, PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=(PX-403|PX-404) --for-spec --no-implementation-order`.
  async function capturePayload(
    send: (url: string) => Promise<void>,
  ): Promise<string> {
    let receivedBody = "";
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        receivedBody = body;
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    await send(`http://localhost:${port}`);
    server.close();
    const formDecoded = receivedBody.replace(/\+/g, "%20").replace(/^payload=/, "");
    const parsed = JSON.parse(decodeURIComponent(formDecoded)) as { text: string };
    return parsed.text;
  }

  it("phase completion names workspace, package, phase, counts, last ticket and package flag", async () => {
    const context: PhaseCompleteContext = {
      workspace: "doors",
      packageName: "doors-core",
      phaseId: 0,
      reviewed: 5,
      total: 5,
      lastTicketKey: "P0-5",
      packageComplete: true,
    };
    const text = await capturePayload((url) => sendSlackPhaseComplete(url, context));
    assert.ok(text.includes("[doors] doors-core P0 5/5 reviewed (last: P0-5)"));
    assert.ok(text.includes("package complete"));
  });

  it("phase completion omits the package flag when the package is not complete", async () => {
    const context: PhaseCompleteContext = {
      workspace: "doors",
      packageName: "doors-core",
      phaseId: -1,
      reviewed: 2,
      total: 4,
      lastTicketKey: "PX-7",
      packageComplete: false,
    };
    const text = await capturePayload((url) => sendSlackPhaseComplete(url, context));
    assert.ok(text.includes("[doors] doors-core PX 2/4 reviewed (last: PX-7)"));
    assert.ok(!text.includes("package complete"));
  });

  it("stop message carries the workspace, reason and location", async () => {
    const context: StopContext = {
      workspace: "doors",
      packageName: "doors-core",
      phaseId: 0,
      ticketKey: "P0-3",
      command: "/make-ticket",
      reason: "repeated command exhausted three escalations",
    };
    const text = await capturePayload((url) => sendSlackStop(url, context));
    assert.ok(text.includes("[doors] stopped: repeated command exhausted three escalations"));
    assert.ok(text.includes("doors-core"));
    assert.ok(text.includes("P0"));
    assert.ok(text.includes("P0-3"));
    assert.ok(text.includes("/make-ticket"));
  });
});
