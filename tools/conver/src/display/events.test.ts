// events.test.ts — every ACP SessionUpdate maps to exactly one display event.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { SessionUpdate } from "@agentclientprotocol/sdk";
import { toDisplayEvent } from "./events.js";

const text = (value: string) => ({ type: "text" as const, text: value });

describe("toDisplayEvent", () => {
// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
  it("C001 maps every SessionUpdate kind to exactly one display event", () => {
    const updates: unknown[] = [
      { sessionUpdate: "agent_message_chunk", content: text("hello") },
      { sessionUpdate: "agent_thought_chunk", content: text("thinking") },
      {
        sessionUpdate: "tool_call",
        toolCallId: "t1",
        title: "read file",
        status: "pending",
        kind: "read",
        content: [{ type: "content", content: text("body") }],
      },
      { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" },
      {
        sessionUpdate: "plan",
        entries: [{ content: "step one", priority: "high", status: "pending" }],
      },
      { sessionUpdate: "notice", severity: "info", title: "note", description: "detail" },
      { sessionUpdate: "usage_update", used: 10, size: 100 },
      { sessionUpdate: "subagent_update", sessionId: "s1", title: "child" },
      { sessionUpdate: "session_message", messageId: "m1", content: [text("msg")] },
      { sessionUpdate: "mystery_update" } as unknown as SessionUpdate,
    ];

    const events = updates.map((update) => toDisplayEvent(update as SessionUpdate));
    assert.strictEqual(events.length, updates.length);
    assert.ok(events.every((event) => event !== null));
    assert.deepStrictEqual(
      events.map((event) => event.kind),
      [
        "message",
        "thought",
        "tool_call",
        "tool_update",
        "plan",
        "notice",
        "usage",
        "subagent",
        "session_message",
        "other",
      ],
    );
    assert.strictEqual(events[9]?.kind === "other" ? events[9].sessionUpdate : "", "mystery_update");
  });

  it("summarizes text, diff and terminal tool content", () => {
    const event = toDisplayEvent({
      sessionUpdate: "tool_call",
      toolCallId: "t2",
      title: "edit",
      status: "in_progress",
      kind: "edit",
      content: [
        { type: "content", content: text("hello") },
        { type: "diff", path: "/tmp/a.ts", oldText: "old", newText: "new" },
        { type: "terminal", terminalId: "term-1" },
      ],
    });
    assert.strictEqual(event.kind, "tool_call");
    if (event.kind !== "tool_call") return;
    assert.deepStrictEqual(event.content, [
      { type: "text", text: "hello" },
      { type: "diff", path: "/tmp/a.ts", oldText: "old", newText: "new" },
      { type: "terminal", terminalId: "term-1" },
    ]);
  });

  it("handles a thought chunk whose content is not text", () => {
    const event = toDisplayEvent({
      sessionUpdate: "agent_thought_chunk",
      content: { type: "image", data: "x", mimeType: "image/png" },
    });
    assert.deepStrictEqual(event, { kind: "thought", text: "" });
  });
});
