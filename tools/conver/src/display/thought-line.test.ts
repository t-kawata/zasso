// @verifies C002, C003, C004
// thought-line.test.ts — streamed thought text stays on one readable line.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import stringWidth from "string-width";
import {
  MAX_ESCAPE_CARRY,
  ThoughtLineWriter,
  usableColumns,
} from "./thought-line.js";

// [::TICKET::] PX-408 changes. Details: `node "$(git rev-parse --show-toplevel)/.claude/scripts/tickets/show-ticket-context.js" --ticket-key=PX-408 --for-spec --no-implementation-order`.
function capture(width = 80): { writer: ThoughtLineWriter; chunks: string[] } {
  const chunks: string[] = [];
  const writer = new ThoughtLineWriter({
    width,
    color: false,
    write: (chunk) => chunks.push(chunk),
  });
  return { writer, chunks };
}

describe("ThoughtLineWriter", () => {
  it("appends consecutive chunks to one line with a single prefix", () => {
    const { writer, chunks } = capture();
    writer.append("Let");
    writer.append(" me");
    const open = chunks.join("");
    assert.equal(open, "∴ Let me");
    assert.equal((open.match(/∴ /g) ?? []).length, 1);
    assert.ok(!open.includes("\n"));
    assert.equal(writer.isOpen, true);
  });

  it("starts an indented line after an embedded newline", () => {
    const { writer, chunks } = capture();
    writer.append("first");
    writer.append("\nsecond");
    assert.ok(chunks.join("").includes("∴ first\n  second"));
  });

  it("closes exactly once and does not add a newline to an empty line", () => {
    const first = capture();
    first.writer.append("a");
    first.writer.close();
    first.writer.close();
    assert.equal((first.chunks.join("").match(/\n/g) ?? []).length, 1);
    assert.equal(first.writer.isOpen, false);

    const empty = capture();
    empty.writer.close();
    assert.equal(empty.chunks.join(""), "");
  });

  it("closes the open line on resize and wraps at the new width", () => {
    const { writer, chunks } = capture(80);
    writer.append("abcdef");
    writer.resize(10);
    writer.append("ghijklmnop");
    writer.close();
    const output = chunks.join("");
    assert.ok(output.includes("∴ abcdef\n"));
    for (const line of output.split("\n")) {
      assert.ok(stringWidth(line) <= usableColumns(10), JSON.stringify(line));
    }
  });

  it("never writes into the terminal last column for ASCII, CJK and emoji", () => {
    const { writer, chunks } = capture(20);
    writer.append("a".repeat(100) + "あ".repeat(50) + "🙂".repeat(10));
    writer.close();
    const lines = chunks.join("").split("\n");
    assert.ok(lines.length > 1);
    for (const line of lines) {
      assert.ok(
        stringWidth(line) <= usableColumns(20),
        `visible width ${stringWidth(line)}: ${JSON.stringify(line)}`,
      );
    }
  });

  it("falls back to unwrapped output when the width cannot hold the prefix", () => {
    const { writer, chunks } = capture(3);
    assert.doesNotThrow(() => writer.append("abcdef"));
    writer.close();
    assert.ok(chunks.join("").includes("abcdef"));
  });

  it("carries an escape sequence split across chunks instead of leaking it", () => {
    const { writer, chunks } = capture();
    writer.append("a\x1b[3");
    assert.ok(!chunks.join("").includes("31m"));
    writer.append("1mred");
    const output = chunks.join("");
    assert.ok(!stripVTControlCharacters(output).includes("31m"));
    assert.ok(output.includes("\x1b[31m"));
    assert.ok(stripVTControlCharacters(output).includes("ared"));
  });

  it("drops a cursor-movement CSI split across chunks", () => {
    const { writer, chunks } = capture();
    writer.append("a\x1b[1");
    writer.append("Ab");
    const output = chunks.join("");
    assert.ok(!output.includes("\x1b[1A"));
    assert.ok(stripVTControlCharacters(output).includes("ab"));
  });

  it("discards an unterminated escape tail longer than MAX_ESCAPE_CARRY", () => {
    const { writer, chunks } = capture();
    writer.append("\x1b[" + "0".repeat(MAX_ESCAPE_CARRY + 1));
    writer.append("x");
    const output = chunks.join("");
    assert.ok(!output.includes("\x1b["));
    assert.ok(stripVTControlCharacters(output).includes("x"));
  });
});
