// events.ts — map every ACP SessionUpdate to exactly one display event.
//
// The SDK delivers a wide union of updates. The renderer must not know the
// protocol shape, and an unknown future kind must not disappear silently: it
// becomes an "other" event that names the kind.
import type {
  ContentBlock,
  SessionUpdate,
  ToolCallContent,
} from "@agentclientprotocol/sdk";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export type ToolContentSummary =
  | { type: "text"; text: string }
  | { type: "diff"; path: string; oldText?: string; newText: string }
  | { type: "terminal"; terminalId: string }
  | { type: "other"; typeName: string };

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export type DisplayEvent =
  | { kind: "message"; text: string }
  | { kind: "thought"; text: string }
  | {
      kind: "tool_call";
      toolCallId: string;
      title: string;
      status: string;
      kindName?: string;
      content: ToolContentSummary[];
    }
  | {
      kind: "tool_update";
      toolCallId: string;
      title?: string;
      status?: string;
      content: ToolContentSummary[];
    }
  | {
      kind: "plan";
      entries: Array<{ content: string; status: string; priority: string }>;
    }
  | { kind: "notice"; severity: string; title: string; description?: string }
  | { kind: "usage"; used: number; size: number; cost?: unknown }
  | { kind: "subagent"; sessionId: string; title?: string; description?: string }
  | { kind: "session_message"; messageId: string; content: ToolContentSummary[] }
  | { kind: "other"; sessionUpdate: string };

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function textOf(content: ContentBlock): string {
  return content.type === "text" ? content.text : "";
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function summarizeContent(content: ContentBlock): ToolContentSummary {
  if (content.type === "text") return { type: "text", text: content.text };
  return { type: "other", typeName: content.type };
}

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
function summarizeToolContent(content: ToolCallContent): ToolContentSummary {
  if (content.type === "content") return summarizeContent(content.content);
  if (content.type === "diff") {
    return {
      type: "diff",
      path: content.path,
      ...(content.oldText === undefined || content.oldText === null
        ? {}
        : { oldText: content.oldText }),
      newText: content.newText,
    };
  }
  return { type: "terminal", terminalId: content.terminalId };
}

/** Map one protocol update to one renderer event. */
export function toDisplayEvent(update: SessionUpdate): DisplayEvent {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      return { kind: "message", text: textOf(update.content) };
    case "agent_thought_chunk":
      return { kind: "thought", text: textOf(update.content) };
    case "tool_call":
      return {
        kind: "tool_call",
        toolCallId: update.toolCallId,
        title: update.title ?? "",
        status: update.status ?? "unknown",
        ...(update.kind === undefined || update.kind === null ? {} : { kindName: update.kind }),
        content: (update.content ?? []).map(summarizeToolContent),
      };
    case "tool_call_update":
      return {
        kind: "tool_update",
        toolCallId: update.toolCallId,
        ...(update.title === undefined || update.title === null ? {} : { title: update.title }),
        ...(update.status === undefined || update.status === null ? {} : { status: update.status }),
        content: (update.content ?? []).map(summarizeToolContent),
      };
    case "plan":
      return {
        kind: "plan",
        entries: update.entries.map((entry) => ({
          content: entry.content,
          status: entry.status,
          priority: entry.priority,
        })),
      };
    case "notice":
      return {
        kind: "notice",
        severity: update.severity,
        title: update.title,
        ...(update.description === undefined || update.description === null
          ? {}
          : { description: update.description }),
      };
    case "usage_update":
      return {
        kind: "usage",
        used: update.used,
        size: update.size,
        ...(update.cost === undefined ? {} : { cost: update.cost }),
      };
    default: {
      const sessionUpdate = String(update.sessionUpdate);
      if (sessionUpdate === "subagent_update") {
        const value = update as unknown as {
          sessionId: string;
          title?: string | null;
          description?: string | null;
        };
        return {
          kind: "subagent",
          sessionId: value.sessionId,
          ...(value.title === undefined || value.title === null ? {} : { title: value.title }),
          ...(value.description === undefined || value.description === null
            ? {}
            : { description: value.description }),
        };
      }
      if (sessionUpdate === "session_message") {
        const value = update as unknown as {
          messageId: string;
          content?: ContentBlock[];
        };
        return {
          kind: "session_message",
          messageId: value.messageId,
          content: (value.content ?? []).map(summarizeContent),
        };
      }
      return { kind: "other", sessionUpdate };
    }
  }
}
