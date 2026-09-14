#!/usr/bin/env node

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
  test("SOURCE_EXTENSIONS contains all 13 expected extensions", () => {
    const expected = [
      ".rs", ".go", ".ts", ".tsx", ".js", ".jsx", ".vue",
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
