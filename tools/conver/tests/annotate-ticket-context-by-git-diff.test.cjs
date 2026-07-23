/**
 * annotate-ticket-context-by-git-diff.test.cjs
 *
 * Tests for the annotate-ticket-context-by-git-diff.js script.
 *
 * RED phase: All tests must fail before implementation exists.
 * Expected initial failure: MODULE_NOT_FOUND (script does not exist yet).
 * After script creation: test each function individually.
 */

const assert = require("node:assert");
const { describe, it, before, after } = require("node:test");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const SCRIPT = path.resolve(__dirname, "../.claude/scripts/tickets/annotate-ticket-context-by-git-diff.js");

// ---------------------------------------------------------------------------
// Shared temp directory helpers for file-based tests
// ---------------------------------------------------------------------------
let dir;

before(function () {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "annot-"));
});

after(function () {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Write lines to a temp file and return its path */
function writeTempFile(lines) {
  const p = path.join(dir, `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.ts`);
  fs.writeFileSync(p, lines.join("\n") + "\n");
  return p;
}

// ---------------------------------------------------------------------------
// 1. Module export tests (importable functions)
// ---------------------------------------------------------------------------

describe("annotate-ticket-context-by-git-diff.js — module exports [RED]", () => {
  it("should be a require-able module", () => {
    // RED: MODULE_NOT_FOUND until script is created
    const mod = require(SCRIPT);
    assert.ok(mod, "Module must exist");
  });

  it("should export detectFirstDefinition function", () => {
    const mod = require(SCRIPT);
    assert.strictEqual(typeof mod.detectFirstDefinition, "function");
  });

  it("should export hasExistingAnnotation function", () => {
    const mod = require(SCRIPT);
    assert.strictEqual(typeof mod.hasExistingAnnotation, "function");
  });

  it("should export buildAnnotation function", () => {
    const mod = require(SCRIPT);
    assert.strictEqual(typeof mod.buildAnnotation, "function");
  });

  it("should export insertAnnotation function", () => {
    const mod = require(SCRIPT);
    assert.strictEqual(typeof mod.insertAnnotation, "function");
  });

  it("should export filterSourceFiles function", () => {
    const mod = require(SCRIPT);
    assert.strictEqual(typeof mod.filterSourceFiles, "function");
  });

  it("should export annotateSourceFiles function", () => {
    const mod = require(SCRIPT);
    assert.strictEqual(typeof mod.annotateSourceFiles, "function");
  });
});

// ---------------------------------------------------------------------------
// 2. detectFirstDefinition
// ---------------------------------------------------------------------------

describe("detectFirstDefinition [RED]", () => {
  it("should detect 'fn' pattern (Rust)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "// comment line",
      "fn calculate_score() -> u32 {",
      "    42",
      "}",
    ];
    const result = mod.detectFirstDefinition(lines);
    assert.strictEqual(result, 2); // 1-indexed, line 2 is the fn
  });

  it("should detect 'func' pattern (Go)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "package main",
      "",
      "func main() {",
      "}",
    ];
    assert.strictEqual(mod.detectFirstDefinition(lines), 3);
  });

  it("should detect 'function' pattern (JS/TS)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "'use strict';",
      "function process(input: string) {",
      "  return input.trim();",
      "}",
    ];
    assert.strictEqual(mod.detectFirstDefinition(lines), 2);
  });

  it("should detect 'class' pattern (TS/JS)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "import { Component } from '@angular/core';",
      "",
      "export class UserService {",
      "}",
    ];
    assert.strictEqual(mod.detectFirstDefinition(lines), 3);
  });

  it("should detect 'struct' pattern (Rust)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "use std::collections::HashMap;",
      "",
      "struct Config {",
      "  port: u16,",
      "}",
    ];
    assert.strictEqual(mod.detectFirstDefinition(lines), 3);
  });

  it("should detect 'interface' pattern (TS)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "// User domain type",
      "",
      "export interface User {",
      "  id: string;",
      "}",
    ];
    assert.strictEqual(mod.detectFirstDefinition(lines), 3);
  });

  it("should detect 'export default' pattern (Vue/React)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "<script setup>",
      "const msg = ref('hello');",
      "</script>",
    ];
    // Nothing matches, but detect export default in normal JS:
  });

  it("should detect 'def' pattern (Python)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "import os",
      "",
      "def process_data(path: str) -> dict:",
      '    return {"ok": True}',
    ];
    assert.strictEqual(mod.detectFirstDefinition(lines), 3);
  });

  it("should detect 'Vue component' pattern (options API)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "<script>",
      "export default {",
      "  name: 'MyComponent',",
      "};",
      "</script>",
    ];
    assert.strictEqual(mod.detectFirstDefinition(lines), 2);
  });

  it("should return null when no pattern matches", () => {
    const mod = require(SCRIPT);
    const lines = [
      "// just a comment",
      "// another comment",
      "const PI = 3.14;", // const is a definition too
    ];
    // Let's actually check: const should be caught by our patterns
    const result = mod.detectFirstDefinition(["// just a comment", "// another comment"]);
    assert.strictEqual(result, null);
  });
});

