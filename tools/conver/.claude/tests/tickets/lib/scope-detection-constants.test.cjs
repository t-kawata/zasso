#!/usr/bin/env node
// [::TICKET::] PX-209 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-209 --for-spec --no-implementation-order`.

/**
 * Unit tests for scope-detection-constants.js.
 *
 * PX-61: Ensures constants are correctly extracted and match originals.
 *
 * RED phase: module doesn't exist yet → before() throws → tests fail.
 * GREEN phase: module exists → before() succeeds → tests run.
 */

const { describe, test, before } = require("node:test");
const assert = require("node:assert");

let SOURCE_EXTENSIONS, DEFINITION_PATTERNS, DEFINITION_KINDS;

before(() => {
  ({ SOURCE_EXTENSIONS, DEFINITION_PATTERNS, DEFINITION_KINDS } = require("../../../scripts/tickets/lib/scope-detection-constants"));
  assert.ok(SOURCE_EXTENSIONS instanceof Set);
  assert.ok(Array.isArray(DEFINITION_PATTERNS));
  assert.ok(typeof DEFINITION_KINDS === "object");
});

describe("scope-detection-constants", () => {
  // [::TICKET::] P22-4 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=P22-4 --for-spec --no-implementation-order`.
  // `.mjs` joined the set in P22-4: the reverse-rotation toolchain is ESM, so
  // without it no file under workspacify-reverse/ could carry its annotation.
  // `.cjs` joined in PX-209 for the same reason, one generation later: 134
  // tracked files, this repository's own tests, were invisible to the mechanism
  // because a file it does not know about is never reported on. The size
  // assertion below is what catches an extension arriving without a decision.
  test("SOURCE_EXTENSIONS contains all 15 expected extensions", () => {
    const expected = [
      ".rs", ".go", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue",
      ".py", ".rb", ".swift", ".kt", ".java", ".cs",
    ];
    for (const ext of expected) {
      assert.ok(SOURCE_EXTENSIONS.has(ext), `Missing extension: ${ext}`);
    }
    assert.strictEqual(SOURCE_EXTENSIONS.size, expected.length);
  });

  test("DEFINITION_PATTERNS has 16 patterns (15 original + IIFE)", () => {
    // 14 original + method shorthand + a JS IIFE pattern
    assert.strictEqual(DEFINITION_PATTERNS.length, 16);
  });

  test("DEFINITION_PATTERNS all compile as RegExp", () => {
    for (const pattern of DEFINITION_PATTERNS) {
      assert.ok(pattern instanceof RegExp);
    }
  });

  test("DEFINITION_KINDS maps each keyword to a valid kind", () => {
    const validKinds = new Set(["function", "class", "struct", "impl", "trait", "enum", "interface", "type", "module"]);
    for (const [keyword, kind] of Object.entries(DEFINITION_KINDS)) {
      assert.ok(validKinds.has(kind), `Unknown kind "${kind}" for keyword "${keyword}"`);
    }
  });

  test("DEFINITION_KINDS has 'fn' → 'function'", () => {
    assert.strictEqual(DEFINITION_KINDS.fn, "function");
  });

  test("DEFINITION_KINDS has 'struct' → 'struct'", () => {
    assert.strictEqual(DEFINITION_KINDS.struct, "struct");
  });
});
