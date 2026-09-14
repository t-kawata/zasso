// supervisor.test.ts — supervisor.ts のユニットテスト
//
// テスト方針:
//   輸送層 (HttpPostJson) は引数注入のシームなので mock.module() は不要。
//   5つの失敗モードが例外を投げずに定型文へ縮退することを1つのテーブルで検証する。
//   縮退先が定型文であることが「supervisor はループを止められない」の唯一の保証である。
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  buildMessagesUrl,
  buildRequestBody,
  buildSupervisorRequest,
  generateCompletionMessage,
  postJsonHttps,
  supervisorPolicy,
} from "./supervisor.js";
import type { HttpPostJson, SupervisorIngredients } from "./supervisor.js";
import { COMPLETION_TEMPLATE, completionPolicy } from "./completion-policy.js";
import type { SessionConfig } from "./session.js";

/** テスト用の入力。省略時は「/start-ticket が attempt 3 で停滞中」を表す */
// [::TICKET::] PX-211 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-211 --for-spec --no-implementation-order`.
function ingredients(
  overrides?: Partial<SupervisorIngredients>,
): SupervisorIngredients {
  return {
    command: "/start-ticket",
    ticketId: "P22-2",
    attempt: 3,
    maxAttempts: 6,
    statusAtStart: "planned",
    statusCurrent: "planned",
    expectedOnCompletion: "done",
    completionDefinition:
      "The status must advance to done via update-ticket.js.",
    priorInstructions: [],
    agentLastMessageTail: "stopped",
    workspaceChangedFiles: null,
    ticketTitle: "Experiment design",
    acceptanceCriteria: "AC",
    scope: ["a", "b", "c", "d", "e"],
    notes: "note",
    ...overrides,
  };
}

const CONFIG: SessionConfig = {
  apiKey: "test-key",
  model: "test-model",
  baseUrl: "https://provider.invalid/api",
};

describe("COMPLETION_TEMPLATE", () => {
  it("is the fixed four-sentence instruction, byte for byte", () => {
    assert.equal(
      COMPLETION_TEMPLATE,
      "Detected that the status indicates an incomplete state. Design and plan with " +
        "neither excess nor deficiency; what is necessary and sufficient must be done. " +
        "The information required to complete the task should already exist. " +
        "Exercise sound judgment and bring it to completion.",
    );
  });
});

describe("completionPolicy", () => {
  it("pins the specified budgets and truncation bounds", () => {
    // 上限と切り詰め幅は仕様が決めた値である。定数を参照する側のテストは
    // 定数が動いても追随してしまうため、値そのものをここで固定する。
    assert.equal(completionPolicy.templateAttempts, 2);
    assert.equal(completionPolicy.maxAttempts, 6);
    assert.equal(completionPolicy.agentMessageTailChars, 1500);
    assert.equal(completionPolicy.notesTailChars, 800);
    assert.equal(completionPolicy.acceptanceCriteriaChars, 512);
    assert.equal(completionPolicy.scopeItems, 3);
  });
});

describe("buildSupervisorRequest — payload bounds", () => {
  it("head-truncates acceptanceCriteria to acceptanceCriteriaChars", () => {
    const long = "A".repeat(completionPolicy.acceptanceCriteriaChars + 200);
    const request = buildSupervisorRequest(
      ingredients({ acceptanceCriteria: long }),
    );

    assert.equal(
      request.ticketContext.acceptanceCriteria.length,
      completionPolicy.acceptanceCriteriaChars,
    );
    assert.ok(long.startsWith(request.ticketContext.acceptanceCriteria));
  });

  it("head-truncates scope to scopeItems entries", () => {
    const request = buildSupervisorRequest(ingredients());
    assert.equal(request.ticketContext.scope.length, completionPolicy.scopeItems);
    assert.deepEqual(request.ticketContext.scope, ["a", "b", "c"]);
  });

  it("tail-truncates notes to notesTailChars", () => {
    const long = "B".repeat(completionPolicy.notesTailChars + 200);
    const request = buildSupervisorRequest(ingredients({ notes: long }));

    assert.equal(request.ticketContext.notesTail.length, completionPolicy.notesTailChars);
    assert.ok(long.endsWith(request.ticketContext.notesTail));
  });

  it("tail-truncates the agent message to agentMessageTailChars", () => {
    const long = "C".repeat(completionPolicy.agentMessageTailChars + 200);
    const request = buildSupervisorRequest(
      ingredients({ agentLastMessageTail: long }),
    );

    assert.equal(request.agentLastMessageTail.length, completionPolicy.agentMessageTailChars);
    assert.ok(long.endsWith(request.agentLastMessageTail));
  });

  it("snapshots priorInstructions so later mutation cannot alter the built request", () => {
    const priorInstructions = [
      { attempt: 1, kind: "template" as const, text: "first" },
    ];
    const request = buildSupervisorRequest(ingredients({ priorInstructions }));

    priorInstructions.push({ attempt: 2, kind: "template" as const, text: "second" });

    assert.equal(request.priorInstructions.length, 1, "the request must be a snapshot");
    assert.equal(request.priorInstructions[0].text, "first");
  });

  it("keeps short values intact and preserves the null workspace count", () => {
    const request = buildSupervisorRequest(ingredients());

    assert.equal(request.ticketContext.notesTail, "note");
    assert.equal(request.agentLastMessageTail, "stopped");
    assert.equal(request.workspaceChangedFiles, null);
    assert.equal(request.attempt, 3);
  });
});

