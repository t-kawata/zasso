#!/usr/bin/env node

/**
 * Unit tests for scope-detection.js (findContainingDefinition).
 *
 * PX-61: Scope detection engine — brace depth tracking + indentation fallback.
 * All tests use inline source code snippets — no file I/O.
 *
 * RED phase: module doesn't exist yet → before() throws → all tests fail.
 * GREEN phase: module exists → before() succeeds → all tests run.
 */

const { describe, test, before } = require("node:test");
const assert = require("node:assert");

let findContainingDefinition;

before(() => {
  // This will throw during RED phase because the module doesn't exist yet.
  // The test framework will report it as a failure.
  ({ findContainingDefinition } = require("../../../scripts/tickets/lib/scope-detection"));
  assert.ok(typeof findContainingDefinition === "function",
    "findContainingDefinition must be a function");
});

// =============================================================================
// Normal cases
// =============================================================================

describe("findContainingDefinition — Normal", () => {
  test("Rust fn inside impl block returns the fn (not impl)", () => {
    const lines = [
      "impl Foo {",              // 0
      "  fn bar() {",            // 1
      "    let x = 1;",          // 2
      "  }",                      // 3
      "}",                        // 4
    ];
    const result = findContainingDefinition(lines, 2);
    assert.deepStrictEqual(result, { startLine: 1, name: "bar", kind: "function" });
  });

  test("Go func with brace-on-next-line style", () => {
    const lines = [
      "func foo()",               // 0
      "{",                        // 1
      "  x := 1",                 // 2
      "}",                        // 3
    ];
    const result = findContainingDefinition(lines, 2);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });

  test("Python nested def with indentation", () => {
    const lines = [
      "def outer():",             // 0
      "    def inner():",         // 1
      "        pass",             // 2
      "    pass",                 // 3
    ];
    const result = findContainingDefinition(lines, 2);
    assert.deepStrictEqual(result, { startLine: 1, name: "inner", kind: "function" });
  });

  test("TS class with method and nested block", () => {
    const lines = [
      "class Foo {",              // 0
      "  bar() {",                // 1
      "    if (true) {",          // 2
      "      let v = 1;",         // 3
      "    }",                    // 4
      "  }",                      // 5
      "}",                        // 6
    ];
    const result = findContainingDefinition(lines, 3);
    assert.deepStrictEqual(result, { startLine: 1, name: "bar", kind: "function" });
  });

  test("Rust struct does not contain brace-managed blocks; impl methods captured", () => {
    const lines = [
      "struct Point {",           // 0
      "  x: i32,",                // 1
      "  y: i32,",                // 2
      "}",                        // 3
      "impl Point {",             // 4
      "  fn new(x: i32) -> Self {", // 5
      "    Self { x, y: 0 }",     // 6
      "  }",                      // 7
      "}",                        // 8
    ];
    const result = findContainingDefinition(lines, 6);
    assert.deepStrictEqual(result, { startLine: 5, name: "new", kind: "function" });
  });

  test("Definition name capture from DEFINITION_PATTERNS regex", () => {
    const lines = [
      "fn process_data() {",      // 0
      "  let x = 1;",             // 1
      "}",                        // 2
    ];
    const result = findContainingDefinition(lines, 1);
    assert.deepStrictEqual(result, { startLine: 0, name: "process_data", kind: "function" });
  });
});

// =============================================================================
// Error cases
// =============================================================================