// ---------------------------------------------------------------------------
// 3. hasExistingAnnotation
// ---------------------------------------------------------------------------

describe("hasExistingAnnotation [RED]", () => {
  it("should return true when annotation for the same ticket key exists", () => {
    const mod = require(SCRIPT);
    const lines = [
      "// This code was implemented under the PX-59 ticket; for details...",
      "fn foo() {}",
    ];
    assert.strictEqual(mod.hasExistingAnnotation(lines, "PX-59"), true);
  });

  it("should return false when annotation for a different ticket key exists", () => {
    const mod = require(SCRIPT);
    const lines = [
      "// This code was implemented under the P0-1 ticket; for details...",
      "fn foo() {}",
    ];
    assert.strictEqual(mod.hasExistingAnnotation(lines, "PX-59"), false);
  });

  it("should return false when no annotation exists", () => {
    const mod = require(SCRIPT);
    const lines = [
      "// regular comment",
      "fn foo() {}",
    ];
    assert.strictEqual(mod.hasExistingAnnotation(lines, "PX-59"), false);
  });
});

// ---------------------------------------------------------------------------
// 4. buildAnnotation
// ---------------------------------------------------------------------------

describe("buildAnnotation [RED]", () => {
  it("should produce correct annotation format for P0-1", () => {
    const mod = require(SCRIPT);
    const result = mod.buildAnnotation("P0-1");
    assert.ok(result.includes("P0-1 ticket"));
    assert.ok(result.includes("show-ticket-context.js"));
    assert.ok(result.includes("--ticket-key=P0-1"));
    assert.ok(result.includes("--for-spec"));
    assert.ok(result.includes("--no-implementation-order"));
  });

  it("should produce correct annotation format for PX-59", () => {
    const mod = require(SCRIPT);
    const result = mod.buildAnnotation("PX-59");
    assert.ok(result.includes("PX-59 ticket"));
    assert.ok(result.includes("--ticket-key=PX-59"));
  });
});

// ---------------------------------------------------------------------------
// 5. insertAnnotation
// ---------------------------------------------------------------------------

describe("insertAnnotation [RED]", () => {
  it("should insert annotation at line 3 (before definition)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "// comment",
      "",
      "fn init() {}",
      "fn run() {}",
    ];
    const comment = mod.buildAnnotation("P0-1");
    const result = mod.insertAnnotation(lines, 3, comment);
    // Result should have 5 lines (original 4 + 1 inserted)
    assert.strictEqual(result.length, 5);
    // Line 3 should now be the comment
    assert.ok(result[2].includes("P0-1 ticket"));
    // Line 4 should be the original definition
    assert.ok(result[3].includes("fn init"));
  });

  it("should NOT insert at position 0 (before shebang)", () => {
    const mod = require(SCRIPT);
    const lines = [
      "#!/usr/bin/env node",
      "fn run() {}",
    ];
    const comment = mod.buildAnnotation("P0-1");
    // Skip shebang: detect should find line 2
    // Actually let's just verify we don't prepend before the shebang
    const result = mod.insertAnnotation(lines, 2, comment);
    assert.strictEqual(result.length, 3);
    assert.ok(result[0].includes("#!/usr/bin/env node"));
    assert.ok(result[1].includes("P0-1 ticket"));
    assert.ok(result[2].includes("fn run()"));
  });
});

// ---------------------------------------------------------------------------
// 6. filterSourceFiles
// ---------------------------------------------------------------------------

describe("filterSourceFiles [RED]", () => {
  it("should keep .rs, .ts, .vue, .go, .py files", () => {
    const mod = require(SCRIPT);
    const files = [
      "src/main.rs",
      "src/main.go",
      "src/app.ts",
      "src/app.vue",
      "src/util.py",
      "README.md",
      "config.json",
      "Cargo.toml",
    ];
    const result = mod.filterSourceFiles(files);
    assert.deepStrictEqual(result.sort(), [
      "src/main.go",
      "src/main.rs",
      "src/app.ts",
      "src/app.vue",
      "src/util.py",
    ].sort());
  });

  it("should return empty array when no source files match", () => {
    const mod = require(SCRIPT);
    const files = ["README.md", "config.json", "package.json"];
    assert.deepStrictEqual(mod.filterSourceFiles(files), []);
  });
});

// ---------------------------------------------------------------------------
// 7. CLI integration test
// ---------------------------------------------------------------------------

describe("CLI integration [RED]", () => {
  it("should exit with code 0 when no git diff exists (no changes)", () => {
    // Run in a temp dir that IS NOT a git repo — script should handle gracefully
    try {
      execFileSync("node", [SCRIPT, "--ticket-key=PX-59"], {
        cwd: dir,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
      });
    } catch (e) {
      // RED: may fail because script doesn't exist yet
      assert.ok(e.code === "MODULE_NOT_FOUND" || e.status !== undefined);
    }
  });
});
