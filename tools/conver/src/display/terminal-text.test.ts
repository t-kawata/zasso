// terminal-text.test.ts — keep SGR color, remove everything that moves the cursor.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sanitizeTerminalText } from "./terminal-text.js";

describe("sanitizeTerminalText", () => {
  it("keeps SGR color sequences", () => {
    assert.strictEqual(
      sanitizeTerminalText("\x1b[31mred\x1b[0m"),
      "\x1b[31mred\x1b[0m",
    );
    assert.strictEqual(
      sanitizeTerminalText("\x1b[38;2;245;230;168mpale\x1b[39m"),
      "\x1b[38;2;245;230;168mpale\x1b[39m",
    );
  });

  it("removes cursor movement and erase sequences", () => {
    assert.strictEqual(sanitizeTerminalText("a\x1b[1Ab"), "ab");
    assert.strictEqual(sanitizeTerminalText("a\x1b[2Kb"), "ab");
    assert.strictEqual(sanitizeTerminalText("a\x1b[?25lb"), "ab");
    assert.strictEqual(sanitizeTerminalText("a\x1b[10;20Hb"), "ab");
  });

  it("removes OSC and DEC private escapes", () => {
    assert.strictEqual(
      sanitizeTerminalText("\x1b]8;;https://example.com\x1b\\link\x1b]8;;\x1b\\"),
      "link",
    );
    assert.strictEqual(sanitizeTerminalText("a\x1b7b\x1b8c"), "abc");
  });

  it("keeps newlines and tabs, drops carriage returns and other C0 controls", () => {
    assert.strictEqual(sanitizeTerminalText("a\rb"), "ab");
    assert.strictEqual(sanitizeTerminalText("a\nb\tc"), "a\nb\tc");
    assert.strictEqual(sanitizeTerminalText("a\x07b\x00c"), "abc");
  });

  it("leaves ordinary wide text unchanged", () => {
    assert.strictEqual(sanitizeTerminalText("日本語 ✓ …"), "日本語 ✓ …");
  });
});
