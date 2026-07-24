#!/usr/bin/env node

/**
 * Unit tests for resolve-ambiguous-markers.js (PX-64).
 *
 * PX-64: Mechanical [::TICKET::] annotation inserter for [::AMBIGUOUS::] resolution.
 *
 * RED phase: module doesn't exist → before() throws → tests fail.
 * GREEN phase: module exists → all tests pass.
 */

const { describe, test, before } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

let listDefinitions, injectAt, listAllDefinitions;

before(() => {
  const mod = require("../../scripts/tickets/resolve-ambiguous-markers");
  listDefinitions = mod.listDefinitions;
  injectAt = mod.injectAt;
  listAllDefinitions = mod.listAllDefinitions;
  assert.ok(typeof listDefinitions === "function");
  assert.ok(typeof injectAt === "function");
  assert.ok(typeof listAllDefinitions === "function");
});

// =============================================================================
// listAllDefinitions (pure function — no file I/O)
// =============================================================================

describe("listAllDefinitions", () => {
  test("finds 3 definitions in multi-definition file", () => {
    const lines = [
      "fn foo() {",       // 0
      "  let x = 1;",     // 1
      "}",                 // 2
      "fn bar() {",       // 3
      "  let y = 2;",     // 4
      "}",                 // 5
      "struct Point {",   // 6
      "  x: i32,",        // 7
      "}",                 // 8
    ];
    const defs = listAllDefinitions(lines);
    assert.strictEqual(defs.length, 3);
    assert.deepStrictEqual(defs[0], { line: 0, name: "foo", kind: "function" });
    assert.deepStrictEqual(defs[1], { line: 3, name: "bar", kind: "function" });
    assert.deepStrictEqual(defs[2], { line: 6, name: "Point", kind: "struct" });
  });

  test("returns empty array for file with no definitions", () => {
    const lines = [
      "// just a comment",
      "",
      "const X = 1;",
    ];
    assert.strictEqual(listAllDefinitions(lines).length, 0);
  });

  test("finds TS class method shorthand", () => {
    const lines = [
      "class Foo {",     // 0
      "  bar() {",       // 1
      "  }",             // 2
      "}",               // 3
    ];
    const defs = listAllDefinitions(lines);
    assert.strictEqual(defs.length, 2);
    assert.strictEqual(defs[0].name, "Foo");
    assert.strictEqual(defs[1].name, "bar");
  });
});

// =============================================================================
// listDefinitions (file-based, read-only)
// =============================================================================

function createTempFile(content) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "px64-test-"));
  const filePath = path.join(tmpDir, "test.rs");
  fs.writeFileSync(filePath, content, "utf8");
  return { filePath, tmpDir };
}

function cleanupTempDir(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

describe("listDefinitions", () => {
  test("reports definitions and AMBIGUOUS line when present", () => {
    const content = [
      '// [::AMBIGUOUS::] Could not locate containing definition for changed line(s) in ticket PX-64 — AI must resolve placement.',
      '',
      'fn foo() {',
      '  let x = 1;',
      '}',
      'fn bar() {',
      '  let y = 2;',
      '}',
    ].join("\n");

    const { filePath, tmpDir } = createTempFile(content);
    try {
      const result = listDefinitions(filePath, "PX-64");
      assert.ok(result.success);
      assert.strictEqual(result.definitions.length, 2);
      assert.ok(result.ambiguousLine.includes("AMBIGUOUS"));
      assert.strictEqual(typeof result.ambiguousLineNumber, "number");
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("file without AMBIGUOUS returns ambiguousLine as null", () => {
    const content = [
      'fn foo() {',
      '}',
    ].join("\n");

    const { filePath, tmpDir } = createTempFile(content);
    try {
      const result = listDefinitions(filePath, "PX-64");
      assert.ok(result.success);
      assert.strictEqual(result.definitions.length, 1);
      assert.strictEqual(result.ambiguousLine, null);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});

// =============================================================================
// injectAt (file-based, mutates)
// =============================================================================

describe("injectAt", () => {
  test("inserts TICKET annotation at specified definition and removes AMBIGUOUS", () => {
    const content = [
      '// [::AMBIGUOUS::] Could not locate containing definition for changed line(s) in ticket PX-64 — AI must resolve placement.',
      '',
      'fn foo() {',
      '  let x = 1;',
      '}',
      'fn bar() {',
      '  let y = 2;',
      '}',
    ].join("\n");

    const { filePath, tmpDir } = createTempFile(content);
    try {
      // Inject at line 5 (bar, 0-indexed)
      const result = injectAt(filePath, "PX-64", 5);
      assert.ok(result.success);

      const updated = fs.readFileSync(filePath, "utf8");
      // AMBIGUOUS marker should be gone
      assert.ok(!updated.includes("AMBIGUOUS"), "AMBIGUOUS marker should be removed");
      // TICKET annotation should be present
      assert.ok(updated.includes("[::TICKET::]"), "TICKET annotation should be present");
      assert.ok(updated.includes("PX-64"), "Ticket key should be in annotation");
      // Annotation should be before fn bar()
      const lines = updated.split("\n");
      const barIndex = lines.findIndex(l => l.includes("fn bar()"));
      assert.ok(barIndex > 0, "bar() should still exist");
      assert.ok(lines[barIndex - 1].includes("[::TICKET::]"), "Annotation should be directly before bar()");
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("line number beyond file length returns error", () => {
    const content = "fn foo() {}\n";
    const { filePath, tmpDir } = createTempFile(content);
    try {
      const result = injectAt(filePath, "PX-64", 99);
      assert.ok(!result.success);
      assert.ok(result.error);
    } finally {
      cleanupTempDir(tmpDir);
    }
  });

  test("injectAt at line 0 inserts at top and removes AMBIGUOUS", () => {
    const content = [
      '// [::AMBIGUOUS::] Could not locate containing definition for changed line(s) in ticket PX-64 — AI must resolve placement.',
      'fn foo() {',
      '}',
    ].join("\n");

    const { filePath, tmpDir } = createTempFile(content);
    try {
      const result = injectAt(filePath, "PX-64", 1);
      assert.ok(result.success);
      const updated = fs.readFileSync(filePath, "utf8");
      assert.ok(!updated.includes("AMBIGUOUS"));
      assert.ok(updated.includes("[::TICKET::]"));
    } finally {
      cleanupTempDir(tmpDir);
    }
  });
});