describe("findContainingDefinition — Error", () => {
  test("targetLine < 0 returns null", () => {
    assert.strictEqual(findContainingDefinition(["fn a() {}"], -1), null);
  });

  test("targetLine >= lines.length returns null", () => {
    assert.strictEqual(findContainingDefinition(["fn a() {}"], 5), null);
  });

  test("Brace inside double-quote string literal does not affect depth", () => {
    const lines = [
      "fn foo() {",                // 0
      '  let s = "hello { }";',    // 1
      "",                          // 2
      "}",                         // 3
    ];
    const result = findContainingDefinition(lines, 1);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });

  test("Brace inside single-line comment does not affect depth", () => {
    const lines = [
      "fn foo() {",                // 0
      "  // if (true) { }",        // 1
      "}",                         // 2
    ];
    const result = findContainingDefinition(lines, 1);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });

  test("Brace inside multi-line block comment does not affect depth", () => {
    const lines = [
      "fn foo() {",                // 0
      "  /*",                      // 1
      "  if (true) {",             // 2
      "  }",                       // 3
      "  */",                      // 4
      "}",                         // 5
    ];
    const result = findContainingDefinition(lines, 2);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });

  test("Brace inside regex literal does not affect depth", () => {
    const lines = [
      "fn foo() {",                // 0
      '  let re = /foo{1,3}/;',    // 1
      "}",                         // 2
    ];
    const result = findContainingDefinition(lines, 1);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });
});

// =============================================================================
// Boundary cases
// =============================================================================

describe("findContainingDefinition — Boundary", () => {
  test("targetLine at definition line returns that definition (self-containing)", () => {
    const lines = [
      "fn foo() {",               // 0
      "}",                        // 1
    ];
    const result = findContainingDefinition(lines, 0);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });

  test("targetLine at closing brace returns that definition", () => {
    const lines = [
      "fn foo() {",               // 0
      "}",                        // 1
    ];
    const result = findContainingDefinition(lines, 1);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });

  test("targetLine at line 0 which is a definition returns that definition", () => {
    const lines = [
      "fn foo() {}",              // 0
    ];
    const result = findContainingDefinition(lines, 0);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });

  test("targetLine at last line which is closing brace of outermost def", () => {
    const lines = [
      "fn foo() {",               // 0
      "  fn bar() {",             // 1
      "  }",                      // 2
      "}",                        // 3
    ];
    const result = findContainingDefinition(lines, 3);
    assert.deepStrictEqual(result, { startLine: 0, name: "foo", kind: "function" });
  });

  test("Empty file returns null for any targetLine", () => {
    assert.strictEqual(findContainingDefinition([], 0), null);
  });
});

// =============================================================================
// Invariant cases
// =============================================================================

describe("findContainingDefinition — Invariant", () => {
  test("Unmatched closing brace at depth 0 does not crash", () => {
    const lines = [
      "}",                        // 0
      "fn foo() {",               // 1
      "}",                        // 2
    ];
    const result = findContainingDefinition(lines, 1);
    assert.deepStrictEqual(result, { startLine: 1, name: "foo", kind: "function" });
  });

  test("Lines before first definition return null", () => {
    const lines = [
      "// license header",        // 0
      "",                         // 1
      "import { x } from 'y';",   // 2
      "fn foo() {}",              // 3
    ];
    assert.strictEqual(findContainingDefinition(lines, 0), null);
    assert.strictEqual(findContainingDefinition(lines, 1), null);
    assert.strictEqual(findContainingDefinition(lines, 2), null);
  });

  test("Line just after closing brace (outside any definition) returns null", () => {
    const lines = [
      "fn foo() {",               // 0
      "}",                        // 1
      "",                         // 2
    ];
    assert.strictEqual(findContainingDefinition(lines, 2), null);
  });
});

// =============================================================================
// findContainingDefinition — IIFE (PX-147 C005)
// =============================================================================

describe("findContainingDefinition — IIFE (PX-147)", () => {
  // @verifies C005
  test("C005: line inside a named IIFE maps to the IIFE start", () => {
    const lines = [
      "(function testX() {",      // 0
      "  const v = 1;",           // 1
      "})();",                    // 2
    ];
    const result = findContainingDefinition(lines, 1, ".js");
    assert.deepStrictEqual(result, { startLine: 0, name: "testX", kind: "function" });
  });

  test("C005: line inside an anonymous IIFE maps to IIFE start with name 'anonymous'", () => {
    const lines = [
      "(function() {",            // 0
      "  const v = 1;",           // 1
      "})();",                    // 2
    ];
    const result = findContainingDefinition(lines, 1, ".js");
    assert.deepStrictEqual(result, { startLine: 0, name: "anonymous", kind: "function" });
  });
});