describe("buildMessagesUrl", () => {
  it("appends /v1/messages and normalises trailing slashes", () => {
    assert.equal(
      buildMessagesUrl("https://api.example.com"),
      "https://api.example.com/v1/messages",
    );
    assert.equal(
      buildMessagesUrl("https://api.example.com/"),
      "https://api.example.com/v1/messages",
    );
    assert.equal(
      buildMessagesUrl("https://gw.example.com/anthropic/"),
      "https://gw.example.com/anthropic/v1/messages",
    );
  });
});

describe("buildRequestBody", () => {
  // @verifies C003
  it("carries model, max_tokens, system and one user message holding the payload", () => {
    const body = buildRequestBody(
      buildSupervisorRequest(ingredients()),
      "test-model",
    ) as {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: string; content: string }>;
    };

    assert.equal(body.model, "test-model");
    assert.equal(body.max_tokens, 512);
    assert.ok(body.system.length > 0);
    assert.equal(body.messages.length, 1);

    const payload = JSON.parse(body.messages[0].content) as Record<string, unknown>;
    assert.equal(payload.command, "/start-ticket");
    assert.equal(payload.ticket, "P22-2");
    assert.equal(payload.attempt, 3);
    assert.equal(payload.max_attempts, 6);
    assert.deepEqual(payload.status, {
      at_command_start: "planned",
      current: "planned",
      expected_on_completion: "done",
    });
    assert.equal(payload.agent_last_message_tail, "stopped");
  });
});

describe("generateCompletionMessage", () => {
  const request = buildSupervisorRequest(ingredients());

  const FAILURE_CASES: Array<{ name: string; post: HttpPostJson }> = [
    {
      name: "transport rejection",
      post: async () => {
        throw new Error("ECONNRESET");
      },
    },
    { name: "non-2xx response", post: async () => ({ statusCode: 500, body: "{}" }) },
    { name: "malformed JSON body", post: async () => ({ statusCode: 200, body: "not json" }) },
    { name: "missing content array", post: async () => ({ statusCode: 200, body: "{}" }) },
    {
      name: "empty instruction text",
      post: async () => ({
        statusCode: 200,
        body: JSON.stringify({ content: [{ type: "text", text: "" }] }),
      }),
    },
  ];

  for (const failureCase of FAILURE_CASES) {
    // @verifies C003
    it(`degrades to the template on ${failureCase.name}`, async () => {
      const message = await generateCompletionMessage(request, CONFIG, failureCase.post);
      assert.equal(message, COMPLETION_TEMPLATE);
    });
  }

  // @verifies C003
  it("resolves to a non-empty string for every failure mode, never rejecting", async () => {
    for (const failureCase of FAILURE_CASES) {
      const message = await generateCompletionMessage(request, CONFIG, failureCase.post);
      assert.equal(typeof message, "string");
      assert.ok(message.length > 0);
    }
  });

  // @verifies C003
  it("passes a well-formed instruction through byte-for-byte", async () => {
    const generated =
      "You stopped with the status still planned. Run the Step 10 transition now.";
    const post: HttpPostJson = async () => ({
      statusCode: 200,
      body: JSON.stringify({ content: [{ type: "text", text: generated }] }),
    });

    assert.equal(await generateCompletionMessage(request, CONFIG, post), generated);
  });

  // @verifies C003
  it("degrades to the template when the provider accepts but never responds", async () => {
    const silentServer = http.createServer(() => {
      // 応答を返さないプロバイダを模す — 完了ループを停止させてはならない
    });
    await new Promise<void>((resolve) => silentServer.listen(0, "127.0.0.1", resolve));
    const address = silentServer.address() as { port: number };
    const originalTimeout = supervisorPolicy.timeoutMs;
    supervisorPolicy.timeoutMs = 50;

    try {
      const message = await generateCompletionMessage(
        request,
        { ...CONFIG, baseUrl: `http://127.0.0.1:${address.port}` },
        postJsonHttps,
      );
      assert.equal(message, COMPLETION_TEMPLATE);
    } finally {
      supervisorPolicy.timeoutMs = originalTimeout;
      silentServer.closeAllConnections();
      await new Promise<void>((resolve) => silentServer.close(() => resolve()));
    }
  });

  // @verifies C003
  it("posts to the configured provider with the API key header", async () => {
    let seenUrl = "";
    let seenHeaders: Record<string, string> = {};
    const post: HttpPostJson = async (url, _body, headers) => {
      seenUrl = url;
      seenHeaders = headers;
      return {
        statusCode: 200,
        body: JSON.stringify({ content: [{ type: "text", text: "go" }] }),
      };
    };

    await generateCompletionMessage(request, CONFIG, post);

    assert.equal(seenUrl, "https://provider.invalid/api/v1/messages");
    assert.equal(seenHeaders["x-api-key"], "test-key");
  });
});
