// renderer.ts — turn an ACP display event into console lines.
//
// Agent text is buffered per turn so a code fence or list split across chunks
// is rendered as one document. Rich mode uses marked + marked-terminal and
// chalk; plain mode (non-TTY) keeps the same lines without ANSI. A rendering
// failure is reported and the execution loop continues.
import { Marked } from "marked";
import { markedTerminal } from "marked-terminal";
import wrapAnsi from "wrap-ansi";
import chalk from "chalk";
import type { DisplayEvent, ToolContentSummary } from "./events.js";

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export interface RendererOptions {
  width: number;
  color: boolean;
  write: (chunk: string) => void;
}

const MAX_DIFF_LINES = 20;

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
export class DisplayRenderer {
  #messageBuffer = "";
  #marked: Marked | null = null;
  readonly #options: RendererOptions;

// [::TICKET::] PX-404 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-404 --for-spec --no-implementation-order`.
  constructor(options: RendererOptions) {
    this.#options = options;
    if (options.color) {
      const marked = new Marked();
      marked.use(markedTerminal({ reflowText: true, width: options.width }));
      this.#marked = marked;
    }
  }

  /** Render one event. Never throws into the execution loop. */
  handle(event: DisplayEvent): void {
    try {
      this.#handle(event);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.#writeLines([`[conver] renderer error: ${detail}`]);
    }
  }

  /** Flush the buffered agent message, e.g. at the end of a turn. */
  flush(): void {
    this.#flushMessageBuffer();
  }

  /** Forward one child stderr chunk, one line at a time. */
  writeStderr(text: string): void {
    for (const line of text.split("\n")) {
      if (line.trim().length === 0) continue;
      this.#writeLines([this.#options.color ? chalk.dim(`[agent] ${line}`) : `[agent] ${line}`]);
    }
  }

  #handle(event: DisplayEvent): void {
    if (event.kind !== "message") this.#flushMessageBuffer();
    switch (event.kind) {
      case "message":
        this.#messageBuffer += event.text;
        return;
      case "thought":
        this.#writeLines([this.#options.color ? chalk.dim(`∴ ${event.text}`) : `∴ ${event.text}`]);
        return;
      case "tool_call":
        this.#writeLines([
          `⏺ ${event.title} (${event.status})`,
          ...this.#toolContentLines(event.content),
        ]);
        return;
      case "tool_update": {
        const label = event.title === undefined ? event.toolCallId : `${event.toolCallId} ${event.title}`;
        const status = event.status === undefined ? "" : ` (${event.status})`;
        this.#writeLines([`⏺ ${label}${status}`, ...this.#toolContentLines(event.content)]);
        return;
      }
      case "plan":
        this.#writeLines([
          "Plan:",
          ...event.entries.map((entry) => `  [${entry.status}] ${entry.content}`),
        ]);
        return;
      case "notice":
        this.#writeLines([
          `! ${event.severity}: ${event.title}`,
          ...(event.description === undefined ? [] : [`  ${event.description}`]),
        ]);
        return;
      case "usage":
        this.#writeLines([`tokens ${event.used}/${event.size}`]);
        return;
      case "subagent":
        this.#writeLines([
          `subagent ${event.title ?? event.sessionId}`,
          ...(event.description === undefined ? [] : [`  ${event.description}`]),
        ]);
        return;
      case "session_message":
        this.#writeLines([
          `session ${event.messageId}: ${this.#summariesToText(event.content)}`,
        ]);
        return;
      case "other":
        this.#writeLines([`update ${event.sessionUpdate}`]);
    }
  }

  #flushMessageBuffer(): void {
    const text = this.#messageBuffer;
    this.#messageBuffer = "";
    if (text.trim().length === 0) return;
    this.#writeLines(this.#renderMessage(text).split("\n"));
  }

  #renderMessage(text: string): string {
    if (this.#marked === null) {
      return wrapAnsi(text.trimEnd(), this.#options.width, { hard: true, trim: false });
    }
    try {
      const rendered = this.#marked.parse(text.trim()) as string;
      return wrapAnsi(rendered.trimEnd(), this.#options.width, { hard: true, trim: false });
    } catch {
      return wrapAnsi(text.trimEnd(), this.#options.width, { hard: true, trim: false });
    }
  }

  #summariesToText(content: ToolContentSummary[]): string {
    return content
      .map((item) => (item.type === "text" ? item.text : `[${item.type}]`))
      .join(" ");
  }

  #toolContentLines(content: ToolContentSummary[]): string[] {
    const lines: string[] = [];
    for (const item of content) {
      if (item.type === "text") {
        lines.push(...item.text.split("\n").map((line) => `  ${line}`));
      } else if (item.type === "terminal") {
        lines.push(`  terminal ${item.terminalId}`);
      } else if (item.type === "diff") {
        lines.push(`  ${item.path}`);
        if (item.oldText !== undefined) {
          lines.push(...this.#diffLines(item.oldText, "-"));
        }
        lines.push(...this.#diffLines(item.newText, "+"));
      } else {
        lines.push(`  [${item.typeName}]`);
      }
    }
    return lines;
  }

  #diffLines(text: string, prefix: string): string[] {
    const all = text.split("\n");
    const shown = all.slice(0, MAX_DIFF_LINES).map((line) => `  ${prefix}${line}`);
    if (all.length > MAX_DIFF_LINES) shown.push("  …");
    return shown;
  }

  #writeLines(lines: string[]): void {
    for (const line of lines) {
      this.#options.write(`${line}\n`);
    }
  }
}
