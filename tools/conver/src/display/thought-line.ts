// thought-line.ts — compose a streamed agent thought into one readable line.
//
// ACP delivers agent_thought_chunk token by token. Writing each chunk as its
// own newline-terminated line turns a single thought into a column of words.
// This writer keeps one line open, appends chunks, and wraps before the
// terminal's last column: the dashboard saves and restores the cursor on every
// redraw, and a cursor left in the pending-wrap state can lose its last cell.
// Agent text is untrusted, so an escape sequence split across chunks is carried
// until it is complete instead of being sanitized as two visible fragments.
import stringWidth from "string-width";
import chalk from "chalk";
import { sanitizeTerminalText } from "./terminal-text.js";

export const THOUGHT_PREFIX = "∴ ";
export const THOUGHT_INDENT = "  ";

/** An escape sequence longer than this is treated as malformed and dropped. */
export const MAX_ESCAPE_CARRY = 256;

/** Minimum columns left for text after the prefix and continuation indent. */
const MIN_CONTENT_COLUMNS = 2;

/**
 * Columns a line may occupy. The final terminal cell is never written, which
 * keeps the cursor out of the pending-wrap state while the dashboard redraws.
 */
export function usableColumns(width: number): number {
  return Math.max(1, width - 1);
}

const CSI_SEQUENCE = /^\x1b\[[0-9;?]*[ -/]*[@-~]/;
const OSC_SEQUENCE = /^\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/;
const DCS_SEQUENCE = /^\x1b[PX^_][\s\S]*?\x1b\\/;
const TWO_CHAR_SEQUENCE = /^\x1b[\s\S]/;

/** The complete escape sequence at the start of `text`, or null if it is cut off. */
// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
function completeEscapeAt(text: string): RegExpExecArray | null {
  if (text.startsWith("\x1b[")) return CSI_SEQUENCE.exec(text);
  if (text.startsWith("\x1b]")) return OSC_SEQUENCE.exec(text);
  if (/^\x1b[PX^_]/.test(text)) return DCS_SEQUENCE.exec(text);
  return TWO_CHAR_SEQUENCE.exec(text);
}

/** Index where an unterminated escape sequence starts, or -1 when all are complete. */
// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
function incompleteEscapeStart(text: string): number {
  let cursor = 0;
  for (;;) {
    const escape = text.indexOf("\x1b", cursor);
    if (escape < 0) return -1;
    const sequence = completeEscapeAt(text.slice(escape));
    if (sequence === null) return escape;
    cursor = escape + sequence[0].length;
  }
}

// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
function splitIncompleteEscape(
  carry: string,
  text: string,
): { safe: string; carry: string } {
  const combined = carry + text;
  const start = incompleteEscapeStart(combined);
  if (start < 0) return { safe: combined, carry: "" };
  const tail = combined.slice(start);
  if (tail.length > MAX_ESCAPE_CARRY) {
    return { safe: combined.slice(0, start), carry: "" };
  }
  return { safe: combined.slice(0, start), carry: tail };
}

// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
export interface ThoughtLineOptions {
  width: number;
  color: boolean;
  write: (chunk: string) => void;
}

/** One open, continuously appended terminal line for streamed thought text. */
// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
export class ThoughtLineWriter {
  #width: number;
  readonly #color: boolean;
  readonly #write: (chunk: string) => void;
  #open = false;
  #lineHasContent = false;
  #atLineStart = false;
  #column = 0;
  #run = "";
  #carry = "";

// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
  constructor(options: ThoughtLineOptions) {
    this.#width = options.width;
    this.#color = options.color;
    this.#write = options.write;
  }

  get isOpen(): boolean {
    return this.#open;
  }

  /** Append one streamed chunk. Never throws into the execution loop. */
  append(text: string): void {
    const { safe, carry } = splitIncompleteEscape(this.#carry, text);
    this.#carry = carry;
    const clean = sanitizeTerminalText(safe);
    if (clean.length === 0) return;
    this.#openLine();
    for (const character of Array.from(clean)) {
      if (character === "\n") {
        this.#breakLine();
        continue;
      }
      this.#appendCharacter(character);
    }
    this.#flushRun();
  }

  /** Close the open line. Idempotent, and never emits a newline for an empty line. */
  close(): void {
    if (!this.#open) return;
    this.#flushRun();
    if (this.#lineHasContent) this.#write("\n");
    this.#open = false;
    this.#lineHasContent = false;
    this.#atLineStart = false;
    this.#column = 0;
    this.#carry = "";
  }

  /** Adopt a new terminal width; the open line is closed so the next one is accurate. */
  resize(width: number): void {
    this.close();
    this.#width = width;
  }

  #openLine(): void {
    if (this.#open) return;
    this.#open = true;
    this.#lineHasContent = true;
    this.#run += THOUGHT_PREFIX;
    this.#column = stringWidth(THOUGHT_PREFIX);
  }

  #breakLine(): void {
    this.#flushRun();
    this.#write("\n");
    this.#column = 0;
    this.#lineHasContent = false;
    this.#atLineStart = true;
  }

  #appendCharacter(character: string): void {
    const width = stringWidth(character);
    if (this.#atLineStart) this.#beginContinuation();
    if (this.#wrapsBefore(width)) {
      this.#breakLine();
      this.#beginContinuation();
    }
    this.#run += character;
    this.#column += width;
    this.#lineHasContent = true;
  }

  #beginContinuation(): void {
    this.#run += THOUGHT_INDENT;
    this.#column = stringWidth(THOUGHT_INDENT);
    this.#lineHasContent = true;
    this.#atLineStart = false;
  }

  #wrapsBefore(width: number): boolean {
    if (this.#wrappingDisabled()) return false;
    // A line that holds only the prefix or indent must accept one character,
    // otherwise a terminal narrower than the prefix would wrap forever.
    if (this.#column <= stringWidth(THOUGHT_INDENT)) return false;
    return this.#column + width > usableColumns(this.#width);
  }

  #wrappingDisabled(): boolean {
    const minimum =
      stringWidth(THOUGHT_PREFIX) + stringWidth(THOUGHT_INDENT) + MIN_CONTENT_COLUMNS;
    return usableColumns(this.#width) < minimum;
  }

  #flushRun(): void {
    if (this.#run.length === 0) return;
    this.#write(this.#color ? chalk.dim(this.#run) : this.#run);
    this.#run = "";
  }
}
