#!/usr/bin/env node
/**
 * validate-stub-format.test.cjs — PX-134 scan mode for validate-stub-format.js.
 *
 * Covers contracts C001..C004 of ticket PX-134 (see specs/PX-134.md):
 *   C001 --scan <dir> validates every marker and exits 0 iff all valid
 *   C002 a malformed marker exits 1 and stderr lists file:line + each error
 *   C003 no-arg invocation still exits 1 with a usage message (backward compat)
 *   C004 the consolidate-stubs gate runs the scan mode
 * [::TICKET::] PX-134 changes. Details: `node .claude/scripts/tickets/show-ticket-context.js --ticket-key=PX-134 --for-spec --no-implementation-order`.
 */

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SCRIPT = path.resolve(__dirname, "../.claude/scripts/tickets/validate-stub-format.js");
const GATE = path.resolve(__dirname, "../.claude/scripts/tickets/consolidate-stubs-gate.sh");

function makeWorkspace() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vsf-"));
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  return dir;
}

function writeFile(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, "utf8");
}

function runCli(args) {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (e) {
    return { status: e.status || 1, stdout: e.stdout || "", stderr: e.stderr || "" };
  }
}

// @verifies C001 (PX-134 contract)
test("C001: --scan <dir> with all-valid markers exits 0 and reports fail:0", () => {
  const ws = makeWorkspace();
  writeFile(path.join(ws, "src/a.rs"), "// [::STUB::] P4-2: reason -- plan\nfn a() {}\n// [::STUB::] P4-2: reason two -- plan two\nfn b() {}\n");
  const out = runCli(["--scan", ws]);
  assert.strictEqual(out.status, 0, "all-valid tree must exit 0");
  const res = JSON.parse(out.stdout);
  assert.strictEqual(res.fail, 0);
  assert.strictEqual(res.pass, res.total);
});

// @verifies C001 boundary (PX-134 contract)
test("C001 boundary: an empty tree exits 0 with total 0", () => {
  const ws = makeWorkspace();
  const out = runCli(["--scan", ws]);
  assert.strictEqual(out.status, 0, "empty tree must exit 0");
  const res = JSON.parse(out.stdout);
  assert.strictEqual(res.total, 0);
});

// @verifies C002 (PX-134 contract)
test("C002: --scan <dir> with a malformed marker exits 1 and stderr lists file:line + error", () => {
  const ws = makeWorkspace();
  writeFile(path.join(ws, "src/a.rs"), "// [::STUB::] broken\nfn a() {}\n");
  const out = runCli(["--scan", ws]);
  assert.strictEqual(out.status, 1, "malformed marker must exit 1");
  assert.ok(out.stderr.includes("src/a.rs:1"), "stderr names the failing file:line");
});

// @verifies C003 (PX-134 contract)
test("C003: no-arg invocation still exits 1 with a usage message (backward compat)", () => {
  const out = runCli([]);
  assert.strictEqual(out.status, 1);
  assert.ok(/Missing input string|usage/i.test(out.stderr));
});

// single-string mode unchanged (backward compat)
test("single-string mode still validates a marker string", () => {
  const out = runCli(["// [::STUB::] P4-2: reason -- plan"]);
  assert.strictEqual(out.status, 0);
  assert.deepStrictEqual(JSON.parse(out.stdout), { valid: true, errors: [] });
});

// --scan with no directory argument is a usage error
test("--scan with no directory argument exits 1 with usage", () => {
  const out = runCli(["--scan"]);
  assert.strictEqual(out.status, 1);
  assert.ok(/directory|--scan <dir>|usage/i.test(out.stderr));
});

// @verifies C004 (PX-134 contract)
test("C004: the consolidate-stubs gate runs the scan mode", () => {
  const gate = fs.readFileSync(GATE, "utf8");
  assert.ok(gate.includes("validate-stub-format.js") && gate.includes("--scan"), "the gate runs the scan mode");
  assert.ok(!/validate-stub-format\.js"\s*$/.test(gate), "no bare no-arg invocation in the gate");
});
