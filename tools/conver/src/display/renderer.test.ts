// renderer.test.ts — deterministic plain rendering and turn buffering.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DisplayRenderer } from "./renderer.js";
import type { DisplayEvent } from "./events.js";
import { toDisplayEvent } from "./events.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function capture(width = 80): { renderer: DisplayRenderer; lines: string[] } {
  const lines: string[] = [];
  const renderer = new DisplayRenderer({
    width,
    color: false,
    write: (chunk) => lines.push(...chunk.split("\n")),
  });
  return { renderer, lines };
}

describe("DisplayRenderer", () => {
  it("buffers message chunks and flushes them before a tool call", () => {
    const { renderer, lines } = capture();
    renderer.handle({ kind: "message", text: "hello " });
    renderer.handle({ kind: "message", text: "world" });
    renderer.handle({
      kind: "tool_call",
      toolCallId: "t1",
      title: "read file",
      status: "pending",
      kindName: "read",
      content: [],
    });
    const output = lines.join("\n");
    assert.ok(output.includes("hello world"));
    assert.ok(output.includes("read file"));
  });

  it("renders thoughts, plans, notices, usage and subagents", () => {
    const { renderer, lines } = capture();
    renderer.handle({ kind: "thought", text: "thinking" });
    renderer.handle({
      kind: "plan",
      entries: [{ content: "step one", status: "pending", priority: "high" }],
    });
    renderer.handle({ kind: "notice", severity: "warning", title: "careful", description: "detail" });
    renderer.handle({ kind: "usage", used: 10, size: 100 });
    renderer.handle({ kind: "subagent", sessionId: "s1", title: "child" });
    renderer.handle({ kind: "session_message", messageId: "m1", content: [{ type: "text", text: "msg" }] });
    const output = lines.join("\n");
    assert.ok(output.includes("thinking"));
    assert.ok(output.includes("step one"));
    assert.ok(output.includes("careful"));
    assert.ok(output.includes("10/100"));
    assert.ok(output.includes("child"));
    assert.ok(output.includes("msg"));
  });

  it("renders tool diffs and terminal content", () => {
    const { renderer, lines } = capture();
    renderer.handle({
      kind: "tool_call",
      toolCallId: "t2",
      title: "edit",
      status: "in_progress",
      content: [
        { type: "text", text: "hello" },
        { type: "diff", path: "/tmp/a.ts", oldText: "old", newText: "new" },
        { type: "terminal", terminalId: "term-1" },
      ],
    });
    const output = lines.join("\n");
    assert.ok(output.includes("/tmp/a.ts"));
    assert.ok(output.includes("+new"));
    assert.ok(output.includes("-old"));
    assert.ok(output.includes("term-1"));
  });

  it("reports an unknown event instead of dropping it", () => {
    const { renderer, lines } = capture();
    renderer.handle({ kind: "other", sessionUpdate: "mystery_update" });
    assert.ok(lines.join("\n").includes("mystery_update"));
  });

  it("catches a rendering exception and continues", () => {
    const { renderer, lines } = capture();
    const evil = {
      get kind(): string {
        throw new Error("boom");
      },
    } as unknown as DisplayEvent;
    assert.doesNotThrow(() => renderer.handle(evil));
    assert.ok(lines.join("\n").includes("renderer error"));
  });

  it("renders a mixed update stream in arrival order", () => {
    const { renderer, lines } = capture();
    const events = [
      toDisplayEvent({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "first" } }),
      toDisplayEvent({
        sessionUpdate: "tool_call",
        toolCallId: "t",
        title: "tool",
        status: "pending",
        kind: "read",
      }),
      toDisplayEvent({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "after" } }),
    ];
    for (const event of events) renderer.handle(event);
    renderer.flush();
    const output = lines.join("\n");
    assert.ok(output.indexOf("first") < output.indexOf("tool"));
    assert.ok(output.indexOf("tool") < output.indexOf("after"));
  });

  it("wraps long messages to the configured width", () => {
    const { renderer, lines } = capture(20);
    renderer.handle({ kind: "message", text: "one two three four five six seven" });
    renderer.flush();
    assert.ok(lines.every((line) => line.length <= 20));
  });
});
